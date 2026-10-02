"""Legacy CMS authentication adapter; all token verification belongs to platform."""
from fastapi import Depends
from app.platform.auth import current_user as get_current_user, resolve_token
from app.modules.cases.providers.minio_storage import MinIOStorageProvider
_storage_provider = None
def get_storage():
    global _storage_provider
    if _storage_provider is None: 
        from app.core.config import get_settings
        c=get_settings()
        import os
        _storage_provider=MinIOStorageProvider(c.minio_endpoint,c.minio_access_key,c.minio_secret_key,public_endpoint=os.getenv("MINIO_PUBLIC_ENDPOINT"))
    return _storage_provider
async def get_current_active_user(current_user=Depends(get_current_user)): return current_user
async def _resolve_user_from_token(token): return (await resolve_token(token))[0]
async def get_optional_user(current_user=Depends(get_current_user)): return current_user
