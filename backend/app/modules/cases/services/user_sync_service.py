"""
User Synchronization Service Module

Handles synchronization between Casdoor users and local shadow users.
Ensures data consistency between authentication system and business database.
"""
from typing import Optional
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.modules.cases.models.sys_users import SysUser
from app.modules.cases.providers.casdoor_provider import CasdoorProvider
from app.modules.cases.core.exceptions import BusinessException


class UserSyncService:
    """
    User Synchronization Service

    Manages shadow user synchronization between Casdoor and local database.
    Implements the Shadow User Pattern for authentication integration.
    """

    def __init__(
        self,
        session: AsyncSession,
        casdoor_provider: Optional[CasdoorProvider] = None
    ):
        """
        Initialize user sync service.

        Args:
            session: Database session
            casdoor_provider: Casdoor provider instance (optional)
        """
        self.session = session
        self.casdoor_provider = casdoor_provider

    async def sync_user_on_login(
        self,
        user_id: str,
        casdoor_info: dict
    ) -> SysUser:
        """
        Synchronize user on login.

        Called every time a user logs in:
        1. Query local user by ID
        2. If exists: update fields (name, email, etc.)
        3. If not exists: create new shadow user
        4. Return user with business context

        Args:
            user_id: Casdoor user UUID
            casdoor_info: User information from Casdoor

        Returns:
            SysUser: Shadow user instance

        Raises:
            BusinessException: If sync fails
        """
        # Query local user
        stmt = select(SysUser).where(
            SysUser.id == user_id,
            SysUser.is_deleted == False
        )

        result = await self.session.execute(stmt)
        user = result.scalar_one_or_none()

        if user:
            # Update existing user
            user.real_name = casdoor_info.get("name", user.real_name)
            user.email = casdoor_info.get("email", user.email)
            user.phone = casdoor_info.get("phone", user.phone)
            user.avatar_url = casdoor_info.get("avatar", user.avatar_url)
            user.updated_at = datetime.utcnow()

            await self.session.commit()
            await self.session.refresh(user)

            return user
        else:
            # Create new shadow user
            return await self.create_shadow_user(user_id, casdoor_info)

    async def create_shadow_user(
        self,
        user_id: str,
        user_info: dict
    ) -> SysUser:
        """
        Create shadow user transactionally.

        Creates a new shadow user in the local database with default values.
        This is called when a user logs in for the first time.

        Args:
            user_id: Casdoor user UUID
            user_info: User information from Casdoor

        Returns:
            SysUser: Newly created shadow user

        Raises:
            BusinessException: If creation fails
        """
        try:
            # Create new user with default values
            user = SysUser(
                id=user_id,
                username=user_info.get("username", ""),
                real_name=user_info.get("name", ""),
                email=user_info.get("email"),
                phone=user_info.get("phone"),
                avatar_url=user_info.get("avatar"),
                tenant_id=user_info.get("organization", "built-in"),
                status="active"
            )

            # Assign default department if available
            # In production, this would look up a default department
            # user.department_id = await self._get_default_department_id()

            self.session.add(user)
            await self.session.commit()
            await self.session.refresh(user)

            return user

        except Exception as e:
            await self.session.rollback()
            raise BusinessException(
                code=5006,
                message=f"创建影子用户失败: {str(e)}"
            )

    async def get_user_by_id(self, user_id: str) -> Optional[SysUser]:
        """
        Get shadow user by ID.

        Args:
            user_id: User UUID

        Returns:
            SysUser if found, None otherwise
        """
        stmt = select(SysUser).where(
            SysUser.id == user_id,
            SysUser.is_deleted == False
        )

        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_user_by_username(self, username: str) -> Optional[SysUser]:
        """
        Get shadow user by username.

        Args:
            username: Username

        Returns:
            SysUser if found, None otherwise
        """
        stmt = select(SysUser).where(
            SysUser.username == username,
            SysUser.is_deleted == False
        )

        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def update_user_status(
        self,
        user_id: str,
        status: str
    ) -> bool:
        """
        Update user status.

        Args:
            user_id: User UUID
            status: New status (active/inactive/locked)

        Returns:
            True if update successful

        Raises:
            BusinessException: If user not found or update fails
        """
        user = await self.get_user_by_id(user_id)

        if not user:
            raise BusinessException(
                code=4004,
                message="用户不存在"
            )

        user.status = status
        user.updated_at = datetime.utcnow()

        await self.session.commit()

        return True

    async def _get_default_department_id(self) -> Optional[str]:
        """
        Get default department ID for new users.

        In production, this would query the sys_departments table
        for a default department (e.g., "未分配部门").

        Returns:
            Default department ID or None
        """
        # TODO: Implement department lookup
        # For now, return None
        return None