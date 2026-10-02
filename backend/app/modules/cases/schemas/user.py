"""
用户相关 Schemas

用于用户管理和同步的 DTOs
"""
from typing import Optional
from pydantic import Field, EmailStr
from datetime import datetime

from .common import BaseSchema


class UserCreateRequest(BaseSchema):
    """创建用户请求"""
    username: str = Field(..., min_length=3, max_length=50, description="用户名")
    password: str = Field(..., min_length=6, description="密码")
    real_name: str = Field(..., min_length=1, max_length=100, description="真实姓名")
    email: Optional[EmailStr] = Field(None, description="邮箱")
    phone: Optional[str] = Field(None, max_length=20, description="手机号")
    employee_no: Optional[str] = Field(None, max_length=50, description="工号")
    department_id: Optional[str] = Field(None, description="部门ID")
    title: Optional[str] = Field(None, max_length=100, description="职位")


class UserUpdateRequest(BaseSchema):
    """更新用户请求"""
    real_name: Optional[str] = Field(None, min_length=1, max_length=100, description="真实姓名")
    email: Optional[EmailStr] = Field(None, description="邮箱")
    phone: Optional[str] = Field(None, max_length=20, description="手机号")
    employee_no: Optional[str] = Field(None, max_length=50, description="工号")
    department_id: Optional[str] = Field(None, description="部门ID")
    title: Optional[str] = Field(None, max_length=100, description="职位")
    status: Optional[str] = Field(None, description="状态")


class UserSyncRequest(BaseSchema):
    """用户同步请求 (从 Casdoor 同步到本地)"""
    casdoor_user_id: str = Field(..., description="Casdoor 用户 UUID")
    username: str = Field(..., description="用户名")
    real_name: str = Field(..., description="真实姓名")
    email: Optional[str] = Field(None, description="邮箱")
    phone: Optional[str] = Field(None, description="手机号")
    avatar_url: Optional[str] = Field(None, description="头像URL")
    organization: str = Field(default="built-in", description="组织")


class DepartmentResponse(BaseSchema):
    """部门信息响应"""
    id: str = Field(..., description="部门ID")
    name: str = Field(..., description="部门名称")
    parent_id: Optional[str] = Field(None, description="父部门ID")
    level: int = Field(..., description="部门层级")
    created_at: Optional[datetime] = Field(None, description="创建时间")
    updated_at: Optional[datetime] = Field(None, description="更新时间")