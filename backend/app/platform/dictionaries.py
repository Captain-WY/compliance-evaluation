from fastapi import APIRouter,Depends,HTTPException
from sqlalchemy import select
from datetime import datetime,timezone
from uuid import uuid4
from pydantic import BaseModel
from app.core.database import CommonSession
from app.platform.auth import current_user,envelope
from app.modules.compliance.models.system_dictionary import SysDictModel
router=APIRouter(prefix='/api/platform/dictionaries',tags=['Common dictionaries'])
class DictionaryInput(BaseModel):
    namespace:str='shared'
    dict_type:str
    dict_code:str
    dict_label:str
    parent_id:str|None=None
@router.get('')
async def list_items(namespace:str|None=None,dict_type:str|None=None,user=Depends(current_user)):
    q=select(SysDictModel).where(SysDictModel.is_deleted.is_(False))
    if namespace:q=q.where(SysDictModel.namespace==namespace)
    if dict_type:q=q.where(SysDictModel.dict_type==dict_type)
    async with CommonSession() as s: rows=(await s.scalars(q)).all()
    return envelope([{'id':r.dict_id,'namespace':r.namespace,'dictType':r.dict_type,'dictCode':r.dict_code,'dictLabel':r.dict_label,'version':r.version,'protected':r.is_system} for r in rows])
@router.post('')
async def create_item(body:DictionaryInput,user=Depends(current_user)):
    if 'platform_admin' not in user.role_codes:raise HTTPException(403,'Administrator required')
    now=datetime.now(timezone.utc)
    row=SysDictModel(dict_id=str(uuid4()),**body.model_dump(),created_by=user.id,updated_by=user.id,created_at=now,updated_at=now,is_deleted=False)
    async with CommonSession() as s:s.add(row);await s.commit()
    return envelope({'id':row.dict_id,'version':row.version})
@router.patch('/{item_id}')
async def update_item(item_id:str,body:DictionaryInput,user=Depends(current_user)):
    if 'platform_admin' not in user.role_codes:raise HTTPException(403,'Administrator required')
    async with CommonSession() as s:
        row=await s.get(SysDictModel,item_id)
        if not row:raise HTTPException(404,'Dictionary not found')
        if row.is_system and (body.dict_code!=row.dict_code or body.dict_type!=row.dict_type or body.namespace!=row.namespace):raise HTTPException(403,'Protected dictionary code')
        if row.edit_policy in {'READ_ONLY','SYSTEM_LOCKED'}:raise HTTPException(403,'Protected dictionary item')
        for k,v in body.model_dump().items():setattr(row,k,v)
        row.version+=1;row.updated_at=datetime.now(timezone.utc);row.updated_by=user.id;await s.commit()
        return envelope({'id':row.dict_id,'version':row.version})
