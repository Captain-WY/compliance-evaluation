"""
认证相关 Schemas

支持 Casdoor 认证集成的 DTOs
"""
from typing import Optional, List
from pydantic import Field, field_validator
from datetime import datetime

from .common import BaseSchema


class LoginRequest(BaseSchema):
    """登录请求"""
    username: str = Field(..., min_length=1, max_length=50, description="用户名")
    password: str = Field(..., min_length=1, description="密码")
    organization: str = Field(default="built-in", description="组织名称")


class LoginResponse(BaseSchema):
    """登录响应"""
    access_token: str = Field(..., description="JWT 访问令牌")
    refresh_token: str = Field(..., description="刷新令牌")
    token_type: str = Field(default="Bearer", description="令牌类型")
    expires_in: int = Field(..., description="过期时间(秒)")
    user: "UserInfoResponse" = Field(..., description="用户信息")


class UserInfoResponse(BaseSchema):
    """用户信息响应 (D9: 补全 roles / permissions / menus 三字段, 2.S16-PRE2)."""
    id: str = Field(..., description="用户ID")
    username: str = Field(..., description="用户名")
    real_name: str = Field(..., description="真实姓名")
    tenant_id: str = Field(default="", description="租户ID")
    email: Optional[str] = Field(None, description="邮箱")
    phone: Optional[str] = Field(None, description="手机号")
    avatar_url: Optional[str] = Field(None, description="头像URL")
    employee_no: Optional[str] = Field(None, description="工号")
    department_id: Optional[str] = Field(None, description="部门ID")
    department: Optional[str] = Field(None, description="部门名称")
    title: Optional[str] = Field(None, description="职位")
    status: str = Field(default="ACTIVE", description="状态")
    roles: List[str] = Field(default_factory=list, description="角色 code 列表")
    permissions: List[str] = Field(default_factory=list, description="权限标识集合 (permission_key, 去重去 null)")
    menus: List[dict] = Field(default_factory=list, description="菜单树 (DIR+MENU, 不含 BUTTON)")


class RefreshTokenRequest(BaseSchema):
    """刷新令牌请求"""
    refresh_token: str = Field(..., description="刷新令牌")


class UserContext(BaseSchema):
    """用户上下文 (用于请求上下文)"""
    user_id: str = Field(..., description="用户ID")
    username: str = Field(..., description="用户名")
    real_name: str = Field(..., description="真实姓名")
    tenant_id: str = Field(..., description="租户ID")
    roles: List[str] = Field(default_factory=list, description="角色列表")
    permissions: List[str] = Field(default_factory=list, description="权限列表")

    def has_permission(self, permission: str) -> bool:
        """检查用户是否拥有指定权限"""
        return permission in self.permissions

    def has_role(self, role: str) -> bool:
        """检查用户是否拥有指定角色"""
        return role in self.roles


class UserInfo(BaseSchema):
    """用户信息 (数据库模型)"""
    id: str = Field(..., description="用户ID")
    username: str = Field(..., description="用户名")
    real_name: Optional[str] = Field(None, description="真实姓名")
    employee_no: Optional[str] = Field(None, description="工号")
    department_id: Optional[str] = Field(None, description="所属部门ID")
    email: Optional[str] = Field(None, description="邮箱")
    phone: Optional[str] = Field(None, description="手机号")
    status: str = Field(..., description="状态")
    avatar_url: Optional[str] = Field(None, description="头像URL")
    tenant_id: str = Field(..., description="租户ID")
    created_at: Optional[datetime] = Field(None, description="创建时间")
    updated_at: Optional[datetime] = Field(None, description="更新时间")


# 更新前向引用
LoginResponse.model_rebuild()