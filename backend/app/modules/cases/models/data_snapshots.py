from sqlalchemy import Column, String, Integer, BigInteger, Text, Date
from app.modules.cases.core.database import Base
from .base import TenantMixin


class DataSnapshot(TenantMixin, Base):
    __tablename__ = "data_snapshots"

    reporting_task_id = Column(String(36), nullable=False)
    snapshot_name = Column(String(128), nullable=False)
    snapshot_date = Column(Date, nullable=True)           # 快照日期，S19-PRE3 D17
    status = Column(String(32), default="DRAFT", nullable=True)  # DRAFT/FINAL，S19-PRE3 D18
    record_count = Column(Integer, default=0, nullable=True)
    s3_file_url = Column(String(512), nullable=False)
    file_size = Column(BigInteger, nullable=True)
    file_hash = Column(String(128), nullable=True)
    # 2.S14-PRE D6: 快照备注说明 (D9 blocker 检查结果摘要写入)
    description = Column(Text, nullable=True)
