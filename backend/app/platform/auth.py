"""Casdoor authentication and shared identity resolution."""
from dataclasses import dataclass
from datetime import datetime, timezone
from hashlib import sha256
from typing import Annotated
import time, asyncio
import httpx, jwt
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from app.core.config import get_settings
from app.core.database import CommonSession
from app.platform.models import ExternalIdentity, RevokedSession
from app.modules.cases.models.sys_users import SysUser
from app.modules.cases.models.sys_user_roles import SysUserRole
from app.modules.cases.models.sys_roles import SysRole
from app.modules.compliance.domain.auth_store import AuthUserRecord, auth_store
from app.platform.authorization import enforce
ROLE_IDS={
 'platform_admin':['ROLE_SYSTEM_ADMIN','ROLE_COMPLIANCE_MANAGER','ROLE_INSPECTION_LEAD'],
 'hq_business':['ROLE_COMPLIANCE_MANAGER','ROLE_INSPECTION_LEAD'],
 'branch_business':['ROLE_BRANCH_COMPLIANCE_OFFICER'],
 'department_business':['ROLE_BUSINESS_LINE_MANAGER'],
 'external_lawyer':[],
}
_jwks_cache=(0,{})
async def validate_token(token: str) -> dict:
    global _jwks_cache
    cfg=get_settings()
    try:
        header=jwt.get_unverified_header(token)
        if header.get('alg')!='RS256': raise jwt.InvalidAlgorithmError()
        if time.time()-_jwks_cache[0]>300 or not _jwks_cache[1]:
            async with httpx.AsyncClient(timeout=10) as client:
                r=await client.get(cfg.casdoor_endpoint.rstrip('/')+'/.well-known/jwks')
                r.raise_for_status(); _jwks_cache=(time.time(),r.json())
        keys=_jwks_cache[1].get('keys',[])
        key=next((k for k in keys if k.get('kid')==header.get('kid')),None)
        if key is None and len(keys)==1 and not header.get('kid'): key=keys[0]
        if key is None: raise jwt.InvalidTokenError('Unknown signing key')
        return jwt.decode(token,jwt.PyJWK.from_dict(key).key,algorithms=['RS256'],
            audience=cfg.casdoor_client_id,issuer=cfg.casdoor_public_endpoint.rstrip('/'),
            options={'require':['exp','iat','sub','iss','aud']},leeway=15)
    except (jwt.PyJWTError,ValueError,StopIteration):
        raise HTTPException(401,'Invalid or expired access token')
    except httpx.HTTPError:
        raise HTTPException(503,'Identity provider unavailable')
async def resolve_token(token):
    claims=await validate_token(token)
    async with CommonSession() as s:
        if await s.get(RevokedSession,sha256(token.encode()).hexdigest()):
            raise HTTPException(401,'Session has been logged out')
        mapping=await s.scalar(select(ExternalIdentity).where(ExternalIdentity.issuer==claims['iss'],ExternalIdentity.subject==claims['sub']))
        if not mapping: raise HTTPException(403,'Identity is not provisioned')
        user=await s.get(SysUser,mapping.user_id)
        if not user or not user.active or user.is_deleted or user.status.lower()!='active': raise HTTPException(401,'Account disabled')
        roles=(await s.scalars(select(SysRole.role_code).join(SysUserRole,SysUserRole.role_id==SysRole.id).where(SysUserRole.user_id==user.id,SysRole.is_deleted.is_(False)))).all()
        user.role_codes=list(roles)
        user.role_code='SYS_ADMIN' if 'platform_admin' in roles else 'LEGAL_ADMIN' if 'hq_business' in roles else 'EXTERNAL_LAWYER' if 'external_lawyer' in roles else 'BUSINESS_USER'
        user.scopes=['all'] if any(r in roles for r in ['platform_admin','hq_business']) else ['organization']
        return user,claims
async def current_user(request: Request, authorization: Annotated[str | None, Header()]=None):
    if hasattr(request.state,'principal'): return request.state.principal
    if not authorization or not authorization.startswith('Bearer '): raise HTTPException(401,'Authentication required')
    user,claims=await resolve_token(authorization[7:]); request.state.principal=user; request.state.claims=claims
    return user
async def ce_current_user(user=Depends(current_user)):
    record=AuthUserRecord(user_id=user.id,username=user.username,display_name=user.real_name,org_id=user.department_id,
        role_ids=list(dict.fromkeys(rid for role in user.role_codes for rid in ROLE_IDS.get(role,[]))),external_subject_id=user.external_subject_id,title=user.title or '')
    # Compatibility projection refreshed from the common identity at each authenticated request.
    auth_store.users[record.user_id]=record
    return record
def user_view(user):
    record=AuthUserRecord(user.id,user.username,user.real_name,user.department_id,list(dict.fromkeys(r for role in user.role_codes for r in ROLE_IDS.get(role,[]))))
    view=auth_store.auth_user_view(record)
    view.update(id=user.id,real_name=user.real_name,department_id=user.department_id,tenant_id=user.tenant_id,
        role_codes=user.role_codes,roles=[{'code':r,'name':r} for r in user.role_codes],permissions=view['permissionIds'])
    return view
class LoginBody(BaseModel):
    username: str
    password: str
router=APIRouter(prefix='/api/platform/auth',tags=['Platform authentication'])
def envelope(data): return {'code':0,'message':'ok','data':data}
@router.post('/login')
async def login(body: LoginBody):
    cfg=get_settings()
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            r=await client.post(cfg.casdoor_endpoint.rstrip('/')+'/api/login/oauth/access_token',data={
                'grant_type':'password','client_id':cfg.casdoor_client_id,'client_secret':cfg.casdoor_client_secret,
                'username':body.username,'password':body.password,'scope':'openid profile'})
            r.raise_for_status(); result=r.json()
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code in (400,401,403):raise HTTPException(401,'Invalid username or password')
            raise HTTPException(503,'Identity provider unavailable')
        except httpx.HTTPError: raise HTTPException(503,'Identity provider unavailable')
    token=result.get('access_token')
    if not token: raise HTTPException(401,'Invalid username or password')
    user,_=await resolve_token(token)
    return envelope({'access_token':token,'token_type':'Bearer','expires_in':result.get('expires_in'), 'user':user_view(user)})
@router.get('/me')
async def me(user=Depends(current_user)): return envelope(user_view(user))
@router.post('/logout')
async def logout(request: Request,user=Depends(current_user),authorization: Annotated[str | None, Header()]=None):
    token=authorization[7:]
    async with CommonSession() as s:
        await s.merge(RevokedSession(token_hash=sha256(token.encode()).hexdigest(),expires_at=datetime.fromtimestamp(request.state.claims['exp'],timezone.utc))); await s.commit()
    return envelope({'logged_out':True})
