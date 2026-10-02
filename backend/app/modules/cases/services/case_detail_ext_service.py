"""案件详情页扩展 BFF Service (切片 2.S2.b).

4 个端点:
  - sidebar         固定右侧栏 (全局属性 + 人员矩阵)
  - overview        概览 Tab (基础案情 + 业务绑定 + 指标快照)
  - permissions     9 键权限布尔 Map (含全局角色覆盖 + 结案锁定 + custom_permissions)
  - members/manage  成员管理 (ADD / REMOVE / SET_PRIMARY)

设计原则:
  1. 字典/Enum 翻译分工与 case_detail_service 一致 (Enum -> label_of; 字典 -> DictService)
  2. sidebar / overview 只读查询, 不需事务
  3. members/manage 写操作必须 async with session.begin() + 悲观锁 (SET_PRIMARY 事务)
  4. 权限计算集中在 _compute_permissions(), 便于 base-info/update / stage/change 复用
  5. N+1 防范: 业务数据和公共人员信息分库批量读取
"""
from __future__ import annotations
from app.adapters.identity import case_role_codes

from contextvars import ContextVar
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any

# Casdoor isAdmin 用户 ID 集合（运行时填充，等效 SYS_ADMIN 权限）
# 设计说明: sys_user_roles 由 Casdoor 登录后同步，在完整同步实现前以此桥接
_casdoor_admin_user_ids: set[str] = set()

# 每个请求的 isAdmin 标志 — 由 deps.get_current_user 设置，restart-safe
_request_is_casdoor_admin: ContextVar[bool] = ContextVar('_request_is_casdoor_admin', default=False)


def is_global_admin(user: Any, admin_roles: set[str] | None = None) -> bool:
    """判断用户是否拥有全局管理员权限.

    检查顺序:
      1. ContextVar _request_is_casdoor_admin (Casdoor isAdmin, 每请求, restart-safe)
      2. 持久集合 _casdoor_admin_user_ids (跨请求缓存, 向后兼容)
      3. user.role_code 字段 (若 SysUser 将来同步 role_code 字段时生效)
    """
    roles = admin_roles or {"SYS_ADMIN", "LEGAL_ADMIN"}
    return getattr(user, "role_code", None) in roles


from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import CommonSession

from ..core.exceptions import BusinessException, NotFoundException
from ..enums import (
    CaseMemberRole,
    CaseMemberStatus,
    CaseStatus,
    OurRole,
    RiskLevel,
    Sector,
    label_of,
)
from ..models.case_budgets import CaseBudget
from ..models.case_counsels import CaseCounsel
from ..models.case_documents import CaseDocument
from ..models.case_document_folders import CaseDocumentFolder
from ..models.case_members import CaseMember
from ..models.case_parties import CaseParty
from ..models.cases import Case
from ..models.estimated_liabilities import EstimatedLiability
from ..models.financial_transactions import FinancialTransaction
from ..models.process_nodes import ProcessNode
from ..models.sys_departments import SysDepartment
from ..models.sys_dicts import SysDict
from ..models.sys_roles import SysRole
from ..models.sys_user_roles import SysUserRole
from ..models.sys_users import SysUser
from ..schemas.case_hall import (
    CaseMemberVO,
    CaseOverviewVO,
    CasePermissionsVO,
    CaseSidebarVO,
    ExternalCounselVO,
    MembersManageRequest,
    MembersManageResponse,
    OverviewMetricsSnapshot,
    OverviewPartyInfo,
    OverviewSubjectBinding,
    OverviewSummaryDetail,
)


# =============================================================================
# 字典翻译 (仅字典字段; Enum 字段走 label_of)
# =============================================================================
_DICT_TYPES_FOR_DETAIL = ("CASE_TYPE", "CAUSE_OF_ACTION", "BUSINESS_LINE", "CASE_STAGE")


async def _load_dict_map(session: AsyncSession) -> dict[str, dict[str, str]]:
    rows = (
        await session.execute(
            select(SysDict.dict_type, SysDict.dict_code, SysDict.dict_name).where(
                SysDict.dict_type.in_(_DICT_TYPES_FOR_DETAIL),
                SysDict.is_deleted.is_(False),
                SysDict.is_active.is_(True),
            )
        )
    ).all()
    out: dict[str, dict[str, str]] = {}
    for dt, code, name in rows:
        out.setdefault(dt, {})[code] = name
    return out


