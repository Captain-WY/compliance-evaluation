"""案件 AI 上下文构建服务 (WP-AI-01).

CaseAiContextBuilder 聚合案件主表、当事人、策略、卷宗、结案复盘、财务快照等
多源数据，生成统一的 AI 分析标准上下文。即使只有案件主表字段也能返回可读的
降级上下文，并通过 pending_material_tasks 告知用户哪些材料会提升结论质量。

参考:
  - docs/plan/2026Q2_AI_CASE_ASSISTANT_WP_AI_01_CONTEXT_BUILDER_DESIGN.md
"""
from __future__ import annotations
from app.adapters.identity import case_role_codes

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.exceptions import NotFoundException, BusinessException
from ..enums.case_enums import CaseMemberStatus
from ..models.cases import Case
from ..models.case_parties import CaseParty
from ..models.case_strategies import CaseStrategy
from ..models.case_documents import CaseDocument
from ..models.case_closures import CaseClosure
from ..models.case_members import CaseMember
from ..models.sys_users import SysUser
from ..models.sys_roles import SysRole
from ..models.sys_user_roles import SysUserRole
from ..models.sys_dicts import SysDict
from ..schemas.case_ai import (
    CaseAiContextBuildRequest,
    CaseAiContextBuildResponse,
    ClaimDefenseVO,
    AmountSummaryVO,
    StrategySnapshotVO,
    ClosureSnapshotVO,
    DossierDocumentSummaryVO,
    DossierSummaryVO,
    MaterialCompletenessVO,
    AiSourceRefVO,
    DocumentParseStatus,
)
from ..services import case_finance_service
from ..schemas.case_finance import FinanceSnapshotRequest

# ---------------------------------------------------------------------------
# 模块级辅助函数
# ---------------------------------------------------------------------------


async def _load_case_or_404(
    session: AsyncSession,
    tenant_id: str,
    case_id: str,
) -> Case:
    """加载案件，不存在时抛 NotFoundException."""
    case = (
        await session.execute(
            select(Case).where(
                and_(
                    Case.id == case_id,
                    Case.tenant_id == tenant_id,
                    Case.is_deleted.is_(False),
                )
            )
        )
    ).scalar_one_or_none()
    if case is None:
        raise NotFoundException(resource="案件", resource_id=case_id)
    return case


async def _check_case_access(
    session: AsyncSession,
    tenant_id: str,
    case_id: str,
    user: SysUser,
) -> None:
    """检查用户是否有案件读权限。无权限时抛 NotFoundException (不暴露存在性)."""
    # 1. 检查全局管理员角色
    global_roles = await _load_user_global_roles(session, tenant_id, str(user.id))
    if "SYS_ADMIN" in global_roles or "LEGAL_ADMIN" in global_roles:
        return

    # 2. 检查案件成员资格
    membership = (
        await session.execute(
            select(CaseMember).where(
                CaseMember.case_id == case_id,
                CaseMember.tenant_id == tenant_id,
                CaseMember.user_id == str(user.id),
                CaseMember.status == CaseMemberStatus.ACTIVE.value,
                CaseMember.is_deleted.is_(False),
            )
        )
    ).scalar_one_or_none()
    if membership is not None:
        return

    # 无权访问（返回 404 不暴露案件存在性）
    raise NotFoundException(resource="案件", resource_id=case_id)


async def _load_user_global_roles(
    session: AsyncSession,
    tenant_id: str,
    user_id: str,
) -> set[str]:
    """返回用户持有的全局角色代码集合."""
    rows = (
        await session.execute(
            select(SysRole.role_code)
            .select_from(SysUserRole)
            .join(SysRole, SysUserRole.role_id == SysRole.id)
            .where(
                SysUserRole.user_id == user_id,
                SysRole.tenant_id == tenant_id,
                SysRole.status == "ACTIVE",
            )
        )
    ).all()
    return case_role_codes(r[0] for r in rows)


