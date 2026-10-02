from sqlalchemy import Column, String
from app.core.database import CommonBase as Base
from .base import JunctionMixin


class SysRoleMenu(JunctionMixin, Base):
    """角色-菜单关联表 (sys_role_menus).

    DDL: id, tenant_id, role_id, menu_id, created_at, created_by
    无 is_deleted / updated_at / updated_by — 属于纯追加中间表.
    D6 全量替换策略: 硬 DELETE WHERE tenant_id=? AND role_id=? + 批量 INSERT, 同一事务.
    """
    __tablename__ = "sys_role_menus"

    role_id = Column(String(36), nullable=False, index=True)
    menu_id = Column(String(36), nullable=False)
