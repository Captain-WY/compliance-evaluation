"""案件新建 + 草稿 + 线索预填 Service (切片 2.S10).

实现 5 方法:
    1. create_case       — 主事务 8 步 (cases + 卷宗目录初始化 + parties + members + budget + draft_del + clue_update + audit)
    2. save_draft        — 草稿保存/更新 (owner 隔离, TTL=30d)
    3. list_drafts       — 当前用户草稿列表 (D2=A)
    4. delete_draft      — 软删草稿 (owner 自检)
    5. prepare_from_clue — 线索纯只读预填 (Q7 默认 CIVIL_LITIGATION)

决策落地 (见 11_case_creation_api_plan.md §10 速查):
    Q1 internal_case_no: {YEAR}-{BUSINESS_LINE}-{SEQ4}
    Q2 dispute_id: DSP-{UUID12}
    Q3 parties: INSERT-only, 同名同类型 4003
    Q4 members: 自动补 OWNER (current_user if not present)
    Q6 draft_data: dict[str, Any] + <=100KB
    Q7 from-clue: case_type_code 默认 CIVIL_LITIGATION
    Q8 clue 可 prepare: NEW/FOLLOWING/REJECTED/CLOSED; CONVERTED 拒 4003
"""
from __future__ import annotations

import json
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.exceptions import BusinessException, NotFoundException
from ..enums import CaseMemberRole, CaseSource, ClueStatus
from ..models.case_budgets import CaseBudget
from ..models.case_clues import CaseClue
from ..models.case_document_folders import CaseDocumentFolder
from ..models.case_documents import CaseDocument
from ..models.case_drafts import CaseDraft
from ..models.case_members import CaseMember
from ..models.case_parties import CaseParty
from ..models.cases import Case
from ..models.sys_users import SysUser
from ..schemas.case_creation import (
    CaseCreateRequest,
    CaseCreateResponse,
    DraftDeleteRequest,
    DraftDeleteResponse,
    DraftItemVO,
    DraftSaveRequest,
    DraftSaveResponse,
    DraftsListRequest,
    DraftsListResponse,
    FromCluePrepareRequest,
    FromCluePrepareResponse,
    PreparedDraftPayload,
)
from .audit_log_service import write_audit_log
from .case_process_service import expand_process_template


# =============================================================================
# 常量
# =============================================================================

DRAFT_TTL_DAYS = 30  # D3=C
DRAFT_DATA_MAX_BYTES = 100 * 1024  # Q6: 100KB
DEFAULT_CASE_TYPE_ON_CLUE = "CIVIL_LITIGATION"  # Q7

# 立案时自动初始化的标准卷宗目录 (5 大分类)
DEFAULT_DOSSIER_FOLDERS: list[dict[str, Any]] = [
    {"folder_name": "程序卷", "sort_order": 10},
    {"folder_name": "证据卷", "sort_order": 20},
    {"folder_name": "审理卷", "sort_order": 30},
    {"folder_name": "执行卷", "sort_order": 40},
    {"folder_name": "内部卷", "sort_order": 50},
]


# =============================================================================
# 辅助: internal_case_no / dispute_id 生成 (Q1 / Q2)
# =============================================================================


async def _gen_internal_case_no(
    session: AsyncSession, tenant_id: str, business_line: str | None
) -> str:
    """Q1: {YEAR}-{BUSINESS_LINE}-{SEQ4}; business_line 为空则回落 OTHER.

    注: SQL 中 `col == None` 翻译为 `col = NULL` 恒为 False (非 NULL-safe),
        因此 business_line=None 时必须用 `col.is_(None)` 显式匹配空值,
        否则多个无业务线案件会重复计数为 1.
    """
    bl = (business_line or "OTHER").upper()
    year = datetime.now(timezone.utc).year

    base_conditions = [
        Case.tenant_id == tenant_id,
        func.extract("year", Case.created_at) == year,
    ]
    if business_line is None:
        base_conditions.append(Case.business_line.is_(None))
    else:
        base_conditions.append(Case.business_line == business_line)

    cnt = (
        await session.execute(
            select(func.count(Case.id)).where(and_(*base_conditions))
        )
    ).scalar_one() or 0
    seq = int(cnt) + 1
    return f"{year}-{bl}-{seq:04d}"


