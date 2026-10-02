from sqlalchemy import Column, String
from app.core.database import CommonBase as Base
from .base import JunctionMixin


class SysUserRole(JunctionMixin, Base):
    """用户-角色关联表 (sys_user_roles).

    DDL: id, tenant_id, user_id, role_id, created_at, created_by
    无 is_deleted / updated_at / updated_by — 属于纯追加中间表.
    D7 全量替换策略: 硬 DELETE WHERE tenant_id=? AND user_id=? + 批量 INSERT, 同一事务.
    """
    __tablename__ = "sys_user_roles"

    user_id = Column(String(36), nullable=False, index=True)
    role_id = Column(String(36), nullable=False)
