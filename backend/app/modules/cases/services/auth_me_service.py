"""GET /auth/me 权限补全 Service (2.S16-PRE2 D9).

D9 推导规则:
  roles       : sys_user_roles JOIN sys_roles → 当前用户活跃角色 code 列表
  permissions : sys_role_menus JOIN sys_menus → 所有角色的 permission_key 集合（去重去 null）
  menus       : 只下发 menu_type IN (DIR, MENU) 节点，组成树（BUTTON 不下发树结构）

注意: sys_user_roles / sys_role_menus 是 JunctionMixin 表，无 is_deleted 列，
      直接按 tenant_id 过滤即可（D6/D7 保证无冗余记录）。
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.sys_menus import SysMenu
from ..models.sys_role_menus import SysRoleMenu
from ..models.sys_roles import SysRole
from ..models.sys_user_roles import SysUserRole
from ..models.sys_users import SysUser
from ..schemas.auth import UserInfoResponse


# ---------------------------------------------------------------------------
# 树构建（DIR + MENU 节点，BUTTON 剔除）
# ---------------------------------------------------------------------------

def _build_menu_tree(menus: list[SysMenu], parent_id: str | None) -> list[dict]:
    nodes = []
    for m in menus:
        if m.parent_id == parent_id and m.menu_type in ("DIR", "MENU"):
            node = {
                "menuId": m.id,
                "menuName": m.menu_name,
                "menuType": m.menu_type,
                "sortOrder": m.sort_order,
                "routePath": m.route_path,
                "component": m.component,
                "icon": m.icon,
                "isHidden": m.is_hidden or False,
                "permissionKey": m.permission_key,
                "children": _build_menu_tree(menus, m.id),
            }
            nodes.append(node)
    nodes.sort(key=lambda x: (x["sortOrder"] or 0, x["menuName"]))
    return nodes


# ---------------------------------------------------------------------------
# 核心查询函数
# ---------------------------------------------------------------------------

async def get_user_roles(session: AsyncSession, *, user: SysUser) -> list[str]:
    """返回用户的活跃角色 code 列表."""
    rows = (
        await session.execute(
            select(SysRole.role_code)
            .select_from(SysUserRole)
            .join(SysRole, SysRole.id == SysUserRole.role_id)
            .where(
                SysUserRole.user_id == user.id,
                SysUserRole.tenant_id == user.tenant_id,
                SysRole.tenant_id == user.tenant_id,
                SysRole.status == "ACTIVE",
                SysRole.is_deleted.is_(False),
            )
        )
    ).scalars().all()
    return list(rows)


async def get_user_permissions(session: AsyncSession, *, user: SysUser) -> list[str]:
    """返回用户所有角色的 permission_key 集合（去重去 null）."""
    # 先查用户角色 ID 列表
    role_ids = (
        await session.execute(
            select(SysUserRole.role_id).where(
                SysUserRole.user_id == user.id,
                SysUserRole.tenant_id == user.tenant_id,
            )
        )
    ).scalars().all()

    if not role_ids:
        return []

    # 再查这些角色绑定的 permission_key（非 null）
    perm_rows = (
        await session.execute(
            select(SysMenu.permission_key)
            .select_from(SysRoleMenu)
            .join(SysMenu, SysMenu.id == SysRoleMenu.menu_id)
            .where(
                SysRoleMenu.role_id.in_(role_ids),
                SysRoleMenu.tenant_id == user.tenant_id,
                SysMenu.tenant_id == user.tenant_id,
                SysMenu.is_deleted.is_(False),
                SysMenu.status == "ACTIVE",
                SysMenu.permission_key.isnot(None),
            )
        )
    ).scalars().all()

    return sorted(set(perm_rows))


async def get_user_menus(session: AsyncSession, *, user: SysUser) -> list[dict]:
    """返回用户有权访问的菜单树（DIR + MENU，按 sortOrder 排序，BUTTON 不下发）."""
    role_ids = (
        await session.execute(
            select(SysUserRole.role_id).where(
                SysUserRole.user_id == user.id,
                SysUserRole.tenant_id == user.tenant_id,
            )
        )
    ).scalars().all()

    if not role_ids:
        return []

    menu_ids = (
        await session.execute(
            select(SysRoleMenu.menu_id).where(
                SysRoleMenu.role_id.in_(role_ids),
                SysRoleMenu.tenant_id == user.tenant_id,
            )
        )
    ).scalars().all()

    if not menu_ids:
        return []

    menus = (
        await session.execute(
            select(SysMenu).where(
                SysMenu.id.in_(menu_ids),
                SysMenu.tenant_id == user.tenant_id,
                SysMenu.is_deleted.is_(False),
                SysMenu.status == "ACTIVE",
                SysMenu.menu_type.in_(("DIR", "MENU")),
            ).order_by(SysMenu.sort_order)
        )
    ).scalars().all()

    return _build_menu_tree(list(menus), parent_id=None)


async def build_user_info_response(
    session: AsyncSession,
    *,
    user: SysUser,
) -> UserInfoResponse:
    """组装完整的 UserInfoResponse（D9）."""
    roles = await get_user_roles(session, user=user)
    permissions = await get_user_permissions(session, user=user)
    menus = await get_user_menus(session, user=user)

    return UserInfoResponse(
        id=user.id,
        username=user.username,
        real_name=user.real_name,
        tenant_id=user.tenant_id,
        email=getattr(user, "email", None),
        phone=getattr(user, "phone", None),
        avatar_url=getattr(user, "avatar_url", None),
        employee_no=getattr(user, "employee_no", None),
        department_id=getattr(user, "department_id", None),
        title=getattr(user, "title", None),
        status=user.status or "ACTIVE",
        roles=roles,
        permissions=permissions,
        menus=menus,
    )