def _gen_dispute_id() -> str:
    """Q2: DSP-{UUID12}."""
    return f"DSP-{uuid.uuid4().hex[:12]}"


# =============================================================================
# 1. create_case (主事务)
# =============================================================================


async def create_case(
    session: AsyncSession,
    tenant_id: str,
    payload: CaseCreateRequest,
    user: SysUser,
) -> CaseCreateResponse:
    """主事务 8 步:
    1. 生成/校验 internal_case_no + dispute_id
    2. INSERT cases (含 extended_data=None)
    2.5 INSERT case_document_folders 标准卷宗目录 (5 大分类)
    2.6 模板展开 (process_template → process_instance + process_nodes)
    3. INSERT case_parties (批量, INSERT-only, Q3 冲突校验)
    4. INSERT case_members (Q4 自动补 OWNER)
    5. INSERT case_budgets (若携带)
    6. UPDATE case_drafts SET is_deleted=TRUE (若携带 draft_id)
    7. UPDATE case_clues SET status=CONVERTED + converted_case_id (若携带 source_clue_id)
    8. 附件校验 (若携带 attachments)
    9. 审计: CASES.CREATE + PARTIES.CREATE×N + MEMBERS.CREATE×N
    """
    warnings: list[str] = []

    # 使用 begin_nested() 兼容 FastAPI 依赖注入中 get_current_user 已触发 autobegin 的场景
    async with session.begin_nested():
        # --- Step 1: 生成编号 ---
        internal_case_no = payload.internal_case_no or await _gen_internal_case_no(
            session, tenant_id, payload.business_line
        )
        dispute_id = payload.dispute_id or _gen_dispute_id()

        # 幂等: 主事务内提前查重 (Bind 级唯一约束作为最终保障)
        dup = (
            await session.execute(
                select(Case.id).where(
                    and_(
                        Case.tenant_id == tenant_id,
                        Case.internal_case_no == internal_case_no,
                        Case.is_deleted.is_(False),
                    )
                )
            )
        ).scalar_one_or_none()
        if dup is not None:
            raise BusinessException(
                code=4003,
                message=f"案件编号 {internal_case_no} 已存在 (case_id={dup})",
            )

        # --- Step 2: INSERT cases ---
        case_id = f"case_{uuid.uuid4().hex[:12]}"
        case = Case(
            id=case_id,
            tenant_id=tenant_id,
            internal_case_no=internal_case_no,
            external_case_no=payload.external_case_no,
            case_name=payload.case_name,
            description=payload.description,
            case_type_code=payload.case_type_code,
            case_source=payload.case_source.value,
            business_line=payload.business_line,
            case_cause=payload.case_cause,
            risk_level=payload.risk_level.value if payload.risk_level else None,
            is_investor_protection=payload.is_investor_protection,
            is_major=payload.is_major,
            sector=payload.sector.value if payload.sector else None,
            our_role=payload.our_role.value if payload.our_role else None,
            plaintiff_name=payload.plaintiff_name,
            defendant_name=payload.defendant_name,
            target_amount=payload.target_amount,
            provision_amount=payload.provision_amount,
            target_subject=payload.target_subject,
            accepting_court=payload.accepting_court,
            presiding_judge=payload.presiding_judge,
            judge_contact=payload.judge_contact,
            handling_lawyer_id=payload.handling_lawyer_id,
            dispute_id=dispute_id,
            procedure_type=payload.procedure_type.value if payload.procedure_type else None,
            current_stage_code="FILING",
            case_status="PENDING",
            filing_date=payload.filing_date,
        )
        session.add(case)
        await session.flush()

        # --- Step 2.5: 初始化标准卷宗目录 (5 大分类) ---
        for folder_def in DEFAULT_DOSSIER_FOLDERS:
            folder_id = f"folder_{uuid.uuid4().hex[:12]}"
            session.add(
                CaseDocumentFolder(
                    id=folder_id,
                    tenant_id=tenant_id,
                    case_id=case_id,
                    parent_id=None,
                    folder_name=folder_def["folder_name"],
                    sort_order=folder_def["sort_order"],
                    is_system=True,
                    created_by=user.id,
                    updated_by=user.id,
                )
            )

        # --- Step 2.6: 模板展开 (process_template → process_instance + process_nodes) ---
        instance_id, node_ids = await expand_process_template(
            session,
            tenant_id=tenant_id,
            case_id=case_id,
            case_type_code=payload.case_type_code,
            stage_code="FILING",
            user_id=user.id,
        )
        if instance_id:
            warnings.append(
                f"流程实例已生成: {instance_id} ({len(node_ids)} 个节点)"
            )

        # --- Step 3: INSERT parties (Q3 INSERT-only) ---
        party_ids: list[str] = []
        seen_party_keys: set[tuple[str, str]] = set()
        for p in payload.parties:
            key = (p.party_name, p.party_type.value)
            if key in seen_party_keys:
                raise BusinessException(
                    code=4003,
                    message=f"当事人 {p.party_name}({p.party_type.value}) 重复",
                )
            seen_party_keys.add(key)
            party_id = f"party_{uuid.uuid4().hex[:12]}"
            session.add(
                CaseParty(
                    id=party_id,
                    tenant_id=tenant_id,
                    case_id=case_id,
                    party_type=p.party_type.value,
                    is_our_side=p.is_our_side,
                    party_name=p.party_name,
                    identity_type=p.identity_type.value,
                    identity_number=p.identity_number,
                    legal_representative=p.legal_representative,
                    contact_number=p.contact_number,
                    service_address=p.service_address,
                    claim_amount=p.claim_amount,
                    claim_details=p.claim_details,
                    created_by=user.id,
                    updated_by=user.id,
                )
            )
            party_ids.append(party_id)

        # --- Step 4: INSERT members (Q4 自动补 OWNER) ---
        normalized_members: list[tuple[str, str]] = []  # (user_id, role_code)
        has_current_user = False
        for m in payload.members:
            normalized_members.append((m.user_id, m.role_code.value))
            if m.user_id == user.id:
                has_current_user = True
        if not has_current_user:
            normalized_members.append((user.id, CaseMemberRole.OWNER.value))

        member_ids: list[str] = []
        today = date.today()
        for uid, role in normalized_members:
            member_id = f"mem_{uuid.uuid4().hex[:12]}"
            session.add(
                CaseMember(
                    id=member_id,
                    tenant_id=tenant_id,
                    case_id=case_id,
                    user_id=uid,
                    role_code=role,
                    status="ACTIVE",
                    join_date=today,
                    created_by=user.id,
                    updated_by=user.id,
                )
            )
            member_ids.append(member_id)

        # --- Step 5: INSERT budget (若携带) ---
        budget_id: str | None = None
        if payload.budget is not None:
            budget_id = f"bdg_{uuid.uuid4().hex[:12]}"
            session.add(
                CaseBudget(
                    id=budget_id,
                    tenant_id=tenant_id,
                    case_id=case_id,
                    total_budget=payload.budget.total_budget,
                    currency=payload.budget.currency.value,
                    status="DRAFT",
                    notes=payload.budget.notes,
                    created_by=user.id,
                    updated_by=user.id,
                )
            )

        # --- Step 6: 软删草稿 (若携带 draft_id) ---
        if payload.draft_id:
            d_row = (
                await session.execute(
                    select(CaseDraft).where(
                        and_(
                            CaseDraft.id == payload.draft_id,
                            CaseDraft.tenant_id == tenant_id,
                            CaseDraft.is_deleted.is_(False),
                        )
                    )
                )
            ).scalar_one_or_none()
            if d_row is not None:
                if d_row.owner_id != user.id:
                    raise BusinessException(
                        code=4013, message="无权删除他人草稿"
                    )
                d_row.is_deleted = True
                d_row.updated_by = user.id
            else:
                warnings.append(f"draft_id={payload.draft_id} 不存在或已删除, 继续创建案件")

        # --- Step 7: UPDATE clue status=CONVERTED (若携带 source_clue_id) ---
        if payload.source_clue_id:
            clue = (
                await session.execute(
                    select(CaseClue).where(
                        and_(
                            CaseClue.id == payload.source_clue_id,
                            CaseClue.tenant_id == tenant_id,
                            CaseClue.is_deleted.is_(False),
                        )
                    )
                )
            ).scalar_one_or_none()
            if clue is None:
                warnings.append(
                    f"source_clue_id={payload.source_clue_id} 不存在, 继续创建案件"
                )
            elif clue.status == ClueStatus.CONVERTED.value:
                raise BusinessException(
                    code=4003,
                    message=f"线索 {payload.source_clue_id} 已转化为案件 {clue.converted_case_id}",
                )
            else:
                clue.status = ClueStatus.CONVERTED.value
                clue.converted_case_id = case_id
                clue.updated_by = user.id

        # --- Step 8: 附件校验 (若携带) ---
        if payload.attachments:
            rows = (
                await session.execute(
                    select(CaseDocument.id, CaseDocument.case_id).where(
                        and_(
                            CaseDocument.id.in_(payload.attachments),
                            CaseDocument.tenant_id == tenant_id,
                            CaseDocument.is_deleted.is_(False),
                        )
                    )
                )
            ).all()
            found_ids = {r[0] for r in rows}
            missing = set(payload.attachments) - found_ids
            if missing:
                warnings.append(f"attachment_ids 部分缺失: {sorted(missing)}")
            # 跨案件引用拒 (P0 安全修复, 对齐 case_memo_service.add_memo 模式):
            # 防止用户通过 attachments[] 引用他人案件的文档, 造成数据错乱.
            bad_cross = [r[0] for r in rows if r[1] and r[1] != case_id]
            if bad_cross:
                raise BusinessException(
                    code=4003,
                    message=f"附件 {bad_cross} 已属于其他案件, 不可关联到新案件",
                )

        # --- Step 9: 审计 ---
        await write_audit_log(
            session,
            tenant_id=tenant_id,
            case_id=case_id,
            operator=user,
            action_module="CASES",
            action_type="CREATE",
            action_detail=(
                f"新建案件 {internal_case_no} / {payload.case_name} "
                f"source={payload.case_source.value}"
            ),
            target_record_id=case_id,
            after_data={
                "internal_case_no": internal_case_no,
                "case_type_code": payload.case_type_code,
                "business_line": payload.business_line,
                "party_count": len(party_ids),
                "member_count": len(member_ids),
                "has_budget": budget_id is not None,
                "source_clue_id": payload.source_clue_id,
            },
        )
        for pid in party_ids:
            await write_audit_log(
                session,
                tenant_id=tenant_id,
                case_id=case_id,
                operator=user,
                action_module="PARTIES",
                action_type="CREATE",
                action_detail=f"新建当事人 {pid}",
                target_record_id=pid,
            )
        for mid in member_ids:
            await write_audit_log(
                session,
                tenant_id=tenant_id,
                case_id=case_id,
                operator=user,
                action_module="MEMBERS",
                action_type="CREATE",
                action_detail=f"新建成员 {mid}",
                target_record_id=mid,
            )

        created_at_val = case.created_at

    # 显式提交外层事务
    await session.commit()

    return CaseCreateResponse(
        case_id=case_id,
        internal_case_no=internal_case_no,
        case_status="PENDING",
        case_stage_code="FILING",
        created_at=created_at_val,
        warnings=warnings,
    )


