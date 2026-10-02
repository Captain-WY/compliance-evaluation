from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, synonym

from app.core.database import CommonBase as Base


class AuditMixin:
    created_by: Mapped[str | None] = mapped_column(String(80), nullable=True)
    updated_by: Mapped[str | None] = mapped_column(String(80), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_by: Mapped[str | None] = mapped_column(String(80), nullable=True)


class OrgNodeModel(AuditMixin, Base):
    __tablename__ = "org_nodes"

    id = synonym("org_id")
    dept_name = synonym("org_name")
    parent_id = synonym("parent_org_id")
    tenant_id: Mapped[str] = mapped_column(String(36), default="built-in")
    status: Mapped[str] = mapped_column(String(32), default="ACTIVE")
    org_id: Mapped[str] = mapped_column(String(80), primary_key=True)
    org_name: Mapped[str] = mapped_column(String(200), nullable=False)
    org_level: Mapped[str] = mapped_column(String(80), nullable=False)
    parent_org_id: Mapped[str | None] = mapped_column(String(80), ForeignKey("org_nodes.org_id"))
    region: Mapped[str | None] = mapped_column(String(80))
    city: Mapped[str | None] = mapped_column(String(80))
    business_line_ids: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    business_line_source: Mapped[str] = mapped_column(
        String(80),
        nullable=False,
        default="explicit",
    )
    data_origin: Mapped[str] = mapped_column(String(80), nullable=False, default="seed")
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sync_source: Mapped[str] = mapped_column(String(80), nullable=False, default="seed")
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    parent_assignment_basis: Mapped[str | None] = mapped_column(String(120), nullable=True)
    parent_confidence: Mapped[str] = mapped_column(String(40), nullable=False, default="unknown")


from app.modules.cases.models.sys_users import SysUser as AuthUserModel


class PersonnelModel(AuditMixin, Base):
    __tablename__ = "personnel"

    personnel_id: Mapped[str] = mapped_column(String(80), primary_key=True)
    user_id: Mapped[str | None] = mapped_column(String(80), ForeignKey("sys_users.id"))
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    org_id: Mapped[str] = mapped_column(String(80), ForeignKey("org_nodes.org_id"), nullable=False)
    title: Mapped[str | None] = mapped_column(String(120))
    phone: Mapped[str | None] = mapped_column(String(40), nullable=True)
    email: Mapped[str | None] = mapped_column(String(160), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sync_source: Mapped[str] = mapped_column(String(80), nullable=False, default="seed")
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    extra: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)


class SystemRoleModel(AuditMixin, Base):
    __tablename__ = "system_roles"

    role_id: Mapped[str] = mapped_column(String(80), primary_key=True)
    role_code: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)
    role_name: Mapped[str] = mapped_column(String(120), nullable=False)
    role_level: Mapped[str] = mapped_column(String(80), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)


class RoleAssignmentModel(AuditMixin, Base):
    __tablename__ = "role_assignments"

    assignment_id: Mapped[str] = mapped_column(String(80), primary_key=True)
    role_id: Mapped[str] = mapped_column(
        String(80),
        ForeignKey("system_roles.role_id"),
        nullable=False,
    )
    personnel_id: Mapped[str] = mapped_column(
        String(80),
        ForeignKey("personnel.personnel_id"),
        nullable=False,
    )
    org_id: Mapped[str] = mapped_column(String(80), ForeignKey("org_nodes.org_id"), nullable=False)
    assigned_by: Mapped[str] = mapped_column(String(80), nullable=False)
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
