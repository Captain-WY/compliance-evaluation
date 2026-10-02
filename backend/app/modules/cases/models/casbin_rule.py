from sqlalchemy import Column, String, Integer
from app.core.database import CommonBase as Base


class CasbinRule(Base):
    __tablename__ = "casbin_rule"

    id = Column(Integer, primary_key=True, autoincrement=True)
    ptype = Column(String(255), nullable=False)
    v0 = Column(String(255), nullable=True)
    v1 = Column(String(255), nullable=True)
    v2 = Column(String(255), nullable=True)
    v3 = Column(String(255), nullable=True)
    v4 = Column(String(255), nullable=True)
    v5 = Column(String(255), nullable=True)