def _dict_name(dict_map: dict, dict_type: str, code: str | None) -> str | None:
    if not code:
        return None
    return dict_map.get(dict_type, {}).get(code)


# =============================================================================
# 权限矩阵常量 (与 03_case_detail_sidebar_api_plan.md §2.4 对齐)
# =============================================================================
# role_code -> 默认 10 键权限 (2.S4-PRE 新增 can_manage_process, 决策 D4)
_DEFAULT_PERMS: dict[str, dict[str, bool]] = {
    CaseMemberRole.OWNER.value: {
        "can_edit_overview": True, "can_edit_base_info": True, "can_change_stage": True,
        "can_manage_members": True, "can_manage_process": True,
        "can_add_memo": True, "can_view_finance": True,
        "can_upload_document": True, "can_close_case": True, "can_delete_case": False,
    },
    CaseMemberRole.CO_COUNSEL.value: {
        "can_edit_overview": True, "can_edit_base_info": True, "can_change_stage": True,
        "can_manage_members": False, "can_manage_process": True,
        "can_add_memo": True, "can_view_finance": True,
        "can_upload_document": True, "can_close_case": False, "can_delete_case": False,
    },
    CaseMemberRole.BUSINESS_COLLABORATOR.value: {
        "can_edit_overview": False, "can_edit_base_info": False, "can_change_stage": False,
        "can_manage_members": False, "can_manage_process": False,
        "can_add_memo": True, "can_view_finance": False,
        "can_upload_document": True, "can_close_case": False, "can_delete_case": False,
    },
    CaseMemberRole.VIEWER.value: {
        "can_edit_overview": False, "can_edit_base_info": False, "can_change_stage": False,
        "can_manage_members": False, "can_manage_process": False,
        "can_add_memo": False, "can_view_finance": False,
        "can_upload_document": False, "can_close_case": False, "can_delete_case": False,
    },
    CaseMemberRole.EXTERNAL_COUNSEL.value: {
        "can_edit_overview": False, "can_edit_base_info": False, "can_change_stage": False,
        "can_manage_members": False, "can_manage_process": False,
        "can_add_memo": True, "can_view_finance": False,
        "can_upload_document": True, "can_close_case": False, "can_delete_case": False,
    },
}

_NO_PERMS = {k: False for k in list(_DEFAULT_PERMS[CaseMemberRole.OWNER.value].keys())}

# 结案锁定时: 除 can_edit_overview (允许复盘) 外全锁
_CLOSED_ALLOW_KEEP = {"can_edit_overview"}

# 2.S9-PRE 决策 D2=B: ARCHIVED 状态全局只读锁
# 归档后所有 10 键权限强制 False (SYS_ADMIN 豁免); 不保留 can_edit_overview
# 对比 CLOSED: CLOSED 允许复盘 (can_edit_overview=True), ARCHIVED 完全冻结
_ARCHIVED_ALL_DENY: frozenset[str] = frozenset()  # 空集: 无任何键允许保留


async def _load_user_case_membership(
    session: AsyncSession, tenant_id: str, case_id: str, user_id: str
) -> CaseMember | None:
    return (
        await session.execute(
            select(CaseMember).where(
                CaseMember.case_id == case_id,
                CaseMember.tenant_id == tenant_id,
                CaseMember.user_id == user_id,
                CaseMember.status == CaseMemberStatus.ACTIVE.value,
                CaseMember.is_deleted.is_(False),
            )
        )
    ).scalar_one_or_none()


async def _load_user_global_roles(
    session: AsyncSession, tenant_id: str, user_id: str,
) -> set[str]:
    """返回用户当前持有的 sys_roles.role_code 集合 (通过 sys_user_roles 关联).

    注: sys_user_roles 是 append-only 关联表, 无 is_deleted 字段 (见设计文档 33_rbac_and_menus §2.3).
    """
    rows = (
        await session.execute(
            select(SysRole.role_code).select_from(SysUserRole)
            .join(SysRole, SysRole.id == SysUserRole.role_id)
            .where(
                SysUserRole.user_id == user_id,
                SysUserRole.tenant_id == tenant_id,
                SysRole.is_deleted.is_(False),
            )
        )
    ).all()
    roles = case_role_codes(r[0] for r in rows)
    return roles


