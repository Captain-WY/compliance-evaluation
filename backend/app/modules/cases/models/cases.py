"""Case 主表 Model.

字段与 docs/design/v1/db/04_cases.md 对齐。
Enum 字段通过 @validates 装饰器校验合法值集合。
"""
from sqlalchemy import Column, String, Boolean, Text, Date, Numeric
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import validates

from app.modules.cases.core.database import Base
from app.modules.cases.enums.case_enums import (
    CaseSource,
    CaseStatus,
    OurRole,
    ProcedureType,
    RiskLevel,
    Sector,
)

from .base import TenantMixin


class Case(TenantMixin, Base):
    __tablename__ = "cases"

    # 2. 基础与核心标识
    internal_case_no = Column(String(64), nullable=False)
    external_case_no = Column(String(128), nullable=True)
    case_name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)  # 案情简述 (AI 向量化源字段)

    # 3. 案件分类与属性
    case_type_code = Column(String(64), nullable=False)  # 字典: CASE_TYPE
    case_source = Column(String(64), nullable=True)
    business_line = Column(String(64), nullable=True)  # 字典: BUSINESS_LINE
    case_cause = Column(String(128), nullable=True)  # 字典: CAUSE_OF_ACTION
    risk_level = Column(String(32), nullable=True)  # Enum: RiskLevel
    is_investor_protection = Column(Boolean, default=False, nullable=False)
    is_major = Column(Boolean, default=False, nullable=False)
    sector = Column(String(32), nullable=True)  # Enum: Sector

    # 4. 核心业务数据
    our_role = Column(String(64), nullable=True)  # Enum: OurRole
    plaintiff_name = Column(String(255), nullable=True)
    defendant_name = Column(String(255), nullable=True)
    target_amount = Column(Numeric(15, 2), nullable=True)
    provision_amount = Column(Numeric(15, 2), nullable=True)
    target_subject = Column(String(255), nullable=True)

    # 5. 法院与人员
    accepting_court = Column(String(128), nullable=True)
    presiding_judge = Column(String(64), nullable=True)
    judge_contact = Column(String(64), nullable=True)
    handling_lawyer_id = Column(String(36), nullable=True)

    # 6. 复杂案件关联
    is_main_case = Column(Boolean, default=False, nullable=True)
    main_case_id = Column(String(36), nullable=True)
    dispute_id = Column(String(36), nullable=False)
    previous_instance_id = Column(String(36), nullable=True)
    procedure_type = Column(String(64), nullable=True)  # Enum: ProcedureType
    framework_contract_id = Column(String(36), nullable=True)

    # 7. 流程与状态控制
    current_stage_code = Column(String(64), nullable=True)  # 字典: CASE_STAGE
    case_status = Column(String(32), default=CaseStatus.PENDING.value, nullable=True)  # Enum
    latest_progress = Column(Text, nullable=True)

    # 8. 关键时间节点与归档
    filing_date = Column(Date, nullable=True)
    close_date = Column(Date, nullable=True)
    archive_no = Column(String(64), nullable=True)

    # 9. 扩展数据
    extended_data = Column(JSONB, nullable=True)

    # ---- Enum 校验 ----

    @validates("risk_level")
    def _validate_risk_level(self, _key: str, value: str | None) -> str | None:
        if value is None or value == "":
            return None
        allowed = {e.value for e in RiskLevel}
        if value not in allowed:
            raise ValueError(
                f"risk_level={value!r} not in RiskLevel enum. allowed={sorted(allowed)}"
            )
        return value

    @validates("sector")
    def _validate_sector(self, _key: str, value: str | None) -> str | None:
        if value is None or value == "":
            return None
        allowed = {e.value for e in Sector}
        if value not in allowed:
            raise ValueError(
                f"sector={value!r} not in Sector enum. allowed={sorted(allowed)}"
            )
        return value

    @validates("our_role")
    def _validate_our_role(self, _key: str, value: str | None) -> str | None:
        if value is None or value == "":
            return None
        allowed = {e.value for e in OurRole}
        if value not in allowed:
            raise ValueError(
                f"our_role={value!r} not in OurRole enum. allowed={sorted(allowed)}"
            )
        return value

    @validates("procedure_type")
    def _validate_procedure_type(self, _key: str, value: str | None) -> str | None:
        if value is None or value == "":
            return None
        allowed = {e.value for e in ProcedureType}
        if value not in allowed:
            raise ValueError(
                f"procedure_type={value!r} not in ProcedureType enum. allowed={sorted(allowed)}"
            )
        return value

    @validates("case_status")
    def _validate_case_status(self, _key: str, value: str | None) -> str | None:
        if value is None or value == "":
            return None
        allowed = {e.value for e in CaseStatus}
        if value not in allowed:
            raise ValueError(
                f"case_status={value!r} not in CaseStatus enum. allowed={sorted(allowed)}"
            )
        return value

    @validates("case_source")
    def _validate_case_source(self, _key: str, value: str | None) -> str | None:
        if value is None or value == "":
            return None
        allowed = {e.value for e in CaseSource}
        if value not in allowed:
            raise ValueError(
                f"case_source={value!r} not in CaseSource enum. allowed={sorted(allowed)}"
            )
        return value
