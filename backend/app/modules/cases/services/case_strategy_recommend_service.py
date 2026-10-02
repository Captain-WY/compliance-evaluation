"""案件策略建议编排服务 (WP-AI-04).

自动汇聚案件上下文、外部类案检索结果和既有策略信息，
生成可人工采纳的策略建议草稿。不保存 case_strategies，不归档文书，不调用真实 LLM。

参考:
  - docs/plan/2026Q2_AI_CASE_ASSISTANT_WP_AI_04_STRATEGY_RECOMMEND_SERVICE_DESIGN.md
"""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from ..core.exceptions import BusinessException
from ..models.sys_users import SysUser
from ..schemas.case_ai import (
    StrategyRecommendRequest,
    StrategyRecommendResponse,
    SimilarCaseItemVO,
    MaterialCompletenessVO,
    AiSourceRefVO,
    SimilarCaseSearchRequest as ExternalCaseSearchRequest,
)
from ..services.case_ai_context_service import CaseAiContextBuilder, CaseAiContextBuildRequest
from ..services import case_strategy_service
from ..services import external_case_search_service
from ..services import case_strategy_llm_service


# ---------------------------------------------------------------------------
# 规则化策略生成
# ---------------------------------------------------------------------------

def _compose_strategy_points(context: Any, similar_cases: list[SimilarCaseItemVO]) -> list[str]:
    """基于案件上下文和类案生成策略要点."""
    points: list[str] = []

    cause = getattr(context, "cause_of_action", None) or ""
    our_role = _get_our_role_desc(context)
    focus = getattr(context, "dispute_focus", []) or []

    # 要点 1: 案由与角色定位
    if cause:
        points.append(f"本案案由为{cause}，我方作为{our_role}，需重点把握举证责任和抗辩要点。")

    # 要点 2: 争议焦点
    if focus:
        points.append(f"核心争议焦点包括：{', '.join(focus[:3])}。")

    # 要点 3: 类案裁判倾向
    if similar_cases:
        outcomes: list[str] = []
        for c in similar_cases[:3]:
            if c.referee_result:
                outcomes.append(c.referee_result)
        if outcomes:
            from collections import Counter
            most_common = Counter(outcomes).most_common(1)[0]
            points.append(
                f"参考类案中裁判结果为'{most_common[0]}'的占比最高({most_common[1]}宗)，"
                f"可作为策略倾向参考。"
            )

    # 要点 4: 材料完备度提示
    completeness = getattr(context, "material_completeness", None)
    if completeness:
        level = getattr(completeness, "level", "LOW")
        if level == "LOW":
            points.append("当前材料完备度较低，建议在正式应诉前补充当事人信息和关键证据。")
        elif level == "MEDIUM":
            points.append("材料基本齐全，但卷宗解析和财务信息仍有提升空间。")
        else:
            points.append("材料较为完备，可基于现有信息制定针对性策略。")

    # 要点 5: 金额策略
    amount = getattr(context, "amount_summary", None)
    if amount:
        target = getattr(amount, "target_amount", None)
        provision = getattr(amount, "provision_amount", None)
        if target and provision:
            try:
                t = Decimal(str(target))
                p = Decimal(str(provision))
                ratio = p / t if t > 0 else Decimal("0")
                if ratio >= Decimal("0.5"):
                    points.append(
                        f"预计负债占标的额比例较高({float(ratio):.0%})，"
                        f"建议优先考虑和解或调解方案以降低损失。"
                    )
                else:
                    points.append(
                        f"预计负债占标的额比例适中({float(ratio):.0%})，"
                        f"可根据证据充分程度选择积极应诉或和解。"
                    )
            except Exception:
                pass

    # 要点 6: 阶段策略
    stage = getattr(context, "case_summary", "")
    if "一审" in stage or "立案" in stage:
        points.append("案件尚处早期阶段，建议抓紧证据收集和管辖权评估。")
    elif "二审" in stage:
        points.append("案件进入二审，需聚焦一审裁判逻辑和上诉要点。")
    elif "执行" in stage:
        points.append("案件处于执行阶段，重点转向财产线索查找和执行异议策略。")

    return points[:6]


