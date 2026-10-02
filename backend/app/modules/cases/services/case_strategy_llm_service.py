"""LLM 类案分析服务 (WP-AI-04 LLM 增强).

基于外部判例和案件上下文，调用 LLM 生成深度策略建议。
LLM 不可用时降级返回 None，由调用方回退到规则化生成。

参考:
  - docs/plan/2026Q2_AI_CASE_ASSISTANT_WP_AI_04_STRATEGY_RECOMMEND_SERVICE_DESIGN.md
"""
from __future__ import annotations

import asyncio
import json
from decimal import Decimal
from typing import Any

from ..core.config import get_settings
from ..core.exceptions import BusinessException
from ..providers.llm import (
    ILLMProvider,
    LLMException,
    LLMRateLimitException,
    LLMContextLengthException,
    get_llm_provider,
)
from ..schemas.case_ai import (
    CaseAiContextBuildResponse,
    SimilarCaseItemVO,
    StrategyRecommendResponse,
    MaterialCompletenessVO,
    AiSourceRefVO,
)
from ..models.case_strategies import CaseStrategy


# ---------------------------------------------------------------------------
# Prompt 构建
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT = (
    "你是一位资深的证券法律事务专家，擅长分析证券纠纷案件并制定诉讼/仲裁应对策略。"
    "你熟悉中国法院裁判规则、证券行业监管要求和企业合规实践。"
    "你的建议需要兼顾法律专业性、商业可行性和风险控制。"
)

_CASE_ANALYSIS_PROMPT_TEMPLATE = """\
请基于以下案件信息和参考判例，生成专业的应对策略建议。

## 案件信息
- 案由：{cause_of_action}
- 标的额：{target_amount}
- 当前阶段：{stage}
- 我方角色：{our_role}
- 案件摘要：{case_summary}
- 争议焦点：{dispute_focus}
- 材料完备度：{completeness_score}/100（{completeness_level}）
{existing_strategy_note}

## 参考判例（按相似度排序）
{similar_cases_text}

## 任务要求
请基于上述案件信息和参考判例，输出以下内容的 JSON 对象：

1. **strategy_points**（string[]，3-6条）：应对策略要点，每条应具体、可操作
2. **action_recommendations**（string[]，3-6条）：近期行动建议，含时间节点和责任人建议
3. **evidence_reinforcement**（string[]，2-5条）：证据补强建议，基于类案裁判逻辑
4. **risk_warnings**（string[]，2-4条）：风险提示，含法律风险和商业风险
5. **recommended_strategy_text**（string，800-1500字）：完整的策略正文草稿，分章节撰写
6. **confidence**（number，0-1）：你对本建议的置信度评估，基于材料完备度和类案匹配质量

## 输出格式
严格输出 JSON，不要包含任何 markdown 代码块标记或其他说明文字。JSON 结构如下：
{{
  "strategy_points": ["...", "..."],
  "action_recommendations": ["...", "..."],
  "evidence_reinforcement": ["...", "..."],
  "risk_warnings": ["...", "..."],
  "recommended_strategy_text": "...",
  "confidence": 0.75
}}
"""


# ---------------------------------------------------------------------------
# 辅助函数
# ---------------------------------------------------------------------------


def _format_amount(amount: Any) -> str:
    """格式化金额，安全处理 None."""
    if amount is None:
        return "待定"
    try:
        d = Decimal(str(amount))
        if d >= Decimal("100000000"):
            return f"{d / 100000000:.2f} 亿元"
        elif d >= Decimal("10000"):
            return f"{d / 10000:.2f} 万元"
        else:
            return f"{d:,.2f} 元"
    except Exception:
        return str(amount)


def _format_similar_cases(cases: list[SimilarCaseItemVO]) -> str:
    """格式化类案列表为 Prompt 文本（精简版，控制 token 数量）."""
    if not cases:
        return "（暂无高相似外部类案参考）"

    lines: list[str] = []
    for i, c in enumerate(cases[:3], 1):  # 最多 3 条，减少 token
        sim = f"{c.similarity * 100:.0f}%" if c.similarity else "N/A"
        parts: list[str] = [f"{i}. {c.title}（相似度{sim}）"]
        if c.cause_of_action:
            parts.append(f"案由：{c.cause_of_action}")
        if c.referee_result:
            parts.append(f"裁判：{c.referee_result}")
        if c.court_name:
            parts.append(f"法院：{c.court_name}")
        lines.append("，".join(parts))

    return "\n".join(lines)


