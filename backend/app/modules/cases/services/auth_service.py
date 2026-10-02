"""
认证服务模块

实现 Casdoor 认证业务逻辑,包括登录、令牌验证、用户同步等
"""
from typing import Optional
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.modules.cases.core.casdoor_config import CasdoorConfig
from app.modules.cases.providers.casdoor_provider import CasdoorProvider, UserInfo
from app.modules.cases.models.sys_users import SysUser
from app.modules.cases.schemas.auth import (
    LoginRequest,
    LoginResponse,
    UserInfoResponse,
    UserContext
)
from app.modules.cases.core.exceptions import BusinessException


class AuthService:
    """
    认证服务

    处理用户认证、令牌验证、用户同步等核心业务逻辑
    """

    def __init__(self, session: AsyncSession, casdoor_provider: Optional[CasdoorProvider] = None):
        """
        初始化认证服务

        Args:
            session: 数据库会话
            casdoor_provider: Casdoor 提供者实例 (可选)
        """
        self.session = session
        self.casdoor_provider = casdoor_provider or CasdoorProvider(CasdoorConfig.from_env())

    async def login(self, credentials: LoginRequest) -> LoginResponse:
        """
        用户登录

        流程:
        1. 调用 Casdoor Provider 认证
        2. 获取 JWT Token
        3. 解析 Token 提取 user_id
        4. 查询/创建本地影子用户
        5. 返回 Token + 用户信息

        Args:
            credentials: 登录凭据

        Returns:
            LoginResponse 包含 token 和用户信息

        Raises:
            BusinessException: 登录失败
        """
        # 1. 调用 Casdoor 认证
        auth_result = await self.casdoor_provider.login(
            username=credentials.username,
            password=credentials.password,
            organization=credentials.organization
        )

        if auth_result.status != "ok":
            raise BusinessException(
                code=4001,
                message=auth_result.msg
            )

        # 2. 提取 token 和用户信息
        access_token = auth_result.data.get("access_token")
        refresh_token = auth_result.data.get("refresh_token")
        token_type = auth_result.data.get("token_type", "Bearer")
        expires_in = auth_result.data.get("expires_in", 7200)
        user_identifier = auth_result.data.get("user_identifier", "")

        if not access_token or not refresh_token:
            raise BusinessException(
                code=4002,
                message="登录失败: 无法获取访问令牌"
            )

        if not user_identifier:
            raise BusinessException(
                code=4002,
                message="登录失败: 无法获取用户信息"
            )

        # 3. 从 JWT token 解析获取 Casdoor 用户 ID
        import jwt

        access_token = auth_result.data.get("access_token")
        if not access_token:
            raise BusinessException(
                code=4003,
                message="登录失败: 无法获取访问令牌"
            )

        try:
            payload = jwt.decode(access_token, options={"verify_signature": False})
            casdoor_user_id = payload.get("sub")
        except Exception as e:
            raise BusinessException(
                code=4003,
                message=f"登录失败: 无法解析用户信息: {str(e)}"
            )

        if not casdoor_user_id:
            raise BusinessException(
                code=4003,
                message="登录失败: 用户 ID 缺失"
            )

        # 4. 从 Casdoor 获取完整用户信息（包含邮箱、手机号等）
        try:
            casdoor_user_info = await self.casdoor_provider.get_user_info(casdoor_user_id)
        except Exception as e:
            # 如果获取失败，使用基本信息继续登录
            casdoor_user_info = None

        # 5. 获取或创建影子用户
        # user_identifier 格式: "organization/username"
        parts = user_identifier.split("/")
        if len(parts) != 2:
            raise BusinessException(
                code=4003,
                message="登录失败: 用户标识格式错误"
            )

        organization, username = parts

        # 查询本地用户并同步完整信息
        user = await self._get_or_create_shadow_user(
            username=username,
            organization=organization,
            casdoor_data=auth_result.data,
            casdoor_user_info=casdoor_user_info
        )

        # 4. 构造响应（使用真实 token）
        return LoginResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type=token_type,
            expires_in=expires_in,
            user=UserInfoResponse(
                id=user.id,
                username=user.username,
                real_name=user.real_name or "",
                email=user.email,
                phone=user.phone,
                avatar_url=user.avatar_url,
                employee_no=user.employee_no,
                department_id=user.department_id,
                status=user.status,
                roles=[],  # TODO: 从 Casbin 获取
                permissions=[]  # TODO: 从 Casbin 获取
            )
        )

    async def validate_token(self, token: str) -> UserContext:
        """
        验证 JWT Token

        流程:
        1. 使用 Casdoor 公钥验证 JWT
        2. 提取 user_id
        3. 查询本地用户获取业务上下文
        4. 返回 UserContext (包含角色/权限)

        Args:
            token: JWT token 字符串

        Returns:
            UserContext 用户上下文

        Raises:
            BusinessException: Token 无效
        """
        # 1. 验证 JWT
        token_payload = await self.casdoor_provider.validate_jwt_token(token)

        # 2. 查询本地用户
        user_id = token_payload.sub

        stmt = select(SysUser).where(
            SysUser.id == user_id,
            SysUser.is_deleted == False
        )

        result = await self.session.execute(stmt)
        user = result.scalar_one_or_none()

        if not user:
            raise BusinessException(
                code=4004,
                message="用户不存在"
            )

        # 3. 返回用户上下文
        return UserContext(
            user_id=user.id,
            username=user.username,
            real_name=user.real_name or "",
            tenant_id=user.tenant_id,
            roles=[],  # TODO: 从 Casbin 获取
            permissions=[]  # TODO: 从 Casbin 获取
        )

    async def _get_or_create_shadow_user(
        self,
        username: str,
        organization: str,
        casdoor_data: dict,
        casdoor_user_info: Optional[UserInfo] = None
    ) -> SysUser:
        """
        获取或创建影子用户

        每次登录时调用:
        1. 从 JWT token 提取 Casdoor 用户 ID
        2. 根据 Casdoor 用户 ID 查询本地用户
        3. 如果存在，同步邮箱、手机号等信息
        4. 如果不存在，根据 username 查询本地用户并更新 ID
        5. 如果都不存在，创建新的影子用户

        Args:
            username: 用户名
            organization: 组织名称
            casdoor_data: Casdoor 返回的用户数据（包含 access_token）
            casdoor_user_info: Casdoor 用户详细信息（可选）

        Returns:
            SysUser 影子用户实例
        """
        import jwt
        from sqlalchemy import update

        # 从 access_token 中提取 Casdoor 用户 ID
        access_token = casdoor_data.get("access_token")
        if not access_token:
            raise BusinessException(
                code=4003,
                message="登录失败: 无法获取访问令牌"
            )

        # Decode token to get user ID (without verification for now, just to extract the sub)
        try:
            payload = jwt.decode(access_token, options={"verify_signature": False})
            casdoor_user_id = payload.get("sub")
        except Exception as e:
            raise BusinessException(
                code=4003,
                message=f"登录失败: 无法解析用户信息: {str(e)}"
            )

        if not casdoor_user_id:
            raise BusinessException(
                code=4003,
                message="登录失败: 用户 ID 缺失"
            )

        # 1. 先尝试用 Casdoor 用户 ID 查找
        stmt = select(SysUser).where(
            SysUser.id == casdoor_user_id,
            SysUser.is_deleted == False
        )
        result = await self.session.execute(stmt)
        user = result.scalar_one_or_none()

        if user:
            # 用户已存在，同步邮箱、手机号等信息
            if casdoor_user_info:
                user.email = casdoor_user_info.email or user.email
                user.phone = casdoor_user_info.phone or user.phone
                user.avatar_url = casdoor_user_info.avatar or user.avatar_url
                user.real_name = casdoor_user_info.name or user.real_name
            user.updated_at = datetime.utcnow()
            await self.session.commit()
            await self.session.refresh(user)
            return user

        # 2. 如果不存在，尝试用 username 查找
        stmt = select(SysUser).where(
            SysUser.username == username,
            SysUser.is_deleted == False
        )
        result = await self.session.execute(stmt)
        user = result.scalar_one_or_none()

        if user:
            # 用户存在但 ID 不匹配，更新为 Casdoor 的用户 ID
            # 使用原生 SQL UPDATE 来绕过主键约束
            await self.session.execute(
                update(SysUser)
                .where(SysUser.id == user.id)
                .values(id=casdoor_user_id, updated_at=datetime.utcnow())
            )
            await self.session.commit()

            # 重新查询更新后的用户
            stmt = select(SysUser).where(
                SysUser.id == casdoor_user_id,
                SysUser.is_deleted == False
            )
            result = await self.session.execute(stmt)
            user = result.scalar_one_or_none()
            return user

        # 3. 如果都不存在，创建新用户（created_by 自举，指向自身）
        user = SysUser(
            id=casdoor_user_id,
            username=username,
            real_name=casdoor_user_info.name if casdoor_user_info else username,
            email=casdoor_user_info.email if casdoor_user_info else None,
            phone=casdoor_user_info.phone if casdoor_user_info else None,
            avatar_url=casdoor_user_info.avatar if casdoor_user_info else None,
            tenant_id=organization,
            status="active",
            created_by=casdoor_user_id,
            updated_by=casdoor_user_id,
        )
        self.session.add(user)
        await self.session.commit()
        await self.session.refresh(user)

        return user

    async def sync_shadow_user(self, user_id: str, user_info: dict) -> SysUser:
        """
        同步影子用户

        保持 sys_users 与 Casdoor 用户同步

        Args:
            user_id: Casdoor 用户 UUID
            user_info: Casdoor 用户信息

        Returns:
            SysUser 同步后的影子用户
        """
        # 查询本地用户
        stmt = select(SysUser).where(
            SysUser.id == user_id,
            SysUser.is_deleted == False
        )

        result = await self.session.execute(stmt)
        user = result.scalar_one_or_none()

        if user:
            # 更新字段
            user.real_name = user_info.get("name", user.real_name)
            user.email = user_info.get("email", user.email)
            user.phone = user_info.get("phone", user.phone)
            user.avatar_url = user_info.get("avatar", user.avatar_url)
            user.updated_at = datetime.utcnow()
        else:
            # 创建新用户
            user = SysUser(
                id=user_id,
                username=user_info.get("username", ""),
                real_name=user_info.get("name", ""),
                email=user_info.get("email"),
                phone=user_info.get("phone"),
                avatar_url=user_info.get("avatar"),
                tenant_id=user_info.get("organization", "built-in"),
                status="active",
                created_by=user_id,
                updated_by=user_id,
            )
            self.session.add(user)

        await self.session.commit()
        await self.session.refresh(user)

        return user