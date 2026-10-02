"""
通用 Schemas
定义统一的响应格式和分页结构
"""
from typing import Generic, TypeVar, Optional, List, Any
from pydantic import BaseModel, Field
from datetime import datetime

from asgi_correlation_id import correlation_id

# 泛型类型变量
T = TypeVar('T')


def _get_trace_id() -> str:
    """获取当前请求的 trace_id，优先从 ASGI correlation_id 读取。"""
    cid = correlation_id.get()
    return cid if cid else ""


class StandardResponse(BaseModel, Generic[T]):
    """统一响应格式"""
    code: int = Field(default=200, description="业务状态码")
    message: str = Field(default="Success", description="响应消息")
    data: Optional[T] = Field(default=None, description="响应数据")
    trace_id: str = Field(default_factory=_get_trace_id, description="追踪ID")

    class Config:
        json_schema_extra = {
            "example": {
                "code": 200,
                "message": "Success",
                "data": {},
                "trace_id": "req-abc-123"
            }
        }


class PaginationParams(BaseModel):
    """分页参数"""
    page: int = Field(default=1, ge=1, description="页码")
    size: int = Field(default=20, ge=1, le=1000, description="每页数量")
    sort: Optional[str] = Field(default=None, description="排序字段")


class PaginatedResponse(BaseModel, Generic[T]):
    """分页响应"""
    total: int = Field(description="总记录数")
    page: int = Field(description="当前页码")
    size: int = Field(description="每页数量")
    items: List[T] = Field(default_factory=list, description="数据列表")

    class Config:
        json_schema_extra = {
            "example": {
                "total": 1050,
                "page": 1,
                "size": 20,
                "items": []
            }
        }


class ErrorResponse(BaseModel):
    """错误响应"""
    code: int = Field(description="错误码")
    message: str = Field(description="错误消息")
    details: Optional[dict] = Field(default=None, description="错误详情")

    class Config:
        json_schema_extra = {
            "example": {
                "code": 4000,
                "message": "参数校验失败",
                "details": {"field": "case_name", "error": "不能为空"}
            }
        }


class BaseSchema(BaseModel):
    """Schema 基类"""
    class Config:
        from_attributes = True  # Pydantic v2: 替代 orm_mode
        populate_by_name = True  # 允许通过字段名填充
        use_enum_values = True  # 使用枚举值而非枚举对象


class AuditMixin(BaseModel):
    """审计字段 Mixin"""
    created_at: Optional[datetime] = None
    created_by: Optional[str] = None
    updated_at: Optional[datetime] = None
    updated_by: Optional[str] = None