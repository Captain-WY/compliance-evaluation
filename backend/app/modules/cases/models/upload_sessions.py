"""Upload transaction state retained from the original cases schema."""
from sqlalchemy import Column,String,DateTime,Boolean,func
from sqlalchemy.dialects.postgresql import JSONB
from app.core.database import CaseBase
class UploadSession(CaseBase):
    __tablename__='upload_sessions'
    id=Column(String(36),primary_key=True)
    tenant_id=Column(String(36),nullable=False)
    case_id=Column(String(36),nullable=False)
    folder_id=Column(String(36),nullable=False)
    doc_id=Column(String(36),nullable=False)
    bucket=Column(String(128),nullable=False)
    object_key=Column(String(1024),nullable=False)
    upload_metadata=Column(JSONB,nullable=False)
    expires_at=Column(DateTime(timezone=True),nullable=False)
    completed_at=Column(DateTime(timezone=True))
    aborted_at=Column(DateTime(timezone=True))
    is_deleted=Column(Boolean,server_default='false')
    created_at=Column(DateTime(timezone=True),server_default=func.now())
    updated_at=Column(DateTime(timezone=True),server_default=func.now())
    created_by=Column(String(36))
    updated_by=Column(String(36))
