"""案件核心服务.

仅保留**跨切片**复用的核心业务逻辑。具体端点的业务逻辑 (如抽屉聚合、基础信息更新) 放在
`case_hall_service.py` 或切片专用 service 中, 避免本文件膨胀为 "万能 service"。

当前保留方法:
  - create_case: 创建案件 + 初始化预算 (由 2.S2.b 切片的 `/cases/create` BFF 端点复用)

已删除的历史方法 (2026-04-18, 切片 2.S2.a):
  - get_case_by_id / get_case_with_dict_names / get_case_list / get_case_list_with_dict_names:
    查询能力由 BFF 视图 (`case_hall_service`) 和 drawer/summary 承担
  - update_case: 由 `case_hall_service.update_case_base_info` 承接
  - delete_case: 由未来的 `/cases/close` BFF 端点承接 (涉及结案流程)
  - get_case_stats: 由 `case_hall_service.summary_stats` 承接
"""
from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from ..core.exceptions import ValidationException
from ..core.validators import DictValidator
from ..enums.case_enums import CaseStatus
from ..models.case_budgets import CaseBudget
from ..models.cases import Case


class CaseService:
    """案件核心服务 (跨切片共用部分)."""

    @staticmethod
    async def create_case(
        session: AsyncSession,
        case_data: dict[str, Any],
        user_id: str,
    ) -> Case:
        """创建案件 + 初始化预算 (事务原子)。

        Args:
            session: AsyncSession
            case_data: 必须包含 tenant_id / internal_case_no / case_name / case_type_code / dispute_id
            user_id: 创建人 ID (写入 created_by / updated_by)

        Returns:
            Case ORM 实例 (已 flush, 含 id)

        Raises:
            ValidationException: 必填缺失 / 字典编码无效
        """
        if session.in_transaction():
            async with session.begin_nested():
                return await CaseService._create_case_impl(session, case_data, user_id)
        else:
            async with session.begin():
                return await CaseService._create_case_impl(session, case_data, user_id)

    @staticmethod
    async def _create_case_impl(
        session: AsyncSession,
        case_data: dict[str, Any],
        user_id: str,
    ) -> Case:
        # 1. 必填校验
        required = ["tenant_id", "internal_case_no", "case_name", "case_type_code", "dispute_id"]
        for field in required:
            if not case_data.get(field):
                raise ValidationException(message=f"缺少必填字段: {field}")

        # 2. 字典字段校验 (仅对字典字段; Enum 由 @validates 装饰器校验)
        if case_data.get("case_type_code"):
            valid = await DictValidator.validate_dict_code(
                session, "CASE_TYPE", case_data["case_type_code"]
            )
            if not valid:
                raise ValidationException(
                    message=f"无效的 case_type_code: {case_data['case_type_code']}"
                )
        if case_data.get("case_cause"):
            valid = await DictValidator.validate_dict_code(
                session, "CAUSE_OF_ACTION", case_data["case_cause"]
            )
            if not valid:
                raise ValidationException(
                    message=f"无效的 case_cause: {case_data['case_cause']}"
                )
        if case_data.get("business_line"):
            valid = await DictValidator.validate_dict_code(
                session, "BUSINESS_LINE", case_data["business_line"]
            )
            if not valid:
                raise ValidationException(
                    message=f"无效的 business_line: {case_data['business_line']}"
                )

        # 3. 填充审计字段
        case_data["created_by"] = user_id
        case_data["updated_by"] = user_id
        case_data.setdefault("case_status", CaseStatus.PENDING.value)

        # 4. 落库
        case = Case(**case_data)
        session.add(case)
        await session.flush()

        # 5. 初始化案件预算
        budget = CaseBudget(
            tenant_id=case_data["tenant_id"],
            case_id=case.id,
            total_budget=0,
            currency="CNY",
            status="DRAFT",
            created_by=user_id,
            updated_by=user_id,
        )
        session.add(budget)
        await session.flush()

        return case
