"""Shared files: metadata in common DB, bytes in MinIO."""
import asyncio, hashlib, io, uuid
from datetime import datetime,timezone
from minio import Minio
from fastapi import APIRouter,Depends,UploadFile,File,HTTPException
from fastapi.responses import Response
from app.core.config import get_settings
from app.core.database import CommonSession
from app.platform.models import FileRecord
from app.platform.auth import current_user,envelope
router=APIRouter(prefix='/api/platform/files',tags=['Platform files'])
def storage():
    c=get_settings(); return Minio(c.minio_endpoint,access_key=c.minio_access_key,secret_key=c.minio_secret_key,secure=False)
@router.post('')
async def upload(file:UploadFile=File(...),user=Depends(current_user)):
    data=await file.read(104857601)
    if len(data)>104857600: raise HTTPException(413,'File exceeds 100 MiB')
    key=str(uuid.uuid4()); c=get_settings(); client=storage()
    await asyncio.to_thread(client.put_object,c.minio_bucket,key,io.BytesIO(data),len(data),content_type=file.content_type or 'application/octet-stream')
    row=FileRecord(id=key,filename=file.filename or 'upload',content_type=file.content_type or 'application/octet-stream',checksum=hashlib.sha256(data).hexdigest(),storage_key=key,owner_id=user.id,org_id=user.department_id,file_size=len(data),uploaded_at_ref=datetime.now(timezone.utc),scan_status="PENDING",created_at=datetime.now(timezone.utc),updated_at=datetime.now(timezone.utc),is_deleted=False,created_by=user.id,updated_by=user.id)
    async with CommonSession() as s: s.add(row); await s.commit()
    return envelope({'id':key,'fileId':key,'filename':row.filename,'checksum':row.checksum,'downloadUrl':f'/api/platform/files/{key}'})
@router.get('/{file_id}')
async def download(file_id:str,user=Depends(current_user)):
    async with CommonSession() as s: row=await s.get(FileRecord,file_id)
    if not row or (row.owner_id!=user.id and 'all' not in user.scopes): raise HTTPException(404,'File not found')
    def read():
        result=storage().get_object(get_settings().minio_bucket,row.storage_key)
        try: return result.read()
        finally: result.close(); result.release_conn()
    return Response(await asyncio.to_thread(read),media_type=row.content_type,headers={'X-Checksum-SHA256':row.checksum})
