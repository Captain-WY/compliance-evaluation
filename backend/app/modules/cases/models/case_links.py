"""Case Links Model.

字段与 docs/design/v1/db/20_case_links.md 对齐。
存储案件间及案件与其它事项 (线索/任务) 的弱关联, 有向。
"""
from sqlalchemy import Column, String
from sqlalchemy.orm import validates

from app.modules.cases.core.database import Base
from app.modules.cases.enums.case_enums import LinkRelationType, LinkTargetType

from .base import TenantMixin


class CaseLink(TenantMixin, Base):
    __tablename__ = "case_links"

    # 1. 关联双方
    source_case_id = Column(String(36), nullable=False)
    target_id = Column(String(36), nullable=False)
    target_type = Column(String(32), nullable=False)  # Enum: LinkTargetType

    # 2. 关联语义
    relation_type = Column(String(32), nullable=False)  # Enum: LinkRelationType
    description = Column(String(255), nullable=True)

    # ---- Enum 校验 ----

    @validates("target_type")
    def _validate_target_type(self, _key: str, value: str) -> str:
        allowed = {e.value for e in LinkTargetType}
        if value not in allowed:
            raise ValueError(
                f"target_type={value!r} not in LinkTargetType enum. allowed={sorted(allowed)}"
            )
        return value

    @validates("relation_type")
    def _validate_relation_type(self, _key: str, value: str) -> str:
        allowed = {e.value for e in LinkRelationType}
        if value not in allowed:
            raise ValueError(
                f"relation_type={value!r} not in LinkRelationType enum. allowed={sorted(allowed)}"
            )
        return value
