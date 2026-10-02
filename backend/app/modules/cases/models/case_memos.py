from sqlalchemy import Column, String, Text, Boolean
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import validates

from app.modules.cases.core.database import Base
from app.modules.cases.enums.case_enums import MemoVisibility

from .base import TenantMixin


class CaseMemo(TenantMixin, Base):
    __tablename__ = "case_memos"

    case_id = Column(String(36), nullable=False)
    process_node_id = Column(String(36), nullable=True)
    memo_type = Column(String(64), nullable=False)
    title = Column(String(255), nullable=True)
    content = Column(Text, nullable=False)
    ai_summary = Column(Text, nullable=True)
    mentioned_users = Column(JSONB, nullable=True)
    attachment_ids = Column(JSONB, nullable=True)
    visibility = Column(
        String(32), default=MemoVisibility.PUBLIC_TO_FOLLOWERS.value, nullable=True
    )
    is_pinned = Column(Boolean, default=False, nullable=True)

    # ---- 2.S10-PRE Enum 校验 ----

    @validates("visibility")
    def _validate_visibility(self, _key: str, value: str | None) -> str | None:
        if value is None or value == "":
            return None
        allowed = {e.value for e in MemoVisibility}
        if value not in allowed:
            raise ValueError(
                f"visibility={value!r} not in MemoVisibility enum. allowed={sorted(allowed)}"
            )
        return value
