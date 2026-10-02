from datetime import datetime, timezone
from sqlalchemy import String, DateTime, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import CommonBase
class ExternalIdentity(CommonBase):
    __tablename__='external_identities'
    __table_args__=(UniqueConstraint('issuer','subject'),)
    id: Mapped[str]=mapped_column(String(80),primary_key=True)
    issuer: Mapped[str]=mapped_column(String(200))
    subject: Mapped[str]=mapped_column(String(160))
    user_id: Mapped[str]=mapped_column(String(80))
class LegacyIdentity(CommonBase):
    __tablename__='legacy_identity_map'
    __table_args__=(UniqueConstraint('source_system','entity','legacy_id'),)
    id: Mapped[str]=mapped_column(String(80),primary_key=True)
    source_system: Mapped[str]=mapped_column(String(40))
    entity: Mapped[str]=mapped_column(String(40))
    legacy_id: Mapped[str]=mapped_column(String(120))
    common_id: Mapped[str]=mapped_column(String(80))
class RevokedSession(CommonBase):
    __tablename__='revoked_sessions'
    token_hash: Mapped[str]=mapped_column(String(64),primary_key=True)
    expires_at: Mapped[datetime]=mapped_column(DateTime(timezone=True))
from app.modules.compliance.models.evidence import FileAssetModel as FileRecord
