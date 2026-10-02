"""外部类案检索服务 (WP-AI-03).

接入外部 Elasticsearch 类案库，支撑 POST /api/bff/v1/ai/similar-cases/search。
支持配置缺失、ES 超时、无结果等场景的降级响应，不影响策略建议链路。

参考:
  - docs/plan/2026Q2_AI_CASE_ASSISTANT_WP_AI_03_EXTERNAL_CASE_SEARCH_DESIGN.md
"""
from __future__ import annotations

import asyncio
import re
from datetime import datetime, timezone, date
from decimal import Decimal
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import get_settings
from ..core.exceptions import NotFoundException, BusinessException
from ..models.sys_users import SysUser
from ..providers.search import (
    ElasticsearchProvider,
    SearchException,
    get_external_case_search_provider,
)
from ..schemas.case_ai import (
    SimilarCaseSearchRequest as CaseAiSimilarCaseSearchRequest,
    SimilarCaseSearchResponse as CaseAiSimilarCaseSearchResponse,
    SimilarCaseItemVO,
    MaterialCompletenessVO,
    AiCommonMetaMixin,
    AiSourceRefVO,
)
from ..schemas.ai_chat import (
    SimilarCaseSearchRequest,
    SimilarCaseSearchResponse,
    SimilarCaseItem,
)
from ..services.case_ai_context_service import CaseAiContextBuilder, CaseAiContextBuildRequest


# ---------------------------------------------------------------------------
# 查询文本脱敏与最小化
# ---------------------------------------------------------------------------

_SENSITIVE_PATTERNS = [
    # 身份证号
    (re.compile(r"\d{17}[\dXx]"), "[ID]"),
    # 统一社会信用代码
    (re.compile(r"[A-HJ-NP-RTUW-Y\d]{18}"), "[USCC]"),
    # 手机号
    (re.compile(r"1[3-9]\d{9}"), "[PHONE]"),
    # 银行卡号 (16-19 位数字)
    (re.compile(r"\d{16,19}"), "[CARD]"),
]

_MAX_QUERY_LENGTH = 800


def _sanitize_query_text(text: str) -> str:
    """脱敏并截断查询文本."""
    if not text:
        return ""

    # 1. 移除敏感信息
    for pattern, replacement in _SENSITIVE_PATTERNS:
        text = pattern.sub(replacement, text)

    # 2. 截断过长文本
    if len(text) > _MAX_QUERY_LENGTH:
        text = text[:_MAX_QUERY_LENGTH] + "..."

    # 3. 清理多余空白
    text = " ".join(text.split())

    return text.strip()


def _build_minimal_query_from_context(context: Any) -> str:
    """从 CaseAiContextBuildResponse 提取最小化查询文本."""
    parts: list[str] = []

    # 案由
    if getattr(context, "cause_of_action", None):
        parts.append(str(context.cause_of_action))

    # 案件摘要前 500 字
    summary = getattr(context, "case_summary", "") or ""
    if summary:
        parts.append(summary[:500])

    # 争议焦点前 3 条
    focus = getattr(context, "dispute_focus", []) or []
    for f in focus[:3]:
        if f:
            parts.append(str(f))

    # 主诉/抗辩摘要
    claim = getattr(context, "claim_and_defense", None)
    if claim:
        if getattr(claim, "our_claim", None):
            parts.append(str(claim.our_claim)[:200])
        if getattr(claim, "opponent_claim", None):
            parts.append(str(claim.opponent_claim)[:200])

    # 金额区间（不发送精确值）
    amount = getattr(context, "amount_summary", None)
    if amount and getattr(amount, "target_amount", None):
        try:
            val = Decimal(str(amount.target_amount))
            # 归一化到百万区间
            if val >= Decimal("100000000"):
                parts.append("标的额过亿")
            elif val >= Decimal("10000000"):
                parts.append("标的额千万级")
            elif val >= Decimal("1000000"):
                parts.append("标的额百万级")
            elif val >= Decimal("100000"):
                parts.append("标的额十万级")
            else:
                parts.append("标的额十万以下")
        except Exception:
            pass

    raw = " ".join(parts)
    return _sanitize_query_text(raw)


# ---------------------------------------------------------------------------
# ES 查询 DSL 构建
# ---------------------------------------------------------------------------

