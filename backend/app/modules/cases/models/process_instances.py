"""Process Instance Model.

字段与 docs/design/v1/db/ 相关设计对齐。
`status` Enum 通过 @validates 校验 (2.S4-PRE, 2026-04-19)。
"""
from sqlalchemy import Column, String, Date
from sqlalchemy.orm import validates

from app.modules.cases.core.database import Base
from app.modules.cases.enums.case_enums import ProcessInstanceStatus

from .base import TenantMixin


class ProcessInstance(TenantMixin, Base):
    __tablename__ = "process_instances"

    case_id = Column(String(36), nullable=False)
    process_template_id = Column(String(36), nullable=True)
    stage_code = Column(String(64), nullable=False)  # 字典 CASE_STAGE
    stage_name = Column(String(128), nullable=False)
    status = Column(
        String(32),
        default=ProcessInstanceStatus.ACTIVE.value,
        nullable=True,
    )  # Enum: ProcessInstanceStatus
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)

    @validates("status")
    def _validate_status(self, _key: str, value: str | None) -> str | None:
        if value is None or value == "":
            return None
        allowed = {e.value for e in ProcessInstanceStatus}
        if value not in allowed:
            raise ValueError(
                f"status={value!r} not in ProcessInstanceStatus enum. allowed={sorted(allowed)}"
            )
        return value
