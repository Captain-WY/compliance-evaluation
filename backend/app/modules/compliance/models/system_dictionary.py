from typing import Any
from uuid import uuid4
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Index, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, synonym

from app.core.database import CommonBase as Base
from app.modules.compliance.models.auth import AuditMixin


class SysDictModel(AuditMixin, Base):
    __tablename__ = "sys_dicts"
    __table_args__ = (
        Index(
            "uk_sys_dicts_type_code_active",
            "namespace",
            "dict_type",
            "dict_code",
            unique=True,
            postgresql_where=text("is_deleted = FALSE"),
            sqlite_where=text("is_deleted = 0"),
        ),
        Index(
            "ix_sys_dicts_type_parent_order",
            "dict_type",
            "parent_id",
            "sort_order",
            postgresql_where=text("is_deleted = FALSE"),
            sqlite_where=text("is_deleted = 0"),
        ),
        Index(
            "ix_sys_dicts_type_active",
            "dict_type",
            "is_active",
            postgresql_where=text("is_deleted = FALSE"),
            sqlite_where=text("is_deleted = 0"),
        ),
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda:datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda:datetime.now(timezone.utc))
    namespace: Mapped[str] = mapped_column(String(40), nullable=False, default="compliance")
    id = synonym("dict_id")
    dict_name = synonym("dict_label")
    dict_id: Mapped[str] = mapped_column(String(80), primary_key=True, default=lambda:str(uuid4()))
    parent_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    dict_type: Mapped[str] = mapped_column(String(64), nullable=False)
    dict_code: Mapped[str] = mapped_column(String(80), nullable=False)
    dict_label: Mapped[str] = mapped_column(String(160), nullable=False)
    dict_label_en: Mapped[str | None] = mapped_column(String(160), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    edit_policy: Mapped[str] = mapped_column(
        String(40),
        nullable=False,
        default="ADMIN_EDITABLE",
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    ui_meta: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    source: Mapped[str] = mapped_column(String(80), nullable=False, default="seed")
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
