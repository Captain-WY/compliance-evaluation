"""系统字典 Schemas"""
from typing import Optional
from pydantic import Field
from .common import BaseSchema, AuditMixin


class SysDictBase(BaseSchema):
    dict_type: str = Field(..., max_length=64, description="字典类型")
    dict_code: str = Field(..., max_length=64, description="字典编码")
    dict_name: str = Field(..., max_length=128, description="字典名称")
    parent_id: Optional[str] = Field(None, max_length=36, description="父级ID")
    sort_order: int = Field(default=0, description="排序号")
    is_active: bool = Field(default=True, description="是否启用")
    description: Optional[str] = Field(None, description="描述")


class SysDictCreate(SysDictBase):
    pass


class SysDictUpdate(BaseSchema):
    dict_name: Optional[str] = Field(None, max_length=128)
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None
    description: Optional[str] = None


class SysDictResponse(SysDictBase, AuditMixin):
    id: str
    is_deleted: bool = False