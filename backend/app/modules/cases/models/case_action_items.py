"""Case Action Item Model (协作任务).

与 process_nodes 解耦 (决策 D1, 2.S4-PRE), 自由添加的任务,
`process_node_id` 为弱关联仅供 UI 展示。

字段依据 docs/design/v1/db/18_collaboration_and_execution.md。
Enum 校验:
  - priority → Priority
  - status → CaseActionItemStatus
"""
from sqlalchemy import Column, String, Text, DateTime
from sqlalchemy.orm import validates

from app.modules.cases.core.database import Base
from app.modules.cases.enums.case_enums import CaseActionItemStatus, Priority

from .base import TenantMixin


class CaseActionItem(TenantMixin, Base):
    __tablename__ = "case_action_items"

    case_id = Column(String(36), nullable=False)
    process_node_id = Column(String(36), nullable=True)  # 弱关联, 解耦语义 (D1)

    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)

    resp_dept_id = Column(String(36), nullable=True)
    assignee_id = Column(String(36), nullable=False)

    due_date = Column(DateTime(timezone=True), nullable=True)
    priority = Column(
        String(16), default=Priority.MEDIUM.value, nullable=True
    )  # Enum: Priority
    status = Column(
        String(32), default=CaseActionItemStatus.TODO.value, nullable=True
    )  # Enum: CaseActionItemStatus
    submit_note = Column(Text, nullable=True)  # 外部律师提交任务时的说明，S19-PRE2 D16
    notification_status = Column(String(32), default="UNNOTIFIED", nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    # ---- Enum 校验 ----

    @validates("priority")
    def _validate_priority(self, _key: str, value: str | None) -> str | None:
        if value is None or value == "":
            return None
        allowed = {e.value for e in Priority}
        if value not in allowed:
            raise ValueError(
                f"priority={value!r} not in Priority enum. allowed={sorted(allowed)}"
            )
        return value

    @validates("status")
    def _validate_status(self, _key: str, value: str | None) -> str | None:
        if value is None or value == "":
            return None
        allowed = {e.value for e in CaseActionItemStatus}
        if value not in allowed:
            raise ValueError(
                f"status={value!r} not in CaseActionItemStatus enum. allowed={sorted(allowed)}"
            )
        return value
