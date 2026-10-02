"""
用户服务
处理用户认证、查询等业务逻辑
"""
from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.sys_users import SysUser
from ..core.exceptions import NotFoundException, ValidationException
from ..core.security import verify_password, create_access_token


class UserService:
    """用户服务"""

    @staticmethod
    async def authenticate_user(
        session: AsyncSession,
        username: str,
        password: str
    ) -> tuple[SysUser, str]:
        """
        认证用户并生成 JWT Token

        注意：实际项目中应该调用 Casdoor API 进行认证
        这里简化为直接验证本地密码（仅用于开发测试）

        Args:
            session: 数据库会话
            username: 用户名
            password: 密码

        Returns:
            tuple[SysUser, str]: (用户对象, JWT Token)

        Raises:
            ValidationException: 用户名或密码错误
        """
        # 查询用户
        query = select(SysUser).where(
            SysUser.username == username,
            SysUser.is_deleted == False
        )
        result = await session.execute(query)
        user = result.scalar_one_or_none()

        if not user:
            raise ValidationException(message="用户名或密码错误")

        # 检查用户状态
        if user.status != "active":
            raise ValidationException(message="用户账号已被禁用或锁定")

        # TODO: 调用 Casdoor API 验证密码
        # 这里简化处理，实际应该通过 Casdoor 验证
        # 示例：假设密码验证通过

        # 生成 JWT Token
        token = create_access_token(
            data={"sub": str(user.id), "username": user.username}
        )

        return user, token

    @staticmethod
    async def get_user_by_id(
        session: AsyncSession,
        user_id: str
    ) -> Optional[SysUser]:
        """
        根据 ID 获取用户

        Args:
            session: 数据库会话
            user_id: 用户 ID

        Returns:
            Optional[SysUser]: 用户对象，不存在返回 None
        """
        query = select(SysUser).where(
            SysUser.id == user_id,
            SysUser.is_deleted == False
        )
        result = await session.execute(query)
        return result.scalar_one_or_none()

    @staticmethod
    async def get_user_by_username(
        session: AsyncSession,
        username: str
    ) -> Optional[SysUser]:
        """
        根据用户名获取用户

        Args:
            session: 数据库会话
            username: 用户名

        Returns:
            Optional[SysUser]: 用户对象，不存在返回 None
        """
        query = select(SysUser).where(
            SysUser.username == username,
            SysUser.is_deleted == False
        )
        result = await session.execute(query)
        return result.scalar_one_or_none()

    @staticmethod
    async def create_user(
        session: AsyncSession,
        user_data: dict
    ) -> SysUser:
        """
        创建用户

        Args:
            session: 数据库会话
            user_data: 用户数据

        Returns:
            SysUser: 创建的用户

        Raises:
            ValidationException: 用户名已存在
        """
        async with session.begin():
            # 检查用户名是否已存在
            existing_user = await UserService.get_user_by_username(
                session, user_data["username"]
            )
            if existing_user:
                raise ValidationException(message="用户名已存在")

            # 创建用户
            user = SysUser(**user_data)
            session.add(user)
            await session.flush()

            return user