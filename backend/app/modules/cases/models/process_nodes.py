"""Process Node Model.

字段与 docs/design/v1/db/05_process_execution.md 对齐。
4 个 Enum 字段通过 @validates 校验 (2.S4-PRE, 2026-04-19):
  - node_type → NodeType
  - status → ProcessNodeStatus
  - priority → Priority
  - action_type → ActionType
"""
from sqlalchemy import Column, String, Date, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import validates

from app.modules.cases.core.database import Base
from app.modules.cases.enums.case_enums import ActionType, NodeType, Priority, ProcessNodeStatus

from .base import TenantMixin


class ProcessNode(TenantMixin, Base):
    __tablename__ = "process_nodes"

    instance_id = Column(String(36), nullable=False)
    case_id = Column(String(36), nullable=False)
    task_template_id = Column(String(36), nullable=True)  # null 表示自定义节点
    task_code = Column(String(64), nullable=True)
    task_name = Column(String(128), nullable=False)

    node_type = Column(
        String(32), default=NodeType.TASK.value, nullable=True
    )  # Enum: NodeType
    status = Column(
        String(32), default=ProcessNodeStatus.PENDING.value, nullable=True
    )  # Enum: ProcessNodeStatus
    assignee_id = Column(String(36), nullable=True)
    priority = Column(
        String(32), default=Priority.MEDIUM.value, nullable=True
    )  # Enum: Priority
    deadline = Column(Date, nullable=True)
    completed_date = Column(Date, nullable=True)

    action_type = Column(
        String(32), default=ActionType.NONE.value, nullable=True
    )  # Enum: ActionType
    action_config = Column(JSONB, nullable=True)
    required_doc_types = Column(JSONB, nullable=True)
    result_data = Column(JSONB, nullable=True)
    description = Column(Text, nullable=True)

    # ---- Enum 校验 ----

    @validates("node_type")
    def _validate_node_type(self, _key: str, value: str | None) -> str | None:
        if value is None or value == "":
            return None
        allowed = {e.value for e in NodeType}
        if value not in allowed:
            raise ValueError(
                f"node_type={value!r} not in NodeType enum. allowed={sorted(allowed)}"
            )
        return value

    @validates("status")
    def _validate_status(self, _key: str, value: str | None) -> str | None:
        if value is None or value == "":
            return None
        allowed = {e.value for e in ProcessNodeStatus}
        if value not in allowed:
            raise ValueError(
                f"status={value!r} not in ProcessNodeStatus enum. allowed={sorted(allowed)}"
            )
        return value

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

    @validates("action_type")
    def _validate_action_type(self, _key: str, value: str | None) -> str | None:
        if value is None or value == "":
            return None
        allowed = {e.value for e in ActionType}
        if value not in allowed:
            raise ValueError(
                f"action_type={value!r} not in ActionType enum. allowed={sorted(allowed)}"
            )
        return value
