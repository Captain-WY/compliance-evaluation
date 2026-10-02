from pathlib import Path
import pytest
from fastapi.routing import APIRoute
from sqlalchemy import select, inspect
from app.core.database import CommonBase,CaseBase,ComplianceBase,RoutedSession,common_engine
from app.core.models import register_models
register_models()

def test_unique_routes_and_common_auth():
    from app.main import create_app
    routes=create_app().routes
    keys=[(method,r.path) for r in routes if isinstance(r,APIRoute) for method in r.methods]
    assert len(keys)==len(set(keys))
    assert ('GET','/api/platform/auth/me') in keys
    assert ('POST','/api/bff/v1/cases/drafts/save') in keys
    assert ('POST','/api/inspection/plans') in keys
    assert len(keys)>300

def test_database_boundaries():
    bases=(CommonBase,CaseBase,ComplianceBase)
    for base in bases:
        assert base.metadata.tables
        for table in base.metadata.tables.values():
            for fk in table.foreign_keys:assert fk.column.table.metadata is base.metadata
    assert 'sys_users' in CommonBase.metadata.tables
    assert 'sys_users' not in CaseBase.metadata.tables
    assert 'unified_tasks' in ComplianceBase.metadata.tables
    assert 'cases' in CaseBase.metadata.tables
    assert 'sys_dicts' in CommonBase.metadata.tables
    assert 'sys_dicts' not in ComplianceBase.metadata.tables

def test_mixed_sql_fails_closed_even_with_common_mapper():
    from app.modules.cases.models.sys_users import SysUser
    from app.modules.cases.models.cases import Case
    session=RoutedSession()
    statement=select(SysUser,Case).join(Case,Case.created_by==SysUser.id)
    with pytest.raises(RuntimeError,match='Cross-database'):
        session.get_bind(mapper=inspect(SysUser),clause=statement)
    assert session.get_bind(mapper=inspect(SysUser),clause=select(SysUser)) is common_engine.sync_engine

def test_casbin_unknown_permission_denied():
    from app.platform.authorization import make_enforcer
    e=make_enforcer([('platform_admin','/api/system/dictionary-admin/items','POST')])
    assert e.enforce('platform_admin','/api/system/dictionary-admin/items','POST')
    assert not e.enforce('external_lawyer','/api/system/dictionary-admin/items','POST')
    assert not e.enforce('platform_admin','/unknown','POST')

def test_seed_route_policy_minimum_denials():
    from app.seed import roles_for_route
    assert roles_for_route('/api/bff/v1/admin/dicts/items/list','POST')==['platform_admin']
    assert 'external_lawyer' not in roles_for_route('/api/inspection/plans','POST')

def test_runtime_resources_packaged():
    from app.modules.compliance.contracts.loader import load_p0_contracts,load_p1_contracts,WORKSPACE_ROOT
    assert load_p0_contracts()['api']
    assert load_p1_contracts()['api']
    assert 'resources' in WORKSPACE_ROOT.parts
