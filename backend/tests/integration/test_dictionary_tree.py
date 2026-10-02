from fastapi import FastAPI
from fastapi.testclient import TestClient
from types import SimpleNamespace
from app.modules.cases.api.bff.v1.admin import dicts_admin_bff
from app.modules.cases.core.database import get_db
from app.modules.cases.core.deps import get_current_user
from app.modules.cases.models.sys_dicts import SysDict

def test_dictionary_tree_endpoint_retains_protection_and_version_fields():
    rows=[SysDict(dict_id='parent',namespace='compliance',dict_type='TEST_TREE',dict_code='ROOT',dict_label='Root',parent_id=None,sort_order=10,is_active=True,description='Root description',version=4,is_system=True,edit_policy='SYSTEM_LOCKED'),
          SysDict(dict_id='child',namespace='compliance',dict_type='TEST_TREE',dict_code='CHILD',dict_label='Child',parent_id='parent',sort_order=20,is_active=True,description='Child description',version=2,is_system=False,edit_policy='ADMIN_EDITABLE')]
    class Session:
        async def execute(self,statement):
            return SimpleNamespace(scalars=lambda:SimpleNamespace(all=lambda:rows))
    application=FastAPI()
    application.include_router(dicts_admin_bff.router,prefix='/api/bff/v1/admin/dicts')
    application.dependency_overrides[get_db]=lambda:Session()
    application.dependency_overrides[get_current_user]=lambda:SimpleNamespace(id='admin')
    with TestClient(application) as client:
        response=client.post('/api/bff/v1/admin/dicts/items/tree',json={'dictType':'TEST_TREE'})
    assert response.status_code==200
    root=response.json()['data']['items'][0]
    assert root['namespace']=='compliance'
    assert root['version']==4 and root['isSystem'] is True and root['editPolicy']=='SYSTEM_LOCKED'
    assert root['description']=='Root description'
    child=root['children'][0]
    assert child['version']==2 and child['isSystem'] is False
    assert child['editPolicy']=='ADMIN_EDITABLE' and child['children']==[]