def _compose_action_recommendations(context: Any) -> list[str]:
    """生成行动建议."""
    actions: list[str] = []

    # 诉讼动作
    actions.append("整理并核对案件全部证据材料，制作证据清单和证明目的说明。")
    actions.append("评估管辖权异议可行性，必要时在答辩期内提出。")

    # 沟通动作
    actions.append("与对方当事人或其代理律师进行初步沟通，了解和解决意愿。")

    # 内部协同
    actions.append("协调业务部门补充合同文本、往来函件和付款凭证。")

    # 时限动作
    actions.append("梳理案件关键时限节点（答辩期、举证期、上诉期），设置提醒。")

    # 根据阶段增加
    stage = getattr(context, "case_summary", "")
    if "一审" in stage or "立案" in stage:
        actions.append("在举证期限内完成证据提交，申请必要的证人出庭。")
    if "执行" in stage:
        actions.append("向法院申请财产调查令，查找被执行人财产线索。")

    return actions[:6]


def _compose_evidence_reinforcement(
    context: Any, pending_tasks: list[str]
) -> list[str]:
    """生成证据补强建议."""
    suggestions: list[str] = []

    # 基础补强
    suggestions.append("补充合同文本原件或经公证的复印件，确保证据链完整。")
    suggestions.append("整理付款流水、发票和财务凭证，证明履行情况。")

    # 基于待补材料
    for task in pending_tasks[:3]:
        if "卷宗" in task or "材料" in task:
            suggestions.append("上传并解析关键卷宗材料，提取结构化证据摘要。")
        if "当事人" in task:
            suggestions.append("完善当事人信息和诉求要点，明确争议边界。")

    # 基于卷宗解析状态
    dossier = getattr(context, "dossier_summary", None)
    if dossier:
        pending = getattr(dossier, "pending_count", 0)
        failed = getattr(dossier, "failed_count", 0)
        if pending > 0:
            suggestions.append(f"尚有 {pending} 份卷宗待解析，解析完成后可提取更多证据要点。")
        if failed > 0:
            suggestions.append(f"有 {failed} 份卷宗解析失败，建议人工复核或重新上传。")

    return suggestions[:5]


def _compose_risk_warnings(
    context: Any,
    similar_cases: list[SimilarCaseItemVO],
    case_search_stub: bool,
    pending_tasks: list[str],
) -> list[str]:
    """生成风险提示."""
    warnings: list[str] = []

    # 材料风险
    completeness = getattr(context, "material_completeness", None)
    if completeness:
        level = getattr(completeness, "level", "LOW")
        if level == "LOW":
            warnings.append("当前材料完备度较低，策略建议置信度有限，建议补充材料后再制定详细方案。")
        elif level == "MEDIUM":
            warnings.append("材料基本齐全，但部分关键信息仍待补充，策略存在调整空间。")

    # 金额风险
    amount = getattr(context, "amount_summary", None)
    if amount:
        target = getattr(amount, "target_amount", None)
        if target:
            try:
                t = Decimal(str(target))
                if t >= Decimal("10000000"):
                    warnings.append(f"标的额达{t/10000:.0f}万元，属重大案件，重大决策需经合规审批。")
            except Exception:
                pass

    # 外部检索降级提示
    if case_search_stub:
        warnings.append("外部类案检索未返回结果，策略建议未充分参考类案裁判倾向，请人工补充类案研究。")

    # 类案差异提示
    if similar_cases and not case_search_stub:
        warnings.append("类案参考仅供策略方向参考，具体案件事实差异可能导致裁判结果不同。")

    # 人工复核提示
    warnings.append("本策略建议为 AI 辅助生成草稿，最终策略需由经办律师和法律合规部门审核确认。")

    return warnings


def _compose_recommended_text(
    context: Any,
    similar_cases: list[SimilarCaseItemVO],
    strategy_points: list[str],
    actions: list[str],
    evidence: list[str],
    risks: list[str],
) -> str:
    """拼装推荐策略正文草稿."""
    lines: list[str] = []

    # 一、案件自动摘要
    lines.append("一、案件自动摘要")
    summary = getattr(context, "case_summary", "") or "案件信息待补充。"
    lines.append(summary)
    lines.append("")

    # 二、类案参考与裁判倾向
    lines.append("二、类案参考与裁判倾向")
    if similar_cases:
        for i, c in enumerate(similar_cases[:5], 1):
            sim_pct = f"{c.similarity * 100:.0f}%" if c.similarity else "N/A"
            lines.append(
                f"{i}. {c.title}（相似度 {sim_pct}）"
            )
            if c.referee_result:
                lines.append(f"   裁判结果：{c.referee_result}")
            if c.match_reason:
                lines.append(f"   匹配理由：{c.match_reason}")
    else:
        lines.append("暂无高相似外部类案参考。")
    lines.append("")

    # 三、应对策略要点
    lines.append("三、应对策略要点")
    for i, p in enumerate(strategy_points, 1):
        lines.append(f"{i}. {p}")
    lines.append("")

    # 四、近期行动建议
    lines.append("四、近期行动建议")
    for i, a in enumerate(actions, 1):
        lines.append(f"{i}. {a}")
    lines.append("")

    # 五、证据补强建议
    lines.append("五、证据补强建议")
    for i, e in enumerate(evidence, 1):
        lines.append(f"{i}. {e}")
    lines.append("")

    # 六、风险提示与人工复核事项
    lines.append("六、风险提示与人工复核事项")
    for i, r in enumerate(risks, 1):
        lines.append(f"{i}. {r}")

    text = "\n".join(lines)
    # 控制长度
    if len(text) > 4500:
        text = text[:4500] + "\n\n（策略正文已截断，请基于要点补充细节。）"
    return text


