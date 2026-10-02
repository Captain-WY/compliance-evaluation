"""用户-角色分配 Service (2.S16).

D7: 全量替换 = 硬 DELETE WHERE user_id=? AND tenant_id=? + 批量 INSERT，同一事务。
关联表 SysUserRole 继承 JunctionMixin（无 is_deleted），用物理 DELETE。

错误码:
  5120 用户不存在
"""
from __future__ import annotations

from sqlalchemy import select, delete, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.exceptions import BusinessException
from ..models.sys_users import SysUser
from ..models.sys_roles import SysRole
from ..models.sys_user_roles import SysUserRole
from ..models.base import generate_uuid
from ..schemas.admin.user_roles import (
    UserRoleListRequest, UserRoleListResponse, UserRoleItem,
    UserRoleSaveRequest, UserRoleSaveResponse,
)


async def _assert_user_exists(session: AsyncSession, user_id: str, tenant_id: str) -> None:
    row = (
        await session.execute(
            select(SysUser.id).where(
                SysUser.id == user_id,
                SysUser.tenant_id == tenant_id,
                SysUser.is_deleted.is_(False),
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise BusinessException(code=5120, message="用户不存在")


async def list_user_roles(
    session: AsyncSession,
    *,
    req: UserRoleListRequest,
    tenant_id: str,
) -> UserRoleListResponse:
    await _assert_user_exists(session, req.userId, tenant_id)

    rows = (
        await session.execute(
            select(SysRole)
            .select_from(SysUserRole)
            .join(SysRole, SysRole.id == SysUserRole.role_id)
            .where(
                SysUserRole.user_id == req.userId,
                SysUserRole.tenant_id == tenant_id,
                SysRole.tenant_id == tenant_id,
                SysRole.is_deleted.is_(False),
            )
        )
    ).scalars().all()

    roles = [
        UserRoleItem(
            roleId=r.id,
            roleCode=r.role_code,
            roleName=r.role_name,
            status=r.status or "ACTIVE",
        )
        for r in rows
    ]
    return UserRoleListResponse(userId=req.userId, roles=roles)


async def save_user_roles(
    session: AsyncSession,
    *,
    req: UserRoleSaveRequest,
    tenant_id: str,
    operator_id: str,
) -> UserRoleSaveResponse:
    await _assert_user_exists(session, req.userId, tenant_id)

    # 验证 roleIds 都属于当前租户且未删除
    if req.roleIds:
        valid_count = (
            await session.execute(
                select(func.count()).where(
                    SysRole.id.in_(req.roleIds),
                    SysRole.tenant_id == tenant_id,
                    SysRole.is_deleted.is_(False),
                )
            )
        ).scalar_one()
        if valid_count != len(set(req.roleIds)):
            raise BusinessException(code=5100, message="roleIds 中包含不存在或已删除的角色")

    async with session.begin():
        # D7: 硬 DELETE 全量清除
        await session.execute(
            delete(SysUserRole).where(
                SysUserRole.user_id == req.userId,
                SysUserRole.tenant_id == tenant_id,
            )
        )
        # 批量 INSERT
        for role_id in req.roleIds:
            session.add(SysUserRole(
                id=generate_uuid(),
                tenant_id=tenant_id,
                user_id=req.userId,
                role_id=role_id,
                created_by=operator_id,
            ))

    return UserRoleSaveResponse(userId=req.userId, roleCount=len(req.roleIds))