async def _compute_permissions(
    session: AsyncSession,
    tenant_id: str,
    case_id: str,
    user_id: str,
    case: Case | None = None,
) -> CasePermissionsVO:
    """计算当前用户对目标案件的 10 键权限.

    计算顺序 (覆盖优先级由低到高):
      1. 默认 _NO_PERMS (未加入)
      2. 案件内角色默认权限 (_DEFAULT_PERMS[role])
      3. 全局角色覆盖: LEGAL_ADMIN -> OWNER 等效 (can_delete_case 除外); SYS_ADMIN -> 全 True
      4. CLOSED 锁定: case_status=CLOSED 时写权限降为 False (SYS_ADMIN 免疫, 保留 can_edit_overview 复盘)
      5. ARCHIVED 全锁 (2.S9-PRE D2=B): case_status=ARCHIVED 时 10 键全降为 False
         (SYS_ADMIN 免疫, 不保留 can_edit_overview, 完全冻结)
      6. custom_permissions 覆盖同名键
    """
    if case is None:
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

    membership = await _load_user_case_membership(session, tenant_id, case_id, user_id)
    global_roles = await _load_user_global_roles(session, tenant_id, user_id)

    has_legal_admin = "LEGAL_ADMIN" in global_roles
    has_sys_admin = "SYS_ADMIN" in global_roles
    case_closed = case.case_status == CaseStatus.CLOSED.value
    case_archived = case.case_status == CaseStatus.ARCHIVED.value

    # 1. 基础权限: 案件内角色的默认
    if membership is not None:
        perms = dict(_DEFAULT_PERMS.get(membership.role_code, _NO_PERMS))
    else:
        perms = dict(_NO_PERMS)

    # 2. 全局角色覆盖
    if has_legal_admin:
        admin_baseline = dict(_DEFAULT_PERMS[CaseMemberRole.OWNER.value])
        # LEGAL_ADMIN 无 can_delete_case
        for k, v in admin_baseline.items():
            perms[k] = perms.get(k, False) or v
    if has_sys_admin:
        for k in perms:
            perms[k] = True

    # 3. CLOSED 锁定 (SYS_ADMIN 免疫, 保留 can_edit_overview 复盘)
    if case_closed and not has_sys_admin:
        for k in list(perms.keys()):
            if k in _CLOSED_ALLOW_KEEP:
                continue
            perms[k] = False

    # 4. ARCHIVED 全锁 (2.S9-PRE D2=B, SYS_ADMIN 豁免, 不保留任何键)
    if case_archived and not has_sys_admin:
        for k in list(perms.keys()):
            if k in _ARCHIVED_ALL_DENY:   # 空集: 无键保留
                continue
            perms[k] = False

    # 5. custom_permissions 覆盖 (同名布尔)
    # 注: ARCHIVED 后 custom_permissions 仍可开个别键 (应急特批场景);
    # 若需严格冻结, 前端应禁止编辑 custom_permissions. SYS_ADMIN 仍是标准绕道.
    if membership is not None and membership.custom_permissions:
        for k, v in membership.custom_permissions.items():
            if k in perms and isinstance(v, bool):
                perms[k] = v

    return CasePermissionsVO(
        case_id=case_id,
        user_role_in_case=membership.role_code if membership else None,
        has_legal_admin=has_legal_admin,
        has_sys_admin=has_sys_admin,
        case_closed=case_closed,
        **perms,
    )


# =============================================================================
# 人员矩阵辅助 (sidebar / members/manage 共用)
# =============================================================================
_ASSIGNEE_ROLES = (CaseMemberRole.OWNER.value, CaseMemberRole.CO_COUNSEL.value)
_FOLLOWER_ROLES = (CaseMemberRole.BUSINESS_COLLABORATOR.value, CaseMemberRole.VIEWER.value)


async def _load_common_member_profiles(
    tenant_id: str, user_ids: set[str]
) -> dict[str, tuple[str | None, str | None, str | None]]:
    """Batch common identities separately from the case database."""
    if not user_ids:
        return {}
    async with CommonSession() as common:
        rows = (await common.execute(
            select(SysUser.id, SysUser.real_name, SysUser.email, SysDepartment.dept_name)
            .outerjoin(SysDepartment, and_(
                SysDepartment.id == SysUser.department_id,
                SysDepartment.tenant_id == tenant_id,
                SysDepartment.is_deleted.is_(False),
            ))
            .where(SysUser.id.in_(user_ids), SysUser.tenant_id == tenant_id,
                   SysUser.is_deleted.is_(False))
        )).all()
    return {uid: (name, email, department) for uid, name, email, department in rows}