# ---------------------------------------------------------------------------
# 辅助函数
# ---------------------------------------------------------------------------

def _get_our_role_desc(context: Any) -> str:
    """获取我方角色描述."""
    claim_defense = getattr(context, "claim_and_defense", None)
    if claim_defense:
        our_claim = getattr(claim_defense, "our_claim", None)
        opponent_claim = getattr(claim_defense, "opponent_claim", None)
        if our_claim and opponent_claim:
            return "争议方"
        elif our_claim:
            return "主张方"
        elif opponent_claim:
            return "被主张方"
    summary = getattr(context, "case_summary", "")
    if "原告" in summary or "申请人" in summary:
        return "原告/申请人"
    if "被告" in summary or "被申请人" in summary:
        return "被告/被申请人"
    return "争议方"


def _compute_confidence(
    material_score: int,
    has_similar_cases: bool,
    has_dossier_summary: bool,
    has_dispute_focus: bool,
    has_amount_info: bool,
) -> float:
    """计算置信度."""
    # 基础分: material_completeness.score 折算 0-0.6
    base = min(material_score / 100 * 0.6, 0.6)

    # 类案加分
    if has_similar_cases:
        base += 0.12

    # 卷宗摘要加分
    if has_dossier_summary:
        base += 0.03

    # 争议焦点加分
    if has_dispute_focus:
        base += 0.03

    # 金额信息加分
    if has_amount_info:
        base += 0.02

    # 规则化生成阶段上限 0.72
    return min(round(base, 2), 0.72)


def _merge_source_refs(
    context: Any,
    similar_cases: list[SimilarCaseItemVO],
) -> list[AiSourceRefVO]:
    """合并 AI-S1 上下文来源与类案来源."""
    refs: list[AiSourceRefVO] = []

    # 上下文来源
    ctx_refs = getattr(context, "source_refs", []) or []
    for r in ctx_refs:
        if isinstance(r, AiSourceRefVO):
            refs.append(r)

    # 类案来源
    for c in similar_cases[:3]:
        excerpt = c.match_reason or ""
        if len(excerpt) > 80:
            excerpt = excerpt[:80] + "..."
        refs.append(AiSourceRefVO(
            source_type="EXTERNAL_CASE",
            source_id=c.external_doc_id or c.display_id,
            source_name=c.title,
            field_path="external_es.hit",
            excerpt=excerpt,
            confidence=c.similarity,
        ))

    return refs


# ---------------------------------------------------------------------------
# 主入口
# ---------------------------------------------------------------------------


