"""案件详情 - 合规 Tab Service (切片 2.S8).

实现 4 个 BFF 方法:
    1. get_checklist     — 按 case 属性动态拼装 template + 合并已提交状态
    2. submit_checklist  — 深度合并 extended_data.regulatory.checklist_items[] (D2=A)
    3. get_disclosures   — 轻实现信披判定 (3 规则绝对值, D3=A) + 历史披露
    4. get_attributes    — regulatory 字段汇总

设计约束 (对齐 docs/design/v1/api/02_case_center/09_case_detail_compliance_api_plan.md):
    1. 单向调用链: BFF -> 本 Service -> Model/cases.extended_data
    2. 显式事务: submit_checklist 用 `async with session.begin():`
    3. 软删 + 审计字段: 统一 `is_deleted=False` 过滤
    4. 业务异常: `BusinessException(4003)` 业务拒 / `BusinessException(4013)` 权限拒
    5. D1 硬编码 CHECKLIST_TEMPLATES: 按 is_major / is_investor_protection / sector 动态组合

权限 (D5=A):
    - 读 (checklist/disclosures/attributes): 案件成员即可
    - 写 (submit_checklist): 需 `can_edit_base_info`

审计 (COMPLIANCE 模块, D6):
    - submit_checklist: COMPLIANCE.UPDATE (action_detail="合规清单更新 N 项, status=...")
    - 其他 3 端点: 无审计 (纯读)
"""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.exceptions import BusinessException, NotFoundException
from ..enums import ChecklistStatus, DisclosureStatus, Sector, label_of
from ..models.case_audit_logs import CaseAuditLog  # noqa: F401 (审计通过 write_audit_log 使用)
from ..models.case_documents import CaseDocument
from ..models.cases import Case
from ..models.compliance_alerts import ComplianceAlert
from ..models.compliance_materials import ComplianceMaterial
from ..models.sys_users import SysUser
from ..schemas.case_compliance import (
    AttributesRequest,
    AttributesResponse,
    ChecklistItemVO,
    ChecklistRequest,
    ChecklistResponse,
    ChecklistSubmitRequest,
    ChecklistSubmitResponse,
    DisclosureRuleHit,
    DisclosuresRequest,
    DisclosuresResponse,
    HistoricalDisclosureVO,
    RegulatorySubKeyVO,
)
from .audit_log_service import write_audit_log
from .case_detail_ext_service import _compute_permissions


# =============================================================================
# 常量 (D1 CHECKLIST_TEMPLATES + D3 信披阈值)
# =============================================================================

# D1=A 硬编码模板. 按 case 属性动态组合:
#   _COMMON (通用必做) + _MAJOR (重大) + _INVESTOR (投资者保护) + _LISTED (上市板)
# 主切片启动约束: 不能仅按 case_type_code 分发 (seed 只有 SECURITIES_DISPUTE 一种),
# 改为按 is_major / is_investor_protection / sector 组合分发, 使 251 案件能产生 3-6 个不同 template 组合.
CHECKLIST_TEMPLATES: dict[str, list[dict[str, Any]]] = {
    "_COMMON": [
        {
            "item_id": "ITEM_ANTI_MONOPOLY",
            "title": "反垄断审查",
            "description": "检查案件是否涉及反垄断/反不正当竞争相关争议",
            "required": True,
            "category": "COMMON",
        },
        {
            "item_id": "ITEM_RELATED_PARTY",
            "title": "关联交易审查",
            "description": "检查交易对手是否为公司关联方, 是否存在利益输送",
            "required": True,
            "category": "COMMON",
        },
        {
            "item_id": "ITEM_INTERNAL_RISK",
            "title": "内部风控评估",
            "description": "对本案件出具内部风控评估意见, 是否触发风险预警",
            "required": True,
            "category": "COMMON",
        },
    ],
    "_MAJOR": [
        {
            "item_id": "ITEM_INVESTOR_NOTICE",
            "title": "投资者告知准备",
            "description": "重大案件应准备投资者告知文本, 触发披露义务时同步发布",
            "required": True,
            "category": "MAJOR",
        },
    ],
    "_INVESTOR_PROTECTION": [
        {
            "item_id": "ITEM_INVESTOR_COMPENSATION",
            "title": "投资者赔偿方案",
            "description": "涉及投资者保护案件需准备赔偿方案 (和解金额/先行赔付)",
            "required": True,
            "category": "INVESTOR",
        },
    ],
    "_LISTED": [
        {
            "item_id": "ITEM_DISCLOSURE_PRE_CHECK",
            "title": "信息披露前置核查",
            "description": "上市板案件应核查是否触发信披义务, 与信披处对接",
            "required": False,
            "category": "LISTED",
        },
    ],
}

