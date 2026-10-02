"""Idempotent fresh-development foundation seed. No source database is read."""
import asyncio,json,uuid
from pathlib import Path
from datetime import datetime,timezone
from sqlalchemy import select
from app.core.models import register_models
from app.core.database import CommonSession,ComplianceSession,CaseSession,CommonBase,ComplianceBase
from app.core.config import get_settings
register_models()
from app.modules.cases.models.sys_users import SysUser
from app.modules.cases.models.sys_roles import SysRole
from app.modules.cases.models.sys_user_roles import SysUserRole
from app.modules.cases.models.casbin_rule import CasbinRule
from app.modules.compliance.models.auth import OrgNodeModel,PersonnelModel,SystemRoleModel
from app.modules.compliance.models.system_dictionary import SysDictModel
from app.modules.compliance.domain.auth_store import auth_store
from app.modules.compliance.seed.runtime_seed import build_s0_config_dictionary_rows
from app.platform.models import ExternalIdentity,LegacyIdentity
from app.platform.auth import ROLE_IDS
ACCOUNTS=[
 ('11111111-1111-4111-8111-111111111111','admin','系统管理员','platform_admin','WLZQ-HQ'),
 ('22222222-2222-4222-8222-222222222222','hq_user','总部业务','hq_business','WLZQ-HQ'),
 ('33333333-3333-4333-8333-333333333333','branch_user','分支业务','branch_business','WLZQ-RBC-GZ-NANSHA'),
 ('44444444-4444-4444-8444-444444444444','department_user','业务部门','department_business','WLZQ-HQ'),
 ('55555555-5555-4555-8555-555555555555','lawyer','外聘律师','external_lawyer','WLZQ-EXTERNAL'),
]
def stable(value):return str(uuid.uuid5(uuid.NAMESPACE_URL,'compliance-evaluation/'+value))
async def add_missing(s,row):
    pk=list(row.__table__.primary_key.columns)[0].name
    if await s.get(type(row),getattr(row,pk)) is None:s.add(row);await s.flush()
def roles_for_route(path,method):
    roles=['platform_admin']
    system=path.startswith('/api/bff/v1/admin/') or path.startswith('/api/system/dictionary-admin') or path.startswith('/api/system/roles') or path.startswith('/api/system/role-assignments')
    if system:return roles
    if path.startswith('/api/bff/v1/') or path.startswith('/api/v1/'):
        roles+=['hq_business','branch_business','department_business']
        if any(x in path for x in ['/vendor-portal/','/cases/views/','/cases/drawer/','/cases/permissions','/cases/sidebar','/cases/overview','/cases/dossier/','/cases/memos/','/notifications/','/attachments/']):roles+=['external_lawyer']
    else:roles+=['hq_business','branch_business','department_business']
    return roles
