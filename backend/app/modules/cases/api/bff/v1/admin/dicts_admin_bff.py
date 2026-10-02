"""字典管理 BFF 路由 (2.S16).

挂载路径: POST /api/bff/v1/admin/dicts/*
"""
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import Field
from sqlalchemy.ext.asyncio import AsyncSession

from .....core.database import get_db
from .....core.deps import get_current_user
from .....models.sys_users import SysUser
from .....schemas.common import StandardResponse, BaseSchema
from .....services.dict_service import (
    list_dict_types,
    list_dict_items,
    get_dict_tree_admin,
    get_dict_detail,
    create_dict_item,
    update_dict_item,
    delete_dict_item,
    sort_dict_items,
)

router = APIRouter(tags=["BFF Admin - 字典管理"])


class DictTypesRequest(BaseSchema):
    pass


class DictItemsListRequest(BaseSchema):
    dictType: Optional[str] = None
    isActive: Optional[bool] = None
    keyword: Optional[str] = None
    page: int = Field(1, ge=1)
    pageSize: int = Field(20, ge=1, le=200)


class DictTreeRequest(BaseSchema):
    dictType: str
    parentId: Optional[str] = None


class DictDetailRequest(BaseSchema):
    itemId: str


class DictCreateRequest(BaseSchema):
    dictType: str
    dictCode: str
    dictName: str
    parentId: Optional[str] = None
    sortOrder: int = Field(0, ge=0)
    isActive: bool = True
    description: Optional[str] = None


class DictUpdateRequest(BaseSchema):
    version: Optional[int] = None
    itemId: str
    dictName: str
    sortOrder: int = Field(0, ge=0)
    isActive: bool = True
    description: Optional[str] = None


class DictDeleteRequest(BaseSchema):
    itemId: str


class DictSortRequest(BaseSchema):
    items: list[dict]


@router.post("/types/list", response_model=StandardResponse[dict])
async def types_list(
    req: DictTypesRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await list_dict_types(db)
    return StandardResponse(code=200, message="获取成功", data=data)


@router.post("/items/list", response_model=StandardResponse[dict])
async def items_list(
    req: DictItemsListRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await list_dict_items(
        db,
        dict_type=req.dictType,
        is_active=req.isActive,
        keyword=req.keyword,
        page=req.page,
        page_size=req.pageSize,
    )
    return StandardResponse(code=200, message="获取成功", data=data)


@router.post("/items/tree", response_model=StandardResponse[dict])
async def items_tree(
    req: DictTreeRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await get_dict_tree_admin(db, dict_type=req.dictType, parent_id=req.parentId, max_depth=3)
    return StandardResponse(code=200, message="获取成功", data=data)


@router.post("/items/detail", response_model=StandardResponse[dict])
async def items_detail(
    req: DictDetailRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await get_dict_detail(db, item_id=req.itemId)
    return StandardResponse(code=200, message="获取成功", data=data)


@router.post("/items/create", response_model=StandardResponse[dict])
async def items_create(
    req: DictCreateRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await create_dict_item(
        db,
        dict_type=req.dictType,
        dict_code=req.dictCode,
        dict_name=req.dictName,
        parent_id=req.parentId,
        sort_order=req.sortOrder,
        is_active=req.isActive,
        description=req.description,
        operator_id=current_user.id,
    )
    return StandardResponse(code=200, message="创建成功", data=data)


@router.post("/items/update", response_model=StandardResponse[dict])
async def items_update(
    req: DictUpdateRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if req.version is not None:
        from .....services.dict_service import _get_item_or_404
        from fastapi import HTTPException
        current = await _get_item_or_404(db, req.itemId)
        if current.version != req.version:
            raise HTTPException(409, 'Dictionary changed; reload before editing')
    data = await update_dict_item(
        db,
        item_id=req.itemId,
        dict_name=req.dictName,
        sort_order=req.sortOrder,
        is_active=req.isActive,
        description=req.description,
        operator_id=current_user.id,
    )
    return StandardResponse(code=200, message="更新成功", data=data)


@router.post("/items/delete", response_model=StandardResponse[dict])
async def items_delete(
    req: DictDeleteRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await delete_dict_item(db, item_id=req.itemId, operator_id=current_user.id)
    return StandardResponse(code=200, message="删除成功", data=data)


@router.post("/items/sort", response_model=StandardResponse[dict])
async def items_sort(
    req: DictSortRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await sort_dict_items(db, items=req.items, operator_id=current_user.id)
    return StandardResponse(code=200, message="排序成功", data=data)
