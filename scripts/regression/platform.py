"""Real HTTP platform regression. Local credentials only; never writes tokens to evidence.

Run from the repository root: python scripts/regression/platform.py
Creates uniquely prefixed disposable development records, never changes seeded roles.
"""
from pathlib import Path
import json
import sys
import uuid
from datetime import datetime, timezone
from urllib.request import Request, urlopen
from urllib.error import HTTPError

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '.local/regression'
OUT.mkdir(parents=True, exist_ok=True)
PREFIX = 'REG-20261003-SYS-' + uuid.uuid4().hex[:6]
TOKENS, RESULTS, AUDIT, STATE = {}, [], [], {'prefix': PREFIX}
ROLES = ['platform_admin', 'hq_business', 'branch_business', 'department_business', 'external_lawyer']

def save():
    (OUT / 'platform-results.json').write_text(json.dumps({'timestamp':datetime.now(timezone.utc).isoformat(), 'state':STATE, 'results':RESULTS, 'requests':AUDIT},ensure_ascii=False,indent=2),encoding='utf-8')

def req(method, path, body=None, role='platform_admin', expected=(200,201), private=False):
    headers = {'Content-Type':'application/json'}
    if role in TOKENS: headers['Authorization']='Bearer '+TOKENS[role]
    request=Request('http://127.0.0.1:8010'+path, data=json.dumps(body).encode() if body is not None else None, headers=headers, method=method)
    try:
        with urlopen(request,timeout=40) as r: status, raw=r.status,r.read()
    except HTTPError as e: status,raw=e.code,e.read()
    try: value=json.loads(raw)
    except ValueError: value=raw.decode(errors='replace')[:1000]
    if not private:
        AUDIT.append({'method':method,'path':path,'role':role,'body':body,'http':status,'response':value})
        save()
    assert status in expected, f'HTTP {status}: {str(value)[:350]}'
    if status < 400 and isinstance(value,dict):
        assert value.get('code',0) in [0,200,'0','200',None], f'business error: {str(value)[:350]}'
    return value.get('data',value) if isinstance(value,dict) else value

def check(cid,label,role,callback):
    start=len(AUDIT)
    try: callback(); result={'id':cid,'label':label,'role':role,'status':'PASS'}
    except Exception as e: result={'id':cid,'label':label,'role':role,'status':'FAIL','actual':str(e)}
    result['request_indexes']=list(range(start,len(AUDIT))); RESULTS.append(result); save(); print(cid,result['status'],label)

def blocked(cid,label,why):
    RESULTS.append({'id':cid,'label':label,'role':'platform_admin','status':'BLOCKED','actual':why}); save()

def post(path,body,role='platform_admin',**kw): return req('POST','/api/bff/v1/'+path,body,role,**kw)
def expect(value,message): assert value,message