_ES_SOURCE_FIELDS = [
    "doc_id", "full_title", "title", "case", "accurate_case",
    "court_name", "court_level", "province",
    "trial_procedure", "court_proceeding", "document_type",
    "referee_date", "casejudgedate", "summary", "basic_fact",
    "focus_dispute", "court_believes", "court_found",
    "alleged", "argue", "referee_result", "referee_basis",
    "keywords", "litigation_participant", "txt",
]

_ES_QUERY_FIELDS = [
    "accurate_case^5", "case^4", "focus_dispute^5",
    "basic_fact^3", "summary^3", "alleged^2", "argue^2",
    "court_found^2", "court_believes^2", "referee_result^2", "txt",
]


def _build_es_query(query_text: str, top_k: int) -> dict[str, Any]:
    """构建 ES multi_match 查询 DSL."""
    return {
        "_source": _ES_SOURCE_FIELDS,
        "query": {
            "multi_match": {
                "query": query_text,
                "fields": _ES_QUERY_FIELDS,
                "type": "best_fields",
                "operator": "or",
            }
        },
        "highlight": {
            "fields": {
                "summary": {},
                "basic_fact": {},
                "focus_dispute": {},
                "court_believes": {},
                "referee_result": {},
            }
        },
        "size": top_k,
        "timeout": "5s",
    }


# ---------------------------------------------------------------------------
# 结果映射
# ---------------------------------------------------------------------------

def _parse_referee_date(raw: Any) -> date | None:
    """解析裁判日期，兼容多种格式."""
    if raw is None:
        return None
    if isinstance(raw, date) and not isinstance(raw, datetime):
        return raw
    if isinstance(raw, datetime):
        return raw.date()

    s = str(raw).strip()
    if not s:
        return None

    # ISO 格式
    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%Y.%m.%d"):
        try:
            return datetime.strptime(s[:10], fmt).date()
        except ValueError:
            continue

    # Excel serial (简单判断：纯数字且大于 30000)
    try:
        num = float(s)
        if num > 30000:
            # Excel 日期起始为 1899-12-30
            from datetime import timedelta
            base = datetime(1899, 12, 30)
            return (base + timedelta(days=int(num))).date()
    except (ValueError, OverflowError):
        pass

    return None


def _normalize_similarity(score: float | None, max_score: float) -> float | None:
    """将 ES _score 归一化为 0-1 相似度."""
    if score is None or max_score <= 0:
        return None
    # 使用 sigmoid 风格的简单归一化
    normalized = score / max_score
    return min(max(normalized, 0.0), 1.0)


def _map_es_hit_to_vo(hit: dict[str, Any], index_name: str) -> SimilarCaseItemVO:
    """将 ES hit 映射为 SimilarCaseItemVO."""
    source = hit.get("_source", {})
    highlight = hit.get("highlight", {})
    score = hit.get("_score")

    # 提取高亮片段
    snippets: list[str] = []
    matched_fields: list[str] = []
    for field, texts in highlight.items():
        if texts:
            matched_fields.append(field)
            snippets.extend(str(t) for t in texts[:2])

    # 构建匹配理由
    match_reason_parts: list[str] = []
    if matched_fields:
        match_reason_parts.append(f"命中字段: {', '.join(matched_fields)}")
    if snippets:
        match_reason_parts.append(f"片段: {snippets[0][:60]}...")
    match_reason = "; ".join(match_reason_parts) or "基于案由与争议焦点的全文匹配"

    # display_id: 优先 external_doc_id，否则 ES _id
    doc_id = source.get("doc_id") or hit.get("_id", "")

    def _safe_str(val: Any) -> str | None:
        """安全提取字符串，列表取首个元素."""
        if val is None:
            return None
        if isinstance(val, list):
            for item in val:
                if item:
                    return str(item)
            return None
        return str(val) if val else None

    return SimilarCaseItemVO(
        display_id=doc_id or str(hit.get("_id", "")),
        source_scope="EXTERNAL",
        source_index=index_name,
        external_doc_id=doc_id or None,
        internal_case_id=None,
        title=_safe_str(source.get("full_title")) or _safe_str(source.get("title")) or "未命名文书",
        case_no=_safe_str(source.get("title")),
        court_name=_safe_str(source.get("court_name")),
        court_level=_safe_str(source.get("court_level")),
        province=_safe_str(source.get("province")),
        cause_of_action=_safe_str(source.get("case")) or _safe_str(source.get("accurate_case")),
        trial_procedure=_safe_str(source.get("trial_procedure")) or _safe_str(source.get("court_proceeding")),
        document_type=_safe_str(source.get("document_type")),
        referee_date=_parse_referee_date(source.get("referee_date") or source.get("casejudgedate")),
        referee_result=_safe_str(source.get("referee_result")),
        referee_basis=_safe_str(source.get("referee_basis")),
        summary=_safe_str(source.get("summary")),
        basic_fact=_safe_str(source.get("basic_fact")),
        focus_dispute=_safe_str(source.get("focus_dispute")),
        court_believes=_safe_str(source.get("court_believes")),
        court_found=_safe_str(source.get("court_found")),
        alleged=_safe_str(source.get("alleged")),
        argue=_safe_str(source.get("argue")),
        keywords=_safe_str(source.get("keywords")),
        litigation_participant=_safe_str(source.get("litigation_participant")),
        similarity=_normalize_similarity(score, score) if score is not None else None,
        score=score,
        matched_fields=matched_fields,
        match_reason=match_reason,
        snippets=snippets[:3],
    )


