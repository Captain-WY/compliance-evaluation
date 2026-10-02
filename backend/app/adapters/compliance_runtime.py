"""Persistence adapter for the legacy inspection domain's in-memory working set.

The merged development deployment runs one API worker. The complete plan state is
stored alongside its searchable business columns; restart never replays seed plans.
"""
from dataclasses import asdict, fields
from datetime import date,datetime,timezone
from sqlalchemy import select
from app.core.database import ComplianceSession,CommonSession
from app.modules.compliance.models.inspection import InspectionPlanModel
from app.modules.compliance.domain.inspection_plan_store import inspection_plan_store,InspectionPlanRecord,InspectionPlanAcknowledgementRecord
async def persist_plans():
    async with ComplianceSession() as s:
        for plan in inspection_plan_store.plans.values():
            values=asdict(plan)
            row=await s.get(InspectionPlanModel,plan.inspection_plan_id)
            if row is None:row=InspectionPlanModel(inspection_plan_id=plan.inspection_plan_id);s.add(row)
            for column in InspectionPlanModel.__table__.columns:
                k=column.name
                if k not in values:continue
                v=values[k]
                if k in ['planned_start_date','planned_end_date']:v=date.fromisoformat(v)
                if k in ['created_at','updated_at']:v=datetime.fromisoformat(v.replace('Z','+00:00'))
                setattr(row,k,v)
            row.runtime_state=values;row.is_deleted=False
        await s.commit()
async def initialize_runtime():
    async with ComplianceSession() as s:
        rows=(await s.scalars(select(InspectionPlanModel).where(InspectionPlanModel.is_deleted.is_(False)))).all()
    plans={}
    names={f.name for f in fields(InspectionPlanRecord)}
    for row in rows:
        values=dict(row.runtime_state or {})
        if not values:
            values={k:getattr(row,k) for k in names if hasattr(row,k)}
            for k,v in list(values.items()):
                if isinstance(v,(date,datetime)):values[k]=v.isoformat()
        values['acknowledgements']=[InspectionPlanAcknowledgementRecord(**x) for x in values.get('acknowledgements',[])]
        plans[row.inspection_plan_id]=InspectionPlanRecord(**values)
    inspection_plan_store.plans=plans
    from app.modules.compliance.models.auth import OrgNodeModel
    from app.modules.compliance.domain.auth_store import auth_store,OrgRecord
    async with CommonSession() as s:
        rows=(await s.scalars(select(OrgNodeModel))).all()
    auth_store.orgs={r.org_id:OrgRecord(r.org_id,r.org_name,r.org_level,r.parent_org_id,region=r.region,city=r.city,business_line_ids=r.business_line_ids or [],active=r.active) for r in rows}

    from app.modules.cases.models.sys_users import SysUser
    from app.modules.cases.models.sys_roles import SysRole
    from app.modules.cases.models.sys_user_roles import SysUserRole
    from app.modules.compliance.domain.auth_store import AuthUserRecord,PersonnelRecord,RoleAssignmentRecord
    from app.platform.auth import ROLE_IDS
    async with CommonSession() as s:
        users=(await s.scalars(select(SysUser).where(SysUser.active.is_(True),SysUser.is_deleted.is_(False)))).all()
        grants=(await s.execute(select(SysUserRole.user_id,SysRole.role_code,SysUserRole.id).join(SysRole,SysRole.id==SysUserRole.role_id))).all()
    auth_store.users={};auth_store.personnel={};auth_store.role_assignments={}
    for user in users:
        roles=list(dict.fromkeys(rid for uid,code,_ in grants if uid==user.id for rid in ROLE_IDS.get(code,[])))
        auth_store.users[user.id]=AuthUserRecord(user.id,user.username,user.real_name,user.department_id,roles,external_subject_id=user.external_subject_id,title=user.title or '')
        pid='PERS-'+user.id
        auth_store.personnel[pid]=PersonnelRecord(pid,user.id,user.real_name,user.department_id,user.title or '')
        for uid,code,gid in grants:
            if uid!=user.id:continue
            for rid in ROLE_IDS.get(code,[]):
                ident=gid+':'+rid
                auth_store.role_assignments[ident]=RoleAssignmentRecord(ident,rid,pid,user.department_id,'SYSTEM',datetime.now(timezone.utc).isoformat())
    from app.modules.compliance.models.evidence import FileAssetModel
    from app.modules.compliance.domain.evidence_store import evidence_store,FileAssetRecord
    async with CommonSession() as s:
        files=(await s.scalars(select(FileAssetModel).where(FileAssetModel.is_deleted.is_(False)))).all()
    evidence_store.file_assets={r.file_id:FileAssetRecord(r.file_id,r.file_name,r.content_type,r.file_size,r.storage_key,r.checksum,r.uploaded_by_ref,r.uploaded_at_ref.isoformat(),r.scan_status,r.uploaded_by_snapshot or {}) for r in files}