# =============================================================================
# 2. save_draft
# =============================================================================


async def save_draft(
    session: AsyncSession,
    tenant_id: str,
    payload: DraftSaveRequest,
    user: SysUser,
) -> DraftSaveResponse:
    # Q6: <=100KB JSONB 大小校验
    try:
        size = len(json.dumps(payload.draft_data, ensure_ascii=False).encode("utf-8"))
    except (TypeError, ValueError) as exc:
        raise BusinessException(
            code=4001, message=f"草稿数据 JSON 序列化失败: {exc}"
        )
    if size > DRAFT_DATA_MAX_BYTES:
        raise BusinessException(
            code=4001,
            message=f"草稿数据 {size} 字节超过 {DRAFT_DATA_MAX_BYTES} 字节限制",
        )

    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(days=DRAFT_TTL_DAYS)

    # 使用 begin_nested() 兼容 FastAPI 依赖注入中 get_current_user 已触发 autobegin 的场景
    async with session.begin_nested():
        if payload.draft_id:
            # UPDATE 分支
            draft = (
                await session.execute(
                    select(CaseDraft).where(
                        and_(
                            CaseDraft.id == payload.draft_id,
                            CaseDraft.tenant_id == tenant_id,
                            CaseDraft.is_deleted.is_(False),
                        )
                    )
                )
            ).scalar_one_or_none()
            if draft is None:
                raise NotFoundException(resource="草稿", resource_id=payload.draft_id)
            if draft.owner_id != user.id:
                raise BusinessException(code=4013, message="无权修改他人草稿")

            draft.draft_data = payload.draft_data
            draft.source_clue_id = payload.source_clue_id
            draft.last_saved_at = now
            # expires_at 在每次保存时续期 30 天
            draft.expires_at = expires_at
            draft.updated_by = user.id
            draft_id = draft.id
        else:
            # CREATE 分支
            draft_id = f"draft_{uuid.uuid4().hex[:12]}"
            session.add(
                CaseDraft(
                    id=draft_id,
                    tenant_id=tenant_id,
                    owner_id=user.id,
                    draft_data=payload.draft_data,
                    source_clue_id=payload.source_clue_id,
                    expires_at=expires_at,
                    last_saved_at=now,
                    created_by=user.id,
                    updated_by=user.id,
                )
            )

    # 显式提交外层事务
    await session.commit()

    return DraftSaveResponse(
        draft_id=draft_id,
        expires_at=expires_at,
        last_saved_at=now,
    )