def _map_vo_to_ai_chat_item(vo: SimilarCaseItemVO) -> SimilarCaseItem:
    """将主契约 VO 映射为 ai_chat 兼容层 Item."""
    return SimilarCaseItem(
        case_id=vo.external_doc_id or vo.display_id,
        case_name=vo.title,
        similarity=vo.similarity or 0.0,
        outcome=vo.referee_result,
        outcome_name=vo.referee_result,
        amount=None,
        display_id=vo.display_id,
        source_scope=vo.source_scope,
        source_index=vo.source_index,
        external_doc_id=vo.external_doc_id,
        internal_case_id=vo.internal_case_id,
        title=vo.title,
        case_no=vo.case_no,
        court_name=vo.court_name,
        court_level=vo.court_level,
        province=vo.province,
        cause_of_action=vo.cause_of_action,
        trial_procedure=vo.trial_procedure,
        document_type=vo.document_type,
        referee_date=vo.referee_date.isoformat() if vo.referee_date else None,
        referee_result=vo.referee_result,
        referee_basis=vo.referee_basis,
        summary=vo.summary,
        basic_fact=vo.basic_fact,
        focus_dispute=vo.focus_dispute,
        court_believes=vo.court_believes,
        court_found=vo.court_found,
        alleged=vo.alleged,
        argue=vo.argue,
        keywords=vo.keywords,
        litigation_participant=vo.litigation_participant,
        score=vo.score,
        matched_fields=vo.matched_fields,
        match_reason=vo.match_reason,
        snippets=vo.snippets,
    )


# ---------------------------------------------------------------------------
# 降级响应构造
# ---------------------------------------------------------------------------

def _stub_response(
    query_text: str | None,
    source_scope: str,
    warnings: list[str],
) -> CaseAiSimilarCaseSearchResponse:
    """构造 stub 降级响应."""
    return CaseAiSimilarCaseSearchResponse(
        is_stub=True,
        run_mode="MOCK",
        generated_at=datetime.now(timezone.utc),
        confidence=0.0,
        source_refs=[],
        material_completeness=MaterialCompletenessVO(score=0, level="LOW"),
        pending_material_tasks=[],
        query_text=query_text,
        source_scope=source_scope,  # type: ignore[arg-type]
        items=[],
        total=0,
        warnings=warnings,
    )


def _empty_response(
    query_text: str | None,
    source_scope: str,
) -> CaseAiSimilarCaseSearchResponse:
    """构造无结果的稳定响应."""
    return CaseAiSimilarCaseSearchResponse(
        is_stub=False,
        run_mode="EXTERNAL_SEARCH",
        generated_at=datetime.now(timezone.utc),
        confidence=0.0,
        source_refs=[],
        material_completeness=MaterialCompletenessVO(score=0, level="LOW"),
        pending_material_tasks=[],
        query_text=query_text,
        source_scope=source_scope,  # type: ignore[arg-type]
        items=[],
        total=0,
        warnings=["暂无高相似外部类案"],
    )


# ---------------------------------------------------------------------------
# 主服务入口
# ---------------------------------------------------------------------------


