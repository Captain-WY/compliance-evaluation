from sqlalchemy import Column, String, Boolean, Integer
from sqlalchemy.orm import validates
from app.core.database import CommonBase as Base
from app.modules.cases.enums.case_enums import MenuType, SystemEntityStatus
from .base import TenantMixin


class SysMenu(TenantMixin, Base):
    __tablename__ = "sys_menus"

    parent_id = Column(String(36), nullable=True)
    menu_name = Column(String(128), nullable=False)
    menu_type = Column(String(16), nullable=False)
    sort_order = Column(Integer, default=0, nullable=True)
    route_path = Column(String(255), nullable=True)
    component = Column(String(255), nullable=True)
    icon = Column(String(64), nullable=True)
    is_hidden = Column(Boolean, default=False, nullable=True)
    permission_key = Column(String(128), nullable=True)
    status = Column(String(32), default="ACTIVE", nullable=True)

    @validates("menu_type")
    def validate_menu_type(self, key: str, value: str | None) -> str | None:
        if value is None:
            return value
        allowed = {e.value for e in MenuType}
        if value not in allowed:
            raise ValueError(f"menu_type={value!r} 非法，允许值: {sorted(allowed)}")
        return value

    @validates("status")
    def validate_status(self, key: str, value: str | None) -> str | None:
        if value is None:
            return value
        allowed = {e.value for e in SystemEntityStatus}
        if value not in allowed:
            raise ValueError(f"status={value!r} 非法，允许值: {sorted(allowed)}")
        return value