async def _load_dict_map(
    session: AsyncSession,
    dict_types: tuple[str, ...],
) -> dict[str, dict[str, str]]:
    """批量加载字典 -> {dict_type: {dict_code: dict_name}}."""
    rows = (
        await session.execute(
            select(SysDict.dict_type, SysDict.dict_code, SysDict.dict_name).where(
                SysDict.dict_type.in_(dict_types),
                SysDict.is_deleted.is_(False),
                SysDict.is_active.is_(True),
            )
        )
    ).all()
    out: dict[str, dict[str, str]] = {}
    for dt, code, name in rows:
        out.setdefault(dt, {})[code] = name
    return out


# ---------------------------------------------------------------------------
# CaseAiContextBuilder
# ---------------------------------------------------------------------------


class CaseAiContextBuilder:
    """案件 AI 上下文构建器.

    聚合多源数据生成统一的 AI 分析标准上下文。
    支持降级运行：仅主表字段也可生成可读上下文。
    """

    def __init__(self) -> None:
        self._dict_map: dict[str, dict[str, str]] = {}

    # -- 字典翻译 --

    def _tr(self, dict_type: str, code: str | None) -> str | None:
        """字典翻译，失败时保留原 code."""
        if not code:
            return None
        return self._dict_map.get(dict_type, {}).get(code, code)

    # -- 主入口 --

    async def build(
        self,
        session: AsyncSession,
        tenant_id: str,
        case_id: str,
        user: SysUser,
        request: CaseAiContextBuildRequest,
    ) -> CaseAiContextBuildResponse:
        """构建案件 AI 上下文."""
        # 1. 权限检查
        await _check_case_access(session, tenant_id, case_id, user)

        # 2. 批量加载字典
        self._dict_map = await _load_dict_map(
            session,
            ("CASE_STAGE", "CAUSE_OF_ACTION", "RISK_LEVEL", "OUR_ROLE", "CASE_TYPE"),
        )

        # 3. 加载案件主表
        case = await _load_case_or_404(session, tenant_id, case_id)

        # 4. 加载关联数据（串行即可，数据量小）
        parties = await self._load_parties(session, tenant_id, case_id)
        strategy = await self._load_strategy(session, tenant_id, case_id)
        documents = await self._load_documents(session, tenant_id, case_id)
        closure = await self._load_closure(session, tenant_id, case_id)

        # 5. 可选加载财务
        finance_snapshot = None
        finance_error: str | None = None
        if request.include_finance:
            finance_snapshot, finance_error = await self._try_load_finance(
                session, tenant_id, case_id, user
            )

        # 6. 构建各上下文片段
        case_summary = self._build_case_summary(case)
        claim_defense = self._build_claim_defense(case, parties)
        dispute_focus = self._build_dispute_focus(case, parties, documents)
        amount_summary = self._build_amount_summary(case, finance_snapshot)
        evidence_summary = self._build_evidence_summary(documents)

        # 7. 构建快照
        strategy_snapshot = self._build_strategy_snapshot(strategy)
        closure_snapshot = self._build_closure_snapshot(closure)
        dossier_summary = self._build_dossier_summary(documents)

        # 8. 计算完备度
        completeness, pending_tasks = self._build_completeness(
            case=case,
            parties=parties,
            strategy=strategy,
            documents=documents,
            closure=closure,
            finance_snapshot=finance_snapshot,
            include_finance=request.include_finance,
            finance_error=finance_error,
        )

        # 9. 构建 source_refs
        source_refs = self._build_source_refs(
            case, parties, strategy, documents, closure
        )

        # 10. 组装响应
        confidence = (
            0.85 if completeness.level == "HIGH"
            else 0.7 if completeness.level == "MEDIUM"
            else 0.5
        )

        return CaseAiContextBuildResponse(
            is_stub=True,
            run_mode="MOCK",
            generated_at=datetime.now(timezone.utc),
            confidence=confidence,
            source_refs=source_refs,
            material_completeness=completeness,
            pending_material_tasks=pending_tasks,
            case_id=case_id,
            context_version="1.0",
            case_summary=case_summary,
            cause_of_action=case.case_cause,
            claim_and_defense=claim_defense,
            dispute_focus=dispute_focus,
            amount_summary=amount_summary,
            evidence_summary=evidence_summary,
            strategy_snapshot=strategy_snapshot,
            closure_snapshot=closure_snapshot,
            dossier_summary=dossier_summary,
        )

    # -- 数据加载 --

    async def _load_parties(
        self,
        session: AsyncSession,
        tenant_id: str,
        case_id: str,
    ) -> list[CaseParty]:
        """加载案件当事人列表."""
        result = await session.execute(
            select(CaseParty).where(
                CaseParty.case_id == case_id,
                CaseParty.tenant_id == tenant_id,
                CaseParty.is_deleted.is_(False),
            )
            .order_by(CaseParty.sort_order.asc())
        )
        return list(result.scalars().all())

    async def _load_strategy(
        self,
        session: AsyncSession,
        tenant_id: str,
        case_id: str,
    ) -> CaseStrategy | None:
        """加载案件最新策略 (version 最大)."""
        result = await session.execute(
            select(CaseStrategy).where(
                CaseStrategy.case_id == case_id,
                CaseStrategy.tenant_id == tenant_id,
                CaseStrategy.is_deleted.is_(False),
            )
            .order_by(CaseStrategy.version.desc(), CaseStrategy.updated_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def _load_documents(
        self,
        session: AsyncSession,
        tenant_id: str,
        case_id: str,
    ) -> list[CaseDocument]:
        """加载案件文档列表 (含 extended_data)."""
        result = await session.execute(
            select(CaseDocument).where(
                CaseDocument.case_id == case_id,
                CaseDocument.tenant_id == tenant_id,
                CaseDocument.is_deleted.is_(False),
            )
            .order_by(CaseDocument.upload_time.desc())
        )
        return list(result.scalars().all())

    async def _load_closure(
        self,
        session: AsyncSession,
        tenant_id: str,
        case_id: str,
    ) -> CaseClosure | None:
        """加载案件结案记录."""
        result = await session.execute(
            select(CaseClosure).where(
                CaseClosure.case_id == case_id,
                CaseClosure.tenant_id == tenant_id,
                CaseClosure.is_deleted.is_(False),
            )
        )
        return result.scalar_one_or_none()

    async def _try_load_finance(
        self,
        session: AsyncSession,
        tenant_id: str,
        case_id: str,
        user: SysUser,
    ) -> tuple[Any | None, str | None]:
        """尝试加载财务快照，无权限时降级返回 None 和错误信息."""
        try:
            payload = FinanceSnapshotRequest(case_id=case_id)
            snapshot = await case_finance_service.snapshot(
                session, tenant_id, payload, user
            )
            return snapshot, None
        except BusinessException as e:
            if e.code == 4013:
                return None, "当前用户无财务查看权限，金额摘要已降级"
            # 其他财务异常也降级，不阻断上下文构建
            return None, f"财务快照加载失败: {e.message}"
        except Exception as e:
            return None, f"财务快照加载异常: {str(e)}"

    # -- 上下文片段构建 --

    def _build_case_summary(self, case: Case) -> str:
        """构建案件自动摘要."""
        if case.description:
            return case.description

        parts: list[str] = []
        if case.case_name:
            parts.append(case.case_name)

        cause = self._tr("CAUSE_OF_ACTION", case.case_cause)
        if cause:
            parts.append(f"案由为{cause}")

        our_role = self._tr("OUR_ROLE", case.our_role)
        if our_role:
            parts.append(f"我方地位为{our_role}")

        opponent = case.defendant_name if case.our_role == "PLAINTIFF" else case.plaintiff_name
        if opponent:
            parts.append(f"主要相对方为{opponent}")

        if case.target_amount is not None:
            parts.append(f"标的额约{case.target_amount}元")

        stage = self._tr("CASE_STAGE", case.current_stage_code)
        if stage:
            parts.append(f"当前阶段为{stage}")

        if case.latest_progress:
            parts.append(f"最新进展为{case.latest_progress}")

        if parts:
            return "，".join(parts) + "。"
        return "案件信息待补充。"

    def _build_claim_defense(
        self,
        case: Case,
        parties: list[CaseParty],
    ) -> ClaimDefenseVO:
        """构建主诉/被诉要点."""
        our_role = case.our_role

        our_party = None
        opponent_party = None
        for p in parties:
            if p.is_our_side:
                our_party = p
            else:
                opponent_party = p

        # 根据我方角色判断谁是原告/被告
        vo = ClaimDefenseVO()

        if our_party and our_party.claim_details:
            vo.our_claim = our_party.claim_details
        elif our_party and our_party.claim_amount is not None:
            vo.our_claim = f"诉请金额{our_party.claim_amount}元"

        if opponent_party and opponent_party.claim_details:
            vo.opponent_claim = opponent_party.claim_details
        elif opponent_party and opponent_party.claim_amount is not None:
            vo.opponent_claim = f"诉请金额{opponent_party.claim_amount}元"

        # 当事人缺失时，用主表冗余字段合成简版
        if not parties or not vo.our_claim:
            if our_role == "PLAINTIFF" and case.plaintiff_name:
                vo.our_claim = f"原告{case.plaintiff_name}"
            elif our_role == "DEFENDANT" and case.defendant_name:
                vo.opponent_claim = f"原告{case.plaintiff_name}诉请{case.target_amount or '待定'}元"

        if not parties or not vo.opponent_claim:
            if our_role == "PLAINTIFF" and case.defendant_name:
                vo.opponent_claim = f"被告{case.defendant_name}"
            elif our_role == "DEFENDANT" and case.plaintiff_name:
                vo.our_claim = f"被告{case.defendant_name}"

        return vo

    def _build_dispute_focus(
        self,
        case: Case,
        parties: list[CaseParty],
        documents: list[CaseDocument],
    ) -> list[str]:
        """构建争议焦点列表."""
        focus: list[str] = []

        # 优先级 1: 卷宗 extracted_facts.focus_dispute
        for doc in documents:
            ai_data = self._extract_ai_data(doc)
            facts = ai_data.get("extracted_facts", {})
            if isinstance(facts, dict) and facts.get("focus_dispute"):
                fd = facts["focus_dispute"]
                if isinstance(fd, list):
                    focus.extend([str(f) for f in fd if f])
                elif isinstance(fd, str):
                    focus.append(fd)

        # 优先级 2: 卷宗 ai_summary 中的结构化争议焦点（简单启发式：按句号拆分）
        for doc in documents:
            ai_data = self._extract_ai_data(doc)
            summary = ai_data.get("ai_summary")
            if summary and isinstance(summary, str):
                # 如果摘要中包含"争议焦点"字样，提取该行
                for line in summary.split("\n"):
                    if "争议焦点" in line or "焦点" in line:
                        cleaned = line.strip().lstrip("-").strip()
                        if cleaned and cleaned not in focus:
                            focus.append(cleaned)

        # 优先级 3: 当事人 claim_details 与案件 description 的规则化切分
        if not focus:
            for p in parties:
                if p.claim_details:
                    # 简单切分：取前两句作为争议要点
                    sentences = [s.strip() for s in str(p.claim_details).split("。") if s.strip()]
                    for s in sentences[:2]:
                        if s not in focus:
                            focus.append(s)

        # 优先级 4: 最低降级
        if not focus:
            cause = self._tr("CAUSE_OF_ACTION", case.case_cause) or case.case_cause or ""
            stage = self._tr("CASE_STAGE", case.current_stage_code) or case.current_stage_code or ""
            target = f"标的额约{case.target_amount}元" if case.target_amount else "标的额待定"
            focus.append(f"{cause}纠纷，{target}，当前处于{stage}阶段")

        return focus

    def _build_amount_summary(
        self,
        case: Case,
        finance_snapshot: Any | None,
    ) -> AmountSummaryVO:
        """构建金额摘要."""
        vo = AmountSummaryVO(
            currency="CNY",
            target_amount=Decimal(case.target_amount) if case.target_amount else None,
            provision_amount=Decimal(case.provision_amount) if case.provision_amount else None,
        )

        if finance_snapshot is None:
            vo.finance_visible = False
            return vo

        vo.finance_visible = True

        # 从财务快照补充字段
        if hasattr(finance_snapshot, "claims"):
            claims = finance_snapshot.claims
            if claims:
                vo.claim_amount = Decimal(claims.our_claim_amount) if claims.our_claim_amount else None

        if hasattr(finance_snapshot, "judgments"):
            judgments = finance_snapshot.judgments
            if judgments:
                vo.judgment_amount = Decimal(judgments.final_amount) if judgments.final_amount else None

        if hasattr(finance_snapshot, "recoveries"):
            recoveries = finance_snapshot.recoveries
            if recoveries:
                vo.recovered_amount = Decimal(recoveries.recovered_amount) if recoveries.recovered_amount else None

        if hasattr(finance_snapshot, "legal_fees"):
            fees = finance_snapshot.legal_fees
            if fees:
                vo.budget_amount = Decimal(fees.budget_amount) if fees.budget_amount else None
                vo.paid_amount = Decimal(fees.paid_amount) if fees.paid_amount else None
                vo.pending_amount = Decimal(fees.pending_amount) if fees.pending_amount else None

        return vo

    def _build_evidence_summary(
        self,
        documents: list[CaseDocument],
    ) -> list[str]:
        """构建证据摘要列表."""
        summaries: list[str] = []
        for doc in documents:
            ai_data = self._extract_ai_data(doc)
            summary = ai_data.get("ai_summary")
            if summary:
                doc_name = doc.doc_name or "未命名文档"
                summaries.append(f"【{doc_name}】{summary}")
            else:
                parse_status = ai_data.get("parse_status", "PENDING")
                if parse_status == "PENDING_OCR":
                    doc_name = doc.doc_name or "未命名文档"
                    summaries.append(f"【{doc_name}】扫描件待 OCR 解析")
        return summaries

    def _build_strategy_snapshot(
        self,
        strategy: CaseStrategy | None,
    ) -> StrategySnapshotVO | None:
        """构建策略快照."""
        if strategy is None:
            return None
        return StrategySnapshotVO(
            strategy_id=str(strategy.id),
            strategy_text=strategy.content,
            win_rate=float(strategy.estimated_win_rate) if strategy.estimated_win_rate else None,
            risk_level=None,  # 模型无 risk_level 字段
            updated_at=strategy.updated_at,
        )

    def _build_closure_snapshot(
        self,
        closure: CaseClosure | None,
    ) -> ClosureSnapshotVO | None:
        """构建结案快照."""
        if closure is None:
            return None
        # improvement_plan 可能是 JSON 或字符串
        improvement = closure.improvement_plan
        actions: list[str] = []
        if improvement:
            if isinstance(improvement, str):
                actions = [s.strip() for s in improvement.split("\n") if s.strip()]
            elif isinstance(improvement, list):
                actions = [str(a) for a in improvement if a]
            elif isinstance(improvement, dict):
                actions = [f"{k}: {v}" for k, v in improvement.items()]

        return ClosureSnapshotVO(
            closure_id=str(closure.id),
            closure_type=closure.closure_type,
            closure_date=closure.closure_date,
            review_summary=closure.review_summary,
            improvement_actions=actions,
        )

    def _build_dossier_summary(
        self,
        documents: list[CaseDocument],
    ) -> DossierSummaryVO | None:
        """构建卷宗汇总."""
        if not documents:
            return None

        key_materials: list[DossierDocumentSummaryVO] = []
        parsed_count = 0
        pending_count = 0
        failed_count = 0

        for doc in documents:
            ai_data = self._extract_ai_data(doc)
            parse_status = ai_data.get("parse_status", "PENDING")
            if isinstance(parse_status, str):
                parse_status = parse_status.upper()

            # 计数
            if parse_status == "PARSED":
                parsed_count += 1
            elif parse_status in ("PENDING", "PENDING_OCR"):
                pending_count += 1
            elif parse_status == "FAILED":
                failed_count += 1

            # 结构化摘要
            facts = ai_data.get("extracted_facts", [])
            if not isinstance(facts, list):
                facts = [str(facts)] if facts else []

            key_materials.append(
                DossierDocumentSummaryVO(
                    document_id=str(doc.id),
                    document_name=doc.doc_name or "未命名",
                    doc_category=doc.doc_category,
                    parse_status=parse_status if parse_status in (
                        "PENDING", "PENDING_OCR", "PARSED", "FAILED", "SKIPPED"
                    ) else "PENDING",
                    ai_summary=ai_data.get("ai_summary"),
                    extracted_facts=[str(f) for f in facts if f],
                    proof_purpose=doc.proof_purpose,
                )
            )

        return DossierSummaryVO(
            total_documents=len(documents),
            parsed_count=parsed_count,
            pending_count=pending_count,
            failed_count=failed_count,
            key_materials=key_materials,
        )

    def _build_completeness(
        self,
        case: Case,
        parties: list[CaseParty],
        strategy: CaseStrategy | None,
        documents: list[CaseDocument],
        closure: CaseClosure | None,
        finance_snapshot: Any | None,
        include_finance: bool,
        finance_error: str | None,
    ) -> tuple[MaterialCompletenessVO, list[str]]:
        """构建材料完备度评分和待补任务列表.

        100 分制:
          案件主表 30 | 当事人诉辩 15 | 财务摘要 15 | 既有策略 10 |
          卷宗摘要 20 | 结案复盘 10
        """
        score = 0
        missing_items: list[str] = []
        pending_tasks: list[str] = []

        # 1. 案件主表 (30)
        if all([
            case.case_name,
            case.case_cause,
            case.our_role,
            case.target_amount is not None,
            case.current_stage_code,
            case.description,
        ]):
            score += 30
        else:
            missing_items.append("案件主表信息不完整")
            partial = sum(bool(x) for x in [
                case.case_name, case.case_cause, case.our_role,
                case.target_amount is not None, case.current_stage_code, case.description,
            ])
            score += int(30 * partial / 6)

        # 2. 当事人诉辩 (15)
        has_claims = any(p.claim_details or p.claim_amount is not None for p in parties)
        if parties and has_claims:
            score += 15
        else:
            missing_items.append("当事人诉辩信息缺失")
            score += 5 if parties else 0

        # 3. 财务摘要 (15)
        if include_finance:
            if finance_snapshot is not None:
                score += 15
            else:
                missing_items.append("财务摘要不可用")
                if finance_error:
                    pending_tasks.append(finance_error)
        # 如果不包含财务，不加分也不扣分

        # 4. 既有策略 (10)
        if strategy is not None:
            score += 10
        else:
            missing_items.append("尚未制定案件策略")

        # 5. 卷宗摘要 (20)
        has_parsed_doc = False
        for doc in documents:
            ai_data = self._extract_ai_data(doc)
            if ai_data.get("ai_summary") or ai_data.get("extracted_facts"):
                has_parsed_doc = True
                break
        if has_parsed_doc:
            score += 20
        else:
            missing_items.append("卷宗材料尚未解析或无可读摘要")
            if documents:
                pending_tasks.append("卷宗材料尚未完成 AI 解析，证据摘要仅基于案件字段生成")
            else:
                pending_tasks.append("尚未上传卷宗材料")

        # 6. 结案复盘 (10)
        if closure is not None and closure.review_summary:
            score += 10
        elif case.case_status == "CLOSED" or case.case_status == "ARCHIVED":
            # 已结案但未写复盘，提示缺失但不扣分（未结案不强制）
            missing_items.append("已结案但缺少复盘摘要")
        # 未结案案件不强制要求结案复盘

        # 映射等级
        if score >= 80:
            level = "HIGH"
        elif score >= 50:
            level = "MEDIUM"
        else:
            level = "LOW"

        return (
            MaterialCompletenessVO(
                score=min(score, 100),
                level=level,
                missing_items=missing_items,
            ),
            pending_tasks,
        )

    def _build_source_refs(
        self,
        case: Case,
        parties: list[CaseParty],
        strategy: CaseStrategy | None,
        documents: list[CaseDocument],
        closure: CaseClosure | None,
    ) -> list[AiSourceRefVO]:
        """构建来源引用列表."""
        refs: list[AiSourceRefVO] = []

        # 案件主表
        if case.description:
            refs.append(AiSourceRefVO(
                source_type="CASE",
                source_id=str(case.id),
                source_name=case.case_name,
                field_path="cases.description",
                excerpt=case.description[:80],
                confidence=0.8,
            ))

        # 当事人
        for p in parties:
            if p.claim_details:
                refs.append(AiSourceRefVO(
                    source_type="PARTY",
                    source_id=str(p.id),
                    source_name=p.party_name,
                    field_path="case_parties.claim_details",
                    excerpt=p.claim_details[:80],
                    confidence=0.7,
                ))

        # 策略
        if strategy and strategy.content:
            refs.append(AiSourceRefVO(
                source_type="STRATEGY",
                source_id=str(strategy.id),
                field_path="case_strategies.content",
                excerpt=strategy.content[:80],
                confidence=0.7,
            ))

        # 卷宗
        for doc in documents:
            ai_data = self._extract_ai_data(doc)
            if ai_data.get("ai_summary"):
                refs.append(AiSourceRefVO(
                    source_type="DOCUMENT",
                    source_id=str(doc.id),
                    source_name=doc.doc_name,
                    field_path="case_documents.extended_data.ai.ai_summary",
                    excerpt=ai_data["ai_summary"][:80],
                    confidence=0.6,
                ))

        # 结案
        if closure and closure.review_summary:
            refs.append(AiSourceRefVO(
                source_type="CLOSURE",
                source_id=str(closure.id),
                field_path="case_closures.review_summary",
                excerpt=closure.review_summary[:80],
                confidence=0.7,
            ))

        return refs

    # -- 工具方法 --

    @staticmethod
    def _extract_ai_data(doc: CaseDocument) -> dict[str, Any]:
        """安全提取卷宗 extended_data.ai 命名空间数据."""
        ed = doc.extended_data or {}
        if not isinstance(ed, dict):
            return {}
        ai = ed.get("ai")
        if not isinstance(ai, dict):
            return {}
        return ai


# ---------------------------------------------------------------------------
# 便捷函数（供 Router 直接调用）
# ---------------------------------------------------------------------------


async def build_case_ai_context(
    session: AsyncSession,
    tenant_id: str,
    case_id: str,
    user: SysUser,
    request: CaseAiContextBuildRequest,
) -> CaseAiContextBuildResponse:
    """便捷函数：构建案件 AI 上下文."""
    builder = CaseAiContextBuilder()
    return await builder.build(session, tenant_id, case_id, user, request)
