"""
数据库模型基础 Mixin
对齐 docs/design/v1/db/ 中各表 DDL 的审计字段规范。

设计原则:
1. 所有业务表都有统一审计字段 (is_deleted / created_at / created_by / updated_at / updated_by)。
2. tenant_id 的存在以设计文档为准:
   - 设计含 tenant_id -> 使用 TenantMixin (需要多租户隔离)
   - 设计不含 tenant_id -> 使用 GlobalMixin (公共/全局表, 如 sys_dicts, casbin_rule)
3. RBAC 关联表 (sys_user_roles / sys_role_menus) 是纯追加表, 无 is_deleted/updated_*:
   - 使用 JunctionMixin (id + tenant_id + created_at + created_by)
   - D6/D7 全量替换策略: 硬 DELETE (非软删) + INSERT, 在同一事务内执行
4. 本模块只服务 SQLAlchemy ORM, 不承担建表职责; 建表以 alembic/versions/001_schema.py 执行的原生 DDL 为准。
"""
from datetime import datetime
from typing import Any
from sqlalchemy import Column, String, Boolean, DateTime
import uuid


def generate_uuid() -> str:
    return str(uuid.uuid4())


class AuditMixin:
    """标准审计字段 Mixin。所有业务表都含有此组字段。"""

    id = Column(String(36), primary_key=True, nullable=False, default=generate_uuid)

    is_deleted = Column(Boolean, default=False, nullable=False, index=True)

    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    created_by = Column(String(36), nullable=True)
    updated_at = Column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )
    updated_by = Column(String(36), nullable=True)

    def to_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {}
        for column in self.__table__.columns:
            value = getattr(self, column.name)
            if isinstance(value, datetime):
                value = value.isoformat()
            result[column.name] = value
        return result

    def __repr__(self) -> str:
        return f"<{self.__class__.__name__}(id={self.id})>"


class TenantMixin(AuditMixin):
    """多租户表 Mixin。用于设计文档中明确声明 tenant_id 的表。"""

    tenant_id = Column(String(36), nullable=False, index=True, default="built-in")


class GlobalMixin(AuditMixin):
    """全局/公共表 Mixin。用于设计文档中不含 tenant_id 的表 (如 sys_dicts, casbin_rule)。"""

    pass


class JunctionMixin:
    """RBAC 关联表 Mixin (2.S16-PRE2).

    用于 sys_user_roles / sys_role_menus 等纯追加中间表，其 DDL 只有:
      id, tenant_id, [business_fk1], [business_fk2], created_at, created_by

    注意:
    - 无 is_deleted（全量替换用硬 DELETE，而非软删除）
    - 无 updated_at / updated_by（追加表不做 UPDATE 操作）
    """

    id = Column(String(36), primary_key=True, nullable=False, default=generate_uuid)
    tenant_id = Column(String(36), nullable=False, index=True, default="built-in")
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    created_by = Column(String(36), nullable=True)

    def __repr__(self) -> str:
        return f"<{self.__class__.__name__}(id={self.id})>"


# 兼容旧名引用, 后续模型统一迁移到 TenantMixin / GlobalMixin 后删除
BaseMixin = TenantMixin
GlobalBaseMixin = GlobalMixin