# =============================================================================
# 3. list_drafts (D2=A owner 隔离)
# =============================================================================


async def list_drafts(
    session: AsyncSession,
    tenant_id: str,
    payload: DraftsListRequest,
    user: SysUser,
) -> DraftsListResponse:
    now = datetime.now(timezone.utc)
    page = payload.pagination.page
    size = payload.pagination.size
    offset = (page - 1) * size

    base_stmt = select(CaseDraft).where(
        and_(
            CaseDraft.tenant_id == tenant_id,
            CaseDraft.owner_id == user.id,
            CaseDraft.is_deleted.is_(False),
            CaseDraft.expires_at > now,
        )
    )
    total = (
        await session.execute(
            select(func.count()).select_from(base_stmt.subquery())
        )
    ).scalar_one() or 0

    rows = (
        await session.execute(
            base_stmt.order_by(CaseDraft.last_saved_at.desc())
            .limit(size)
            .offset(offset)
        )
    ).scalars().all()

    # 批量取 clue title (若有 source_clue_id)
    clue_ids = [d.source_clue_id for d in rows if d.source_clue_id]
    clue_map: dict[str, str] = {}
    if clue_ids:
        cl_rows = (
            await session.execute(
                select(CaseClue.id, CaseClue.clue_title).where(
                    and_(
                        CaseClue.id.in_(clue_ids),
                        CaseClue.tenant_id == tenant_id,
                        CaseClue.is_deleted.is_(False),
                    )
                )
            )
        ).all()
        clue_map = {r[0]: r[1] for r in cl_rows}

    items: list[DraftItemVO] = []
    for d in rows:
        dd = d.draft_data or {}
        items.append(
            DraftItemVO(
                draft_id=d.id,
                case_name=dd.get("case_name") if isinstance(dd, dict) else None,
                draft_data=dd if isinstance(dd, dict) else None,
                source_clue_id=d.source_clue_id,
                source_clue_title=clue_map.get(d.source_clue_id) if d.source_clue_id else None,
                last_saved_at=d.last_saved_at,
                expires_at=d.expires_at,
            )
        )

    return DraftsListResponse(total=int(total), page=page, size=size, items=items)