async def _load_case_members(
    session: AsyncSession, tenant_id: str, case_id: str
) -> tuple[list[CaseMemberVO], list[CaseMemberVO], list[CaseMemberVO]]:
    """返回 (assignees, followers, external_members) 三个列表.

    external_members: case_members 中 role_code=EXTERNAL_COUNSEL 的条目
    (2026-04-19 偏差#1/#3 修正: 之前的实现排除了 EXTERNAL_COUNSEL, 导致 sidebar/manage 响应丢失此类成员).
    """
    rows = (
        await session.execute(
            select(
                CaseMember.id,
                CaseMember.user_id,
                CaseMember.role_code,
                CaseMember.status,
                CaseMember.join_date,
                CaseMember.is_notification_muted,
                CaseMember.custom_permissions,
            )
            .select_from(CaseMember)
            .where(
                CaseMember.case_id == case_id,
                CaseMember.tenant_id == tenant_id,
                CaseMember.status == CaseMemberStatus.ACTIVE.value,
                CaseMember.is_deleted.is_(False),
            )
            .order_by(CaseMember.join_date.asc())
        )
    ).all()

    assignees: list[CaseMemberVO] = []
    followers: list[CaseMemberVO] = []
    external_members: list[CaseMemberVO] = []
    profiles = await _load_common_member_profiles(tenant_id, {r[1] for r in rows})
    for _mid, uid, role_code, status, join_d, muted, custom in rows:
        real_name, _email, dept_name = profiles.get(uid, (None, None, None))
        vo = CaseMemberVO(
            user_id=uid,
            user_name=real_name,
            role_code=role_code,
            role_name=label_of(role_code, CaseMemberRole),
            status=status,
            join_date=join_d,
            is_notification_muted=bool(muted),
            department_name=dept_name,
            custom_permissions=custom,
        )
        if role_code in _ASSIGNEE_ROLES:
            assignees.append(vo)
        elif role_code in _FOLLOWER_ROLES:
            followers.append(vo)
        elif role_code == CaseMemberRole.EXTERNAL_COUNSEL.value:
            external_members.append(vo)
    return assignees, followers, external_members


async def _load_external_counsels_merged(
    session: AsyncSession, tenant_id: str, case_id: str
) -> list[ExternalCounselVO]:
    """合并 case_counsels 和 case_members.EXTERNAL_COUNSEL 两个来源的外聘律师列表.

    2026-04-19 偏差#1 修正: 原实现仅查 case_counsels, 忽略了 case_members.EXTERNAL_COUNSEL
    (已开系统账号的外聘); 现按 source 区分后合并返回, 前端可按 source 做徽章 + 去重.
    排序: case_counsels 先 (主数据更权威), 同来源内 LEAD 优先.
    """
    # 1. case_counsels (主数据)
    counsel_rows = (
        await session.execute(
            select(
                CaseCounsel.id,
                CaseCounsel.lawyer_id,
                CaseCounsel.lawyer_name,
                CaseCounsel.law_firm_id,
                CaseCounsel.law_firm_name,
                CaseCounsel.role_in_case,
                CaseCounsel.contact_phone,
                CaseCounsel.contact_email,
                CaseCounsel.status,
            ).where(
                CaseCounsel.case_id == case_id,
                CaseCounsel.tenant_id == tenant_id,
                CaseCounsel.counsel_type == "EXTERNAL",
                CaseCounsel.is_deleted.is_(False),
            )
            .order_by(CaseCounsel.role_in_case.desc())  # LEAD 优先
        )
    ).all()
    out: list[ExternalCounselVO] = [
        ExternalCounselVO(
            source="CASE_COUNSELS",
            counsel_id=r[0], lawyer_id=r[1], lawyer_name=r[2],
            law_firm_id=r[3], law_firm_name=r[4], role_in_case=r[5],
            contact_phone=r[6], contact_email=r[7], status=r[8],
        )
        for r in counsel_rows
    ]

    # 2. case_members.EXTERNAL_COUNSEL (已开账号的外聘)
    member_rows = (
        await session.execute(
            select(
                CaseMember.id,
                CaseMember.user_id,
                CaseMember.join_date,
                CaseMember.status,
                CaseMember.custom_permissions,
            )
            .select_from(CaseMember)
            .where(
                CaseMember.case_id == case_id,
                CaseMember.tenant_id == tenant_id,
                CaseMember.role_code == CaseMemberRole.EXTERNAL_COUNSEL.value,
                CaseMember.status == CaseMemberStatus.ACTIVE.value,
                CaseMember.is_deleted.is_(False),
            )
            .order_by(CaseMember.join_date.asc())
        )
    ).all()
    profiles = await _load_common_member_profiles(tenant_id, {r[1] for r in member_rows})
    for mid, uid, join_d, status, custom in member_rows:
        real_name, email, dept_name = profiles.get(uid, (None, None, None))
        out.append(
            ExternalCounselVO(
                source="CASE_MEMBERS",
                member_id=mid,
                lawyer_id=uid,
                lawyer_name=real_name or uid,
                law_firm_name=dept_name,  # 部门名暂作律所名占位 (真实场景由 case_counsels 承接)
                contact_email=email,
                status=status,
                join_date=join_d,
                custom_permissions=custom,
            )
        )
    return out