# D3=A 信披判定 — 绝对值阈值
_AMOUNT_THRESHOLD_CNY = Decimal("10000000")  # 1000W CNY
_LISTED_SECTORS: frozenset[str] = frozenset(
    {
        Sector.MAIN_BOARD.value,
        Sector.STAR_MARKET.value,
        Sector.GEM.value,
        Sector.BEIJING_EXCHANGE.value,
    }
)

# 历史披露相关 material_type (来自字典 COMPLIANCE_MATERIAL_TYPE)
_DISCLOSURE_MATERIAL_TYPES: frozenset[str] = frozenset(
    {
        "INTERIM_ANNOUNCEMENT",  # 临时公告
        "QUARTERLY_REPORT",      # 季报披露
        "ANNUAL_REPORT",         # 年报披露
    }
)


# =============================================================================
# 通用工具
# =============================================================================


async def _load_case_or_404(
    session: AsyncSession, tenant_id: str, case_id: str
) -> Case:
    stmt = select(Case).where(
        and_(
            Case.id == case_id,
            Case.tenant_id == tenant_id,
            Case.is_deleted.is_(False),
        )
    )
    case = (await session.execute(stmt)).scalar_one_or_none()
    if case is None:
        raise NotFoundException(resource="案件", resource_id=case_id)
    return case


async def _require_compliance_read(
    session: AsyncSession, tenant_id: str, case_id: str, user: SysUser
) -> Case:
    """读权限 (D5=A): 案件成员即可 (对齐 S3 parties/list / S7 counsels/list)."""
    case = await _load_case_or_404(session, tenant_id, case_id)
    perms = await _compute_permissions(session, tenant_id, case_id, user.id, case=case)
    excluded = {"case_id", "user_role_in_case", "has_legal_admin", "has_sys_admin", "case_closed"}
    if not any(
        v for k, v in perms.model_dump().items() if k not in excluded
    ):
        raise NotFoundException(resource="案件", resource_id=case_id)
    return case


async def _require_compliance_write(
    session: AsyncSession, tenant_id: str, case_id: str, user: SysUser
) -> Case:
    """写权限 (D5=A): can_edit_base_info (对齐 S6 财务 / S7 attach_contract 模式)."""
    case = await _load_case_or_404(session, tenant_id, case_id)
    perms = await _compute_permissions(session, tenant_id, case_id, user.id, case=case)
    if not perms.can_edit_base_info:
        raise BusinessException(
            code=4013, message="无权提交合规检查清单 (缺少 can_edit_base_info)"
        )
    return case


def _compute_template_items(case: Case) -> list[dict[str, Any]]:
    """按 case 属性动态组合 CHECKLIST_TEMPLATES (D1=A)."""
    items: list[dict[str, Any]] = []
    items.extend(CHECKLIST_TEMPLATES["_COMMON"])
    if case.is_major:
        items.extend(CHECKLIST_TEMPLATES["_MAJOR"])
    if case.is_investor_protection:
        items.extend(CHECKLIST_TEMPLATES["_INVESTOR_PROTECTION"])
    if (case.sector or "") in _LISTED_SECTORS:
        items.extend(CHECKLIST_TEMPLATES["_LISTED"])
    return items


def _compute_checklist_status(
    template_items: list[dict[str, Any]],
    submitted_by_id: dict[str, dict[str, Any]],
) -> ChecklistStatus:
    """按 required items 是否全部提交计算 status."""
    required_ids = {t["item_id"] for t in template_items if t["required"]}
    if not required_ids:
        # 理论上 _COMMON 都是 required, 这里兜底
        return (
            ChecklistStatus.COMPLETED if submitted_by_id else ChecklistStatus.NOT_STARTED
        )
    submitted_required = required_ids & set(submitted_by_id.keys())
    if submitted_required == required_ids:
        return ChecklistStatus.COMPLETED
    if submitted_by_id:
        return ChecklistStatus.IN_PROGRESS
    return ChecklistStatus.NOT_STARTED


def _extract_checklist_state(
    case: Case,
) -> tuple[dict[str, dict[str, Any]], str | None]:
    """从 cases.extended_data.regulatory 中抽取已提交 items + 当前 status."""
    ed = case.extended_data or {}
    if not isinstance(ed, dict):
        return {}, None
    reg = ed.get("regulatory") or {}
    if not isinstance(reg, dict):
        return {}, None
    items = reg.get("checklist_items") or []
    if not isinstance(items, list):
        return {}, reg.get("checklist_status")
    by_id: dict[str, dict[str, Any]] = {}
    for it in items:
        if isinstance(it, dict) and isinstance(it.get("item_id"), str):
            by_id[it["item_id"]] = it
    return by_id, reg.get("checklist_status")


