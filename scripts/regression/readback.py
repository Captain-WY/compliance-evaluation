"""Read-only verification of the 2026-10-03 regression records, before/after restart.

Usage: python scripts/regression/readback.py before|after
Requires the local records created by this regression. Does not create business data.
"""
from pathlib import Path
import sys, json
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from datetime import datetime, timezone

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'.local/regression'
PHASE=sys.argv[1] if len(sys.argv)>1 else 'before'
TOKENS={}; RESULTS=[]; AUDIT=[]

def req(method,path,body=None,role='hq_business',expected=(200,),private=False):
    headers={'Content-Type':'application/json'}
    if role in TOKENS:headers['Authorization']='Bearer '+TOKENS[role]
    request=Request('http://127.0.0.1:8010'+path,data=json.dumps(body).encode() if body is not None else None,headers=headers,method=method)
    try:
        with urlopen(request,timeout=30) as r:status,raw=r.status,r.read()
    except HTTPError as e:status,raw=e.code,e.read()
    try:value=json.loads(raw)
    except ValueError:value=raw.decode(errors='replace')[:200]
    if not private:AUDIT.append({'method':method,'path':path,'body':body,'role':role,'http':status,'response':value})
    assert status in expected,f'HTTP {status}'
    if isinstance(value,dict) and status<400:
        assert value.get('code',0) in [0,200,None,'0','200'],str(value)[:250]
    return value.get('data',value) if isinstance(value,dict) else value

def check(cid,label,fn):
    try:detail=fn();r={'id':cid,'label':label,'status':'PASS','detail':detail}
    except Exception as e:r={'id':cid,'label':label,'status':'FAIL','detail':str(e)}
    RESULTS.append(r); print(cid,r['status'],label)

def expect(value,msg):assert value,msg
def items(value):return value if isinstance(value,list) else value.get('items',[])

for account in json.loads((ROOT/'.local/dev-accounts.json').read_text(encoding='utf-8-sig')):
    TOKENS[account['role']]=req('POST','/api/platform/auth/login',{'username':account['username'],'password':account['password']},role=None,private=True)['access_token']

def ui_case():
    value=req('POST','/api/bff/v1/cases/views/list',{'keyword':'REG-20261003-UI-CASE','pagination':{'page':1,'size':100}})
    row=next(x for x in value['cases'] if x['id']=='case_a8817c7dd2d3')
    expect(row['extended_data']['regulatory']['estimated_risk_capital_deduction']==10000,'saved finance estimate absent')
    return {'case_id':row['id'],'deduction':10000}
check('READ-01','总部页面立案及财务10000元读回',ui_case)
def clue():
    value=req('POST','/api/bff/v1/business-portal/clues/list',{'keyword':'REG-20261003-UI-CLUE'},role='department_business')
    expect('REG-20261003-UI-CLUE' in json.dumps(value),'UI clue missing')
    return '部门上报线索仍可读取'
check('READ-02','业务部门页面上报线索读回',clue)
def ledger():
    value=req('GET','/api/assessment/daily-ledger?pageSize=100',role='branch_business')
    row=next((x for x in items(value) if x.get('title')=='REG-20261003-UI-LEDGER'),None)
    expect(row is not None,'已提示保存成功的页面台账不存在')
    return {k:row.get(k) for k in ['ledgerEntryId','title','occurredDate','status']}
check('READ-03','页面保存履职台账读回',ledger)
def inspection():
    value=req('GET','/api/inspection/plans/REG-20261003-INSP-5201e7-MAIN')
    expect('REG-20261003-INSP-5201e7-updated' in json.dumps(value),'plan title absent')
    return '检查计划可读取'
check('READ-04','检查计划读回',inspection)
def dictionaries():
    value=req('GET','/api/platform/dictionaries?dict_type=REGRESSION',role='platform_admin')
    expect(any(x['dictLabel']=='REG-20261003-SYS-d33698-edited' for x in value),'dictionary missing')
    return '字典修改值保留'
check('READ-05','公共字典读回',dictionaries)
if PHASE=='before':
    check('UI-API-01','业务部门前端调用的my-tasks接口应存在',lambda:req('POST','/api/bff/v1/business-portal/my-tasks',{'status':None,'page':1,'pageSize':50},role='department_business'))
    check('UI-API-02','对应后端evidence-tasks/list可读取',lambda:req('POST','/api/bff/v1/business-portal/evidence-tasks/list',{},role='department_business'))
else:
    check('READ-06','结案记录重启后仍关闭',lambda:expect('CLOSED' in json.dumps(req('POST','/api/bff/v1/cases/detail/sidebar',{'case_id':'case_b1eec6d5e531'})),'closed case state absent'))

path=OUT/f'readback-{PHASE}.json'
path.write_text(json.dumps({'phase':PHASE,'at':datetime.now(timezone.utc).isoformat(),'results':RESULTS,'requests':AUDIT},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({status:sum(x['status']==status for x in RESULTS) for status in ['PASS','FAIL']}))