# =============================================================================
# 4. delete_draft
# =============================================================================


async def delete_draft(
    session: AsyncSession,
    tenant_id: str,
    payload: DraftDeleteRequest,
    user: SysUser,
) -> DraftDeleteResponse:
    # 使用 begin_nested() 兼容 FastAPI 依赖注入中 get_current_user 已触发 autobegin 的场景
    async with session.begin_nested():
        draft = (
            await session.execute(
                select(CaseDraft).where(
                    and_(
                        CaseDraft.id == payload.draft_id,
                        CaseDraft.tenant_id == tenant_id,
                        CaseDraft.is_deleted.is_(False),
                    )
                )
            )
        ).scalar_one_or_none()
        if draft is None:
            raise NotFoundException(resource="草稿", resource_id=payload.draft_id)
        if draft.owner_id != user.id:
            raise BusinessException(code=4013, message="无权删除他人草稿")
        draft.is_deleted = True
        draft.updated_by = user.id

    # 显式提交外层事务
    await session.commit()

    return DraftDeleteResponse(draft_id=payload.draft_id, deleted=True)


# =============================================================================
# 5. prepare_from_clue (Q7/Q8 纯只读)
# =============================================================================


async def prepare_from_clue(
    session: AsyncSession,
    tenant_id: str,
    payload: FromCluePrepareRequest,
    user: SysUser,  # noqa: ARG001 - 保留形参便于未来接入权限
) -> FromCluePrepareResponse:
    clue = (
        await session.execute(
            select(CaseClue).where(
                and_(
                    CaseClue.id == payload.clue_id,
                    CaseClue.tenant_id == tenant_id,
                    CaseClue.is_deleted.is_(False),
                )
            )
        )
    ).scalar_one_or_none()
    if clue is None:
        raise NotFoundException(resource="线索", resource_id=payload.clue_id)

    # Q8: CONVERTED 拒, 其他允许
    if clue.status == ClueStatus.CONVERTED.value:
        raise BusinessException(
            code=4003,
            message=f"线索已转化为案件 {clue.converted_case_id}, 不可再次预填",
        )

    warnings: list[str] = []
    if clue.status in (ClueStatus.REJECTED.value, ClueStatus.CLOSED.value):
        warnings.append(f"线索状态为 {clue.status}, 预填仅供参考")

    # Q7: 字段映射 + 默认 CIVIL_LITIGATION
    prepared = PreparedDraftPayload(
        case_name=clue.clue_title,
        case_type_code=DEFAULT_CASE_TYPE_ON_CLUE,
        business_line=clue.business_line,
        defendant_name=clue.opponent_name,
        target_amount=Decimal(clue.estimated_amount) if clue.estimated_amount is not None else None,
        description=clue.description,
        case_source=CaseSource.CLUE_CONVERSION,
        source_clue_id=clue.id,
    )

    return FromCluePrepareResponse(
        clue_id=clue.id,
        clue_title=clue.clue_title,
        clue_status=clue.status or ClueStatus.NEW.value,
        prepared_draft=prepared,
        warnings=warnings,
    )
