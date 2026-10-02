from datetime import date
import pytest
from sqlalchemy import JSON, MetaData
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.modules.cases.models.cases import Case
from app.modules.cases.models.external_lawyers import ExternalLawyer
from app.modules.cases.models.case_counsels import CaseCounsel
from app.modules.cases.models.case_members import CaseMember
from app.modules.cases.services.vendor_portal_service import list_my_cases

@pytest.mark.asyncio
async def test_vendor_my_cases_reads_only_active_delegation_or_membership():
    engine=create_async_engine('sqlite+aiosqlite:///:memory:')
    metadata=MetaData()
    for model in (Case,ExternalLawyer,CaseCounsel,CaseMember):
        table=model.__table__.to_metadata(metadata)
        for column in table.columns:
            if isinstance(column.type,JSONB):column.type=JSON()
    async with engine.begin() as conn:await conn.run_sync(metadata.create_all)
    sessions=async_sessionmaker(engine,expire_on_commit=False)
    async with sessions() as s:
        s.add_all([ExternalLawyer(id='lawyer',user_id='user',firm_id='firm',lawyer_name='Lawyer',tenant_id='built-in',status='ACTIVE'),ExternalLawyer(id='empty-lawyer',user_id='empty-user',firm_id='firm',lawyer_name='Empty',tenant_id='built-in',status='ACTIVE')])
        for ident in ['delegated','member','unrelated','deleted-delegation','other-tenant']:
            s.add(Case(id=ident,internal_case_no=ident,case_name=ident,case_type_code='CIVIL_LITIGATION',dispute_id=ident,tenant_id='other' if ident=='other-tenant' else 'built-in'))
        s.add_all([CaseCounsel(id='c1',case_id='delegated',lawyer_id='lawyer',lawyer_name='Lawyer',counsel_type='EXTERNAL',status='ACTIVE',tenant_id='built-in'),CaseCounsel(id='c2',case_id='deleted-delegation',lawyer_id='lawyer',lawyer_name='Lawyer',counsel_type='EXTERNAL',status='ACTIVE',tenant_id='built-in',is_deleted=True),CaseCounsel(id='c3',case_id='other-tenant',lawyer_id='lawyer',lawyer_name='Lawyer',counsel_type='EXTERNAL',status='ACTIVE',tenant_id='other'),CaseMember(id='m1',case_id='member',user_id='user',role_code='EXTERNAL_COUNSEL',join_date=date(2026,10,3),tenant_id='built-in',status='ACTIVE')])
        await s.commit()
        result=await list_my_cases(tenant_id='built-in',user_id='user',page=1,page_size=20,db=s)
        assert result['total']==2
        assert {row['caseId'] for row in result['items']}=={'delegated','member'}
        assert all(set(row)=={'caseId','caseCode','caseTitle','stage','lastUpdateDate'} for row in result['items'])
        paged=await list_my_cases(tenant_id='built-in',user_id='user',page=2,page_size=1,db=s)
        assert paged['total']==2 and len(paged['items'])==1
        empty=await list_my_cases(tenant_id='built-in',user_id='empty-user',page=1,page_size=20,db=s)
        assert empty['total']==0 and empty['items']==[]
    await engine.dispose()
