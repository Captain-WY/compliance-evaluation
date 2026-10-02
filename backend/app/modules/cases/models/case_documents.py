"""Case Document Model.

字段对齐 docs/design/v1/db/07_case_documents.md.
2.S5-PRE (2026-04-19): 新增 `file_hash` (SHA256) 字段, 用于秒传与完整性校验.
"""
from sqlalchemy import BigInteger, Boolean, Column, DateTime, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB

from app.modules.cases.core.database import Base

from .base import TenantMixin


class CaseDocument(TenantMixin, Base):
    __tablename__ = "case_documents"

    case_id = Column(String(36), nullable=False)
    folder_id = Column(String(36), nullable=False)
    process_node_id = Column(String(36), nullable=True)  # D1 解耦: 弱关联流程节点
    doc_category = Column(String(64), nullable=True)  # 字典 DOCUMENT_CATEGORY
    doc_name = Column(String(255), nullable=False)
    doc_type = Column(String(32), nullable=False)
    doc_size = Column(BigInteger, nullable=False)
    file_hash = Column(String(96), nullable=True)  # 2.S5-PRE: SHA256 (64 hex) 或 `sha256:xxx` 格式
    file_url = Column(String(1024), nullable=False)
    version = Column(Integer, default=1, nullable=True)
    parent_doc_id = Column(String(36), nullable=True)
    is_latest = Column(Boolean, default=True, nullable=True)
    evidence_no = Column(String(64), nullable=True)
    proof_purpose = Column(Text, nullable=True)
    is_confidential = Column(Boolean, default=False, nullable=True)
    extended_data = Column(JSONB, nullable=True)
    uploader_id = Column(String(36), nullable=False)
    upload_time = Column(DateTime(timezone=True), nullable=True)
