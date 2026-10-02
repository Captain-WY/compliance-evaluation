"""
案件成员服务
管理案件团队成员和角色
"""
from typing import List, Optional
from datetime import datetime
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.case_members import CaseMember
from ..models.cases import Case
from ..core.exceptions import NotFoundException, ValidationException, DuplicateException


class CaseMemberService:
    """案件成员服务"""

    @staticmethod
    async def add_member(
        session: AsyncSession,
        case_id: str,
        user_id: str,
        role: str,
        operator_id: str,
        join_date: Optional[str] = None
    ) -> CaseMember:
        """
        添加案件成员

        业务逻辑：
        1. 验证案件存在
        2. 验证必填字段
        3. 检查重复添加
        4. 创建成员记录

        Args:
            session: 数据库会话
            case_id: 案件 ID
            user_id: 用户 ID
            role: 角色（主办律师、协办律师、助理等）
            operator_id: 操作人 ID
            join_date: 加入日期（可选）

        Returns:
            CaseMember: 创建的成员记录

        Raises:
            NotFoundException: 案件不存在
            ValidationException: 参数校验失败
            DuplicateException: 成员已存在
        """
        async with session.begin():
            # 1. 验证案件存在
            case_query = select(Case).where(
                and_(Case.id == case_id, Case.is_deleted == False)
            )
            case_result = await session.execute(case_query)
            case = case_result.scalar_one_or_none()

            if not case:
                raise NotFoundException("案件", case_id)

            # 2. 验证必填字段
            if not role or not role.strip():
                raise ValidationException("角色不能为空")

            # 3. 检查重复添加（同一用户在同一案件中）
            existing_query = select(CaseMember).where(
                and_(
                    CaseMember.case_id == case_id,
                    CaseMember.user_id == user_id,
                    CaseMember.is_deleted == False
                )
            )
            existing_result = await session.execute(existing_query)
            existing_member = existing_result.scalar_one_or_none()

            if existing_member:
                raise DuplicateException("案件成员", f"用户 {user_id} 在案件 {case_id}")

            # 4. 创建成员记录
            member = CaseMember(
                case_id=case_id,
                user_id=user_id,
                role=role,
                join_date=join_date or datetime.now().strftime("%Y-%m-%d"),
                is_active="Y",
                created_by=operator_id,
                updated_by=operator_id
            )
            session.add(member)
            await session.flush()

            return member

    @staticmethod
    async def get_members_by_case(
        session: AsyncSession,
        case_id: str
    ) -> List[CaseMember]:
        """
        查询案件的所有成员

        Args:
            session: 数据库会话
            case_id: 案件 ID

        Returns:
            List[CaseMember]: 成员列表（排除已删除）
        """
        query = select(CaseMember).where(
            and_(
                CaseMember.case_id == case_id,
                CaseMember.is_deleted == False,
                CaseMember.is_active == "Y"
            )
        ).order_by(CaseMember.created_at)

        result = await session.execute(query)
        return list(result.scalars().all())

    @staticmethod
    async def update_member_role(
        session: AsyncSession,
        member_id: str,
        new_role: str,
        operator_id: str
    ) -> CaseMember:
        """
        更新成员角色

        Args:
            session: 数据库会话
            member_id: 成员 ID
            new_role: 新角色
            operator_id: 操作人 ID

        Returns:
            CaseMember: 更新后的成员

        Raises:
            NotFoundException: 成员不存在
            ValidationException: 角色不能为空
        """
        async with session.begin():
            # 验证角色不为空
            if not new_role or not new_role.strip():
                raise ValidationException("角色不能为空")

            # 查询成员
            query = select(CaseMember).where(
                and_(
                    CaseMember.id == member_id,
                    CaseMember.is_deleted == False
                )
            )
            result = await session.execute(query)
            member = result.scalar_one_or_none()

            if not member:
                raise NotFoundException("案件成员", member_id)

            # 更新角色
            member.role = new_role
            member.updated_by = operator_id
            member.updated_at = datetime.now()

            await session.flush()
            return member

    @staticmethod
    async def remove_member(
        session: AsyncSession,
        member_id: str,
        operator_id: str
    ) -> None:
        """
        移除案件成员（软删除）

        Args:
            session: 数据库会话
            member_id: 成员 ID
            operator_id: 操作人 ID

        Raises:
            NotFoundException: 成员不存在
        """
        async with session.begin():
            # 查询成员
            query = select(CaseMember).where(
                and_(
                    CaseMember.id == member_id,
                    CaseMember.is_deleted == False
                )
            )
            result = await session.execute(query)
            member = result.scalar_one_or_none()

            if not member:
                raise NotFoundException("案件成员", member_id)

            # 软删除
            member.is_deleted = True
            member.is_active = "N"
            member.updated_by = operator_id
            member.updated_at = datetime.now()

            await session.flush()

    @staticmethod
    async def get_user_cases(
        session: AsyncSession,
        user_id: str
    ) -> List[Case]:
        """
        查询用户参与的所有案件

        Args:
            session: 数据库会话
            user_id: 用户 ID

        Returns:
            List[Case]: 案件列表
        """
        # 联表查询：case_members JOIN cases
        query = select(Case).join(
            CaseMember, Case.id == CaseMember.case_id
        ).where(
            and_(
                CaseMember.user_id == user_id,
                CaseMember.is_deleted == False,
                CaseMember.is_active == "Y",
                Case.is_deleted == False
            )
        ).order_by(Case.created_at.desc())

        result = await session.execute(query)
        return list(result.scalars().all())