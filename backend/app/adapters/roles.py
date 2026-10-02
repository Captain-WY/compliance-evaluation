"""Common role-assignment writes for the CE compatibility API."""
from uuid import uuid4
from sqlalchemy import select,delete
from fastapi import HTTPException
from app.core.database import CommonSession
from app.modules.cases.models.sys_roles import SysRole
from app.modules.cases.models.sys_user_roles import SysUserRole
from app.modules.compliance.models.auth import PersonnelModel
ROLE_MAP={'ROLE_SYSTEM_ADMIN':'platform_admin','ROLE_COMPLIANCE_DIRECTOR':'hq_business','ROLE_COMPLIANCE_MANAGER':'hq_business','ROLE_INSPECTION_LEAD':'hq_business','ROLE_INSPECTOR':'hq_business','ROLE_BRANCH_MANAGER':'branch_business','ROLE_BRANCH_COMPLIANCE_OFFICER':'branch_business','ROLE_BUSINESS_LINE_MANAGER':'department_business'}
async def create_assignment(payload,actor):
    code=ROLE_MAP.get(payload.role_id)
    if not code:raise HTTPException(422,'Role is not mapped to a platform policy')
    async with CommonSession() as s:
        person=await s.get(PersonnelModel,payload.personnel_id)
        if not person or not person.user_id:raise HTTPException(404,'Personnel not found')
        if person.org_id!=payload.org_id:raise HTTPException(422,'Role scope must match the common organization')
        role=await s.scalar(select(SysRole).where(SysRole.role_code==code))
        old=await s.scalar(select(SysUserRole).where(SysUserRole.user_id==person.user_id,SysUserRole.role_id==role.id))
        if old:raise HTTPException(409,'Role assignment already exists')
        ident=str(uuid4());s.add(SysUserRole(id=ident,user_id=person.user_id,role_id=role.id,tenant_id='built-in',created_by=actor.user_id));await s.commit()
    from app.adapters.compliance_runtime import initialize_runtime
    await initialize_runtime()
    return {'assignmentId':ident+':'+payload.role_id,'roleId':payload.role_id,'personnelId':payload.personnel_id,'orgId':payload.org_id,'active':True}
async def delete_assignment(ident):
    grant_id=ident.split(':',1)[0]
    async with CommonSession() as s:
        record=await s.get(SysUserRole,grant_id)
        if not record:raise HTTPException(404,'Role assignment not found')
        await s.delete(record);await s.commit()
    from app.adapters.compliance_runtime import initialize_runtime
    await initialize_runtime()
    return {'assignmentId':ident,'deleted':True}