# =============================================================================
# 1. /compliance/checklist — 读 (template + 已提交合并)
# =============================================================================


async def get_checklist(
    session: AsyncSession,
    tenant_id: str,
    payload: ChecklistRequest,
    user: SysUser,
) -> ChecklistResponse:
    case = await _require_compliance_read(session, tenant_id, payload.case_id, user)

    template = _compute_template_items(case)
    submitted_by_id, _ = _extract_checklist_state(case)

    # 批量查 submitted_by 对应的 user.real_name (避免 N+1)
    submitter_ids = {
        it["submitted_by"]
        for it in submitted_by_id.values()
        if it.get("submitted_by")
    }
    name_map: dict[str, str] = {}
    if submitter_ids:
        rows = (
            await session.execute(
                select(SysUser.id, SysUser.real_name, SysUser.username).where(
                    and_(
                        SysUser.id.in_(submitter_ids),
                        SysUser.tenant_id == tenant_id,
                    )
                )
            )
        ).all()
        for uid, real_name, username in rows:
            name_map[uid] = real_name or username or uid

    # 合并 template + submitted
    items: list[ChecklistItemVO] = []
    completed_count = 0
    for t in template:
        sub = submitted_by_id.get(t["item_id"])
        submitted_at = None
        if sub and sub.get("submitted_at"):
            try:
                submitted_at = datetime.fromisoformat(
                    str(sub["submitted_at"]).replace("Z", "+00:00")
                )
            except (ValueError, TypeError):
                submitted_at = None

        if sub:
            completed_count += 1

        items.append(
            ChecklistItemVO(
                item_id=t["item_id"],
                title=t["title"],
                description=t.get("description"),
                required=t["required"],
                category=t.get("category"),
                submitted=bool(sub),
                is_compliant=sub.get("is_compliant") if sub else None,
                notes=sub.get("notes") if sub else None,
                attachment_ids=list(sub.get("attachment_ids") or []) if sub else [],
                submitted_by=sub.get("submitted_by") if sub else None,
                submitted_by_name=(
                    name_map.get(sub["submitted_by"]) if sub and sub.get("submitted_by") else None
                ),
                submitted_at=submitted_at,
            )
        )

    status_enum = _compute_checklist_status(template, submitted_by_id)
    required_count = sum(1 for t in template if t["required"])

    return ChecklistResponse(
        case_id=payload.case_id,
        status=status_enum,
        status_name=label_of(status_enum, ChecklistStatus),
        total_items=len(template),
        completed_items=completed_count,
        required_items=required_count,
        items=items,
    )


# =============================================================================
# 2. /compliance/checklist/submit — 写 (D2=A 深度合并)
# =============================================================================