def _build_prompt(
    context: CaseAiContextBuildResponse,
    similar_cases: list[SimilarCaseItemVO],
    existing_strategy: CaseStrategy | None,
) -> str:
    """构建 LLM Prompt."""
    # 案件信息
    amount_summary = context.amount_summary
    target_amount = _format_amount(
        getattr(amount_summary, "target_amount", None) if amount_summary else None
    )

    our_role = "争议方"
    claim_defense = getattr(context, "claim_and_defense", None)
    if claim_defense:
        if getattr(claim_defense, "our_claim", None) and getattr(claim_defense, "opponent_claim", None):
            our_role = "争议方"
        elif getattr(claim_defense, "our_claim", None):
            our_role = "主张方/原告"
        elif getattr(claim_defense, "opponent_claim", None):
            our_role = "被主张方/被告"

    dispute_focus = getattr(context, "dispute_focus", [])
    dispute_focus_text = "\n".join(f"  - {f}" for f in dispute_focus[:5]) if dispute_focus else "  - 暂无明确争议焦点"

    completeness = getattr(context, "material_completeness", None)
    completeness_score = getattr(completeness, "score", 0) if completeness else 0
    completeness_level = getattr(completeness, "level", "LOW") if completeness else "LOW"

    # 既有策略备注
    existing_strategy_note = ""
    existing_strategy_text = getattr(existing_strategy, "analysis", None) or getattr(existing_strategy, "content", None)
    if existing_strategy and existing_strategy_text:
        existing_strategy_note = (
            f"\n- 既有策略方向：{getattr(existing_strategy, 'direction', None) or '未指定'}\n"
            f"- 既有策略概要：{existing_strategy_text[:200]}..."
        )

    return _CASE_ANALYSIS_PROMPT_TEMPLATE.format(
        cause_of_action=getattr(context, "cause_of_action", "未指定") or "未指定",
        target_amount=target_amount,
        stage=getattr(context, "case_summary", "")[:100] or "一审阶段",
        our_role=our_role,
        case_summary=getattr(context, "case_summary", "案件信息待补充。"),
        dispute_focus=dispute_focus_text,
        completeness_score=completeness_score,
        completeness_level=completeness_level,
        existing_strategy_note=existing_strategy_note,
        similar_cases_text=_format_similar_cases(similar_cases),
    )


def _parse_llm_json(raw: str) -> dict[str, Any]:
    """解析 LLM 返回的 JSON，处理常见格式问题."""
    text = raw.strip()

    # 去除 markdown 代码块
    if text.startswith("```json"):
        text = text[7:]
    elif text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    text = text.strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # 尝试提取第一个 {} 包裹的内容
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            return json.loads(text[start:end + 1])
        raise LLMException(f"LLM 返回内容无法解析为 JSON: {raw[:200]}")


def _safe_list(data: Any, key: str) -> list[str]:
    """安全提取字符串列表."""
    val = data.get(key) if isinstance(data, dict) else None
    if not val:
        return []
    if isinstance(val, list):
        return [str(v) for v in val if v]
    if isinstance(val, str):
        return [val]
    return []


def _clamp(value: float, low: float, high: float) -> float:
    """限制数值范围."""
    return max(low, min(high, value))


# ---------------------------------------------------------------------------
# 主入口
# ---------------------------------------------------------------------------


