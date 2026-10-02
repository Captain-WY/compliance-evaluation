"""案件草稿表 (case_drafts).

2.S10-PRE D1=A 决策: 独立表存储立案向导草稿, 不污染 cases 主表 NOT NULL 约束.
D2=A: owner_id 范围隔离 (仅当前用户可见自己草稿).
D3=C: TTL=30 天, `expires_at` 字段存储过期时间, S10 本切片仅存字段, 主动清理留平台专项切片.

字段语义:
    owner_id        — 草稿创建者 (通常同 created_by, 但显式声明以便后续移交)
    draft_data      — JSONB 存储 NewCaseForm 全部字段 (不限 schema, 以便前端扩展)
    source_clue_id  — 可选, 若从 from-clue/prepare 启动则记录来源线索
    expires_at      — 过期时间 (created_at + 30d), list/detail 端点过滤 WHERE expires_at > now
    last_saved_at   — 最近一次 save 时间 (与 updated_at 冗余, 便于前端展示 "N 分钟前保存")
"""
from sqlalchemy import Column, String, DateTime
from sqlalchemy.dialects.postgresql import JSONB

from app.modules.cases.core.database import Base

from .base import TenantMixin


class CaseDraft(TenantMixin, Base):
    __tablename__ = "case_drafts"

    owner_id = Column(String(36), nullable=False, index=True)
    draft_data = Column(JSONB, nullable=False)
    source_clue_id = Column(String(36), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    last_saved_at = Column(DateTime(timezone=True), nullable=False)
