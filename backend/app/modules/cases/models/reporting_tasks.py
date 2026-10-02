"""报送/报表任务 Model (reporting_tasks).

2.S11-PRE 决策 D5 + D6:
    - status 字段注册 ReportingTaskStatus Enum, 加 @validates 双重校验
    - report_category 字段注册 ReportCategory Enum (3 值), 加 @validates
    - 共享表, 通过 report_category 路由 S11 (INTERNAL_FINANCE) vs S14 (COMPLIANCE_DISCLOSURE)

2.S14-PRE 决策 D2 + D4 + Q1:
    - ReportingTaskStatus 扩充 3 值 (DATA_PREP/PENDING_APPROVAL/APPROVED), S14 合规报送工作流
    - 新增 content_data TEXT 字段: AI 草稿 + 人工润色内容暂存
    - 新增 snapshot_id VARCHAR(36) 字段: 任务绑定的数据源快照 (tasks/generate 时写入)

字段与 docs/design/v1/db/25_reporting_tasks.md + docs/design/v1/api/03_finance_board/04_*.md 对齐.
"""
from sqlalchemy import Column, String, Date, DateTime, Text
from sqlalchemy.orm import validates

from app.modules.cases.core.database import Base
from app.modules.cases.enums.case_enums import ReportCategory, ReportingTaskStatus

from .base import TenantMixin


class ReportingTask(TenantMixin, Base):
    __tablename__ = "reporting_tasks"

    task_name = Column(String(128), nullable=False)
    report_category = Column(String(32), nullable=False)  # Enum: ReportCategory (D6)
    rule_id = Column(String(36), nullable=True)
    template_id = Column(String(36), nullable=True)
    assignee_id = Column(String(36), nullable=False)
    due_date = Column(Date, nullable=False)
    status = Column(
        String(32), default=ReportingTaskStatus.DRAFT.value, nullable=True
    )  # Enum: ReportingTaskStatus (D5)
    approval_instance_id = Column(String(36), nullable=True)
    submitted_at = Column(DateTime(timezone=True), nullable=True)

    # 2.S11-PRE D3 异步生成配套 (alembic 013 新增, PRE2 补 ORM 字段声明):
    # status=COMPLETED 时填 report_url; status=FAILED 时填 error_detail
    report_url = Column(String(512), nullable=True)
    error_detail = Column(Text, nullable=True)
    # 2.S14-PRE D4: AI 生成内容暂存 (DATA_PREP 阶段写入, 审批通过后正式报送)
    content_data = Column(Text, nullable=True)
    # 2.S14-PRE Q1: 任务绑定的数据源快照 ID (data_snapshots.id)
    # tasks/generate 调用时写入; tasks/download 据此定位数据底稿
    # NULL = 尚未绑定快照; 非 NULL = 已选定数据源
    snapshot_id = Column(String(36), nullable=True)

    # ---- 2.S11-PRE Enum 校验 ----

    @validates("status")
    def _validate_status(self, _key: str, value: str | None) -> str | None:
        if value is None or value == "":
            return None
        allowed = {e.value for e in ReportingTaskStatus}
        if value not in allowed:
            raise ValueError(
                f"status={value!r} not in ReportingTaskStatus enum. allowed={sorted(allowed)}"
            )
        return value

    @validates("report_category")
    def _validate_report_category(self, _key: str, value: str | None) -> str | None:
        if value is None:
            return value
        allowed = {e.value for e in ReportCategory}
        if value not in allowed:
            raise ValueError(
                f"report_category={value!r} not in ReportCategory enum. allowed={sorted(allowed)}"
            )
        return value