def main():
    for a in json.loads((ROOT/'.local/dev-accounts.json').read_text(encoding='utf-8-sig')):
        value=req('POST','/api/platform/auth/login',{'username':a['username'],'password':a['password']},role=None,private=True)
        TOKENS[a['role']]=value['access_token']
    for i,role in enumerate(ROLES):
        check(f'SYS-A{i+1}', '登录身份及角色映射',role,lambda r=role: expect(r in req('GET','/api/platform/auth/me',role=r)['role_codes'],'role mismatch'))
    check('SYS-A6','匿名请求拒绝','anonymous',lambda:req('GET','/api/platform/auth/me',role=None,expected=(401,)))
    check('SYS-A7','错误密码拒绝','anonymous',lambda:req('POST','/api/platform/auth/login',{'username':'admin','password':'regression-invalid-password'},role=None,expected=(401,),private=True))
    for i,role in enumerate(ROLES[1:]):
        def denied(r=role):
            post('admin/roles/create',{'roleCode':PREFIX+'-deny','roleName':PREFIX},r,expected=(403,))
            post('admin/menus/tree',{},r,expected=(403,))
            req('POST','/api/platform/dictionaries',{'dict_type':'REGRESSION','dict_code':PREFIX,'dict_label':PREFIX},r,expected=(403,))
        check(f'SYS-A{8+i}','拒绝系统角色/菜单/字典管理',role,denied)
    check('SYS-01','角色列表包含五类业务角色','platform_admin',lambda:expect(set(ROLES).issubset({r['roleCode'] for r in post('admin/roles/list',{'pageSize':200})['items']}),'missing roles'))
    def create_role(): STATE['role']=post('admin/roles/create',{'roleCode':PREFIX,'roleName':PREFIX})['roleId']
    check('SYS-02','创建独立测试角色','platform_admin',create_role)
    if 'role' in STATE:
        def update_role():
            post('admin/roles/update',{'roleId':STATE['role'],'roleName':PREFIX+'-edited'})
            expect(post('admin/roles/detail',{'roleId':STATE['role']})['roleName']==PREFIX+'-edited','role name not persisted')
        check('SYS-03','角色修改并读回','platform_admin',update_role)
        def toggle_role():
            post('admin/roles/toggle',{'roleId':STATE['role'],'targetStatus':'INACTIVE'})
            expect(post('admin/roles/detail',{'roleId':STATE['role']})['status']=='INACTIVE','status not persisted')
        check('SYS-04','测试角色停用并读回','platform_admin',toggle_role)
    else:
        blocked('SYS-03','角色修改并读回','SYS-02 创建失败');blocked('SYS-04','测试角色停用并读回','SYS-02 创建失败')
    check('SYS-05','菜单树读取','platform_admin',lambda:expect(len(post('admin/menus/tree',{})['items'])>0,'empty menu tree'))
    def create_menu(): STATE['menu']=post('admin/menus/create',{'menuName':PREFIX,'menuType':'DIR','routePath':'/regression/'+PREFIX,'isHidden':True})['menuId']
    check('SYS-06','创建独立隐藏测试菜单','platform_admin',create_menu)
    if 'menu' in STATE:
        def menu_toggle():
            post('admin/menus/update',{'menuId':STATE['menu'],'menuName':PREFIX})
            value=post('admin/menus/detail',{'menuId':STATE['menu']})
            expect(value['status']=='INACTIVE',f"status={value['status']}; routePath={value['routePath']}; isHidden={value['isHidden']}")
        check('SYS-07','按页面停用动作请求并核对状态/原字段','platform_admin',menu_toggle)
        if 'role' in STATE:
            def assign_menu():
                post('admin/role-menus/save',{'roleId':STATE['role'],'menuIds':[STATE['menu']]})
                expect(STATE['menu'] in post('admin/role-menus/list',{'roleId':STATE['role']})['menuIds'],'binding missing')
            check('SYS-08','独立测试角色菜单绑定读回','platform_admin',assign_menu)
        else: blocked('SYS-08','独立测试角色菜单绑定读回','SYS-02 失败')
    else:
        blocked('SYS-07','菜单停用读回','SYS-06 失败'); blocked('SYS-08','独立测试角色菜单绑定读回','角色/菜单创建失败')
    check('SYS-09','组织树读取','platform_admin',lambda:expect(bool(req('GET','/api/system/org-tree')),'empty org tree'))
    check('SYS-10','人员及权限范围读取','platform_admin',lambda:(req('GET','/api/system/personnel?pageSize=100'),req('GET','/api/system/role-assignments')))
    check('SYS-11','流程模板列表','platform_admin',lambda:post('process-templates/list',{}))
    def template(): STATE['process']=post('process-templates/create',{'case_type_code':PREFIX,'stage_code':'REG_STAGE','stage_name':PREFIX,'sort_order':1})['processTemplateId']
    check('SYS-12','创建独立流程模板','platform_admin',template)
    if 'process' in STATE:
        def task():
            STATE['task']=post('task-templates/create',{'process_template_id':STATE['process'],'task_name':PREFIX,'task_code':'REG_TASK'})['taskTemplateId']
            expect(any(x['taskTemplateId']==STATE['task'] for x in post('task-templates/list',{'process_template_id':STATE['process']})['items']),'task missing')
        check('SYS-13','任务模板创建与读取','platform_admin',task)
        def toggle():
            post('process-templates/toggle',{'process_template_id':STATE['process'],'is_active':False})
            expect(post('process-templates/detail',{'process_template_id':STATE['process']})['isActive'] is False,'template still active')
        check('SYS-14','流程模板停用读回','platform_admin',toggle)
    else:
        blocked('SYS-13','任务模板创建与读取','SYS-12失败');blocked('SYS-14','流程模板停用读回','SYS-12失败')
    def dictionary():
        body={'namespace':'shared','dict_type':'REGRESSION','dict_code':PREFIX,'dict_label':PREFIX}
        STATE['dict']=req('POST','/api/platform/dictionaries',body)['id']
        body['dict_label']=PREFIX+'-edited';req('PATCH','/api/platform/dictionaries/'+STATE['dict'],body)
        expect(any(x['dictLabel']==body['dict_label'] for x in req('GET','/api/platform/dictionaries?dict_type=REGRESSION')),'label missing')
        expect(any(x['dictCode']==PREFIX for x in post('admin/dicts/items/tree',{'dictType':'REGRESSION'})['items']),'BFF missing')
        value=req('GET','/api/system/dictionary-admin/items?dictType=REGRESSION&pageSize=100')
        expect(PREFIX in json.dumps(value),'CE dictionary missing')
    check('SYS-15','统一字典新增修改并跨两个适配器读回','platform_admin',dictionary)
    if 'dict' in STATE:
        def duplicate():
            req('POST','/api/platform/dictionaries',{'namespace':'shared','dict_type':'REGRESSION','dict_code':PREFIX,'dict_label':'duplicate'},expected=(400,409,422))
        check('SYS-16','重复字典编码友好拒绝','platform_admin',duplicate)
    # Template writes must be confined to administrators/HQ maintenance, never an external lawyer.
    def lawyer_template():
        post('process-templates/create',{'case_type_code':PREFIX+'-LAWYER','stage_code':'REG_STAGE','stage_name':PREFIX+'-LAWYER'},'external_lawyer',expected=(403,))
    check('SYS-17','律师禁止创建系统流程模板','external_lawyer',lawyer_template)
    # Avoid revoking shared sessions while other parallel scenarios are running.
    save()
    print(json.dumps({'prefix':PREFIX,'counts':{s:sum(x['status']==s for x in RESULTS) for s in ['PASS','FAIL','BLOCKED']}},ensure_ascii=False))
if __name__=='__main__': main()
