"""
报送任务服务
管理报送任务的创建、查询、更新和删除
"""
from datetime import datetime, date
from typing import List, Optional
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.cases.models.reporting_tasks import ReportingTask
from app.modules.cases.models.report_case_links import ReportCaseLink
from app.modules.cases.models.cases import Case
from app.modules.cases.core.exceptions import NotFoundException, ValidationException


class ReportingService:
    """报送任务服务类"""

    @staticmethod
    async def create_reporting_task(
        session: AsyncSession,
        tenant_id: Optional[str] = None,
        task_data: Optional[dict] = None,
        user_id: Optional[str] = None,
        **kwargs
    ) -> ReportingTask:
        """
        创建报送任务

        Args:
            session: 数据库会话
            tenant_id: 租户ID
            task_data: 任务数据字典
            user_id: 用户ID
            **kwargs: 任务数据（向后兼容）

        Returns:
            ReportingTask: 创建的任务对象

        Raises:
            ValidationException: 必填字段为空
        """
        # 支持两种调用方式
        data = task_data or kwargs

        task_name = data.get("task_name")
        report_category = data.get("report_category")
        assignee_id = data.get("assignee_id")
        due_date = data.get("due_date")
        rule_id = data.get("rule_id")
        template_id = data.get("template_id")

        # 验证必填字段
        if not task_name or not task_name.strip():
            raise ValidationException(message="任务名称不能为空")

        if not report_category or not report_category.strip():
            raise ValidationException(message="报告类别不能为空")

        if not assignee_id or not assignee_id.strip():
            raise ValidationException(message="负责人不能为空")

        if not due_date or not due_date.strip():
            raise ValidationException(message="截止日期不能为空")

        # 创建任务
        task = ReportingTask(
            tenant_id=tenant_id,
            task_name=task_name.strip(),
            report_category=report_category.strip(),
            assignee_id=assignee_id.strip(),
            due_date=due_date.strip(),
            rule_id=rule_id,
            template_id=template_id,
            status="DRAFT",
            created_by=user_id,
            updated_by=user_id
        )

        session.add(task)
        await session.flush()
        await session.refresh(task)

        return task

    @staticmethod
    async def get_reporting_tasks(
        session: AsyncSession,
        tenant_id: Optional[str] = None,
        filters: Optional[dict] = None,
        page: int = 1,
        size: int = 20
    ) -> tuple[List[ReportingTask], int]:
        """
        查询报送任务列表

        Args:
            session: 数据库会话
            tenant_id: 租户ID（可选）
            filters: 过滤条件（可选）
            page: 页码
            size: 每页数量

        Returns:
            tuple[List[ReportingTask], int]: 任务列表和总数
        """
        conditions = [ReportingTask.is_deleted == False]

        if tenant_id:
            conditions.append(ReportingTask.tenant_id == tenant_id)

        if filters:
            if "status" in filters:
                conditions.append(ReportingTask.status == filters["status"])
            if "task_type" in filters:
                conditions.append(ReportingTask.report_category == filters["task_type"])

        # Count query
        count_query = select(ReportingTask).where(and_(*conditions))
        count_result = await session.execute(count_query)
        total = len(list(count_result.scalars().all()))

        # Data query with pagination
        query = select(ReportingTask).where(
            and_(*conditions)
        ).order_by(ReportingTask.due_date.asc())
        query = query.offset((page - 1) * size).limit(size)

        result = await session.execute(query)
        tasks = list(result.scalars().all())

        return tasks, total

    @staticmethod
    async def update_task_status(
        db: AsyncSession,
        task_id: str,
        status: str,
        operator_id: str
    ) -> ReportingTask:
        """
        更新任务状态

        Args:
            db: 数据库会话
            task_id: 任务ID
            status: 新状态
            operator_id: 操作人ID

        Returns:
            ReportingTask: 更新后的任务对象

        Raises:
            NotFoundException: 任务不存在
            ValidationException: 状态为空
        """
        # 验证状态
        if not status or not status.strip():
            raise ValidationException(message="状态不能为空")

        # 查询任务
        query = select(ReportingTask).where(
            and_(ReportingTask.id == task_id, ReportingTask.is_deleted == False)
        )
        result = await db.execute(query)
        task = result.scalar_one_or_none()

        if not task:
            raise NotFoundException(resource="报送任务", resource_id=task_id)

        # 更新状态
        task.status = status.strip()
        if status == "SUBMITTED":
            task.submitted_at = date.today()

        task.updated_by = operator_id
        task.updated_at = datetime.utcnow()

        await db.flush()
        await db.refresh(task)

        return task

    @staticmethod
    async def link_case_to_report(
        db: AsyncSession,
        task_id: str,
        case_id: str,
        operator_id: str
    ) -> ReportCaseLink:
        """
        关联案件到报送任务

        Args:
            db: 数据库会话
            task_id: 任务ID
            case_id: 案件ID
            operator_id: 操作人ID

        Returns:
            ReportCaseLink: 创建的关联对象

        Raises:
            NotFoundException: 任务或案件不存在
        """
        # 验证任务是否存在
        task_query = select(ReportingTask).where(
            and_(ReportingTask.id == task_id, ReportingTask.is_deleted == False)
        )
        task_result = await db.execute(task_query)
        task = task_result.scalar_one_or_none()

        if not task:
            raise NotFoundException(resource="报送任务", resource_id=task_id)

        # 验证案件是否存在
        case_query = select(Case).where(
            and_(Case.id == case_id, Case.is_deleted == False)
        )
        case_result = await db.execute(case_query)
        case = case_result.scalar_one_or_none()

        if not case:
            raise NotFoundException(resource="案件", resource_id=case_id)

        # 创建关联
        link = ReportCaseLink(
            tenant_id=task.tenant_id,
            reporting_task_id=task_id,
            case_id=case_id,
            created_by=operator_id,
            updated_by=operator_id
        )

        db.add(link)
        await db.flush()
        await db.refresh(link)

        return link

    @staticmethod
    async def delete_task(
        db: AsyncSession,
        task_id: str,
        operator_id: str
    ) -> None:
        """
        删除报送任务（软删除）

        Args:
            db: 数据库会话
            task_id: 任务ID
            operator_id: 操作人ID

        Raises:
            NotFoundException: 任务不存在
        """
        # 查询任务
        query = select(ReportingTask).where(
            and_(ReportingTask.id == task_id, ReportingTask.is_deleted == False)
        )
        result = await db.execute(query)
        task = result.scalar_one_or_none()

        if not task:
            raise NotFoundException(resource="报送任务", resource_id=task_id)

        # 软删除
        task.is_deleted = True
        task.updated_by = operator_id
        task.updated_at = datetime.utcnow()

        await db.flush()