async def submit_checklist(
    session: AsyncSession,
    tenant_id: str,
    payload: ChecklistSubmitRequest,
    user: SysUser,
) -> ChecklistSubmitResponse:
    # 先校验 template 合法的 item_id 集合 (拒绝模板外的项)
    async with session.begin():
        case = await _require_compliance_write(session, tenant_id, payload.case_id, user)

        template = _compute_template_items(case)
        valid_item_ids = {t["item_id"] for t in template}

        # 检查提交项是否都在 template 中
        invalid_ids = [it.item_id for it in payload.items if it.item_id not in valid_item_ids]
        if invalid_ids:
            raise BusinessException(
                code=4003,
                message=f"提交了模板外的 item_id: {invalid_ids}; 有效值集: {sorted(valid_item_ids)}",
            )

        # 校验 attachment_ids 属本案 (D1=A 复用 S5 卷宗, 参考 S7 attach_contract)
        all_att_ids = [
            aid for it in payload.items for aid in (it.attachment_ids or [])
        ]
        if all_att_ids:
            doc_rows = (
                await session.execute(
                    select(CaseDocument.id, CaseDocument.case_id).where(
                        and_(
                            CaseDocument.id.in_(all_att_ids),
                            CaseDocument.tenant_id == tenant_id,
                            CaseDocument.is_deleted.is_(False),
                        )
                    )
                )
            ).all()
            found_ids = {r[0] for r in doc_rows}
            missing = set(all_att_ids) - found_ids
            if missing:
                raise NotFoundException(
                    resource="案件文档", resource_id=",".join(sorted(missing))
                )
            bad_case = [r[0] for r in doc_rows if r[1] != payload.case_id]
            if bad_case:
                raise BusinessException(
                    code=4003, message=f"附件 {bad_case} 不属于本案件"
                )

        # D2=A 深度合并: 读 extended_data.regulatory, 合并 items, 不走 update_base_info
        ed = dict(case.extended_data) if isinstance(case.extended_data, dict) else {}
        reg_old: dict[str, Any] = {}
        if isinstance(ed.get("regulatory"), dict):
            reg_old = dict(ed["regulatory"])

        # 已提交 items (按 item_id 索引)
        existing_items: list[dict[str, Any]] = (
            reg_old.get("checklist_items") or []
            if isinstance(reg_old.get("checklist_items"), list)
            else []
        )
        by_id: dict[str, dict[str, Any]] = {}
        for it in existing_items:
            if isinstance(it, dict) and isinstance(it.get("item_id"), str):
                by_id[it["item_id"]] = it

        # 合并新 items (按 item_id 覆盖)
        now_iso = datetime.now(timezone.utc).isoformat()
        updated_count = 0
        for new_item in payload.items:
            by_id[new_item.item_id] = {
                "item_id": new_item.item_id,
                "is_compliant": new_item.is_compliant,
                "notes": new_item.notes,
                "attachment_ids": list(new_item.attachment_ids or []),
                "submitted_by": user.id,
                "submitted_at": now_iso,
            }
            updated_count += 1

        # 重新计算 status
        new_status = _compute_checklist_status(template, by_id)

        # 回写 extended_data.regulatory (保留 S2-PRE 原 4 字段 + 新 4 字段)
        reg_new = dict(reg_old)  # 浅拷贝保留 reg_case_code / security_code 等
        reg_new["checklist_status"] = new_status.value
        reg_new["checklist_items"] = list(by_id.values())
        ed["regulatory"] = reg_new
        case.extended_data = ed
        case.updated_by = user.id

        # 审计 COMPLIANCE.UPDATE
        await write_audit_log(
            session,
            tenant_id=tenant_id,
            case_id=payload.case_id,
            operator=user,
            action_module="COMPLIANCE",
            action_type="UPDATE",
            action_detail=(
                f"合规清单更新 {updated_count} 项, status={new_status.value}"
            ),
            target_record_id=payload.case_id,
            before_data={
                "checklist_status": reg_old.get("checklist_status"),
                "items_count_before": len(existing_items),
            },
            after_data={
                "checklist_status": new_status.value,
                "items_count_after": len(by_id),
                "updated_item_ids": [it.item_id for it in payload.items],
            },
        )

    return ChecklistSubmitResponse(
        case_id=payload.case_id,
        status=new_status,
        status_name=label_of(new_status, ChecklistStatus),
        updated_item_count=updated_count,
        warnings=[],
    )


# =============================================================================
# 3. /compliance/disclosures — 读 (D3=A 轻实现 + 历史)
# =============================================================================


async def get_disclosures(
    session: AsyncSession,
    tenant_id: str,
    payload: DisclosuresRequest,
    user: SysUser,
) -> DisclosuresResponse:
    case = await _require_compliance_read(session, tenant_id, payload.case_id, user)

    # D3=A 三条规则判定 (全部绝对值, 注: "占净资产>10%" 相对值留 S13 规则引擎)
    is_major_hit = bool(case.is_major)
    sector_value = case.sector or ""
    is_listed_hit = sector_value in _LISTED_SECTORS
    amount = Decimal(case.target_amount or 0)
    is_amount_hit = amount > _AMOUNT_THRESHOLD_CNY

    rules = [
        DisclosureRuleHit(
            rule_id="RULE_MAJOR", name="重大案件 (is_major=True)", hit=is_major_hit
        ),
        DisclosureRuleHit(
            rule_id="RULE_LISTED_BOARD",
            name=f"上市板 ({'/'.join(sorted(_LISTED_SECTORS))})",
            hit=is_listed_hit,
        ),
        DisclosureRuleHit(
            rule_id="RULE_AMOUNT_THRESHOLD",
            name=f"目标金额 > {_AMOUNT_THRESHOLD_CNY}",
            hit=is_amount_hit,
        ),
    ]

    triggered = all(r.hit for r in rules)
    reason: str | None = None
    if triggered:
        reason = (
            f"重大案件 + 上市 ({sector_value}) + 金额 {amount} 元, "
            f"触发《上市公司信息披露管理办法》第31条"
        )

    # 历史披露 (material_type 属披露相关 + disclosure_status='DISCLOSED')
    # Batch A fix: 补 material_type 过滤, 避免返回非披露类的 DISCLOSED 物料
    hist_stmt = (
        select(ComplianceMaterial)
        .where(
            and_(
                ComplianceMaterial.case_id == payload.case_id,
                ComplianceMaterial.tenant_id == tenant_id,
                ComplianceMaterial.is_deleted.is_(False),
                ComplianceMaterial.disclosure_status == DisclosureStatus.DISCLOSED.value,
                ComplianceMaterial.material_type.in_(_DISCLOSURE_MATERIAL_TYPES),
            )
        )
        .order_by(ComplianceMaterial.disclosure_date.desc().nullslast())
    )
    hist_rows = (await session.execute(hist_stmt)).scalars().all()

    historical: list[HistoricalDisclosureVO] = [
        HistoricalDisclosureVO(
            id=m.id,
            material_type=m.material_type,
            disclosure_status=DisclosureStatus(m.disclosure_status or "DISCLOSED"),
            disclosure_status_name=label_of(
                m.disclosure_status or "DISCLOSED", DisclosureStatus
            ),
            disclosure_date=m.disclosure_date,
            reporting_period=m.reporting_period,
            attachment_ids=list(m.attachment_ids) if m.attachment_ids else [],
            created_at=m.created_at,
        )
        for m in hist_rows
    ]

    return DisclosuresResponse(
        case_id=payload.case_id,
        disclosure_triggered=triggered,
        disclosure_reason=reason,
        trigger_rules_checked=rules,
        historical_disclosures=historical,
    )


