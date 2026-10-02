"""
数据快照服务
管理数据快照的创建、查询和删除
"""
from datetime import datetime
from typing import List, Optional
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.cases.models.data_snapshots import DataSnapshot
from app.modules.cases.core.exceptions import NotFoundException, ValidationException


class SnapshotService:
    """数据快照服务类"""

    @staticmethod
    async def create_snapshot(
        db: AsyncSession,
        snapshot_name: str,
        snapshot_type: str,
        snapshot_date: str,
        snapshot_data: dict,
        operator_id: str,
        data_range: Optional[str] = None,
        record_count: Optional[str] = None,
        remarks: Optional[str] = None
    ) -> DataSnapshot:
        """
        创建数据快照

        Args:
            db: 数据库会话
            snapshot_name: 快照名称
            snapshot_type: 快照类型
            snapshot_date: 快照日期
            snapshot_data: 快照数据
            operator_id: 操作人ID
            data_range: 数据范围（可选）
            record_count: 记录数量（可选）
            remarks: 备注（可选）

        Returns:
            DataSnapshot: 创建的快照对象

        Raises:
            ValidationException: 快照名称为空
        """
        # 验证必填字段
        if not snapshot_name or not snapshot_name.strip():
            raise ValidationException(message="快照名称不能为空")

        # 创建快照
        snapshot = DataSnapshot(
            snapshot_name=snapshot_name.strip(),
            snapshot_type=snapshot_type,
            snapshot_date=snapshot_date,
            snapshot_data=snapshot_data,
            data_range=data_range,
            record_count=record_count,
            remarks=remarks,
            created_by=operator_id,
            updated_by=operator_id,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
            is_deleted=False
        )

        db.add(snapshot)
        await db.flush()
        await db.refresh(snapshot)

        return snapshot

    @staticmethod
    async def get_all_snapshots(
        db: AsyncSession
    ) -> List[DataSnapshot]:
        """
        查询所有数据快照

        Args:
            db: 数据库会话

        Returns:
            List[DataSnapshot]: 快照列表
        """
        query = select(DataSnapshot).where(
            DataSnapshot.is_deleted == False
        ).order_by(DataSnapshot.snapshot_date.desc())

        result = await db.execute(query)
        snapshots = result.scalars().all()

        return snapshots

    @staticmethod
    async def get_snapshot_by_id(
        db: AsyncSession,
        snapshot_id: str
    ) -> Optional[DataSnapshot]:
        """
        根据ID查询数据快照

        Args:
            db: 数据库会话
            snapshot_id: 快照ID

        Returns:
            Optional[DataSnapshot]: 快照对象，不存在返回 None
        """
        query = select(DataSnapshot).where(
            and_(
                DataSnapshot.id == snapshot_id,
                DataSnapshot.is_deleted == False
            )
        )

        result = await db.execute(query)
        snapshot = result.scalar_one_or_none()

        return snapshot

    @staticmethod
    async def delete_snapshot(
        db: AsyncSession,
        snapshot_id: str,
        operator_id: str
    ) -> None:
        """
        删除数据快照（软删除）

        Args:
            db: 数据库会话
            snapshot_id: 快照ID
            operator_id: 操作人ID

        Raises:
            NotFoundException: 快照不存在
        """
        # 查询快照
        query = select(DataSnapshot).where(
            and_(DataSnapshot.id == snapshot_id, DataSnapshot.is_deleted == False)
        )
        result = await db.execute(query)
        snapshot = result.scalar_one_or_none()

        if not snapshot:
            raise NotFoundException(resource="数据快照", resource_id=snapshot_id)

        # 软删除
        snapshot.is_deleted = True
        snapshot.updated_by = operator_id
        snapshot.updated_at = datetime.utcnow()

        await db.flush()