async def analyze_with_llm(
    context: CaseAiContextBuildResponse,
    similar_cases: list[SimilarCaseItemVO],
    existing_strategy: CaseStrategy | None,
) -> StrategyRecommendResponse | None:
    """调用 LLM 进行类案深度分析.

    执行流程:
      1. 检查 LLM_ENABLED 和 Provider 可用性
      2. 构建 Prompt（含案件上下文 + 外部判例）
      3. 调用 LLM（JSON mode，带超时）
      4. 解析 JSON，组装 StrategyRecommendResponse
      5. 任何异常均返回 None，由调用方降级

    Args:
        context: 案件 AI 上下文
        similar_cases: 外部类案列表（已按相似度排序）
        existing_strategy: 既有策略（可为 None）

    Returns:
        StrategyRecommendResponse（LLM 生成），或 None（降级）
    """
    settings = get_settings()

    # 1. 检查 LLM 是否启用
    if not getattr(settings, "LLM_ENABLED", False):
        print(f"[LLM_DEBUG] LLM_ENABLED=False, returning None")
        return None

    # 2. 获取 Provider
    provider = get_llm_provider(settings)
    if provider is None:
        print(f"[LLM_DEBUG] Provider is None, returning None")
        return None
    print(f"[LLM_DEBUG] Provider created: {type(provider).__name__}")

    # 3. 构建 Prompt
    prompt = _build_prompt(context, similar_cases, existing_strategy)
    print(f"[LLM_DEBUG] Prompt built, len={len(prompt)}")
    messages = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": prompt},
    ]

    # 4. 调用 LLM（带超时）
    print(f"[LLM_DEBUG] Calling chat_completion, timeout={getattr(settings, 'LLM_REQUEST_TIMEOUT', 60.0) + 5.0}")
    try:
        raw_response = await asyncio.wait_for(
            provider.chat_completion(
                messages,
                model=getattr(settings, "LLM_DEFAULT_MODEL", None) or None,
                temperature=getattr(settings, "LLM_TEMPERATURE", 0.3),
                max_tokens=getattr(settings, "LLM_MAX_TOKENS", 2048),
                json_mode=True,
            ),
            timeout=getattr(settings, "LLM_REQUEST_TIMEOUT", 60.0) + 5.0,
        )
        print(f"[LLM_DEBUG] chat_completion success, len={len(raw_response)}")
    except asyncio.TimeoutError as e:
        print(f"[LLM_DEBUG] TimeoutError: {e}")
        await provider.close()
        return None
    except (LLMException, LLMRateLimitException, LLMContextLengthException) as e:
        print(f"[LLM_DEBUG] LLMException: {type(e).__name__}: {e}")
        await provider.close()
        return None
    except Exception as e:
        print(f"[LLM_DEBUG] Exception: {type(e).__name__}: {e}")
        await provider.close()
        return None
    finally:
        # 确保关闭（如果上面的 except 没有执行到）
        try:
            await provider.close()
        except Exception:
            pass

    # 5. 解析 JSON
    try:
        data = _parse_llm_json(raw_response)
    except (LLMException, json.JSONDecodeError):
        return None

    # 6. 组装响应
    from datetime import datetime, timezone

    strategy_points = _safe_list(data, "strategy_points")
    action_recommendations = _safe_list(data, "action_recommendations")
    evidence_reinforcement = _safe_list(data, "evidence_reinforcement")
    risk_warnings = _safe_list(data, "risk_warnings")
    recommended_strategy_text = str(data.get("recommended_strategy_text") or "")

    # 置信度：LLM 返回的置信度与材料完备度取加权
    llm_confidence = _clamp(float(data.get("confidence") or 0.6), 0.0, 1.0)
    material_score = getattr(context.material_completeness, "score", 0) if context.material_completeness else 0
    # 加权：LLM 置信度 70% + 材料完备度 30%
    final_confidence = _clamp(
        llm_confidence * 0.7 + (material_score / 100) * 0.3,
        0.0, 0.95,  # LLM 阶段上限 0.95
    )

    # 如果 LLM 返回的字段为空，降级
    if not strategy_points or not recommended_strategy_text:
        return None

    # 类案来源引用
    source_refs: list[AiSourceRefVO] = []
    ctx_refs = getattr(context, "source_refs", []) or []
    for r in ctx_refs:
        if isinstance(r, AiSourceRefVO):
            source_refs.append(r)

    for c in similar_cases[:3]:
        excerpt = c.match_reason or ""
        if len(excerpt) > 80:
            excerpt = excerpt[:80] + "..."
        source_refs.append(AiSourceRefVO(
            source_type="EXTERNAL_CASE",
            source_id=c.external_doc_id or c.display_id,
            source_name=c.title,
            field_path="external_es.hit",
            excerpt=excerpt,
            confidence=c.similarity,
        ))

    # 既有策略复核提示
    if existing_strategy:
        risk_warnings.insert(
            0,
            f"案件已有策略草稿（方向：{getattr(existing_strategy, 'direction', '未指定')}，"
            f"胜诉率：{getattr(existing_strategy, 'win_probability', getattr(existing_strategy, 'estimated_win_rate', 0))}%），"
            f"本次 LLM 分析仅为复核参考，采纳时请注意比对差异。"
        )

    return StrategyRecommendResponse(
        is_stub=False,           # LLM 生成不再是 stub
        run_mode="LLM",
        generated_at=datetime.now(timezone.utc),
        confidence=round(final_confidence, 2),
        source_refs=source_refs,
        material_completeness=context.material_completeness or MaterialCompletenessVO(score=0, level="LOW"),
        pending_material_tasks=getattr(context, "pending_material_tasks", []) or [],
        case_id=context.case_id,
        case_auto_summary=getattr(context, "case_summary", "") or "案件信息待补充。",
        similar_cases=similar_cases,
        strategy_points=strategy_points,
        action_recommendations=action_recommendations,
        evidence_reinforcement=evidence_reinforcement,
        risk_warnings=risk_warnings,
        recommended_strategy_text=recommended_strategy_text,
    )
