"""
案件策略服务
管理案件策略的创建、查询、更新和删除
"""
from datetime import datetime
from typing import List, Optional
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.cases.models.case_strategies import CaseStrategy
from app.modules.cases.models.cases import Case
from app.modules.cases.core.exceptions import NotFoundException, ValidationException


class StrategyService:
    """案件策略服务类"""

    @staticmethod
    async def create_strategy(
        db: AsyncSession,
        case_id: str,
        strategy_title: str,
        strategy_content: str,
        operator_id: str,
        strategy_type: str = "LITIGATION",
        version: Optional[str] = None,
        status: str = "DRAFT"
    ) -> CaseStrategy:
        """
        创建案件策略

        Args:
            db: 数据库会话
            case_id: 案件ID
            strategy_title: 策略标题
            strategy_content: 策略内容
            operator_id: 操作人ID
            strategy_type: 策略类型（可选）
            version: 版本（可选）
            status: 状态（可选）

        Returns:
            CaseStrategy: 创建的策略对象

        Raises:
            NotFoundException: 案件不存在
            ValidationException: 策略标题为空
        """
        # 验证案件是否存在
        case_query = select(Case).where(
            and_(Case.id == case_id, Case.is_deleted == False)
        )
        result = await db.execute(case_query)
        case = result.scalar_one_or_none()

        if not case:
            raise NotFoundException(resource="案件", resource_id=case_id)

        # 验证必填字段
        if not strategy_title or not strategy_title.strip():
            raise ValidationException(message="策略标题不能为空")

        # 创建策略
        strategy = CaseStrategy(
            case_id=case_id,
            title=strategy_title.strip(),
            content=strategy_content,
            strategy_type=strategy_type,
            author_id=operator_id,
            version=version,
            status=status,
            created_by=operator_id,
            updated_by=operator_id,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
            is_deleted=False
        )

        db.add(strategy)
        await db.flush()
        await db.refresh(strategy)

        return strategy

    @staticmethod
    async def get_strategies_by_case(
        db: AsyncSession,
        case_id: str
    ) -> List[CaseStrategy]:
        """
        查询案件的所有策略

        Args:
            db: 数据库会话
            case_id: 案件ID

        Returns:
            List[CaseStrategy]: 策略列表
        """
        query = select(CaseStrategy).where(
            and_(
                CaseStrategy.case_id == case_id,
                CaseStrategy.is_deleted == False
            )
        ).order_by(CaseStrategy.created_at.desc())

        result = await db.execute(query)
        strategies = result.scalars().all()

        return strategies

    @staticmethod
    async def update_strategy(
        db: AsyncSession,
        strategy_id: str,
        operator_id: str,
        strategy_title: Optional[str] = None,
        strategy_content: Optional[str] = None,
        strategy_type: Optional[str] = None,
        version: Optional[str] = None,
        status: Optional[str] = None
    ) -> CaseStrategy:
        """
        更新案件策略

        Args:
            db: 数据库会话
            strategy_id: 策略ID
            operator_id: 操作人ID
            strategy_title: 新标题（可选）
            strategy_content: 新内容（可选）
            strategy_type: 新类型（可选）
            version: 新版本（可选）
            status: 新状态（可选）

        Returns:
            CaseStrategy: 更新后的策略对象

        Raises:
            NotFoundException: 策略不存在
            ValidationException: 标题为空
        """
        # 查询策略
        query = select(CaseStrategy).where(
            and_(CaseStrategy.id == strategy_id, CaseStrategy.is_deleted == False)
        )
        result = await db.execute(query)
        strategy = result.scalar_one_or_none()

        if not strategy:
            raise NotFoundException(resource="案件策略", resource_id=strategy_id)

        # 验证标题
        if strategy_title is not None:
            if not strategy_title or not strategy_title.strip():
                raise ValidationException(message="策略标题不能为空")
            strategy.title = strategy_title.strip()

        # 更新字段
        if strategy_content is not None:
            strategy.content = strategy_content

        if strategy_type is not None:
            strategy.strategy_type = strategy_type

        if version is not None:
            strategy.version = version

        if status is not None:
            strategy.status = status

        strategy.updated_by = operator_id
        strategy.updated_at = datetime.utcnow()

        await db.flush()
        await db.refresh(strategy)

        return strategy

    @staticmethod
    async def delete_strategy(
        db: AsyncSession,
        strategy_id: str,
        operator_id: str
    ) -> None:
        """
        删除案件策略（软删除）

        Args:
            db: 数据库会话
            strategy_id: 策略ID
            operator_id: 操作人ID

        Raises:
            NotFoundException: 策略不存在
        """
        # 查询策略
        query = select(CaseStrategy).where(
            and_(CaseStrategy.id == strategy_id, CaseStrategy.is_deleted == False)
        )
        result = await db.execute(query)
        strategy = result.scalar_one_or_none()

        if not strategy:
            raise NotFoundException(resource="案件策略", resource_id=strategy_id)

        # 软删除
        strategy.is_deleted = True
        strategy.updated_by = operator_id
        strategy.updated_at = datetime.utcnow()

        await db.flush()