async def main():
    now=datetime.now(timezone.utc)
    audit=dict(created_at=now,updated_at=now,is_deleted=False,created_by='SYSTEM',updated_by='SYSTEM')
    foundation=json.loads((Path(__file__).parent/'resources/cases-foundation.json').read_text(encoding='utf-8'))
    async with CommonSession() as s:
        for org in auth_store.orgs.values():
            await add_missing(s,OrgNodeModel(org_id=org.org_id,org_name=org.org_name,org_level=org.org_level,parent_org_id=None,business_line_ids=org.business_line_ids,**audit))
        for oid,label in [('WLZQ-HQ','总部'),('WLZQ-EXTERNAL','外部律师')]:
            await add_missing(s,OrgNodeModel(org_id=oid,org_name=label,org_level='HEADQUARTERS' if oid=='WLZQ-HQ' else 'EXTERNAL',business_line_ids=[],**audit))
        for org in auth_store.orgs.values():
            row=await s.get(OrgNodeModel,org.org_id)
            if not row.parent_org_id and org.parent_org_id in auth_store.orgs:row.parent_org_id=org.parent_org_id
        for uid,username,label,role,org in ACCOUNTS:
            rid=stable('role/'+role)
            await add_missing(s,SysRole(id=rid,tenant_id='built-in',role_code=role,role_name=label,status='ACTIVE'))
            await add_missing(s,SysUser(id=uid,username=username,real_name=label,department_id=org,tenant_id='built-in',status='active',active=True,external_subject_id=uid,extra={'roleIds':ROLE_IDS[role]}))
            await add_missing(s,SysUserRole(id=stable('user-role/'+uid),user_id=uid,role_id=rid,tenant_id='built-in'))
            await add_missing(s,ExternalIdentity(id=stable('casdoor/'+uid),issuer=get_settings().casdoor_public_endpoint.rstrip('/'),subject=uid,user_id=uid))
            await add_missing(s,LegacyIdentity(id=stable('identity/'+uid),source_system='casdoor',entity='user',legacy_id=uid,common_id=uid))
            await add_missing(s,PersonnelModel(personnel_id='PERS-'+uid,user_id=uid,display_name=label,org_id=org,title=label,**audit))
        from app.modules.cases.models.sys_menus import SysMenu
        from app.modules.cases.models.sys_role_menus import SysRoleMenu
        for mid,name,kind,parent,sort,route,component,icon,permission in foundation['MENUS']:
            await add_missing(s,SysMenu(id=mid,menu_name=name,menu_type=kind,parent_id=parent,sort_order=sort,route_path=route,component=component,icon=icon,permission_key=permission,tenant_id='built-in',status='ACTIVE'))
        menu_roles={'platform_admin':'role_admin','hq_business':'role_legal_dir','branch_business':'role_legal_lawyer','department_business':'role_business'}
        for role,source in menu_roles.items():
            for mid in foundation['ROLE_MENU_BINDINGS'].get(source,[]):
                await add_missing(s,SysRoleMenu(id=stable('role-menu/'+role+'/'+mid),tenant_id='built-in',role_id=stable('role/'+role),menu_id=mid,created_by='SYSTEM'))
        for row in build_s0_config_dictionary_rows():await add_missing(s,row)
        for dt,code,label,parent,sort,description in foundation['DICTS']:
            await add_missing(s,SysDictModel(dict_id=stable('cases/dict/'+dt+'/'+code),namespace='cases',dict_type=dt,dict_code=code,dict_label=label,parent_id=stable('cases/dict/'+dt+'/'+parent) if parent else None,sort_order=sort,description=description,**audit))
        existing={(r.v0,r.v1,r.v2) for r in (await s.scalars(select(CasbinRule).where(CasbinRule.ptype=='p'))).all()}
        policies=json.loads((Path(__file__).parent/'resources/route-policies.json').read_text(encoding='utf-8'))
        for role,path,method in policies:
            if (role,path,method) not in existing:
                s.add(CasbinRule(ptype='p',v0=role,v1=path,v2=method))
        await s.commit()
    from app.modules.compliance.models.assessment import AssessmentIndicatorCategoryModel
    from app.modules.compliance.domain.indicator_store import INDICATOR_CATEGORY_META
    async with ComplianceSession() as s:
        for cid,data in INDICATOR_CATEGORY_META.items():
            row=AssessmentIndicatorCategoryModel(category_id=cid,category_code=data['categoryCode'],category_name=data['categoryName'],description='',sort_order=0,active=True,**audit)
            await add_missing(s,row)
        await s.commit()
    from app.modules.cases.models.process_templates import ProcessTemplate
    from app.modules.cases.models.task_templates import TaskTemplate
    async with CaseSession() as s:
        for ident,ct,stage,name,sort,required,description in foundation['PROCESS_TEMPLATES']:
            await add_missing(s,ProcessTemplate(id=ident,case_type_code=ct,stage_code=stage,stage_name=name,sort_order=sort,is_required=required,description=description))
        for item in foundation['TASK_TEMPLATES']:
            ident,process,code,name,sort,required,days,milestone,description=item
            await add_missing(s,TaskTemplate(id=ident,process_template_id=process,task_code=code,task_name=name,sort_order=sort,is_required=required,default_days_due=days,is_milestone=milestone,description=description))
        await s.commit()
    from app.modules.cases.models.external_lawyers import ExternalLawyer
    from app.modules.cases.models.law_firms import LawFirm
    async with CaseSession() as s:
        firm_id=stable('development-law-firm')
        await add_missing(s,LawFirm(id=firm_id,firm_name='本地开发律师事务所',tenant_id='built-in',cooperation_status='BACKUP'))
        await add_missing(s,ExternalLawyer(id=stable('development-lawyer'),user_id=ACCOUNTS[4][0],firm_id=firm_id,lawyer_name='外聘律师',tenant_id='built-in',status='ACTIVE'))
        await s.commit()
    print('Foundation seed complete; existing rows and credentials preserved.')
if __name__=='__main__':asyncio.run(main())
