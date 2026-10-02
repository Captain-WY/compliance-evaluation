"""系统字典 Service (重写 2.S16-PRE).

设计说明:
  sys_dicts 表使用 GlobalMixin（无 tenant_id 列），属于全局/公共字典，
  所有租户共享同一份字典数据（字典类型/字典项 由 SYS_ADMIN 统一维护）。
  因此本 Service 不做租户隔离过滤。

向下兼容: DictService 静态方法保留 (get_dict_by_type / get_dict_by_code /
  get_dict_name / get_dict_tree / get_all_active_dicts)，已修复 get_dict_tree()
  树结构构建逻辑 (原版 pass 空实现)。

新增管理端函数 (供 S16 BFF admin/dicts/* 路由调用):
  list_dict_types    → POST /admin/dicts/types/list
  list_dict_items    → POST /admin/dicts/items/list
  get_dict_tree_admin → POST /admin/dicts/items/tree
  get_dict_detail    → POST /admin/dicts/items/detail
  create_dict_item   → POST /admin/dicts/items/create
  update_dict_item   → POST /admin/dicts/items/update
  delete_dict_item   → POST /admin/dicts/items/delete
  sort_dict_items    → POST /admin/dicts/items/sort
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.exceptions import BusinessException
from ..models.sys_dicts import SysDict


# ---------------------------------------------------------------------------
# 内部工具
# ---------------------------------------------------------------------------

def _item_node(d: SysDict) -> dict:
    return {
        "id": d.id,
        "dictType": d.dict_type,
        "dictCode": d.dict_code,
        "dictName": d.dict_name,
        "parentId": d.parent_id,
        "sortOrder": d.sort_order,
        "isActive": d.is_active,
        "description": d.description,
        "namespace": d.namespace, "version": d.version, "isSystem": d.is_system, "editPolicy": d.edit_policy,
    }


def _build_tree(items: list[SysDict], parent_id: str | None, depth: int, max_depth: int) -> list[dict]:
    """递归构建字典树. depth 从 1 开始; max_depth=3 → BUTTON 层为止."""
    if depth > max_depth:
        return []
    nodes = []
    for d in items:
        if d.parent_id == parent_id:
            node = {
                **_item_node(d),
                "children": _build_tree(items, d.id, depth + 1, max_depth),
            }
            nodes.append(node)
    nodes.sort(key=lambda x: (x["sortOrder"] or 0, x["dictCode"]))
    return nodes


async def _get_item_or_404(session: AsyncSession, item_id: str) -> SysDict:
    row = (
        await session.execute(
            select(SysDict).where(
                SysDict.id == item_id,
                SysDict.is_deleted.is_(False),
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise BusinessException(code=5200, message=f"字典项 {item_id} 不存在")
    return row


async def _count_depth(session: AsyncSession, parent_id: str | None) -> int:
    """计算 parent_id 节点在树中的层级（根节点=1）.

    返回 parent_id 所在的深度; 调用方用 depth >= 3 判断新子节点是否会超限.
    parent_id=None 返回 0，表示新节点将成为根节点（深度=1），不超限.
    """
    if parent_id is None:
        return 0
    depth = 1
    current = parent_id
    for _ in range(4):  # 最多追溯 4 层（超过 3 层已经违规）
        parent_val = (
            await session.execute(
                select(SysDict.parent_id).where(
                    SysDict.id == current,
                    SysDict.is_deleted.is_(False),
                )
            )
        ).scalar_one_or_none()
        if parent_val is None:
            break
        depth += 1
        current = parent_val
    return depth


# ---------------------------------------------------------------------------
# 管理端函数
# ---------------------------------------------------------------------------

async def list_dict_types(session: AsyncSession) -> dict:
    """获取所有字典类型汇总（distinct dict_type + 条目数 + 是否层级）."""
    rows = (
        await session.execute(
            select(SysDict.dict_type, func.count(SysDict.id).label("cnt"))
            .where(SysDict.is_deleted.is_(False))
            .group_by(SysDict.dict_type)
            .order_by(SysDict.dict_type)
        )
    ).all()

    # 判断是否层级字典：type 下有任何 parent_id 非 NULL 的条目
    items = []
    for row in rows:
        has_hierarchy = (
            await session.execute(
                select(func.count(SysDict.id)).where(
                    SysDict.dict_type == row.dict_type,
                    SysDict.is_deleted.is_(False),
                    SysDict.parent_id.isnot(None),
                )
            )
        ).scalar() or 0

        items.append({
            "dictType": row.dict_type,
            "dictTypeName": row.dict_type,  # 设计文档无独立 type_name 列，返回 code
            "itemCount": row.cnt,
            "isHierarchical": has_hierarchy > 0,
        })
    return {"items": items}


async def list_dict_items(
    session: AsyncSession,
    *,
    dict_type: str | None,
    is_active: bool | None,
    keyword: str | None,
    page: int,
    page_size: int,
) -> dict:
    filters = [SysDict.is_deleted.is_(False)]
    if dict_type:
        filters.append(SysDict.dict_type == dict_type)
    if is_active is not None:
        filters.append(SysDict.is_active.is_(is_active))
    if keyword:
        kw = f"%{keyword}%"
        filters.append(or_(SysDict.dict_name.ilike(kw), SysDict.dict_code.ilike(kw)))

    total = (await session.execute(select(func.count(SysDict.id)).where(*filters))).scalar() or 0
    rows = (
        await session.execute(
            select(SysDict)
            .where(*filters)
            .order_by(SysDict.dict_type, SysDict.sort_order)
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).scalars().all()

    return {
        "total": total,
        "page": page,
        "pageSize": page_size,
        "items": [_item_node(d) for d in rows],
    }


async def get_dict_tree_admin(
    session: AsyncSession,
    *,
    dict_type: str,
    parent_id: str | None,
    max_depth: int,
) -> dict:
    rows = (
        await session.execute(
            select(SysDict).where(
                SysDict.dict_type == dict_type,
                SysDict.is_deleted.is_(False),
            ).order_by(SysDict.sort_order)
        )
    ).scalars().all()

    return {"items": _build_tree(list(rows), parent_id, depth=1, max_depth=max_depth)}


async def get_dict_detail(session: AsyncSession, *, item_id: str) -> dict:
    d = await _get_item_or_404(session, item_id)
    return {
        **_item_node(d),
        "createdAt": d.created_at,
        "createdBy": d.created_by,
        "updatedAt": d.updated_at,
        "updatedBy": d.updated_by,
    }


async def create_dict_item(
    session: AsyncSession,
    *,
    operator_id: str,
    dict_type: str,
    dict_code: str,
    dict_name: str,
    parent_id: str | None,
    sort_order: int,
    is_active: bool,
    description: str | None,
) -> dict:
    # 5201: dictCode 唯一性（忽略软删除记录）
    dup = (
        await session.execute(
            select(SysDict.id).where(
                SysDict.dict_type == dict_type,
                SysDict.dict_code == dict_code,
                SysDict.is_deleted.is_(False),
            )
        )
    ).scalar_one_or_none()
    if dup:
        raise BusinessException(code=5201, message=f"dictCode={dict_code!r} 在该字典类型下已存在")

    # 5202: parentId 必须存在且属于同一 dictType
    if parent_id is not None:
        parent_type = (
            await session.execute(
                select(SysDict.dict_type).where(
                    SysDict.id == parent_id,
                    SysDict.is_deleted.is_(False),
                )
            )
        ).scalar_one_or_none()
        if parent_type is None or parent_type != dict_type:
            raise BusinessException(code=5202, message=f"parentId={parent_id!r} 不存在或不属于同一字典类型")

    # 5203: 层级深度最大 3 层（depth >= 3 意味着父节点已在第 3 层，子节点将成第 4 层）
    depth = await _count_depth(session, parent_id)
    if depth >= 3:
        raise BusinessException(code=5203, message="层级深度超过 3 层限制")

    async with session.begin_nested():
        item = SysDict(
            namespace="cases",
            dict_type=dict_type,
            dict_code=dict_code,
            dict_name=dict_name,
            parent_id=parent_id,
            sort_order=sort_order,
            is_active=is_active,
            description=description,
            created_by=operator_id,
            updated_by=operator_id,
        )
        session.add(item)
        await session.flush()

    return {"id": item.id, "dictType": dict_type, "dictCode": dict_code, "dictName": dict_name}


async def update_dict_item(
    session: AsyncSession,
    *,
    operator_id: str,
    item_id: str,
    dict_name: str | None,
    sort_order: int | None,
    is_active: bool | None,
    description: str | None,
) -> dict:
    item = await _get_item_or_404(session, item_id)
    if item.edit_policy in {"READ_ONLY","SYSTEM_LOCKED"}:
        raise BusinessException(code=5204,message="受保护字典项不可修改")
    item.version += 1

    async with session.begin_nested():
        if dict_name is not None:
            item.dict_name = dict_name
        if sort_order is not None:
            item.sort_order = sort_order
        if is_active is not None:
            item.is_active = is_active
        if description is not None:
            item.description = description
        item.updated_by = operator_id
        item.updated_at = datetime.now(timezone.utc)

    return {"id": item_id, "updatedAt": item.updated_at}


async def delete_dict_item(
    session: AsyncSession,
    *,
    operator_id: str,
    item_id: str,
) -> dict:
    item = await _get_item_or_404(session, item_id)
    if item.is_system or item.edit_policy in {"READ_ONLY","SYSTEM_LOCKED","SEEDED_LOCKED"}:
        raise BusinessException(code=5204,message="受保护字典项不可删除")

    now = datetime.now(timezone.utc)
    async with session.begin_nested():
        await _soft_delete_subtree(session, item_id, operator_id, now)

    return {"id": item_id, "deleted": True}


async def _soft_delete_subtree(
    session: AsyncSession,
    node_id: str,
    operator_id: str,
    now: datetime,
) -> None:
    """递归软删除以 node_id 为根的子树（含自身）."""
    protected = await _get_item_or_404(session, node_id)
    if protected.is_system or protected.edit_policy in {"READ_ONLY","SYSTEM_LOCKED","SEEDED_LOCKED"}:
        raise BusinessException(code=5204,message="受保护字典项不可删除")
    children = (
        await session.execute(
            select(SysDict.id).where(
                SysDict.parent_id == node_id,
                SysDict.is_deleted.is_(False),
            )
        )
    ).scalars().all()
    for child_id in children:
        await _soft_delete_subtree(session, child_id, operator_id, now)

    await session.execute(
        update(SysDict)
        .where(SysDict.id == node_id)
        .values(is_deleted=True, updated_by=operator_id, updated_at=now)
    )


async def sort_dict_items(
    session: AsyncSession,
    *,
    operator_id: str,
    items: list[dict],
) -> dict:
    now = datetime.now(timezone.utc)
    async with session.begin_nested():
        for entry in items:
            row = await _get_item_or_404(session, entry["id"])
            if row.edit_policy in {"READ_ONLY","SYSTEM_LOCKED"}:
                raise BusinessException(code=5204,message="受保护字典项不可排序")
            row.version += 1
            await session.execute(
                update(SysDict)
                .where(
                    SysDict.id == entry["id"],
                    SysDict.is_deleted.is_(False),
                )
                .values(sort_order=entry["sortOrder"], updated_by=operator_id, updated_at=now)
            )
    return {"updatedCount": len(items)}


# ---------------------------------------------------------------------------
# 向下兼容: DictService 静态方法 (原有调用方不必改动)
# sys_dicts 是全局表, 无 tenant_id; tenant_id 参数保留但不使用, 以维持向下兼容签名.
# ---------------------------------------------------------------------------

class DictService:
    """向下兼容封装 — 新代码请直接调用模块级函数."""

    @staticmethod
    async def get_dict_by_type(
        session: AsyncSession,
        dict_type: str,
        is_active: bool = True,
        tenant_id: str | None = None,  # 保留参数不使用（sys_dicts 无 tenant_id）
    ) -> list[SysDict]:
        filters = [SysDict.dict_type == dict_type, SysDict.is_deleted.is_(False)]
        if is_active:
            filters.append(SysDict.is_active.is_(True))
        result = await session.execute(
            select(SysDict).where(*filters).order_by(SysDict.sort_order)
        )
        return list(result.scalars().all())

    @staticmethod
    async def get_dict_by_code(
        session: AsyncSession,
        dict_type: str,
        dict_code: str,
        tenant_id: str | None = None,  # 保留参数不使用
    ) -> SysDict | None:
        result = await session.execute(
            select(SysDict).where(
                SysDict.dict_type == dict_type,
                SysDict.dict_code == dict_code,
                SysDict.is_deleted.is_(False),
            )
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def get_dict_name(
        session: AsyncSession,
        dict_type: str,
        dict_code: str,
        tenant_id: str | None = None,  # 保留参数不使用
    ) -> str | None:
        item = await DictService.get_dict_by_code(session, dict_type, dict_code)
        return item.dict_name if item else None

    @staticmethod
    async def get_all_active_dicts(
        session: AsyncSession,
        tenant_id: str | None = None,  # 保留参数不使用
    ) -> list[SysDict]:
        result = await session.execute(
            select(SysDict)
            .where(SysDict.is_deleted.is_(False), SysDict.is_active.is_(True))
            .order_by(SysDict.dict_type, SysDict.sort_order)
        )
        return list(result.scalars().all())

    @staticmethod
    async def get_dict_tree(
        session: AsyncSession,
        dict_type: str,
        tenant_id: str | None = None,  # 保留参数不使用
    ) -> list[dict]:
        result = await session.execute(
            select(SysDict)
            .where(SysDict.dict_type == dict_type, SysDict.is_deleted.is_(False))
            .order_by(SysDict.sort_order)
        )
        items = list(result.scalars().all())
        return _build_tree(items, parent_id=None, depth=1, max_depth=3)
