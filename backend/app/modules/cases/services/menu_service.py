"""菜单管理 Service (2.S16).

错误码:
  5110 菜单节点不存在
  5111 permissionKey 已被其他节点使用
  5112 parentId 不存在
  5113 超过最大层级深度 3 层
  5114 节点下仍有子菜单
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.exceptions import BusinessException
from ..enums.case_enums import MenuType, SystemEntityStatus
from ..enums.labels import label_of
from ..models.sys_menus import SysMenu
from ..models.base import generate_uuid
from ..schemas.admin.menus import (
    MenuTreeRequest, MenuTreeResponse, MenuNode,
    MenuDetailResponse,
    MenuCreateRequest, MenuCreateResponse,
    MenuUpdateRequest, MenuUpdateResponse,
    MenuDeleteResponse,
)


# ---------------------------------------------------------------------------
# 内部工具
# ---------------------------------------------------------------------------

def _menu_type_name(menu_type: str) -> str:
    return label_of(menu_type, MenuType) or menu_type


def _status_name(status: str) -> str:
    return label_of(status, SystemEntityStatus) or status


async def _get_menu_or_404(session: AsyncSession, menu_id: str, tenant_id: str) -> SysMenu:
    row = (
        await session.execute(
            select(SysMenu).where(
                SysMenu.id == menu_id,
                SysMenu.tenant_id == tenant_id,
                SysMenu.is_deleted.is_(False),
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise BusinessException(code=5110, message="菜单节点不存在")
    return row


def _build_admin_tree(
    menus: list[SysMenu],
    parent_id: str | None,
    include_button: bool,
) -> list[MenuNode]:
    nodes = []
    for m in menus:
        if m.parent_id != parent_id:
            continue
        if not include_button and m.menu_type == MenuType.BUTTON.value:
            continue
        node = MenuNode(
            menuId=m.id,
            menuName=m.menu_name,
            menuType=m.menu_type,
            menuTypeName=_menu_type_name(m.menu_type),
            sortOrder=m.sort_order,
            routePath=m.route_path,
            component=m.component,
            icon=m.icon,
            isHidden=m.is_hidden or False,
            permissionKey=m.permission_key,
            status=m.status or "ACTIVE",
            children=_build_admin_tree(menus, m.id, include_button),
        )
        nodes.append(node)
    nodes.sort(key=lambda n: (n.sortOrder or 0, n.menuName))
    return nodes


async def _count_depth(session: AsyncSession, parent_id: str | None, tenant_id: str) -> int:
    """返回 parent_id 节点所在的深度（根节点=0）."""
    if parent_id is None:
        return 0
    depth = 0
    current = parent_id
    while current:
        row = (
            await session.execute(
                select(SysMenu.parent_id).where(
                    SysMenu.id == current,
                    SysMenu.tenant_id == tenant_id,
                    SysMenu.is_deleted.is_(False),
                )
            )
        ).scalar_one_or_none()
        if row is None:
            break
        depth += 1
        current = row
    return depth


# ---------------------------------------------------------------------------
# 公开函数
# ---------------------------------------------------------------------------

async def get_menu_tree(
    session: AsyncSession,
    *,
    req: MenuTreeRequest,
    tenant_id: str,
) -> MenuTreeResponse:
    # 管理端树：显示全状态节点（含 INACTIVE），便于管理员查看和重新启用
    q = select(SysMenu).where(
        SysMenu.tenant_id == tenant_id,
        SysMenu.is_deleted.is_(False),
    ).order_by(SysMenu.sort_order)
    menus = (await session.execute(q)).scalars().all()
    nodes = _build_admin_tree(list(menus), None, req.includeButton)
    return MenuTreeResponse(items=nodes)


async def get_menu_detail(
    session: AsyncSession,
    *,
    menu_id: str,
    tenant_id: str,
) -> MenuDetailResponse:
    menu = await _get_menu_or_404(session, menu_id, tenant_id)
    return MenuDetailResponse(
        menuId=menu.id,
        parentId=menu.parent_id,
        menuName=menu.menu_name,
        menuType=menu.menu_type,
        menuTypeName=_menu_type_name(menu.menu_type),
        sortOrder=menu.sort_order,
        routePath=menu.route_path,
        component=menu.component,
        icon=menu.icon,
        isHidden=menu.is_hidden or False,
        permissionKey=menu.permission_key,
        status=menu.status or "ACTIVE",
        statusName=_status_name(menu.status or "ACTIVE"),
    )


async def create_menu(
    session: AsyncSession,
    *,
    req: MenuCreateRequest,
    tenant_id: str,
    operator_id: str,
) -> MenuCreateResponse:
    # 5112: parentId 有效性
    if req.parentId:
        parent = (
            await session.execute(
                select(SysMenu.id).where(
                    SysMenu.id == req.parentId,
                    SysMenu.tenant_id == tenant_id,
                    SysMenu.is_deleted.is_(False),
                )
            )
        ).scalar_one_or_none()
        if not parent:
            raise BusinessException(code=5112, message="parentId 不存在")

    # D8: 深度校验（最多 3 层 DIR→MENU→BUTTON，0-indexed：根=0，一级=1，二级=2）
    # parent 深度 >= 2 意味着 parent 已是第3层(BUTTON)，子节点将成第4层 → 拒绝
    depth = await _count_depth(session, req.parentId, tenant_id)
    if depth >= 2:
        raise BusinessException(code=5113, message="超过最大层级深度 3 层（DIR→MENU→BUTTON）")

    # D5/5111: permissionKey 租户内唯一
    if req.permissionKey:
        dup = (
            await session.execute(
                select(SysMenu.id).where(
                    SysMenu.tenant_id == tenant_id,
                    SysMenu.permission_key == req.permissionKey,
                    SysMenu.is_deleted.is_(False),
                )
            )
        ).scalar_one_or_none()
        if dup:
            raise BusinessException(code=5111, message=f"permissionKey={req.permissionKey!r} 已被其他菜单节点使用")

    menu = SysMenu(
        id=generate_uuid(),
        tenant_id=tenant_id,
        parent_id=req.parentId,
        menu_name=req.menuName,
        menu_type=req.menuType,
        sort_order=req.sortOrder or 0,
        route_path=req.routePath,
        component=req.component,
        icon=req.icon,
        is_hidden=req.isHidden,
        permission_key=req.permissionKey,
        status="ACTIVE",
        created_by=operator_id,
    )
    async with session.begin():
        session.add(menu)

    return MenuCreateResponse(
        menuId=menu.id,
        menuName=menu.menu_name,
        menuType=menu.menu_type,
    )


async def update_menu(
    session: AsyncSession,
    *,
    req: MenuUpdateRequest,
    tenant_id: str,
    operator_id: str,
) -> MenuUpdateResponse:
    menu = await _get_menu_or_404(session, req.menuId, tenant_id)

    # D5/5111: permissionKey 唯一（排除自身）
    if req.permissionKey and req.permissionKey != menu.permission_key:
        dup = (
            await session.execute(
                select(SysMenu.id).where(
                    SysMenu.tenant_id == tenant_id,
                    SysMenu.permission_key == req.permissionKey,
                    SysMenu.is_deleted.is_(False),
                    SysMenu.id != req.menuId,
                )
            )
        ).scalar_one_or_none()
        if dup:
            raise BusinessException(code=5111, message=f"permissionKey={req.permissionKey!r} 已被其他菜单节点使用")

    now = datetime.utcnow()
    async with session.begin():
        menu.menu_name = req.menuName
        menu.sort_order = req.sortOrder if req.sortOrder is not None else menu.sort_order
        menu.route_path = req.routePath
        menu.component = req.component
        menu.icon = req.icon
        menu.is_hidden = req.isHidden
        menu.permission_key = req.permissionKey
        menu.updated_by = operator_id
        menu.updated_at = now
        session.add(menu)

    return MenuUpdateResponse(menuId=menu.id, updatedAt=now)


async def delete_menu(
    session: AsyncSession,
    *,
    menu_id: str,
    tenant_id: str,
    operator_id: str,
) -> MenuDeleteResponse:
    menu = await _get_menu_or_404(session, menu_id, tenant_id)

    # 5114: 仍有子节点
    child_count = (
        await session.execute(
            select(func.count()).where(
                SysMenu.parent_id == menu_id,
                SysMenu.tenant_id == tenant_id,
                SysMenu.is_deleted.is_(False),
            )
        )
    ).scalar_one()
    if child_count > 0:
        raise BusinessException(code=5114, message="节点下仍有子菜单，请先删除子节点")

    now = datetime.utcnow()
    async with session.begin():
        menu.is_deleted = True
        menu.updated_by = operator_id
        menu.updated_at = now
        session.add(menu)

    return MenuDeleteResponse(menuId=menu_id, deleted=True)