async def search_similar_cases(
    session: AsyncSession,
    tenant_id: str,
    req: SimilarCaseSearchRequest,
    user: SysUser,
) -> CaseAiSimilarCaseSearchResponse:
    """外部类案检索主入口.

    执行顺序:
      1. 归一化参数
      2. 校验请求
      3. case_id 模式构建最小化 query
      4. source_scope 处理
      5. 调用外部 ES
      6. 映射结果
      7. 任何异常均降级
    """
    # 1. 归一化
    case_id = req.case_id or None
    query_text = req.query or None
    top_k = req.top_k if req.top_k is not None else 5
    source_scope = req.source_scope or "EXTERNAL"

    # 2. 校验
    if not case_id and not query_text:
        raise BusinessException(
            code=4000,
            message="case_id 与 query 至少需提供一个",
        )

    # 3. case_id 模式：构建最小化 query
    if case_id:
        try:
            builder = CaseAiContextBuilder()
            ctx_req = CaseAiContextBuildRequest(
                case_id=case_id,
                include_documents=True,
                include_finance=False,
            )
            context = await builder.build(session, tenant_id, case_id, user, ctx_req)
            built_query = _build_minimal_query_from_context(context)

            # case_id + query 时以案件上下文为主，query 作为补充
            if query_text:
                sanitized = _sanitize_query_text(query_text)
                built_query = f"{built_query} {sanitized}"

            query_text = built_query
        except NotFoundException:
            raise BusinessException(
                code=4300,
                message="案件不存在或无访问权限",
            )
        except Exception:
            # 上下文构建失败不阻断，降级为 query 模式
            if not query_text:
                return _stub_response(
                    None,
                    source_scope,
                    warnings=["案件上下文构建失败，无法生成类案查询"],
                )
            query_text = _sanitize_query_text(query_text)
    else:
        # query 独立检索模式
        query_text = _sanitize_query_text(query_text or "")

    if not query_text:
        return _stub_response(
            None,
            source_scope,
            warnings=["查询文本为空，无法执行类案检索"],
        )

    # 4. source_scope 处理
    if source_scope == "INTERNAL":
        return _stub_response(
            query_text,
            source_scope,
            warnings=["内部案件索引尚未启用"],
        )

    # 5. 检查外部 ES 配置
    settings = get_settings()
    provider = get_external_case_search_provider(settings)

    if provider is None:
        warnings = ["外部类案 ES 未配置"]
        if source_scope == "ALL":
            warnings.append("内部案件索引尚未启用")
        return _stub_response(query_text, source_scope, warnings)

    # 6. 调用外部 ES
    index_name = getattr(settings, "EXTERNAL_CASE_ES_INDEX", "doc_document_ycc")
    es_query = _build_es_query(query_text, top_k)

    try:
        hits = await asyncio.wait_for(
            provider.search(index=index_name, query=es_query, size=top_k),
            timeout=getattr(settings, "EXTERNAL_CASE_ES_REQUEST_TIMEOUT", 5.0) + 1.0,
        )
    except asyncio.TimeoutError:
        await provider.close()
        return _stub_response(
            query_text,
            source_scope,
            warnings=["外部类案 ES 查询超时"],
        )
    except SearchException as e:
        # 不暴露底层地址或堆栈
        await provider.close()
        return _stub_response(
            query_text,
            source_scope,
            warnings=["外部类案检索服务暂时不可用"],
        )
    except Exception:
        await provider.close()
        return _stub_response(
            query_text,
            source_scope,
            warnings=["外部类案检索遇到未知错误"],
        )

    # 7. 映射结果
    if not hits:
        warnings: list[str] = ["暂无高相似外部类案"]
        if source_scope == "ALL":
            warnings.append("内部案件索引尚未启用")
        return _empty_response(query_text, source_scope)

    # 计算 max_score 用于归一化
    max_score = 0.0
    for hit in hits:
        s = hit.get("_score", 0.0)
        if isinstance(s, (int, float)) and s > max_score:
            max_score = s

    items: list[SimilarCaseItemVO] = []
    for hit in hits:
        vo = _map_es_hit_to_vo(hit, index_name)
        if max_score > 0 and vo.score is not None:
            vo.similarity = min(max(vo.score / max_score, 0.0), 1.0)
        items.append(vo)

    warnings: list[str] = []
    if source_scope == "ALL":
        warnings.append("内部案件索引尚未启用")

    await provider.close()
    return CaseAiSimilarCaseSearchResponse(
        is_stub=False,
        run_mode="EXTERNAL_SEARCH",
        generated_at=datetime.now(timezone.utc),
        confidence=0.7 if items else 0.0,
        source_refs=[],
        material_completeness=MaterialCompletenessVO(
            score=30 if items else 0,
            level="MEDIUM" if items else "LOW",
        ),
        pending_material_tasks=[],
        query_text=query_text,
        source_scope=source_scope,  # type: ignore[arg-type]
        items=items,
        total=len(items),
        warnings=warnings,
    )
