"""字典查询 API (业务侧只读接口, 管理端走 BFF admin/dicts/*)."""
from typing import Optional, List
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.database import get_db
from ...schemas.common import StandardResponse
from ...schemas.dicts import SysDictResponse
from ...services.dict_service import DictService

router = APIRouter()


@router.get("", response_model=StandardResponse[List[SysDictResponse]])
async def get_dicts(
    type: Optional[str] = Query(None, description="字典类型"),
    db: AsyncSession = Depends(get_db),
):
    """业务侧字典查询（供前端下拉框使用），只返回启用且未删除的字典项."""
    if type:
        dicts = await DictService.get_dict_by_type(session=db, dict_type=type)
    else:
        dicts = await DictService.get_all_active_dicts(session=db)

    dict_items = [SysDictResponse.model_validate(d) for d in dicts]
    return StandardResponse(data=dict_items)