# =============================================================================
# 4. /compliance/attributes — 读 (regulatory 汇总)
# =============================================================================


async def get_attributes(
    session: AsyncSession,
    tenant_id: str,
    payload: AttributesRequest,
    user: SysUser,
) -> AttributesResponse:
    case = await _require_compliance_read(session, tenant_id, payload.case_id, user)

    # extended_data.regulatory 聚合
    ed = case.extended_data or {}
    reg = ed.get("regulatory") or {} if isinstance(ed, dict) else {}
    if not isinstance(reg, dict):
        reg = {}

    checklist_status_raw = reg.get("checklist_status")
    try:
        checklist_status_enum = (
            ChecklistStatus(checklist_status_raw) if checklist_status_raw else None
        )
    except ValueError:
        checklist_status_enum = None

    # 按模板 + 已提交计算 total / completed (实时从 template 动态算, 不读缓存)
    template = _compute_template_items(case)
    by_id, _ = _extract_checklist_state(case)
    required_count = sum(1 for t in template if t["required"])
    completed_count = sum(
        1 for t in template if t["required"] and t["item_id"] in by_id
    )

    regulatory_vo = RegulatorySubKeyVO(
        reg_case_code=reg.get("reg_case_code"),
        reg_cause_name=reg.get("reg_cause_name"),
        security_code=reg.get("security_code"),
        security_name=reg.get("security_name"),
        checklist_status=checklist_status_enum,
        checklist_status_name=(
            label_of(checklist_status_enum, ChecklistStatus)
            if checklist_status_enum
            else None
        ),
        checklist_total=required_count,
        checklist_completed=completed_count,
        disclosure_triggered=reg.get("disclosure_triggered"),
        disclosure_reason=reg.get("disclosure_reason"),
    )

    # 关联计数 (compliance_alerts + compliance_materials 本案件)
    alerts_count = (
        await session.execute(
            select(func.count(ComplianceAlert.id)).where(
                and_(
                    ComplianceAlert.case_id == payload.case_id,
                    ComplianceAlert.tenant_id == tenant_id,
                    ComplianceAlert.is_deleted.is_(False),
                )
            )
        )
    ).scalar_one() or 0

    materials_count = (
        await session.execute(
            select(func.count(ComplianceMaterial.id)).where(
                and_(
                    ComplianceMaterial.case_id == payload.case_id,
                    ComplianceMaterial.tenant_id == tenant_id,
                    ComplianceMaterial.is_deleted.is_(False),
                )
            )
        )
    ).scalar_one() or 0

    sector_enum: Sector | None = None
    if case.sector:
        try:
            sector_enum = Sector(case.sector)
        except ValueError:
            sector_enum = None

    return AttributesResponse(
        case_id=payload.case_id,
        is_investor_protection=bool(case.is_investor_protection),
        is_major=bool(case.is_major),
        sector=sector_enum,
        sector_name=label_of(case.sector, Sector) if case.sector else None,
        target_amount=case.target_amount,
        provision_amount=case.provision_amount,
        regulatory=regulatory_vo,
        related_alerts_count=int(alerts_count),
        related_materials_count=int(materials_count),
    )
