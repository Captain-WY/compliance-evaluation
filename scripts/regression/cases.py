"""Live case regression. Credentials stay in memory; evidence excludes tokens/passwords."""
from __future__ import annotations
import argparse, json, uuid
import hashlib
import requests
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'.local/regression'
BASE='http://127.0.0.1:8010'
B='/api/bff/v1/'
ROLE='department_business'

def unwrap(x): return x.get('data',x) if isinstance(x,dict) else x
def items(x):
    x=unwrap(x)
    return x if isinstance(x,list) else x.get('items',x.get('records',[]))

class Run:
    def __init__(self):
        self.prefix='REG-20261003-CASE-'+uuid.uuid4().hex[:6]
        self.tokens={}; self.users={}; self.results=[]; self.evidence=[]; self.state={'prefix':self.prefix}
        OUT.mkdir(parents=True,exist_ok=True)
    def save(self):
        def clean(x):
            if isinstance(x,dict): return {k:clean(v) for k,v in x.items()}
            if isinstance(x,list): return [clean(v) for v in x]
            if isinstance(x,str) and ('X-Amz-' in x or 'Signature=' in x): return x.split('?')[0]+'?[signed-query-redacted]'
            return x
        (OUT/('cases-'+self.prefix[-6:]+'.json')).write_text(json.dumps(clean({'state':self.state,'results':self.results,'evidence':self.evidence}),ensure_ascii=False,indent=2),encoding='utf-8')
    def req(self,path,body=None,role=ROLE,expected=(200,201),method='POST',private=False):
        headers={'Content-Type':'application/json'}
        if role in self.tokens: headers['Authorization']='Bearer '+self.tokens[role]
        req=Request(BASE+path,data=json.dumps(body or {}).encode() if method!='GET' else None,headers=headers,method=method)
        try:
            with urlopen(req,timeout=30) as r: status=r.status; raw=r.read()
        except HTTPError as e: status=e.code; raw=e.read()
        try: data=json.loads(raw)
        except ValueError: data=raw.decode(errors='replace')
        if not private:
            self.evidence.append({'seq':len(self.evidence)+1,'role':role,'method':method,'path':path,'request':body,'http':status,'response':data}); self.save()
        assert status in expected,f'HTTP {status}; expected {expected}; '+str(data)[:500]
        if status==400 and 400 in expected:
            assert isinstance(data,dict) and (data.get('code') in (4011,4013,4014,4004,4040,4300) or '无权' in data.get('message','')), 'Not a permission/closed-state rejection: '+str(data)
        if status<400 and isinstance(data,dict): assert data.get('code',0) in (0,200,None,'0','200'),str(data)[:500]
        return unwrap(data)
    def api(self,path,body=None,**kwargs): return self.req(B+path,body,**kwargs)
    def check(self,name,fn):
        start=len(self.evidence)+1
        try: fn(); result={'name':name,'status':'PASS'}
        except Exception as e: result={'name':name,'status':'FAIL','error':str(e)}
        result['evidence']=list(range(start,len(self.evidence)+1)); self.results.append(result); self.save()
        print(result['status'],name,result.get('error',''),flush=True)
    def ok(self,test,msg): assert test,msg
    def login(self):
        for a in json.loads((ROOT/'.local/dev-accounts.json').read_text(encoding='utf-8-sig')):
            r=self.req('/api/platform/auth/login',{'username':a['username'],'password':a['password']},role=None,private=True)
            self.tokens[a['role']]=r['access_token']
            self.users[a['role']]=self.req('/api/platform/auth/me',role=a['role'],method='GET')
        self.state['users']={k:v.get('id',v.get('userId')) for k,v in self.users.items()}
    def uid(self,role): return self.state['users'][role]
    def execute(self):
        self.check('01 五角色真实登录并读取身份',self.login)
        def draft():
            self.state['draft']=self.api('cases/drafts/save',{'draft_data':{'case_name':self.prefix}})['draft_id']
            d=self.state['draft']
            self.ok(any(x['draft_id']==d for x in items(self.api('cases/drafts/list'))),'own draft missing')
            for role in ['branch_business','external_lawyer']:
                self.api('cases/drafts/delete',{'draft_id':d},role=role,expected=(400,403,404))
            self.ok(any(x['draft_id']==d for x in items(self.api('cases/drafts/list'))),'foreign deletion changed draft')
        self.check('02 部门保存草稿、读回及异角色删除拒绝',draft)
        def clue():
            self.state['clue']=self.api('clues/create',{'clue_title':self.prefix,'source_type':'MANUAL','estimated_amount':'10000','opponent_name':self.prefix+'-对方'})['clue_id']
            c=self.state['clue']
            self.api('clues/update',{'clue_id':c,'description':self.prefix+'-线索描述'})
            self.ok(self.api('clues/detail',{'clue_id':c})['description'].endswith('线索描述'),'clue update lost')
            self.api('clues/detail',{'clue_id':c},role='branch_business',expected=(400,403,404))
            self.api('clues/assign',{'clue_id':c,'assignee_id':self.uid('hq_business')})
            self.ok(self.api('clues/detail',{'clue_id':c},role='hq_business')['assignee_id']==self.uid('hq_business'),'assignment mismatch')
        self.check('03 部门线索创建更新、跨角色分派与分支隔离',clue)
        def create():
            c=self.state['clue']
            p=self.api('cases/from-clue/prepare',{'clue_id':c},role='hq_business')['prepared_draft']
            self.ok(p['case_name']==self.prefix and str(p['target_amount']).startswith('10000'),'prefill lost')
            p.update({'members':[{'user_id':self.uid(ROLE),'role_code':'BUSINESS_COLLABORATOR'}],'budget':{'total_budget':'5000'},'draft_id':None})
            r=self.api('cases/create',p,role='hq_business'); self.state['case']=r['case_id']
            self.ok(self.api('clues/detail',{'clue_id':c})['converted_case_id']==r['case_id'],'clue conversion link missing')
            self.ok(self.api('cases/detail/sidebar',{'case_id':r['case_id']})['case_id']==r['case_id'],'department member missing')
        self.check('04 总部从部门线索立案、预算初始化、成员回读',create)
        if 'case' not in self.state: return
        c=self.state['case']; cb={'case_id':c}; h='hq_business'; lawyer='external_lawyer'
        self.check('05 分支未加入案件时读写均拒绝',lambda:[self.api('cases/'+p,dict(cb,**body),role='branch_business',expected=(400,403,404)) for p,body in [('detail/sidebar',{}),('base-info/update',{'patch':{'description':self.prefix+'-DENIED'}}),('finance/snapshot',{}),('tasks/list',{})]])
        def member():
            self.api('cases/members/manage',dict(cb,action='ADD',role_code='VIEWER',user_ids=[self.uid('branch_business')]),role=h)
            self.ok(self.api('cases/detail/permissions',cb,role='branch_business')['can_edit_base_info']==False,'follower can edit')
            self.api('cases/base-info/update',dict(cb,patch={'description':self.prefix+'-DENIED'}),role='branch_business',expected=(400,403))
            self.api('cases/members/manage',dict(cb,action='REMOVE',user_ids=[self.uid('branch_business')]),role=h)
            self.api('cases/detail/sidebar',cb,role='branch_business',expected=(400,403,404))
        self.check('06 增加关注人、只读拒绝、移除后访问撤销',member)
        def parties():
            r=self.api('cases/parties/add',dict(cb,party_type='DEFENDANT',party_name=self.prefix+'-被告',identity_type='LEGAL_ENTITY'),role=h)
            self.state['party']=r
            self.ok(self.prefix+'-被告' in json.dumps(self.api('cases/parties/list',cb),ensure_ascii=False),'party missing')
        self.check('07 总部新增当事人、部门读回',parties)
        def task():
            r=self.api('cases/tasks/create',dict(cb,title=self.prefix+'-部门任务',assignee_id=self.uid(ROLE)),role=h)
            self.state['task']=r.get('task',r).get('id',r.get('task_id'))
            self.ok(bool(self.state['task']),'task id missing '+str(r))
            t=self.state['task']; self.api('cases/tasks/update-status',{'task_id':t,'new_status':'DONE'})
            self.ok(any(x['id']==t and x['status']=='DONE' for x in items(self.api('cases/tasks/list',cb))),'task status not persisted')
            self.api('cases/tasks/update-status',{'task_id':t,'new_status':'TODO'},role='branch_business',expected=(400,403,404))
        self.check('08 总部分派部门任务、执行人完成、跨人拒绝',task)
        def finance():
            self.api('cases/finance/update',dict(cb,fields={'target_amount':'12000','notes':self.prefix}),role=h)
            self.api('cases/finance/spend/record',dict(cb,transaction_type='COURT_FEE',amount='100',description=self.prefix),role=h)
            self.ok(any(str(x['amount']).startswith('100') for x in items(self.api('cases/finance/spend/list',cb,role=h))),'spend lost')
            self.api('cases/finance/update',dict(cb,fields={'target_amount':'12001'}),expected=(400,403))
        self.check('09 负责人维护财务支出及部门财务写拒绝',finance)
        def counsel():
            v=self.api('vendor-portal/summary',role=lawyer); self.state['lawyer']=v['lawyerId']
            self.api('cases/counsels/external/assign',dict(cb,external_lawyer_id=v['lawyerId']),role=h)
            self.ok(any(x.get('caseId')==c for x in items(self.api('vendor-portal/my-cases',role=lawyer))),'assigned case absent in portal')
        self.check('10 外聘律师指派后门户案件可见',counsel)
        self.check('11 已指派律师打开案件侧栏与总览',lambda:[self.api('cases/'+p,cb,role=lawyer) for p in ['detail/sidebar','detail/overview','detail/permissions']])
        def lawyer_task():
            r=self.api('cases/tasks/create',dict(cb,title=self.prefix+'-律师任务',assignee_id=self.uid(lawyer)),role=h)
            t=r.get('task',r).get('id',r.get('task_id')); self.state['lawyer_user_task']=t
            self.ok(any(x.get('taskId')==t for x in items(self.api('vendor-portal/tasks/list',role=lawyer))),'user-id-assigned task absent in lawyer portal')
        self.check('12 账号ID分派律师任务后门户可见',lawyer_task)
        def lawyer_native():
            r=self.api('cases/tasks/create',dict(cb,title=self.prefix+'-律师档案任务',assignee_id=self.state['lawyer']),role=h)
            t=r.get('task',r).get('id',r.get('task_id')); self.state['lawyer_task']=t
            self.ok(any(x.get('taskId')==t for x in items(self.api('vendor-portal/tasks/list',role=lawyer))),'lawyer-id task absent')
            self.api('vendor-portal/tasks/submit',{'taskId':t,'notes':self.prefix},role=lawyer)
            self.ok(self.api('vendor-portal/tasks/detail',{'taskId':t},role=lawyer)['status']=='COMPLETED','lawyer completion lost')
        self.check('13 档案ID分派律师任务、提交并读回完成状态',lawyer_native)
        self.check('14 部门门户原始线索转换状态同步',lambda:self.ok(any(x.get('clueId')==self.state['clue'] and x.get('caseId')==c and x.get('status')=='CONVERTED' for x in items(self.api('business-portal/clues/list'))),'portal clue conversion missing'))
        self.check('15 部门取证任务列表可读',lambda:self.ok(isinstance(self.api('business-portal/evidence-tasks/list').get('items'),list),'invalid evidence list'))
        def dossier():
            folder=self.api('cases/dossier/folders/create',dict(cb,folder_name=self.prefix+'-卷宗'),role=h)
            fid=folder.get('folder',folder).get('folder_id',folder.get('id')); self.state['folder']=fid
            self.ok(bool(fid),'folder id missing '+str(folder))
            raw=(self.prefix+' dossier roundtrip').encode()
            up=self.api('cases/dossier/upload/init',dict(cb,folder_id=fid,doc_name=self.prefix+'.txt',doc_type='TXT',doc_size=len(raw),file_hash=hashlib.sha256(raw).hexdigest()),role=h)
            self.state['upload']=up
            url=up.get('upload_url',up.get('presigned_url'))
            self.ok(bool(url),'upload URL missing '+str(up))
            transfer=requests.Session(); transfer.trust_env=False
            res=transfer.put(url,data=raw,headers={'Content-Type':'application/octet-stream'},timeout=15)
            self.ok(res.status_code==200,'object PUT HTTP '+str(res.status_code)); etag=res.headers.get('ETag')
            doc=self.api('cases/dossier/upload/complete',{'upload_id':up['upload_id'],'etag':etag},role=h)
            did=doc.get('document',doc).get('id',doc.get('doc_id')); self.state['doc']=did
            self.ok(bool(did),'document id missing '+str(doc))
            dl=self.api('cases/dossier/download-url',{'doc_id':did},role=h)
            res=transfer.get(dl.get('presigned_url',dl.get('download_url',dl.get('url'))),timeout=15); actual=res.content
            self.ok(actual==raw,'download bytes differ')
            self.api('cases/dossier/download-url',{'doc_id':did},role='branch_business',expected=(400,403,404))
        self.check('18 卷宗目录、实际上传下载字节及非成员拒绝',dossier)
        def timeline():
            r=self.api('cases/process/timeline',cb,role=h); self.state['timeline']=r
            self.ok(bool(r.get('stages',r.get('instances'))),'new case has no process stages')
            for n in r['instances'][0]['nodes']:
                self.api('cases/process/nodes/complete',{'node_id':n['id'],'remark':self.prefix},role=h)
            after=self.api('cases/process/timeline',cb,role=h)
            self.ok(all(n['status']=='COMPLETED' for n in after['instances'][0]['nodes']),'node completion not persisted')
        self.check('19 新立案件流程实例与节点初始化',timeline)
        def memo():
            r=self.api('cases/memos/add',dict(cb,memo_type='GENERAL',content=self.prefix+'-协作备注'))
            self.state['memo']=r['memo_id']
            self.ok(self.prefix+'-协作备注' in json.dumps(self.api('cases/activities/query',dict(cb,action_modules=['MEMO'])),ensure_ascii=False),'memo missing from frontend MEMO activities reader')
        self.check('20 部门协作备注创建及前端同源读回',memo)
        self.check('16 归档校验拒绝未结案案件',lambda:self.ok(self.api('cases/archiving/validate',cb,role=h)['can_archive']==False,'unclosed case archivable'))
        def closing():
            r=self.api('cases/closing/submit',dict(cb,closure_date='2026-10-03',closure_type='SETTLED',review_summary=self.prefix,status='APPROVED'),role=h)
            self.ok(r['case_status']=='CLOSED','close did not transition')
            self.ok(self.api('cases/closing/info',cb,role=h)['closure']['status']=='APPROVED','closure readback mismatch')
            self.api('cases/tasks/create',dict(cb,title=self.prefix+'-closed-denied',assignee_id=self.uid(ROLE)),role=h,expected=(400,403))
        self.check('17 结案登记读回与结案后写入拒绝',closing)

