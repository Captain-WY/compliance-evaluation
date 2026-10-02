"""
审批任务服务
管理审批流程中的具体任务节点
"""
from typing import Optional
from datetime import datetime
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.approval_tasks import ApprovalTask
from ..core.exceptions import NotFoundException, ValidationException


class ApprovalTaskService:
    """审批任务服务"""

    @staticmethod
    async def create_task(
        session: AsyncSession,
        instance_id: str,
        node_name: str,
        assignee_id: str,
        operator_id: str
    ) -> ApprovalTask:
        """
        创建审批任务

        Args:
            session: 数据库会话
            instance_id: 审批实例 ID
            node_name: 节点名称
            assignee_id: 审批人 ID
            operator_id: 创建人 ID

        Returns:
            ApprovalTask: 创建的任务

        Raises:
            ValidationException: 参数校验失败
        """
        async with session.begin():
            # 验证必填字段
            if not node_name or not node_name.strip():
                raise ValidationException("节点名称不能为空")

            if not assignee_id or not assignee_id.strip():
                raise ValidationException("审批人不能为空")

            # 创建任务
            task = ApprovalTask(
                instance_id=instance_id,
                node_name=node_name,
                assignee_id=assignee_id,
                status="PENDING",
                created_by=operator_id,
                updated_by=operator_id
            )
            session.add(task)
            await session.flush()

            return task

    @staticmethod
    async def get_task_by_id(
        session: AsyncSession,
        task_id: str
    ) -> Optional[ApprovalTask]:
        """
        根据 ID 获取审批任务

        Args:
            session: 数据库会话
            task_id: 任务 ID

        Returns:
            Optional[ApprovalTask]: 任务，不存在返回 None
        """
        query = select(ApprovalTask).where(
            and_(
                ApprovalTask.id == task_id,
                ApprovalTask.is_deleted == False
            )
        )

        result = await session.execute(query)
        return result.scalar_one_or_none()

    @staticmethod
    async def update_task_status(
        session: AsyncSession,
        task_id: str,
        action: str,
        comment: Optional[str],
        operator_id: str
    ) -> ApprovalTask:
        """
        更新任务状态

        Args:
            session: 数据库会话
            task_id: 任务 ID
            action: 操作（APPROVED, REJECTED）
            comment: 审批意见
            operator_id: 操作人 ID

        Returns:
            ApprovalTask: 更新后的任务

        Raises:
            NotFoundException: 任务不存在
            ValidationException: 参数校验失败
        """
        async with session.begin():
            # 查询任务
            query = select(ApprovalTask).where(
                and_(
                    ApprovalTask.id == task_id,
                    ApprovalTask.is_deleted == False
                )
            )
            result = await session.execute(query)
            task = result.scalar_one_or_none()

            if not task:
                raise NotFoundException("审批任务", task_id)

            # 验证操作类型
            if action not in ["APPROVED", "REJECTED"]:
                raise ValidationException("无效的操作类型")

            # 更新任务状态
            task.action = action
            task.comment = comment
            task.status = action
            task.acted_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            task.updated_by = operator_id
            task.updated_at = datetime.now()

            await session.flush()
            return task