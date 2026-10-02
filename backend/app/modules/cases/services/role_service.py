"""角色管理 Service (2.S16).

错误码:
  5100 角色不存在
  5101 roleCode 已存在
  5102 角色下仍有用户绑定
  5103 targetStatus 非法
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.exceptions import BusinessException
from ..enums.case_enums import SystemEntityStatus
from ..enums.labels import label_of
from ..models.sys_roles import SysRole
from ..models.sys_user_roles import SysUserRole
from ..schemas.admin.roles import (
    RoleListRequest, RoleListResponse, RoleListItem,
    RoleDetailResponse,
    RoleCreateRequest, RoleCreateResponse,
    RoleUpdateRequest, RoleUpdateResponse,
    RoleDeleteResponse,
    RoleToggleRequest, RoleToggleResponse,
)
from ..models.base import generate_uuid


# ---------------------------------------------------------------------------
# 内部工具
# ---------------------------------------------------------------------------

def _status_name(status: str) -> str:
    return label_of(status, SystemEntityStatus) or status


async def _get_role_or_404(session: AsyncSession, role_id: str) -> SysRole:
    row = (
        await session.execute(
            select(SysRole).where(SysRole.id == role_id, SysRole.is_deleted.is_(False))
        )
    ).scalar_one_or_none()
    if not row:
        raise BusinessException(code=5100, message="角色不存在")
    return row


# ---------------------------------------------------------------------------
# 公开函数
# ---------------------------------------------------------------------------

async def list_roles(
    session: AsyncSession,
    *,
    req: RoleListRequest,
    tenant_id: str,
) -> RoleListResponse:
    q = select(SysRole).where(SysRole.tenant_id == tenant_id, SysRole.is_deleted.is_(False))
    if req.status:
        q = q.where(SysRole.status == req.status)
    if req.keyword:
        kw = f"%{req.keyword}%"
        q = q.where(
            (SysRole.role_name.ilike(kw)) | (SysRole.role_code.ilike(kw))
        )

    total_q = select(func.count()).select_from(q.subquery())
    total: int = (await session.execute(total_q)).scalar_one()

    offset = (req.page - 1) * req.pageSize
    roles = (await session.execute(q.offset(offset).limit(req.pageSize))).scalars().all()

    # 批量查用户绑定数
    role_ids = [r.id for r in roles]
    counts: dict[str, int] = {}
    if role_ids:
        rows = (
            await session.execute(
                select(SysUserRole.role_id, func.count().label("cnt"))
                .where(SysUserRole.role_id.in_(role_ids), SysUserRole.tenant_id == tenant_id)
                .group_by(SysUserRole.role_id)
            )
        ).all()
        counts = {r.role_id: r.cnt for r in rows}

    items = [
        RoleListItem(
            roleId=r.id,
            roleCode=r.role_code,
            roleName=r.role_name,
            description=r.description,
            status=r.status or "ACTIVE",
            statusName=_status_name(r.status or "ACTIVE"),
            userCount=counts.get(r.id, 0),
        )
        for r in roles
    ]
    return RoleListResponse(total=total, page=req.page, pageSize=req.pageSize, items=items)


async def get_role_detail(
    session: AsyncSession,
    *,
    role_id: str,
    tenant_id: str,
) -> RoleDetailResponse:
    role = await _get_role_or_404(session, role_id)
    if role.tenant_id != tenant_id:
        raise BusinessException(code=5100, message="角色不存在")
    return RoleDetailResponse(
        roleId=role.id,
        roleCode=role.role_code,
        roleName=role.role_name,
        description=role.description,
        status=role.status or "ACTIVE",
        statusName=_status_name(role.status or "ACTIVE"),
        createdAt=role.created_at,
        updatedAt=role.updated_at,
    )


async def create_role(
    session: AsyncSession,
    *,
    req: RoleCreateRequest,
    tenant_id: str,
    operator_id: str,
) -> RoleCreateResponse:
    # D5: roleCode 租户内唯一
    existing = (
        await session.execute(
            select(SysRole.id).where(
                SysRole.tenant_id == tenant_id,
                SysRole.role_code == req.roleCode,
                SysRole.is_deleted.is_(False),
            )
        )
    ).scalar_one_or_none()
    if existing:
        raise BusinessException(code=5101, message=f"roleCode={req.roleCode!r} 在当前租户下已存在")

    role = SysRole(
        id=generate_uuid(),
        tenant_id=tenant_id,
        role_code=req.roleCode,
        role_name=req.roleName,
        description=req.description,
        status="ACTIVE",
        created_by=operator_id,
    )
    async with session.begin():
        session.add(role)

    return RoleCreateResponse(
        roleId=role.id,
        roleCode=role.role_code,
        roleName=role.role_name,
        status=role.status,
    )


async def update_role(
    session: AsyncSession,
    *,
    req: RoleUpdateRequest,
    tenant_id: str,
    operator_id: str,
) -> RoleUpdateResponse:
    role = await _get_role_or_404(session, req.roleId)
    if role.tenant_id != tenant_id:
        raise BusinessException(code=5100, message="角色不存在")

    now = datetime.utcnow()
    async with session.begin():
        role.role_name = req.roleName
        role.description = req.description
        role.updated_by = operator_id
        role.updated_at = now
        session.add(role)

    return RoleUpdateResponse(roleId=role.id, updatedAt=now)


async def delete_role(
    session: AsyncSession,
    *,
    role_id: str,
    tenant_id: str,
    operator_id: str,
) -> RoleDeleteResponse:
    role = await _get_role_or_404(session, role_id)
    if role.tenant_id != tenant_id:
        raise BusinessException(code=5100, message="角色不存在")

    # 5102: 角色下仍有用户绑定
    bound = (
        await session.execute(
            select(func.count()).where(
                SysUserRole.role_id == role_id,
                SysUserRole.tenant_id == tenant_id,
            )
        )
    ).scalar_one()
    if bound > 0:
        raise BusinessException(code=5102, message="角色下仍有用户绑定，请先解除用户角色关联")

    now = datetime.utcnow()
    async with session.begin():
        role.is_deleted = True
        role.updated_by = operator_id
        role.updated_at = now
        session.add(role)

    return RoleDeleteResponse(roleId=role_id, deleted=True)


async def toggle_role(
    session: AsyncSession,
    *,
    req: RoleToggleRequest,
    tenant_id: str,
    operator_id: str,
) -> RoleToggleResponse:
    allowed_statuses = {e.value for e in SystemEntityStatus}
    if req.targetStatus not in allowed_statuses:
        raise BusinessException(code=5103, message=f"targetStatus={req.targetStatus!r} 非法，允许值: {sorted(allowed_statuses)}")

    role = await _get_role_or_404(session, req.roleId)
    if role.tenant_id != tenant_id:
        raise BusinessException(code=5100, message="角色不存在")

    now = datetime.utcnow()
    async with session.begin():
        role.status = req.targetStatus
        role.updated_by = operator_id
        role.updated_at = now
        session.add(role)

    return RoleToggleResponse(
        roleId=role.id,
        status=req.targetStatus,
        statusName=_status_name(req.targetStatus),
    )