def verify_existing(r):
    """Read-only follow-up, no service restart or product mutation."""
    r.login()
    def document():
        dl=r.api('cases/dossier/download-url',{'doc_id':r.state['doc']},role='hq_business')
        s=requests.Session(); s.trust_env=False
        res=s.get(dl['presigned_url'],timeout=15)
        r.ok(res.status_code==200 and res.content==(r.prefix+' dossier roundtrip').encode(),'download mismatch')
        r.state['download_sha256']=hashlib.sha256(res.content).hexdigest()
        r.api('cases/dossier/download-url',{'doc_id':r.state['doc']},role='branch_business',expected=(400,403,404))
    r.check('18R 卷宗实际下载字节校验及非成员拒绝（字段修正复测）',document)
    r.check('21 律师提交500后任务仍待处理无伪成功',lambda:r.ok(r.api('vendor-portal/tasks/detail',{'taskId':r.state['lawyer_task']},role='external_lawyer')['status']=='PENDING','task changed despite failure'))

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--verify-existing',type=Path,help='existing .local/regression/cases-*.json evidence')
    args=parser.parse_args()
    r=Run()
    if args.verify_existing:
        d=json.loads(args.verify_existing.read_text(encoding='utf-8'))
        r.state=d['state']; r.prefix=r.state['prefix']; r.results=d['results']; r.evidence=d['evidence']
        verify_existing(r)
    else: r.execute()
    r.save(); print('EVIDENCE',r.prefix); print('RAW SUMMARY', {s:sum(x['status']==s for x in r.results) for s in ['PASS','FAIL']})
