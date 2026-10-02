from sqlalchemy import Column, String, Text
from sqlalchemy.orm import validates
from app.modules.cases.core.database import Base
from app.modules.cases.enums.case_enums import LawFirmCooperationStatus, LawFirmRatingLevel
from .base import TenantMixin


class LawFirm(TenantMixin, Base):
    __tablename__ = "law_firms"

    firm_name = Column(String(128), nullable=False)
    unified_social_credit_code = Column(String(64), nullable=True)
    profile = Column(Text, nullable=True)
    rate_card_summary = Column(Text, nullable=True)
    cooperation_status = Column(String(32), default="BACKUP", nullable=True)
    rating_level = Column(String(16), nullable=True)

    @validates("cooperation_status")
    def validate_cooperation_status(self, key: str, value: str | None) -> str | None:
        if value is None:
            return value
        allowed = {e.value for e in LawFirmCooperationStatus}
        if value not in allowed:
            raise ValueError(f"cooperation_status={value!r} 非法，允许值: {sorted(allowed)}")
        return value

    @validates("rating_level")
    def validate_rating_level(self, key: str, value: str | None) -> str | None:
        if value is None:
            return value
        allowed = {e.value for e in LawFirmRatingLevel}
        if value not in allowed:
            raise ValueError(f"rating_level={value!r} 非法，允许值: {sorted(allowed)}")
        return value