async def recommend_strategy(
    db: AsyncSession,
    tenant_id: str,
    req: StrategyRecommendRequest,
    current_user: SysUser,
) -> StrategyRecommendResponse:
    """生成案件策略建议草稿.

    调用链:
      1. CaseAiContextBuilder.build(case_id) -> 案件上下文 + 权限校验
      2. case_strategy_service.get_by_case(case_id) -> 既有策略
      3. external_case_search_service.search_similar_cases() -> 外部类案（top_k > 0）
      4. 规则化拼装 -> StrategyRecommendResponse
    """
    case_id = req.case_id
    top_k = req.top_k
    source_scope = req.source_scope or "EXTERNAL"

    # 1. 构建案件 AI 上下文（含权限校验）
    builder = CaseAiContextBuilder()
    ctx_req = CaseAiContextBuildRequest(
        case_id=case_id,
        include_documents=True,
        include_finance=True,
    )
    try:
        context = await builder.build(db, tenant_id, case_id, current_user, ctx_req)
    except Exception as e:
        raise BusinessException(
            code=4300,
            message=f"案件上下文构建失败: {getattr(e, 'message', str(e))}",
        )

    # 2. 获取既有策略
    existing_strategy = await case_strategy_service.get_by_case(db, tenant_id, case_id)

    # 3. 外部类案检索（top_k=0 时跳过）
    similar_cases: list[SimilarCaseItemVO] = []
    case_search_stub = True
    case_search_warnings: list[str] = []

    if top_k > 0:
        try:
            search_req = ExternalCaseSearchRequest(
                case_id=case_id,
                top_k=top_k,
                source_scope=source_scope,
            )
            search_result = await external_case_search_service.search_similar_cases(
                db, tenant_id, search_req, current_user
            )
            similar_cases = search_result.items
            case_search_stub = search_result.is_stub
            case_search_warnings = search_result.warnings
        except Exception:
            # 类案检索失败不阻断策略生成
            similar_cases = []
            case_search_stub = True
            case_search_warnings = ["外部类案检索失败，策略建议未包含类案参考"]

    # 4. LLM 类案深度分析（优先于规则化生成）
    print(f"[LLM_DEBUG_SVC] similar_cases={len(similar_cases)}, stub={case_search_stub}")
    if similar_cases:
        try:
            llm_result = await case_strategy_llm_service.analyze_with_llm(
                context=context,
                similar_cases=similar_cases,
                existing_strategy=existing_strategy,
            )
            print(f"[LLM_DEBUG_SVC] llm_result={llm_result is not None}")
            if llm_result is not None:
                # LLM 分析成功，直接返回
                print(f"[LLM_DEBUG_SVC] Returning LLM result, is_stub={llm_result.is_stub}")
                return llm_result
        except Exception as e:
            # LLM 分析失败不阻断，降级到规则化生成
            import traceback
            print(f"[LLM_DEBUG_SVC] analyze_with_llm EXCEPTION: {type(e).__name__}: {e}")
            traceback.print_exc()
            pass

    # 5. 提取关键信息（规则化降级路径）
    case_auto_summary = getattr(context, "case_summary", "") or "案件信息待补充。"
    material_completeness = getattr(context, "material_completeness", None)
    material_score = getattr(material_completeness, "score", 0) if material_completeness else 0
    pending_tasks = getattr(context, "pending_material_tasks", []) or []
    dispute_focus = getattr(context, "dispute_focus", []) or []
    amount_summary = getattr(context, "amount_summary", None)
    dossier_summary = getattr(context, "dossier_summary", None)

    # 5. 规则化生成各字段
    strategy_points = _compose_strategy_points(context, similar_cases)
    action_recommendations = _compose_action_recommendations(context)
    evidence_reinforcement = _compose_evidence_reinforcement(context, pending_tasks)
    risk_warnings = _compose_risk_warnings(
        context, similar_cases, case_search_stub, pending_tasks
    )

    # 如果已有策略，增加复核提示
    if existing_strategy:
        risk_warnings.insert(
            0,
            f"案件已有策略草稿（方向：{existing_strategy.direction}，"
            f"胜诉率：{existing_strategy.win_probability}%），"
            f"本次生成仅为复核参考，采纳时请注意比对差异。"
        )

    recommended_strategy_text = _compose_recommended_text(
        context,
        similar_cases,
        strategy_points,
        action_recommendations,
        evidence_reinforcement,
        risk_warnings,
    )

    # 6. 计算置信度
    confidence = _compute_confidence(
        material_score=material_score,
        has_similar_cases=bool(similar_cases),
        has_dossier_summary=dossier_summary is not None,
        has_dispute_focus=bool(dispute_focus),
        has_amount_info=getattr(amount_summary, "target_amount", None) is not None,
    )

    # 7. 确定 run_mode
    if case_search_stub or not similar_cases:
        run_mode = "CONTEXT_ONLY"
    else:
        run_mode = "EXTERNAL_SEARCH"

    # 8. 合并 warnings
    all_warnings = list(case_search_warnings)
    for w in risk_warnings:
        if w not in all_warnings:
            all_warnings.append(w)

    # 9. source_refs
    source_refs = _merge_source_refs(context, similar_cases)

    return StrategyRecommendResponse(
        is_stub=True,  # 规则化生成阶段始终 stub
        run_mode=run_mode,
        generated_at=datetime.now(timezone.utc),
        confidence=confidence,
        source_refs=source_refs,
        material_completeness=material_completeness or MaterialCompletenessVO(
            score=0, level="LOW"
        ),
        pending_material_tasks=pending_tasks,
        case_id=case_id,
        case_auto_summary=case_auto_summary,
        similar_cases=similar_cases,
        strategy_points=strategy_points,
        action_recommendations=action_recommendations,
        evidence_reinforcement=evidence_reinforcement,
        risk_warnings=risk_warnings,
        recommended_strategy_text=recommended_strategy_text,
    )
