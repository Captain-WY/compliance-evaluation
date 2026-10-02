"""角色-菜单分配 Service (2.S16).

D6: 全量替换 = 硬 DELETE WHERE role_id=? AND tenant_id=? + 批量 INSERT，同一事务。
关联表 SysRoleMenu 继承 JunctionMixin（无 is_deleted），用物理 DELETE。

错误码:
  5100 角色不存在
"""
from __future__ import annotations

from sqlalchemy import select, delete, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.exceptions import BusinessException
from ..models.sys_menus import SysMenu
from ..models.sys_roles import SysRole
from ..models.sys_role_menus import SysRoleMenu
from ..models.base import generate_uuid
from ..schemas.admin.role_menus import (
    RoleMenuListRequest, RoleMenuListResponse,
    RoleMenuSaveRequest, RoleMenuSaveResponse,
)


async def _assert_role_exists(session: AsyncSession, role_id: str, tenant_id: str) -> None:
    row = (
        await session.execute(
            select(SysRole.id).where(
                SysRole.id == role_id,
                SysRole.tenant_id == tenant_id,
                SysRole.is_deleted.is_(False),
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise BusinessException(code=5100, message="角色不存在")


async def list_role_menus(
    session: AsyncSession,
    *,
    req: RoleMenuListRequest,
    tenant_id: str,
) -> RoleMenuListResponse:
    await _assert_role_exists(session, req.roleId, tenant_id)

    menu_ids = (
        await session.execute(
            select(SysRoleMenu.menu_id).where(
                SysRoleMenu.role_id == req.roleId,
                SysRoleMenu.tenant_id == tenant_id,
            )
        )
    ).scalars().all()

    return RoleMenuListResponse(roleId=req.roleId, menuIds=list(menu_ids))


async def save_role_menus(
    session: AsyncSession,
    *,
    req: RoleMenuSaveRequest,
    tenant_id: str,
    operator_id: str,
) -> RoleMenuSaveResponse:
    await _assert_role_exists(session, req.roleId, tenant_id)

    # 验证 menuIds 都属于当前租户且未删除
    if req.menuIds:
        valid_count = (
            await session.execute(
                select(func.count()).where(
                    SysMenu.id.in_(req.menuIds),
                    SysMenu.tenant_id == tenant_id,
                    SysMenu.is_deleted.is_(False),
                )
            )
        ).scalar_one()
        if valid_count != len(set(req.menuIds)):
            raise BusinessException(code=5110, message="menuIds 中包含不存在或已删除的菜单节点")

    async with session.begin():
        # D6: 硬 DELETE 全量清除
        await session.execute(
            delete(SysRoleMenu).where(
                SysRoleMenu.role_id == req.roleId,
                SysRoleMenu.tenant_id == tenant_id,
            )
        )
        # 批量 INSERT
        for menu_id in req.menuIds:
            session.add(SysRoleMenu(
                id=generate_uuid(),
                tenant_id=tenant_id,
                role_id=req.roleId,
                menu_id=menu_id,
                created_by=operator_id,
            ))

    return RoleMenuSaveResponse(roleId=req.roleId, menuCount=len(req.menuIds))