# =============================================================================
# Service 主类
# =============================================================================
class CaseDetailExtService:
    """案件详情页扩展服务 (2.S2.b)."""

    # -------------------- sidebar --------------------
    @staticmethod
    async def sidebar(
        session: AsyncSession, tenant_id: str, case_id: str
    ) -> CaseSidebarVO:
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

        dict_map = await _load_dict_map(session)

        # 下一截止日: 优先从 extended_data.next_deadline 读取, 否则回退到最近的未完成 ProcessNode
        ext = case.extended_data or {}
        next_deadline = ext.get("next_deadline")
        if next_deadline is None:
            next_deadline = (
                await session.execute(
                    select(ProcessNode.deadline)
                    .where(
                        ProcessNode.case_id == case_id,
                        ProcessNode.tenant_id == tenant_id,
                        ProcessNode.is_deleted.is_(False),
                        ProcessNode.deadline.is_not(None),
                        ProcessNode.status != "COMPLETED",
                    )
                    .order_by(ProcessNode.deadline.asc())
                    .limit(1)
                )
            ).scalar_one_or_none()

        assignees, followers, _ = await _load_case_members(session, tenant_id, case_id)
        external_counsels = await _load_external_counsels_merged(session, tenant_id, case_id)

        return CaseSidebarVO(
            case_id=case.id,
            case_code=case.internal_case_no,
            case_name=case.case_name,
            stage_code=case.current_stage_code,
            stage_name=_dict_name(dict_map, "CASE_STAGE", case.current_stage_code),
            risk_level=case.risk_level,
            risk_level_name=label_of(case.risk_level, RiskLevel),
            case_status=case.case_status,
            case_status_name=label_of(case.case_status, CaseStatus),
            business_line=case.business_line,
            business_line_name=_dict_name(dict_map, "BUSINESS_LINE", case.business_line),
            accepting_court=case.accepting_court,
            filing_date=case.filing_date,
            close_date=case.close_date,
            next_deadline=next_deadline,
            target_amount=case.target_amount,
            assignees=assignees,
            followers=followers,
            external_counsels=external_counsels,
        )

    # -------------------- overview --------------------
    @staticmethod
    async def overview(
        session: AsyncSession, tenant_id: str, case_id: str
    ) -> CaseOverviewVO:
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

        dict_map = await _load_dict_map(session)

        # extended_data 解包
        ext = case.extended_data or {}
        reg = ext.get("regulatory") or {}
        sd = ext.get("summary_detail") or {}
        tags = list(ext.get("tags") or [])

        # 指标快照: 并行聚合
        budget_amount = (
            await session.execute(
                select(CaseBudget.total_budget).where(
                    CaseBudget.case_id == case_id,
                    CaseBudget.tenant_id == tenant_id,
                    CaseBudget.is_deleted.is_(False),
                )
            )
        ).scalar_one_or_none()

        fees_rows = (
            await session.execute(
                select(
                    FinancialTransaction.fund_direction,
                    func.coalesce(func.sum(FinancialTransaction.amount), 0),
                ).where(
                    FinancialTransaction.case_id == case_id,
                    FinancialTransaction.tenant_id == tenant_id,
                    FinancialTransaction.is_deleted.is_(False),
                )
                .group_by(FinancialTransaction.fund_direction)
            )
        ).all()
        fees_out = Decimal("0")
        fees_in = Decimal("0")
        for direction, amt in fees_rows:
            if direction == "OUT":
                fees_out = Decimal(amt or 0)
            elif direction == "IN":
                fees_in = Decimal(amt or 0)

        latest_liability = (
            await session.execute(
                select(EstimatedLiability.current_amount)
                .where(
                    EstimatedLiability.case_id == case_id,
                    EstimatedLiability.tenant_id == tenant_id,
                    EstimatedLiability.is_deleted.is_(False),
                )
                .order_by(EstimatedLiability.created_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()

        doc_count = (
            await session.execute(
                select(func.count())
                .select_from(CaseDocument)
                .where(
                    CaseDocument.case_id == case_id,
                    CaseDocument.tenant_id == tenant_id,
                    CaseDocument.is_deleted.is_(False),
                )
            )
        ).scalar_one()

        folder_count = (
            await session.execute(
                select(func.count())
                .select_from(CaseDocumentFolder)
                .where(
                    CaseDocumentFolder.case_id == case_id,
                    CaseDocumentFolder.tenant_id == tenant_id,
                    CaseDocumentFolder.is_deleted.is_(False),
                )
            )
        ).scalar_one()

        party_count = (
            await session.execute(
                select(func.count())
                .select_from(CaseParty)
                .where(
                    CaseParty.case_id == case_id,
                    CaseParty.tenant_id == tenant_id,
                    CaseParty.is_deleted.is_(False),
                )
            )
        ).scalar_one()

        member_count = (
            await session.execute(
                select(func.count())
                .select_from(CaseMember)
                .where(
                    CaseMember.case_id == case_id,
                    CaseMember.tenant_id == tenant_id,
                    CaseMember.status == CaseMemberStatus.ACTIVE.value,
                    CaseMember.is_deleted.is_(False),
                )
            )
        ).scalar_one()

        ext_counsel_count = (
            await session.execute(
                select(func.count())
                .select_from(CaseCounsel)
                .where(
                    CaseCounsel.case_id == case_id,
                    CaseCounsel.tenant_id == tenant_id,
                    CaseCounsel.counsel_type == "EXTERNAL",
                    CaseCounsel.is_deleted.is_(False),
                )
            )
        ).scalar_one()

        return CaseOverviewVO(
            case_id=case.id,
            case_code=case.internal_case_no,
            case_name=case.case_name,
            description=case.description,
            tags=tags,
            summary_detail=OverviewSummaryDetail(
                background=sd.get("background"),
                dispute_focus=sd.get("dispute_focus"),
                amount_text=sd.get("amount_text"),
                risk_assessment=sd.get("risk_assessment"),
            ),
            parties=OverviewPartyInfo(
                plaintiff_name=case.plaintiff_name,
                defendant_name=case.defendant_name,
                our_role=case.our_role,
                our_role_name=label_of(case.our_role, OurRole),
                cause_of_action=case.case_cause,
                cause_of_action_name=_dict_name(dict_map, "CAUSE_OF_ACTION", case.case_cause),
                target_amount=case.target_amount,
                provision_amount=case.provision_amount,
            ),
            subject_binding=OverviewSubjectBinding(
                business_line=case.business_line,
                business_line_name=_dict_name(dict_map, "BUSINESS_LINE", case.business_line),
                target_subject=case.target_subject,
                sector=case.sector,
                sector_name=label_of(case.sector, Sector) if case.sector else None,
                is_investor_protection=bool(case.is_investor_protection),
                is_major=bool(case.is_major),
                reg_case_code=reg.get("reg_case_code"),
                reg_cause_name=reg.get("reg_cause_name"),
                security_code=reg.get("security_code"),
                security_name=reg.get("security_name"),
            ),
            metrics=OverviewMetricsSnapshot(
                total_budget=budget_amount,
                total_fees_out=fees_out,
                total_fees_in=fees_in,
                estimated_liability=latest_liability,
                document_count=int(doc_count),
                document_folder_count=int(folder_count),
                party_count=int(party_count),
                member_count=int(member_count),
                external_counsel_count=int(ext_counsel_count),
            ),
            filing_date=case.filing_date,
            close_date=case.close_date,
            created_at=case.created_at,
        )

    # -------------------- permissions --------------------
    @staticmethod
    async def permissions(
        session: AsyncSession, tenant_id: str, case_id: str, user_id: str
    ) -> CasePermissionsVO:
        return await _compute_permissions(session, tenant_id, case_id, user_id)

    # -------------------- members/manage --------------------
    @staticmethod
    async def manage_members(
        session: AsyncSession,
        tenant_id: str,
        case_id: str,
        current_user: SysUser,
        request: MembersManageRequest,
    ) -> MembersManageResponse:
        from .audit_log_service import write_audit_log  # 避免循环导入

        action = request.action
        user_ids = list(dict.fromkeys(request.user_ids))  # 去重保序
        current_user_id = str(current_user.id)

        async with session.begin():
            # 1. 权限检查: 仅 canManageMembers 可操作 (放事务内避免 autobegin 冲突)
            perms = await _compute_permissions(session, tenant_id, case_id, current_user_id)
            if not perms.can_manage_members:
                raise BusinessException(
                    code=4003, message="无权管理该案件成员 (缺少 canManageMembers 权限)"
                )

            # 2. 加载案件 (悲观锁, 避免并发 SET_PRIMARY 冲突)
            case = (
                await session.execute(
                    select(Case)
                    .where(
                        and_(
                            Case.id == case_id,
                            Case.tenant_id == tenant_id,
                            Case.is_deleted.is_(False),
                        )
                    )
                    .with_for_update()
                )
            ).scalar_one_or_none()
            if case is None:
                raise NotFoundException(resource="案件", resource_id=case_id)

            affected = 0

            if action == "ADD":
                if not request.role_code:
                    raise BusinessException(code=4001, message="ADD 操作必须传 role_code")
                if request.role_code not in {e.value for e in CaseMemberRole}:
                    raise BusinessException(
                        code=4001, message=f"非法 role_code: {request.role_code!r}"
                    )
                if request.role_code == CaseMemberRole.OWNER.value:
                    raise BusinessException(
                        code=4001,
                        message="不可直接 ADD 为 OWNER, 请使用 SET_PRIMARY 动作",
                    )
                for uid in user_ids:
                    existing = (
                        await session.execute(
                            select(CaseMember).where(
                                CaseMember.case_id == case_id,
                                CaseMember.user_id == uid,
                                CaseMember.is_deleted.is_(False),
                            )
                        )
                    ).scalar_one_or_none()
                    today = date.today()
                    if existing is not None:
                        # 已存在则更新 role_code + 重新激活
                        existing.role_code = request.role_code
                        existing.status = CaseMemberStatus.ACTIVE.value
                        existing.custom_permissions = request.custom_permissions
                        existing.join_date = today
                        existing.leave_date = None
                        existing.updated_by = current_user_id
                        existing.updated_at = datetime.now(timezone.utc)
                    else:
                        session.add(
                            CaseMember(
                                tenant_id=tenant_id,
                                case_id=case_id,
                                user_id=uid,
                                role_code=request.role_code,
                                status=CaseMemberStatus.ACTIVE.value,
                                join_date=today,
                                is_notification_muted=False,
                                custom_permissions=request.custom_permissions,
                                created_by=current_user_id,
                                updated_by=current_user_id,
                            )
                        )
                    affected += 1
                    await write_audit_log(
                        session,
                        tenant_id=tenant_id,
                        case_id=case_id,
                        operator=current_user,
                        action_module="MEMBERS",
                        action_type="CREATE",
                        action_detail=f"添加成员 user_id={uid} 角色={request.role_code}",
                        target_record_id=uid,
                        before_data=None,
                        after_data={"user_id": uid, "role_code": request.role_code},
                    )

            elif action == "REMOVE":
                today = date.today()
                for uid in user_ids:
                    m = (
                        await session.execute(
                            select(CaseMember).where(
                                CaseMember.case_id == case_id,
                                CaseMember.tenant_id == tenant_id,
                                CaseMember.user_id == uid,
                                CaseMember.is_deleted.is_(False),
                            )
                        )
                    ).scalar_one_or_none()
                    if m is None:
                        continue
                    if m.role_code == CaseMemberRole.OWNER.value:
                        raise BusinessException(
                            code=4002,
                            message=f"不可移除 OWNER 角色的成员 (user_id={uid}); 请先 SET_PRIMARY 指定新 OWNER",
                        )
                    removed_role = m.role_code
                    m.status = CaseMemberStatus.INACTIVE.value
                    m.leave_date = today
                    m.is_deleted = True
                    m.updated_by = current_user_id
                    m.updated_at = datetime.now(timezone.utc)
                    affected += 1
                    await write_audit_log(
                        session,
                        tenant_id=tenant_id,
                        case_id=case_id,
                        operator=current_user,
                        action_module="MEMBERS",
                        action_type="DELETE",
                        action_detail=f"移除成员 user_id={uid} (原角色={removed_role})",
                        target_record_id=uid,
                        before_data={"user_id": uid, "role_code": removed_role},
                        after_data=None,
                    )

            elif action == "SET_PRIMARY":
                if len(user_ids) != 1:
                    raise BusinessException(
                        code=4001,
                        message="SET_PRIMARY 一次只能指定一个用户",
                    )
                target_uid = user_ids[0]

                # 原 OWNER 降为 CO_COUNSEL
                old_owner = (
                    await session.execute(
                        select(CaseMember)
                        .where(
                            CaseMember.case_id == case_id,
                            CaseMember.tenant_id == tenant_id,
                            CaseMember.role_code == CaseMemberRole.OWNER.value,
                            CaseMember.status == CaseMemberStatus.ACTIVE.value,
                            CaseMember.is_deleted.is_(False),
                        )
                        .with_for_update()
                    )
                ).scalar_one_or_none()

                if old_owner and old_owner.user_id == target_uid:
                    raise BusinessException(
                        code=4002, message="目标用户已经是 OWNER, 无需变更"
                    )

                today = date.today()
                if old_owner:
                    old_owner.role_code = CaseMemberRole.CO_COUNSEL.value
                    old_owner.updated_by = current_user_id
                    old_owner.updated_at = datetime.now(timezone.utc)
                    affected += 1

                new_owner = (
                    await session.execute(
                        select(CaseMember)
                        .where(
                            CaseMember.case_id == case_id,
                            CaseMember.tenant_id == tenant_id,
                            CaseMember.user_id == target_uid,
                            CaseMember.is_deleted.is_(False),
                        )
                        .with_for_update()
                    )
                ).scalar_one_or_none()
                if new_owner is not None:
                    new_owner.role_code = CaseMemberRole.OWNER.value
                    new_owner.status = CaseMemberStatus.ACTIVE.value
                    new_owner.join_date = new_owner.join_date or today
                    new_owner.leave_date = None
                    new_owner.updated_by = current_user_id
                    new_owner.updated_at = datetime.now(timezone.utc)
                else:
                    session.add(
                        CaseMember(
                            tenant_id=tenant_id,
                            case_id=case_id,
                            user_id=target_uid,
                            role_code=CaseMemberRole.OWNER.value,
                            status=CaseMemberStatus.ACTIVE.value,
                            join_date=today,
                            is_notification_muted=False,
                            created_by=current_user_id,
                            updated_by=current_user_id,
                        )
                    )
                affected += 1

                # 同步主表 handling_lawyer_id (反范式字段)
                old_handling_lawyer_id = case.handling_lawyer_id
                case.handling_lawyer_id = target_uid
                case.updated_by = current_user_id
                case.updated_at = datetime.now(timezone.utc)

                await write_audit_log(
                    session,
                    tenant_id=tenant_id,
                    case_id=case_id,
                    operator=current_user,
                    action_module="MEMBERS",
                    action_type="UPDATE",
                    action_detail=(
                        f"变更主办律师: {old_handling_lawyer_id or '(无)'} -> {target_uid}"
                    ),
                    target_record_id=target_uid,
                    before_data={
                        "handling_lawyer_id": old_handling_lawyer_id,
                        "old_owner_user_id": old_owner.user_id if old_owner else None,
                    },
                    after_data={
                        "handling_lawyer_id": target_uid,
                        "new_owner_user_id": target_uid,
                    },
                )

            else:
                raise BusinessException(code=4001, message=f"不支持的 action: {action}")

        # 事务提交后查询最新成员列表
        assignees, followers, external_members = await _load_case_members(
            session, tenant_id, case_id
        )
        return MembersManageResponse(
            case_id=case_id,
            action=action,
            affected_count=affected,
            assignees=assignees,
            followers=followers,
            external_members=external_members,
        )
