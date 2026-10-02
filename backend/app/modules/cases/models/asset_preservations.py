"""资产保全记录 Model (asset_preservations).

2.S12-PRE 决策:
    D1: /extend 就地更新 expire_date, 续期历史写 extended_data.extend_history[]
    D2: EXPIRED 为 Service 层视图计算态 (DB 不写), status 字段仅含 ACTIVE/RELEASED/REALIZED
    D7: asset_identifiers JSONB 按 asset_type 分组结构 (见 AssetType docstring)

字段与 docs/design/v1/db/10_asset_preservations.md 对齐.
"""
from sqlalchemy import Column, String, Numeric, Date, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import validates

from app.modules.cases.core.database import Base
from app.modules.cases.enums.case_enums import AssetType, PreservationStatus, PreservationType

from .base import TenantMixin


class AssetPreservation(TenantMixin, Base):
    __tablename__ = "asset_preservations"

    case_id = Column(String(36), nullable=False)
    process_node_id = Column(String(36), nullable=True)
    owner_party_id = Column(String(36), nullable=False)
    asset_type = Column(String(64), nullable=False)       # Enum: AssetType (6 值)
    asset_name = Column(String(255), nullable=False)
    asset_identifiers = Column(JSONB, nullable=True)      # D7: 按 asset_type 分组结构
    preservation_type = Column(String(32), nullable=False)  # Enum: PreservationType (3 值)
    status = Column(String(32), default=PreservationStatus.ACTIVE.value, nullable=False)
    start_date = Column(Date, nullable=False)
    expire_date = Column(Date, nullable=False)             # D2: 视图计算 EXPIRED 依据
    currency = Column(String(16), default="CNY", nullable=True)
    estimated_value = Column(Numeric(15, 2), nullable=True)
    realized_value = Column(Numeric(15, 2), nullable=True)  # D4: /realize 时填写
    execution_court = Column(String(128), nullable=True)
    ruling_document_id = Column(String(36), nullable=True)  # D3: 可选, 不强制
    description = Column(Text, nullable=True)
    extended_data = Column(JSONB, nullable=True)           # D1: 续期历史存 extend_history[]

    # ---- 2.S12-PRE Enum 校验 ----

    @validates("asset_type")
    def _validate_asset_type(self, _key: str, value: str) -> str:
        allowed = {e.value for e in AssetType}
        if value not in allowed:
            raise ValueError(
                f"asset_type={value!r} not in AssetType enum. allowed={sorted(allowed)}"
            )
        return value

    @validates("preservation_type")
    def _validate_preservation_type(self, _key: str, value: str) -> str:
        allowed = {e.value for e in PreservationType}
        if value not in allowed:
            raise ValueError(
                f"preservation_type={value!r} not in PreservationType enum. allowed={sorted(allowed)}"
            )
        return value

    @validates("status")
    def _validate_status(self, _key: str, value: str) -> str:
        # D2: DB 仅允许写入 ACTIVE / RELEASED / REALIZED
        # EXPIRED 是 Service 层视图计算态, 不持久化到 DB
        allowed = {
            PreservationStatus.ACTIVE.value,
            PreservationStatus.RELEASED.value,
            PreservationStatus.REALIZED.value,
        }
        if value not in allowed:
            raise ValueError(
                f"status={value!r} invalid for DB write. "
                f"allowed DB statuses={sorted(allowed)}. "
                f"Note: EXPIRED is a view-computed state, not stored in DB."
            )
        return value
