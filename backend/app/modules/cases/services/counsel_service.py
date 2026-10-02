"""
外聘律师服务
管理案件外聘律师的创建、查询、更新和删除
"""
from datetime import datetime
from typing import List, Optional
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.cases.models.case_counsels import CaseCounsel
from app.modules.cases.models.cases import Case
from app.modules.cases.core.exceptions import NotFoundException, ValidationException


class CounselService:
    """外聘律师服务类"""

    @staticmethod
    async def create_counsel_record(
        db: AsyncSession,
        case_id: str,
        lawyer_id: str,
        role: str,
        operator_id: str,
        contract_id: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        fee_amount: Optional[str] = None,
        remarks: Optional[str] = None
    ) -> CaseCounsel:
        """
        创建外聘律师记录

        Args:
            db: 数据库会话
            case_id: 案件ID
            lawyer_id: 律师ID
            role: 角色
            operator_id: 操作人ID
            contract_id: 合同ID（可选）
            start_date: 开始日期（可选）
            end_date: 结束日期（可选）
            fee_amount: 费用金额（可选）
            remarks: 备注（可选）

        Returns:
            CaseCounsel: 创建的律师记录对象

        Raises:
            NotFoundException: 案件不存在
            ValidationException: 必填字段为空
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
        if not lawyer_id or not lawyer_id.strip():
            raise ValidationException(message="律师ID不能为空")

        if not role or not role.strip():
            raise ValidationException(message="角色不能为空")

        # 创建律师记录
        counsel = CaseCounsel(
            case_id=case_id,
            lawyer_id=lawyer_id.strip(),
            role=role.strip(),
            contract_id=contract_id,
            start_date=start_date,
            end_date=end_date,
            fee_amount=fee_amount,
            remarks=remarks,
            created_by=operator_id,
            updated_by=operator_id,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
            is_deleted=False
        )

        db.add(counsel)
        await db.flush()
        await db.refresh(counsel)

        return counsel

    @staticmethod
    async def get_counsel_by_case(
        db: AsyncSession,
        case_id: str
    ) -> List[CaseCounsel]:
        """
        查询案件的所有外聘律师记录

        Args:
            db: 数据库会话
            case_id: 案件ID

        Returns:
            List[CaseCounsel]: 律师记录列表
        """
        query = select(CaseCounsel).where(
            and_(
                CaseCounsel.case_id == case_id,
                CaseCounsel.is_deleted == False
            )
        ).order_by(CaseCounsel.created_at.desc())

        result = await db.execute(query)
        counsels = result.scalars().all()

        return counsels

    @staticmethod
    async def update_counsel(
        db: AsyncSession,
        counsel_id: str,
        operator_id: str,
        role: Optional[str] = None,
        contract_id: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        fee_amount: Optional[str] = None,
        remarks: Optional[str] = None
    ) -> CaseCounsel:
        """
        更新外聘律师记录

        Args:
            db: 数据库会话
            counsel_id: 律师记录ID
            operator_id: 操作人ID
            role: 新角色（可选）
            contract_id: 新合同ID（可选）
            start_date: 新开始日期（可选）
            end_date: 新结束日期（可选）
            fee_amount: 新费用金额（可选）
            remarks: 新备注（可选）

        Returns:
            CaseCounsel: 更新后的律师记录对象

        Raises:
            NotFoundException: 律师记录不存在
            ValidationException: 角色为空
        """
        # 查询律师记录
        query = select(CaseCounsel).where(
            and_(CaseCounsel.id == counsel_id, CaseCounsel.is_deleted == False)
        )
        result = await db.execute(query)
        counsel = result.scalar_one_or_none()

        if not counsel:
            raise NotFoundException(resource="律师记录", resource_id=counsel_id)

        # 验证角色
        if role is not None:
            if not role or not role.strip():
                raise ValidationException(message="角色不能为空")
            counsel.role = role.strip()

        # 更新字段
        if contract_id is not None:
            counsel.contract_id = contract_id

        if start_date is not None:
            counsel.start_date = start_date

        if end_date is not None:
            counsel.end_date = end_date

        if fee_amount is not None:
            counsel.fee_amount = fee_amount

        if remarks is not None:
            counsel.remarks = remarks

        counsel.updated_by = operator_id
        counsel.updated_at = datetime.utcnow()

        await db.flush()
        await db.refresh(counsel)

        return counsel

    @staticmethod
    async def delete_counsel(
        db: AsyncSession,
        counsel_id: str,
        operator_id: str
    ) -> None:
        """
        删除外聘律师记录（软删除）

        Args:
            db: 数据库会话
            counsel_id: 律师记录ID
            operator_id: 操作人ID

        Raises:
            NotFoundException: 律师记录不存在
        """
        # 查询律师记录
        query = select(CaseCounsel).where(
            and_(CaseCounsel.id == counsel_id, CaseCounsel.is_deleted == False)
        )
        result = await db.execute(query)
        counsel = result.scalar_one_or_none()

        if not counsel:
            raise NotFoundException(resource="律师记录", resource_id=counsel_id)

        # 软删除
        counsel.is_deleted = True
        counsel.updated_by = operator_id
        counsel.updated_at = datetime.utcnow()

        await db.flush()