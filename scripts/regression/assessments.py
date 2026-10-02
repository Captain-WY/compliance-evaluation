"""Role-based assessment HTTP regression. No product mutation outside prefixed test records."""
from __future__ import annotations
import argparse,json,uuid,urllib.request,urllib.error,time,subprocess,hashlib
from datetime import date,timedelta,datetime
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
EVIDENCE=ROOT/'.local/regression'
STATE=EVIDENCE/'assessments-state.json'

class Regression:
 def __init__(self):
  self.state=json.loads(STATE.read_text(encoding='utf-8')) if STATE.exists() else {'prefix':'REG-20261003-ASMT-'+uuid.uuid4().hex[:6],'results':[],'requests':[]}
  self.tokens={};self.principals={};self.base='http://127.0.0.1:8010';self.last=None
 def save(self):
  STATE.write_text(json.dumps(self.state,ensure_ascii=False,indent=2),encoding='utf-8')
 def call(self,method,path,body=None,role='hq_business',raw=None,content_type=None):
  headers={}
  if role in self.tokens:headers['Authorization']='Bearer '+self.tokens[role]
  payload=raw if raw is not None else json.dumps(body,ensure_ascii=False).encode('utf-8') if body is not None else None
  if content_type:headers['Content-Type']=content_type
  elif body is not None:headers['Content-Type']='application/json'
  req=urllib.request.Request(self.base+path,data=payload,headers=headers,method=method)
  start=time.time()
  try:
   with urllib.request.urlopen(req,timeout=40) as res:status=res.status;data=res.read()
  except urllib.error.HTTPError as exc:status=exc.code;data=exc.read()
  try:reply=json.loads(data)
  except ValueError:reply={'nonJson':data.decode('utf-8',errors='replace')[:300]}
  auth=path.startswith('/api/platform/auth/')
  record={'seq':len(self.state['requests'])+1,'time':datetime.now().isoformat(),'role':role,'method':method,'path':path,'request':'[REDACTED]' if auth else body if raw is None else {'uploadBytes':len(raw)},'http':status,'response':'[REDACTED]' if auth else reply,'seconds':round(time.time()-start,3)}
  self.state['requests'].append(record);self.last=record;self.save()
  return status,reply.get('data',reply) if isinstance(reply,dict) else reply
 def require(self,method,path,body=None,role='hq_business',expect=(200,201),**kw):
  status,data=self.call(method,path,body,role,**kw)
  if status not in expect:raise AssertionError(f'HTTP {status}; '+json.dumps(data,ensure_ascii=False)[:500])
  return data
 def check(self,name,fn,role='hq_business',severity='P2',code=''):
  start=len(self.state['requests'])+1
  try:
   detail=fn();result={'name':name,'status':'PASS','role':role,'severity':'—','detail':detail or '状态及返回内容断言通过'}
  except Exception as exc:result={'name':name,'status':'FAIL','role':role,'severity':severity,'detail':str(exc)}
  result.update({'requestStart':start,'requestEnd':len(self.state['requests']),'code':code});self.state['results'].append(result);self.save();print(result['status'],name,result['detail'] if result['status']=='FAIL' else '')
 def blocked(self,name,reason,role='branch_business',code=''):
  self.state['results'].append({'name':name,'status':'BLOCKED','role':role,'severity':'—','detail':reason,'code':code});self.save();print('BLOCKED',name)
 def login(self):
  accounts=json.loads((ROOT/'.local/dev-accounts.json').read_text(encoding='utf-8-sig'))
  for a in accounts:
   d=self.require('POST','/api/platform/auth/login',{'username':a['username'],'password':a['password']},role=None)
   self.tokens[a['role']]=d['access_token'];self.principals[a['role']]=self.require('GET','/api/platform/auth/me',role=a['role'])
  self.state['principals']={r:{k:v for k,v in u.items() if k in ['id','userId','orgId','orgName','role_codes','permissions','permittedMenuIds','dataScope']} for r,u in self.principals.items()};self.save()
 def discover(self):
  for name,path in [('indicators','/api/assessment/indicators?pageSize=100'),('schemes','/api/assessment/schemes?pageSize=100'),('workflows','/api/workflow/templates'),('orgs','/api/system/org-tree'),('dicts','/api/system/config-dictionaries?types=scoring_rule_type,assessment_frequency,assessment_target_scope_mode,assessment_dispatch_mode')]:
   status,data=self.call('GET',path);self.state['discovery_'+name]=data;print(name,status,list(data) if isinstance(data,dict) else len(data))
  self.save()

 def indicator(self):
  prefix=self.state['prefix']
  def create():
   body={'indicatorCode':prefix+'-IND','indicatorName':prefix+'考核及时率','categoryId':'AICAT-P1-FOUNDATION-BRANCH-COMPLIANCE','weightDefault':100,'maxScore':100,'variables':[{'variableCode':'rate','variableName':'合规率','valueType':'NUMBER'}],'scoringRule':{'ruleType':'FORMULA','effect':'DIRECT_SCORE','expression':'rate'},'evidenceTemplates':[{'templateName':prefix+'举证','required':True,'acceptedFileTags':[]}]}
   d=self.require('POST','/api/assessment/indicators',body);self.state['indicator']=d;self.save();assert d['version']['status']=='DRAFT'
   listing=self.require('GET','/api/assessment/indicators?pageSize=100');assert any(x['indicatorId']==d['indicatorId'] for x in listing['items']);return '草稿创建且独立列表请求读回'
  if 'indicator' not in self.state:self.check('A01 总部新建指标并读回',create,code='domain/indicator_store.py:create_indicator')
  if 'indicator' not in self.state:return
  d=self.state['indicator'];url='/api/assessment/indicators/'+d['indicatorId']+'/versions/'+d['version']['versionId']
  def invalid():
   status,data=self.call('POST',url+'/validate-scoring',{'scoringRule':{'ruleType':'FORMULA','expression':'unknown_variable + 1'}});assert status==422;return '未声明变量被422拒绝'
  self.check('A02 非法评分规则拒绝',invalid)
  def valid():
   data=self.require('POST',url+'/validate-scoring',{'sampleValues':{'rate':82}});assert data['valid'] and data['sampleResult']==82;return '样例rate=82，计算结果82'
  self.check('A03 合法规则计算结果',valid)
  def publish():
   data=self.require('POST',url+'/publish');assert data['version']['status']=='PUBLISHED' and data['activeVersionId']==d['version']['versionId'];self.state['indicator']=data
   rows=self.require('GET','/api/assessment/indicators?pageSize=100')['items'];item=next(x for x in rows if x['indicatorId']==d['indicatorId']);assert item['status']=='PUBLISHED';return '发布状态及列表快照一致'
  self.check('A04 指标发布并读回',publish,code='domain/indicator_store.py:publish_version')
  self.check('A05 发布后禁止改草稿',lambda:self.require('PATCH',url,{'indicatorName':prefix+'不应写入'},expect=(409,)),code='domain/indicator_store.py:update_draft')
 def scheme(self):
  if 'indicator' not in self.state:self.blocked('A06 创建独立考核方案','指标创建失败');return
  prefix=self.state['prefix'];ind=self.state['indicator'];branch=self.principals['branch_business']['orgId']
  def create():
   body={'schemeCode':prefix+'-SCH','schemeName':prefix+'方案','year':2026,'frequency':'YEARLY','totalWeight':100,'items':[{'indicatorId':ind['indicatorId'],'versionId':ind['version']['versionId'],'weight':100,'scoreCap':100}],'gradeThresholds':[{'gradeCode':'PASS','gradeLabel':'合格','minScore':0}],'targetGroups':[{'groupName':prefix+'南沙对象','scopeMode':'MANUAL_SELECTION','members':[{'orgId':branch}]}],'scheduleBinding':{'dispatchMode':'MANUAL'},'idempotencyKey':prefix+'-scheme-create'}
   d=self.require('POST','/api/assessment/schemes',body);self.state['scheme']=d;self.save();assert d['status']=='DRAFT';read=self.require('GET','/api/assessment/schemes/'+d['schemeId']);assert read['schemeName']==body['schemeName'];return '创建及读回通过'
  if 'scheme' not in self.state:self.check('A06 新方案草稿保存读回',create,code='domain/scheme_store.py:create_scheme')
  if 'scheme' not in self.state:return
  d=self.state['scheme'];path='/api/assessment/schemes/'+d['schemeId']
  def replay():
   source=next(x['request'] for x in reversed(self.state['requests']) if x['path']=='/api/assessment/schemes' and x['method']=='POST' and x['http'] in (200,201) and isinstance(x['request'],dict) and x['request'].get('schemeCode')==prefix+'-SCH')
   result=self.require('POST','/api/assessment/schemes',source);assert result['schemeId']==d['schemeId'];return '相同幂等键返回同一方案ID'
  self.check('A07 方案创建幂等',replay)
  def publish_gate():
   status,error=self.call('POST',path+'/publish',{'idempotencyKey':prefix+'-publish','optimisticVersion':d['optimisticVersion']});assert status==422 and 'workflow_route_required' in json.dumps(error);return '缺少已发布路由的方案不能发布'
  self.check('A08 方案发布路由门槛',publish_gate)
  templates=self.require('GET','/api/workflow/templates')['items']
  if not any(x.get('currentVersionId') for x in templates):self.blocked('A09 新方案合法发布到ACTIVE','仅有WFT-ASSESS-DEFAULT草稿，无publishedVersion；路由无新建接口，约束禁止修改共享种子。后续周期只引用既有ACTIVE种子方案。',role='hq_business',code='api/routes/workflow.py:37,66,106; domain/scheme_store.py:1566')
 def cycle(self):
  prefix=self.state['prefix'];branch=self.principals['branch_business']['orgId']
  def create():
   body={'cycleCode':prefix+'-CYCLE','cycleName':prefix+'周期','schemeId':'ASCH-SEED-2026','year':2026,'periodStart':'2026-10-01','periodEnd':'2026-10-31','targetOrgIds':[branch]}
   d=self.require('POST','/api/assessment/cycles',body);self.state['cycle']=d;self.save();assert d['status']=='DRAFT' and d['targetCount']==0;return '独立周期仅引用原方案，未改动种子'
  if 'cycle' not in self.state:self.check('A10 创建独立周期',create,code='domain/cycle_store.py:create_cycle')
  if 'cycle' not in self.state:return
  cid=self.state['cycle']['cycleId'];path='/api/assessment/cycles/'+cid
  self.check('A11 未复核周期禁止发布结果',lambda:self.require('POST',path+'/publish-results',expect=(409,)))
  def dispatch():
   d=self.require('POST',path+'/dispatch',{'targetOrgIds':[branch],'dueDate':'2026-10-31','message':prefix+'下发'});self.state['cycle']=d;self.state['reportingId']=d['reportingTasks'][0]['reportingTaskId'];assert d['status']=='DISPATCHED' and d['targetCount']==1
   rows=self.require('GET','/api/assessment/reporting-tasks?pageSize=100',role='branch_business')['items'];assert any(x['reportingTaskId']==self.state['reportingId'] for x in rows);return 'DISPATCHED且分支可见实际任务'
  if 'reportingId' not in self.state:self.check('A12 周期下发及分支任务可见',dispatch,code='domain/cycle_store.py:dispatch_cycle')
  self.check('A13 重复下发拒绝且任务不重复',lambda:self.require('POST',path+'/dispatch',{},expect=(409,)))
  def read():
   d=self.require('GET',path);assert len(d['targets'])==1 and len(d['reportingTasks'])==1;return '独立GET确认1对象/1填报任务'
  self.check('A14 周期派发持久读回',read)

 def diagnostics(self):
  rows=self.require('GET','/api/assessment/cycles?pageSize=100')['items'];self.state['phantomCycles']=[x for x in rows if x['cycleCode'].startswith(self.state['prefix'])]
  for c in self.state['phantomCycles']:self.state['phantomCycleDetail']=self.require('GET','/api/assessment/cycles/'+c['cycleId'])
  schemes=self.require('GET','/api/assessment/schemes?pageSize=100');self.state['schemesAfterFirstSave']=schemes
  for path,role in [('/api/assessment/reporting-tasks','branch_business'),('/api/assessment/review-tasks','hq_business'),('/api/assessment/results','branch_business')]:self.require('GET',path,role=role)
  def persisted_cycle():
   out=self.db("SELECT cycle_id,cycle_code,status FROM assessment_cycles; SELECT scheme_id,status FROM assessment_schemes;")
   if self.state['phantomCycles'] and self.state['prefix']+'-CYCLE' not in out:raise AssertionError('POST周期500后GET仍返回DRAFT周期，但assessment_cycles为0行；接口存在未提交的幽灵周期')
  self.check('A15 周期创建失败后的API/数据库一致性',persisted_cycle,severity='P1',code='repositories/assessment_runtime.py:121-126; api/routes/assessment.py:700-709')
  for name,role in [('A16 周期下发生成填报任务','hq_business'),('A17 分支填报草稿及缺证提交拒绝','branch_business'),('A18 分支举证提交和撤回','branch_business'),('A19 总部复核开始、打分及退回','hq_business'),('A20 分支补证重提及总部通过','hq_business'),('A21 生成并发布结果及分值核验','hq_business'),('A22 分支申诉及总部裁决','branch_business'),('A23 分支确认、结果定稿及周期归档','hq_business')]:
   self.blocked(name,'新方案发布缺已发布工作流；ACTIVE种子方案未持久化导致周期创建500，无合法持久化周期可继续。未对其他业务记录执行写操作。',role=role)

 def db(self,sql):
  cmd=['docker','compose','--env-file','deploy/local/.env','-f','deploy/local/compose.yaml','exec','-T','postgres','psql','-U','postgres','-d','compliance_business','-c','BEGIN READ ONLY; '+sql+' COMMIT;']
  result=subprocess.run(cmd,cwd=ROOT,capture_output=True,text=True,encoding='utf-8');assert result.returncode==0,result.stderr
  self.state.setdefault('databaseEvidence',[]).append({'sql':sql,'output':result.stdout});self.save();return result.stdout

 def ledger(self):
  role='branch_business';prefix=self.state['prefix']
  def upload():
   boundary='Regression'+uuid.uuid4().hex;content=(prefix+' attachment evidence\n').encode();raw=(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{prefix}.txt"\r\nContent-Type: text/plain\r\n\r\n').encode()+content+f'\r\n--{boundary}--\r\n'.encode()
   d=self.require('POST','/api/files',role=role,raw=raw,content_type='multipart/form-data; boundary='+boundary);assert d['fileId'];assert d['fileSize']==len(content);self.state['file']=d;return '真实multipart附件上传，文件ID及大小验证通过'
  self.check('A24 分支真实证据文件上传',upload,role=role)
  def create():
   body={'title':prefix+'履职台账','occurredDate':'2026-10-03','category':'GENERAL','description':'HTTP回归原始证据','status':'AVAILABLE','fileIds':[self.state['file']['fileId']] if 'file' in self.state else []}
   d=self.require('POST','/api/assessment/daily-ledger',body,role=role);self.state['ledger']=d;assert d['title']==body['title'];rows=self.require('GET','/api/assessment/daily-ledger?pageSize=100',role=role)['items'];assert any(x['ledgerEntryId']==d['ledgerEntryId'] for x in rows)
  self.check('A25 分支台账创建与独立读回',create,role=role)
  if 'ledger' not in self.state:return
  lid=self.state['ledger']['ledgerEntryId'];path='/api/assessment/daily-ledger/'+lid
  def patch():
   d=self.require('PATCH',path,{'description':prefix+'更新后'},role=role);assert d['description']==prefix+'更新后'
   rows=self.require('GET','/api/assessment/daily-ledger?pageSize=100',role=role)['items'];assert next(x for x in rows if x['ledgerEntryId']==lid)['description']==prefix+'更新后'
  self.check('A26 分支台账编辑与读回',patch,role=role)
  def dbcheck():
   out=self.db("SELECT ledger_entry_id,title,status FROM daily_compliance_ledger_entries WHERE ledger_entry_id='"+lid+"';")
   assert prefix in out,'创建与编辑返回200，GET可读；数据库按ledger_entry_id查询0行。路由未使用session及持久化仓储。'
  self.check('A27 台账落库一致性',dbcheck,role=role,severity='P1',code='api/routes/assessment.py:1129-1194; domain/reporting_store.py:399-466')
  def remove():
   d=self.require('DELETE',path,role=role);assert d['status']=='DELETED';rows=self.require('GET','/api/assessment/daily-ledger?pageSize=100',role=role)['items'];assert all(x['ledgerEntryId']!=lid for x in rows);self.require('PATCH',path,{'title':prefix+'禁止恢复'},role=role,expect=(409,))
  self.check('A28 台账软删除和删除后禁止编辑',remove,role=role)

 def permissions(self):
  ind=self.state['indicator'];scheme=self.state['scheme'];iid=ind['indicatorId'];sid=scheme['schemeId'];prefix=self.state['prefix']
  collections=['indicators','schemes','cycles','reporting-tasks','daily-ledger','review-tasks','results']
  for role in ['department_business','external_lawyer']:
   for collection in collections:
    self.check('AUTH '+role+'拒绝读取'+collection,lambda c=collection,r=role:self.require('GET','/api/assessment/'+c,role=r,expect=(403,)),role=role,severity='P1')
   for label,path in [('方案','/api/assessment/schemes/'+sid)]:
    self.check('AUTH '+role+'拒绝现存'+label+'详情',lambda p=path,r=role:self.require('GET',p,role=r,expect=(403,)),role=role,severity='P1')
  for role in ['branch_business','department_business','external_lawyer']:
   create_body=next(x['request'] for x in self.state['requests'] if x['path']=='/api/assessment/indicators' and x['method']=='POST' and x['http'] in (200,201)).copy();create_body['indicatorCode']=prefix+'-DENY-'+role
   self.check('AUTH '+role+'拒绝新建指标',lambda r=role,b=create_body:self.require('POST','/api/assessment/indicators',b,role=r,expect=(403,)),role=role,severity='P1')
   self.check('AUTH '+role+'拒绝修改现存方案',lambda r=role:self.require('PATCH','/api/assessment/schemes/'+sid,{'schemeName':prefix+'不应改变','idempotencyKey':prefix+'-deny-'+r,'optimisticVersion':scheme['optimisticVersion']},role=r,expect=(403,)),role=role,severity='P1')
   self.check('AUTH '+role+'拒绝新建周期',lambda r=role:self.require('POST','/api/assessment/cycles',{'cycleName':prefix+'拒绝','schemeId':sid,'year':2026,'periodStart':'2026-10-01','periodEnd':'2026-10-31','targetOrgIds':['WLZQ-RBC-GZ-NANSHA']},role=r,expect=(403,)),role=role,severity='P1')
   self.check('AUTH '+role+'拒绝总部复核列表',lambda r=role:self.require('GET','/api/assessment/review-tasks',role=r,expect=(403,)),role=role,severity='P1')
  for role in ['department_business','external_lawyer']:
   self.check('AUTH '+role+'拒绝分支台账新增',lambda r=role:self.require('POST','/api/assessment/daily-ledger',{'title':prefix+'越权','occurredDate':'2026-10-03'},role=r,expect=(403,)),role=role,severity='P1')
  for collection in collections:
   self.check('AUTH 平台管理员读取'+collection,lambda c=collection:self.require('GET','/api/assessment/'+c,role='platform_admin'),role='platform_admin')
  def unchanged():
   d=self.require('GET','/api/assessment/schemes/'+sid);assert d['schemeName']==scheme['schemeName'] and d['optimisticVersion']==scheme['optimisticVersion'];rows=self.require('GET','/api/assessment/indicators?pageSize=100')['items'];assert not any('-DENY-' in x.get('indicatorCode','') for x in rows)
  self.check('AUTH 拒绝写入后数据未改变',unchanged)

 def boundaries(self):
  prefix=self.state['prefix'];branch='branch_business';admin='platform_admin'
  def cross_org():
   d=self.require('POST','/api/assessment/daily-ledger',{'title':prefix+'总部隔离台账','occurredDate':'2026-10-03'},role=admin);self.state['adminLedger']=d;lid=d['ledgerEntryId'];assert d['orgId']=='WLZQ-HQ'
   rows=self.require('GET','/api/assessment/daily-ledger?pageSize=100',role=branch)['items'];assert all(x['ledgerEntryId']!=lid for x in rows)
   self.require('PATCH','/api/assessment/daily-ledger/'+lid,{'description':prefix+'非法'},role=branch,expect=(403,));self.require('DELETE','/api/assessment/daily-ledger/'+lid,role=branch,expect=(403,))
   rows=self.require('GET','/api/assessment/daily-ledger?pageSize=100',role=admin)['items'];row=next(x for x in rows if x['ledgerEntryId']==lid);assert row['status']=='AVAILABLE' and row['description']==''
   self.require('DELETE','/api/assessment/daily-ledger/'+lid,role=admin);return '总部台账对分支列表隐藏；直接PATCH/DELETE均403，管理员读回未被修改'
  self.check('A29 分支跨机构台账拒绝及无写入',cross_org,role=branch,severity='P1',code='domain/reporting_store.py:_get_ledger_for_user,_can_access_org')
  def invalid_file():
   self.require('POST','/api/assessment/daily-ledger',{'title':prefix+'非法附件','occurredDate':'2026-10-03','fileIds':['FILE-DOES-NOT-EXIST-'+prefix]},role=branch,expect=(404,));return '不存在附件不能写入台账'
  self.check('A30 台账不存在附件拒绝',invalid_file,role=branch)
  def edit_scheme():
   old=self.require('GET','/api/assessment/schemes/'+self.state['scheme']['schemeId']);path='/api/assessment/schemes/'+old['schemeId']
   d=self.require('PATCH',path,{'description':prefix+'修订','optimisticVersion':old['optimisticVersion'],'idempotencyKey':prefix+'-edit'});assert d['optimisticVersion']==old['optimisticVersion']+1;self.state['scheme']=d
   self.require('PATCH',path,{'description':prefix+'不应覆盖','optimisticVersion':old['optimisticVersion'],'idempotencyKey':prefix+'-stale'},expect=(409,));read=self.require('GET',path);assert read['description']==prefix+'修订';return '保存后版本递增，旧版本409拒绝且说明未被覆盖'
  self.check('A31 方案编辑及并发版本保护',edit_scheme)
  def seeds():
   before={x['schemeId'] for x in self.state['discovery_schemes']['items']};after={x['schemeId'] for x in self.require('GET','/api/assessment/schemes?pageSize=100')['items']};missing=before-after
   assert not missing,'首次保存独立草稿后原API方案消失：'+','.join(sorted(missing))
  self.check('A32 保存新方案不应删除已有列表方案',seeds,severity='P1',code='repositories/assessment_runtime.py:111-118')

 def prepare_workflow(self):
  prefix=self.state['prefix'];path='/api/workflow/templates/WFT-ASSESS-DEFAULT'
  def prepare():
   before=self.require('GET',path);backup=EVIDENCE/'assessments-workflow-before.json'
   if not backup.exists():backup.write_text(json.dumps(before,ensure_ascii=False,indent=2),encoding='utf-8')
   if before['status']=='ACTIVE':
    self.state['workflow']=before;assert before['currentVersionId'];return '已发布模板独立读回ACTIVE，版本'+before['currentVersionId']
   chains=before['chains']
   changes=[]
   for chain in chains:
    for i,node in enumerate(chain['nodes']):
     user_id='33333333-3333-4333-8333-333333333333' if i==0 else '22222222-2222-4222-8222-222222222222'
     changes.append({'nodeId':node['nodeId'],'before':node['approverSelector'],'after':{'selectorType':'USER','userId':user_id}})
     node['approverSelector']={'selectorType':'USER','userId':user_id};node['nodeType']='FINAL_APPROVER' if node['isFinal'] else 'USER'
   (EVIDENCE/'assessments-workflow-change-list.json').write_text(json.dumps({'authorization':'主任务授权通过API配置共享初始模板以继续完整回归','changes':changes},ensure_ascii=False,indent=2),encoding='utf-8')
   self.require('PATCH',path,{'chains':chains});v=self.require('POST',path+'/validate');assert v['summary']['errorCount']==0,v
   d=self.require('POST',path+'/publish')['template'];self.state['workflow']=d;assert d['currentVersionId'];return '原始模板已备份；四级节点合法映射branch/HQ账号；校验0错误并发布'
  self.check('B01 备份配置并发布初始工作流',prepare,code='api/routes/workflow.py:66-126')
  if 'workflow' not in self.state:return
  def bind():
   sid=self.state['scheme']['schemeId'];p='/api/assessment/schemes/'+sid;d=self.require('GET',p)
   d=self.require('PATCH',p,{'workflowBinding':{'routeTemplateId':'WFT-ASSESS-DEFAULT','routeTemplateVersionId':self.state['workflow']['currentVersionId']},'optimisticVersion':d['optimisticVersion'],'idempotencyKey':prefix+'-bind-workflow'})
   d=self.require('POST',p+'/publish',{'optimisticVersion':d['optimisticVersion'],'idempotencyKey':prefix+'-publish-ready'});self.state['scheme']=d;assert d['status']=='ACTIVE';return '自建方案绑定已发布路由并成为ACTIVE'
  self.check('B02 新方案发布到ACTIVE',bind)
  if self.state['scheme']['status']!='ACTIVE':return
  def cycle():
   d=self.require('POST','/api/assessment/cycles',{'cycleCode':prefix+'-MAIN','cycleName':prefix+'完整链周期','schemeId':self.state['scheme']['schemeId'],'year':2026,'periodStart':'2026-10-01','periodEnd':'2026-10-31','targetOrgIds':['WLZQ-RBC-GZ-NANSHA']});self.state['cycle']=d;assert d['status']=='DRAFT'
   d=self.require('POST','/api/assessment/cycles/'+d['cycleId']+'/dispatch',{'targetOrgIds':['WLZQ-RBC-GZ-NANSHA'],'dueDate':'2026-10-31','message':prefix+'完整链下发'});self.state['cycle']=d;self.state['reportingId']=d['reportingTasks'][0]['reportingTaskId'];assert d['targetCount']==1
   self.state['reporting']=self.require('GET','/api/assessment/reporting-tasks/'+self.state['reportingId'],role='branch_business');return '自建ACTIVE方案生成独立周期并下发，分支读取任务'
  self.check('B03 周期创建下发并分支读取',cycle,severity='P1')

 def reporting_main(self):
  if self.state.get('appealCycleBlocked'):raise RuntimeError('扣分周期前置失败；禁止复用上一周期任务重跑')
  role='branch_business';p='/api/assessment/reporting-tasks/'+self.state['reportingId'];prefix=self.state['prefix'];cid=self.state['cycle']['cycleId']
  task=self.require('GET',p,role=role);item=task['items'][0];body={'items':[{'responseItemId':item['responseItemId'],'value':{'rate':82},'comment':prefix+'初报','fileIds':[]}]}
  def draft():
   d=self.require('PATCH',p,body,role=role);assert d['status']=='IN_PROGRESS';d=self.require('GET',p,role=role);assert d['items'][0]['value']=={'rate':82}
   status,err=self.call('POST',p+'/submit',body,role=role);assert status==422 and 'required_evidence_missing' in json.dumps(err),str(err);return '草稿读回rate=82，缺证提交422'
  self.check('B04 分支填报草稿及缺证拒绝',draft,role=role)
  def submit():
   body['items'][0]['fileIds']=[self.state['file']['fileId']];d=self.require('POST',p+'/submit',body,role=role);assert d['status']=='SUBMITTED';self.state['reporting']=d
   d=self.require('POST',p+'/recall',role=role);assert d['status']=='RECALLED';d=self.require('POST',p+'/submit',body,role=role);assert d['status']=='SUBMITTED';return '真实证据提交、复核前撤回和重提均成功'
  self.check('B05 分支举证提交撤回及重提',submit,role=role,severity='P1')
  def review():
   rows=self.require('GET','/api/assessment/review-tasks?pageSize=100')['items'];d=next(x for x in rows if x['cycleId']==cid);self.state['reviewId']=d['reviewTaskId'];rp='/api/assessment/review-tasks/'+d['reviewTaskId']
   d=self.require('POST',rp+'/start');assert d['status']=='IN_REVIEW';self.state['review']=d;self.require('POST',p+'/recall',role=role,expect=(409,))
   self.require('POST','/api/assessment/cycles/'+cid+'/generate-results',expect=(409,));return 'HQ任务可见、开始复核，branch撤回和提前生成结果均拒绝'
  self.check('B06 总部开始复核及状态门槛',review,severity='P1')

 def review_main(self):
  if self.state.get('appealCycleBlocked'):raise RuntimeError('扣分周期前置失败；禁止复用上一周期任务重跑')
  admin='platform_admin';branch='branch_business';cid=self.state['cycle']['cycleId'];p='/api/assessment/reporting-tasks/'+self.state['reportingId'];prefix=self.state['prefix']
  rows=self.require('GET','/api/assessment/review-tasks',role=admin)['items'];review=next(x for x in rows if x['cycleId']==cid);rid=review['reviewTaskId'];self.state['reviewId']=rid;rp='/api/assessment/review-tasks/'+rid
  def hq_scope():
   detail_status,_=self.call('GET',rp);start_status,_=self.call('POST',rp+'/start');assert detail_status==200 and start_status==200,f'HQ详情{detail_status}、开始{start_status}；任务assigneeUserId={review.get("assigneeUserId")}，已发布工作流明确指定HQ账号'
  self.check('B07 HQ按方案工作流应可复核',hq_scope,severity='P1',code='domain/review_store.py:291-324,776-790')
  def return_flow():
   d=self.require('POST',rp+'/start',role=admin);assert d['status']=='IN_REVIEW';self.require('POST',p+'/recall',role=branch,expect=(409,));self.require('POST','/api/assessment/cycles/'+cid+'/generate-results',role=admin,expect=(409,))
   self.require('POST',rp+'/decision',{'decision':'RETURN_TO_BRANCH'},role=admin,expect=(422,))
   d=self.require('POST',rp+'/decision',{'decision':'RETURN_TO_BRANCH','decisionReason':prefix+'请补充依据'},role=admin);assert d['status']=='RETURNED_TO_BRANCH';d=self.require('GET',p,role=branch);assert d['status']=='RETURNED'
   body={'items':[{'responseItemId':d['items'][0]['responseItemId'],'value':{'rate':85},'comment':prefix+'补证重提','fileIds':[self.state['file']['fileId']]}]}
   d=self.require('POST',p+'/submit',body,role=branch);assert d['status']=='SUBMITTED';d=self.require('GET',rp,role=admin);assert d['status']=='PENDING';return '管理员开始复核、退回原因门槛、退回、branch补证85分重提、复核重置PENDING'
  self.check('B08 管理员复核退回及分支重提',return_flow,role=admin,severity='P1')
  def approve():
   d=self.require('POST',rp+'/start',role=admin);self.require('POST',rp+'/decision',{'decision':'APPROVE'},role=admin,expect=(422,))
   item=d['items'][0];d=self.require('PATCH',rp,{'items':[{'reviewItemId':item['reviewItemId'],'preliminaryScore':100,'reviewed':True,'comment':prefix+'初评100扣减20分'}],'scoreAdjustments':[{'reviewItemId':item['reviewItemId'],'adjustmentType':'MANUAL','scoreDelta':-20,'reason':prefix+'证据扣减20分'}]},role=admin);assert d['items'][0]['finalScore']==80
   d=self.require('POST',rp+'/decision',{'decision':'APPROVE','decisionReason':prefix+'复核完成'},role=admin);assert d['status']=='APPROVED';self.state['review']=d
   d=self.require('GET',p,role=branch);assert d['status']=='ACCEPTED';return '未逐项评分不得通过；管理员核定80分并通过，分支任务ACCEPTED'
  self.check('B09 管理员评分通过并分支读回',approve,role=admin,severity='P1')

 def appeal_cycle(self):
  prefix=self.state['prefix'];branch='branch_business';old=self.state['result'];p='/api/assessment/results/'+old['resultId']
  def close_unchanged():
   self.require('POST',p+'/appeals',{'reason':prefix+'无扣分不能申诉','items':[{'resultItemId':old['items'][0]['resultItemId'],'requestedScore':90,'reason':'无扣分边界'}],'fileIds':[self.state['file']['fileId']]},role=branch,expect=(409,))
   self.require('POST',p+'/confirm',{'comment':prefix+'无扣减原始结果确认'},role=branch);self.require('POST',p+'/finalize');self.require('POST','/api/assessment/cycles/'+self.state['cycle']['cycleId']+'/archive',{'reason':prefix+'无扣分链归档'});return '80原始分/80最终分无扣减，申诉409符合规则；确认定稿归档成功'
  self.check('B15 无扣分结果拒绝申诉并归档',close_unchanged,role=branch)
  self.state['firstCompletedCycle']=self.state['cycle'];self.state['firstCompletedResult']=old
  def create():
   self.state['appealCycleBlocked']=True
   d=self.require('POST','/api/assessment/cycles',{'cycleCode':prefix+'-APPEAL','cycleName':prefix+'扣分申诉周期','schemeId':self.state['scheme']['schemeId'],'year':2026,'periodStart':'2026-10-01','periodEnd':'2026-10-31','targetOrgIds':['WLZQ-RBC-GZ-NANSHA']});self.state['cycle']=d;assert d['cycleId']!=old['cycleId'],'新周期复用了既有已归档周期ID'
   d=self.require('POST','/api/assessment/cycles/'+d['cycleId']+'/dispatch',{'dueDate':'2026-10-31','message':prefix+'扣分链下发'});self.state['cycle']=d;self.state['reportingId']=d['reportingTasks'][0]['reportingTaskId'];self.state.pop('result',None);self.state['appealCycleBlocked']=False;return '新建独立扣分申诉周期，不修改既有发布结果'
  self.check('B16 创建扣分申诉补测周期',create)

 def results_main(self):
  if self.state.get('appealCycleBlocked'):raise RuntimeError('扣分周期前置失败；禁止复用上一周期结果重跑')
  cid=self.state['cycle']['cycleId'];cp='/api/assessment/cycles/'+cid;branch='branch_business';prefix=self.state['prefix']
  def publish():
   d=self.require('POST',cp+'/generate-results');result=d['results'][0];assert result['status']=='GENERATED' and result['totalScore']==80;self.state['result']=result;rid=result['resultId']
   d=self.require('POST',cp+'/publish-results');assert d['results'][0]['status']=='PUBLISHED'
   d=self.require('GET','/api/assessment/results/'+rid,role=branch);assert d['totalScore']==80 and d['confirmationStatus']=='PENDING_CONFIRMATION';self.state['result']=d;return 'HQ生成发布80分，branch独立读取80分且待确认'
  self.check('B10 总部生成发布结果及分值读回',publish,severity='P1')
  if 'result' not in self.state:return
  result=self.state['result'];rid=result['resultId'];rp='/api/assessment/results/'+rid
  def grade():
   scheme=self.require('GET','/api/assessment/schemes/'+self.state['scheme']['schemeId']);d=self.require('GET',rp);assert d['gradeCode']=='PASS',f'方案gradeThresholds={scheme["gradeThresholds"]}，实际80分gradeCode={d["gradeCode"]}'
  self.check('B11 结果等级应服从发布方案',grade,severity='P2',code='domain/result_store.py:468-480')
  def appeal():
   body={'reason':prefix+'评分申诉','items':[{'resultItemId':result['items'][0]['resultItemId'],'requestedScore':90,'reason':prefix+'补充证据要求90分'}],'fileIds':['FILE-NOT-EXIST-'+prefix]}
   self.require('POST',rp+'/appeals',body,role=branch,expect=(404,));body['fileIds']=[self.state['file']['fileId']]
   d=self.require('POST',rp+'/appeals',body,role=branch);self.state['appeal']=d;assert d['status']=='SUBMITTED';self.require('POST',rp+'/finalize',expect=(409,));self.require('POST',rp+'/confirm',{'comment':prefix+'不能确认'},role=branch,expect=(409,));return '无效附件404，真实附件申诉成功；开放申诉阻止定稿和确认'
  self.check('B12 分支申诉及开放申诉状态保护',appeal,role=branch,severity='P1')
  if 'appeal' not in self.state:return
  def decide():
   appeal=self.state['appeal'];ap='/api/assessment/score-appeals/'+appeal['scoreAppealId']+'/decision';body={'decision':'ADOPTED','decisionReason':prefix+'核实采纳','items':[{'scoreAppealItemId':appeal['items'][0]['scoreAppealItemId'],'adoptedScore':90}]}
   d=self.require('POST',ap,body);assert d['status']=='ADOPTED';d=self.require('GET',rp,role=branch);assert d['totalScore']==90 and d['confirmationStatus']=='PENDING_CONFIRMATION';self.state['result']=d;return '总部采纳90分；分支读回总分90且重新待确认'
  self.check('B13 总部裁决及总分重新计算',decide,severity='P1')
  def close():
   d=self.require('POST',rp+'/confirm',{'comment':prefix+'确认90分'},role=branch);assert d['confirmationStatus']=='CONFIRMED'
   d=self.require('POST',rp+'/finalize');assert d['status']=='FINALIZED' and len(d['archives'])==1;self.state['result']=d
   d=self.require('POST',cp+'/archive',{'reason':prefix+'完整链归档'});assert d['status']=='ARCHIVED';self.state['cycle']=d
   d=self.require('GET',rp,role=branch);assert d['status']=='FINALIZED' and d['totalScore']==90;d=self.require('GET',cp);assert d['status']=='ARCHIVED';return '分支确认90分→总部定稿生成1份档案→周期ARCHIVED；独立GET一致'
  self.check('B14 分支确认总部定稿与周期归档',close,severity='P1')

 def collision_evidence(self):
  self.state['appealCycleBlocked']=True
  d=self.require('GET','/api/assessment/cycles/ACYC-0002');self.state['cycleCollision']=d
  self.db('SELECT cycle_id,cycle_code,status FROM assessment_cycles; SELECT cycle_target_id,cycle_id,target_status FROM assessment_cycle_targets; SELECT review_task_id,status FROM assessment_review_tasks; SELECT result_id,status,total_score,grade_code FROM assessment_results;')
  print({k:d[k] for k in ['cycleId','cycleCode','status','targetCount']})
  def objects():
   for role in ['department_business','external_lawyer']:
    for path in ['/api/assessment/reporting-tasks/ACYC-0002-REPORT-001','/api/assessment/review-tasks/ACYC-0002-REPORT-001-REVIEW','/api/assessment/results/ACYC-0002-TARGET-001-RESULT']:
     self.require('GET',path,role=role,expect=(403,))
    self.require('POST','/api/assessment/results/ACYC-0002-TARGET-001-RESULT/confirm',{'comment':'denied'},role=role,expect=(403,));self.require('POST','/api/assessment/review-tasks/ACYC-0002-REPORT-001-REVIEW/start',role=role,expect=(403,))
   self.require('POST','/api/assessment/review-tasks/ACYC-0002-REPORT-001-REVIEW/start',role='branch_business',expect=(403,));self.require('POST','/api/assessment/results/ACYC-0002-TARGET-001-RESULT/finalize',role='branch_business',expect=(403,));return '部门/律师现存填报、复核、结果详情及确认/复核操作403；branch总部操作403'
  self.check('B17 现存任务结果五角色拒绝边界',objects,role='department_business/external_lawyer/branch_business',severity='P1')

 def readback(self):
  def verify():
   s=self.require('GET','/api/assessment/schemes/ASCH-0006');assert s['status']=='ACTIVE'
   w=self.require('GET','/api/workflow/templates/WFT-ASSESS-DEFAULT');assert w['currentVersionId']=='WFT-ASSESS-DEFAULT-V001'
   c=self.require('GET','/api/assessment/cycles/ACYC-0002');assert c['cycleCode'].endswith('-APPEAL') and c['status']=='DRAFT' and c['targetCount']==1
   r=self.require('GET','/api/assessment/results/ACYC-0002-TARGET-001-RESULT',role='branch_business');assert r['status']=='FINALIZED' and r['totalScore']==80 and len(r['archives'])==1
   self.state['postRestart']={'scheme':s,'workflow':w,'cycle':c,'result':r};return '主任务重启后：ACTIVE方案/发布路由/FINALIZED80分及1份档案均保留；碰撞损坏的父周期APPEAL/DRAFT同样持久化'
  self.check('B18 主任务重启后考核数据读回',verify)

 def final_report(self):
  doc=ROOT/'docs/testing/regression-assessments.md';initial=EVIDENCE/'assessments-report-initial.md'
  if not initial.exists():initial.write_text(doc.read_text(encoding='utf-8'),encoding='utf-8')
  original={r['name']:dict(r) for r in self.state['results'] if r['name'].startswith(('A','AUTH')) and '拒绝现存指标详情' not in r['name']}
  old_blocks=[r for r in original.values() if r['status']=='BLOCKED']
  effective=[r for r in original.values() if r['status']!='BLOCKED']
  chosen=[]
  for key in ['B01','B02','B03','B04','B05','B07','B08','B09','B10','B11','B15','B16','B17','B18']:
   candidates=[dict(r) for r in self.state['results'] if r['name'].startswith(key+' ')]
   passed=[r for r in candidates if r['status']=='PASS'];chosen.append(passed[0] if passed else candidates[0])
  for key,name in [('B12','分支扣分申诉及开放申诉保护'),('B13','总部申诉裁决及重新计分'),('B14','申诉后确认定稿归档')]:
   chosen.append({'name':key+' '+name,'status':'BLOCKED','role':'branch_business/hq_business','severity':'—','detail':'首周期无scoreAdjustment扣减，409拒绝申诉符合规则；创建扣分周期发生ACYC-0002主键碰撞，无法取得合法新任务继续。'})
  effective+=chosen
  for r in effective:
   if r['name'].startswith('A10 '):r['severity']='P1'
  counts={x:sum(r['status']==x for r in effective) for x in ['PASS','FAIL','BLOCKED']}
  self.state['initialCounts']={'PASS':53,'FAIL':4,'BLOCKED':9};self.state['finalResults']=effective;self.state['counts']=counts
  self.state['excludedSupplementalRequests']={'225-229':'发布返回template包裹层的测试解包错误；HTTP发布成功，240独立GET核验。','328-329':'初始结果originalScore=finalScore=80，没有可申诉扣减；409符合规则，340作为合法边界PASS。','357-388':'第二周期创建前置失败后误跑上一周期已结束任务；不覆盖首次B04/B05/B08/B09/B10真实通过。B07及B11首轮有效证据保留。'}
  self.save()
  text=f'''# 合规考核五角色 HTTP 回归：补测最终报告

日期：2026-10-03。最终有效检查 **{counts['PASS']} PASS / {counts['FAIL']} FAIL / {counts['BLOCKED']} BLOCKED**。共6个产品问题：5个P1、1个P2。首轮原始统计53/4/9及逐项证据保留在文末；已解除的前置阻塞不重复计入最终统计。同名补测按场景选取有效记录，原始请求和失败记录均未删除。

## 最终业务结论

- 已通过正常API备份、配置和发布 `WFT-ASSESS-DEFAULT-V001`；自建方案 `ASCH-0006` 成为ACTIVE。首轮“不能改共享初始模板”的测试安排已解除，不再作为终止理由。
- 首个合法持久化周期ACYC-0002：下发→分支草稿/缺证拒绝→真实证据提交/撤回/重提→管理员复核退回→分支补证→管理员核定80分通过→HQ结果生成发布→branch确认→HQ定稿→周期归档，均有真实HTTP与状态证据。
- **HQ业务复核链失败**：已绑定路由明确指定HQ账号，但任务assignee=NULL，HQ列表空、详情和start均403。管理员补测仅证明其权限下后续流程可走通，不计为HQ业务完成。
- 扣分申诉仍受阻：首周期初评80分、最终80分，没有调整扣减，409拒绝申诉符合当前规则。为准备“初评100、扣减20、申诉90”场景另建周期，发现ID碰撞覆盖已归档周期，无法取得新的合法填报任务。没有绕过状态或直接写DB。
- 未改产品代码、账号或角色；仅授权修改并发布初始工作流，原始快照及改动清单见本地证据。主任务统一重启backend后，本任务重新登录核验方案、工作流、结果及档案保留；碰撞造成的父周期错误状态也已持久化。
- ASMT-03现已由主任务真实重启证实：UI创建的LEDGER-0002、title=REG-20261003-UI-LEDGER重启前可见、重启后消失。证据`.local/regression/readback-before.json`和`readback-after.json`的READ-03。此为原台账未落库缺陷的补充证据，不重复计缺陷。

## 新发现的问题

### ASMT-04 / P1：工作流指定HQ审批人，生成的复核任务却无分派人

角色hq_business。最小复现：发布四节点工作流（L0指定branch，其余指定HQ）→绑定自建方案→创建下发周期→branch提交。GET `/api/assessment/review-tasks`为空；从管理员取得真实ID后HQ GET详情及POST start均403（请求264、287–288）。

预期：配置的HQ审批人能看到和处理复核。实际：管理员可见该任务，DB `assessment_review_tasks.assignee_user_id`为空，HQ无法继续。源码`backend/app/modules/compliance/domain/review_store.py:24,291–324`使用旧用户`USER-HQ-COMP-001`及旧组织`WLZQ-HQ-COMPLIANCE`，未从绑定工作流取本次HQ账号；权限判断在776–790。管理员旁路不消除此缺陷。

### ASMT-05 / P2：结果等级忽略方案已发布的等级区间

角色hq_business/branch_business。方案快照只有`gradeCode=PASS,minScore=0,maxScore=null`，故80分应为PASS；生成结果却为B（请求326–327）。源码`domain/result_store.py:468–480`硬编码90/75/60分段与A/B/C/D，未读取方案gradeThresholds。分值80本身与管理员复核一致。

### ASMT-06 / P1：新增周期复用已归档周期ID并覆盖父记录

角色hq_business。最小复现状态为“仅有持久化ACYC-0002”（早前失败的幽灵ACYC-0001已在hydrate时被移除）。

1. 请求343：原`REG-20261003-ASMT-e78d6c-MAIN`周期ACYC-0002归档返回200 ARCHIVED。
2. 请求344：POST `/api/assessment/cycles`，新唯一cycleCode=`REG-20261003-ASMT-e78d6c-APPEAL`，同一个ACTIVE方案、合法日期/组织。预期新独立ID；实际200返回已有ACYC-0002和DRAFT。
3. 请求345：POST `/cycles/ACYC-0002/dispatch`返回409 `Cycle has already been dispatched`。
4. 请求399 GET与只读SQL核实：父记录code已被新值覆盖、status=DRAFT；旧target=CLOSED、review=APPROVED、result=FINALIZED,totalScore=80,grade=B仍挂在同一ID。

源码`domain/cycle_store.py:142`用`len(self.cycles)+1`生成ID，`repositories/assessment_runtime.py:187`使用merge更新同一主键。该操作造成业务数据不一致，是新合法请求触发的产品缺陷。没有尝试删除、强改DB或重复创建来人为修正。扣分申诉、裁决、申诉后归档因此BLOCKED。

## 补测逐项结果

| 检查/场景 | 角色 | 结论 | 请求证据 | 预期与实际 |
|---|---|---|---|---|
'''
  for r in chosen:
   seq=f"{r.get('requestStart')}–{r.get('requestEnd')}" if r.get('requestStart') else '未执行'
   detail=str(r['detail']).replace('|','/').replace('\n',' ')[:500]
   text+=f"| {r['name']} | {r['role']} | {r['status']} | {seq} | {detail} |\n"
  text+='''

## 证据、数据现状与执行记录

- HTTP/SQL总证据：`.local/regression/assessments-state.json`，包含requests、databaseEvidence、原始results、finalResults、counts与明确排除的测试准备错误。
- 工作流原始模板/版本：`.local/regression/assessments-workflow-before.json`（publishedVersion原为空）。改动清单：`assessments-workflow-change-list.json`。初始校验3个EMPTY_APPROVER_SET，按现有五账号配置USER选择器后校验0错误并正常发布；角色和账号未更改。
- 执行命令：`python -X utf8 scripts/regression/assessments.py prepare_workflow`、`reporting_main`、`review_main`、`results_main`、`appeal_cycle`、`collision_evidence`。SQL全在BEGIN READ ONLY事务中完成。补测仍仅修改脚本、报告和本地证据。
- 当前可用于主任务重启核验：scheme ASCH-0006 ACTIVE；workflow WFT-ASSESS-DEFAULT-V001；cycle ACYC-0002（被碰撞覆盖为APPEAL/DRAFT）；reporting ACYC-0002-REPORT-001 ACCEPTED；review ACYC-0002-REPORT-001-REVIEW APPROVED；result ACYC-0002-TARGET-001-RESULT FINALIZED/80/B。要核查的是保存后的实际状态，不将已覆盖的父周期宣称仍ARCHIVED。
- B01初次脚本误读发布包裹层，HTTP发布已成功，随后GET校正；不计产品失败。第二周期前置失败后对上一周期已结束对象的后续误跑返回409，排除这些连带测试准备错误，不覆盖首周期真实通过。B06空列表与B07明确403属同一HQ分派问题，最终只计B07。
- B12首次无扣分申诉409为规则拒绝，B15明确验证其边界并完成无申诉归档；其后扣分申诉流程仍未测通，绝不改记通过。测试脚本已加前置保护，避免继续复用旧对象。

---

## 首轮历史报告（保留原始统计与当时边界，非最终结论）

'''
  doc.write_text(text+initial.read_text(encoding='utf-8').replace('# 合规考核五角色 HTTP 回归','### 首轮合规考核五角色 HTTP 回归',1),encoding='utf-8');print(json.dumps(counts));print('final report written')

 def report(self):
  # Keep failed setup attempts in raw evidence; exclude them from product verdicts.
  latest={r['name']:dict(r) for r in self.state['results'] if '拒绝现存指标详情' not in r['name']}
  for r in latest.values():
   if r['name'].startswith('A10 '):r['severity']='P1'
  self.state['finalResults']=list(latest.values());self.state['excludedSetupRequests']={'55':'请求Grade最后一个区间错误设置maxScore；已修正并在77-78通过。','131,140':'不存在GET /indicators/{id}路由，404不是权限检验；删除此测试，保留真实列表/新增权限断言。','95':'HQ读取branch专属填报列表403；诊断脚本改为branch读取，不记产品缺陷。'}
  counts={x:sum(r['status']==x for r in latest.values()) for x in ['PASS','FAIL','BLOCKED']};self.state['counts']=counts;self.save()
  head=f'''# 合规考核五角色 HTTP 回归

日期：2026-10-03（Asia/Shanghai）。API：`http://127.0.0.1:8010`。独立测试前缀：`{self.state['prefix']}`。

## 结论与边界

最终有效检查 **{counts['PASS']} PASS / {counts['FAIL']} FAIL / {counts['BLOCKED']} BLOCKED**。4项失败归为3个P1产品问题；缺少可绑定的已发布工作流另列环境/能力阻塞。指标规则、方案草稿与幂等/并发保护、附件上传、台账内存内CRUD、现有对象权限与跨机构拒绝已执行。完整考核链未完成，不能宣称业务回归通过。

只运行真实HTTP、只读SQL及日志核查；未改产品代码、种子、共享角色或账号，未重启服务。新建记录均带前缀；两个测试台账已软删除，指标、草稿方案、证据文件保留供复核。未执行构建、类型检查或后端单元测试，本报告不代表这些检查通过。因约束不重启，未声称验证重启读回；台账未落库是直接SQL证据。

五角色：platform_admin（平台管理员、HQ）、hq_business（总部业务、HQ）、branch_business（南沙分公司）、department_business（部门业务、HQ）、external_lawyer（外部律师）。账号凭据来自本地开发账号文件，仅内存使用；登录与身份响应在请求证据中脱敏。

## P1缺陷

### ASMT-01：API内存种子方案与数据库不一致，合法周期创建500，首次保存后种子列表消失

- 检查：A10、A32；角色：hq_business；请求证据66、77–81、202。
- 最小复现：GET `/api/assessment/schemes`选择返回的ACTIVE `ASCH-SEED-2026`；POST `/api/assessment/cycles`，body为 `{{"cycleCode":"<prefix>-CYCLE","cycleName":"<prefix>周期","schemeId":"ASCH-SEED-2026","year":2026,"periodStart":"2026-10-01","periodEnd":"2026-10-31","targetOrgIds":["WLZQ-RBC-GZ-NANSHA"]}}`。
- 预期：可引用返回的已启用方案创建DRAFT周期。实际：HTTP500，日志明确 `assessment_cycles_scheme_id_fkey`，`ASCH-SEED-2026`不在`assessment_schemes`表。
- 再保存独立草稿`ASCH-0006`成功，随后GET schemes只剩该DRAFT。最初返回的5个种子方案全部消失，包括3个ACTIVE方案；期间未调用删除种子接口。
- 已核验代码：`backend/app/modules/compliance/api/routes/assessment.py:693–709`、`repositories/assessment_runtime.py:112–118,174–198`；hydrate在DB空时保留内存种子，DB非空时整体替换。
- 下游：无法创建合法且落库的周期，阻断下发及其后业务。环境已改变，复现初始500需要相同“DB无方案、运行时有种子”初态；勿通过删除当前数据重造初态。

### ASMT-02：周期落库失败后仍返回未提交的幽灵周期

- 检查：A15；角色：hq_business；GET证据175–176及databaseEvidence。
- 最小复现：接ASMT-01周期POST500后GET `/api/assessment/cycles`和`/api/assessment/cycles/ACYC-0001`。
- 预期：失败写入不进入后续业务视图。实际：HTTP200返回前缀周期ACYC-0001、DRAFT；只读SQL `SELECT cycle_id,cycle_code,status FROM assessment_cycles`为0行。
- 已核验代码：`domain/cycle_store.py:128–167`先修改内存；`api/routes/assessment.py:700–709`随后持久化；`repositories/assessment_runtime.py:120–126`在0行时直接返回，未清除失败内存记录。
- 下游：页面可能显示创建失败的周期；本次未沿此未提交对象继续执行下发并冒充成功链。

### ASMT-03：履职台账创建/编辑成功但未落库

- 检查：A27；角色：branch_business；HTTP证据107–110，databaseEvidence中ledger查询。
- 最小复现：POST `/api/assessment/daily-ledger`（前缀title、occurredDate=2026-10-03、status=AVAILABLE、真实fileIds），PATCH `/daily-ledger/LEDGER-0001`编辑说明，GET列表。
- 预期：成功响应的数据进入持久化库。实际：POST/PATCH/GET均200且字段一致，但 `SELECT ledger_entry_id,title,status FROM daily_compliance_ledger_entries WHERE ledger_entry_id='LEDGER-0001'`为0行。
- 已核验代码：`api/routes/assessment.py:1129–1194`未接session或仓储；`domain/reporting_store.py:255–335`仅修改内存字典。
- 下游：作为后续填报复用的台账缺少数据库保障；重启丢失的实际行为本次未执行，不能将其写为已回归事实。

## 环境/能力阻塞 B-ASMT-01

A09 BLOCKED：`GET /api/workflow/templates`仅返回`WFT-ASSESS-DEFAULT` DRAFT，currentVersionId和publishedVersion均空。方案发布返回422 `workflow_route_required`，符合门槛要求。工作流路由只有查询、修改、校验、发布（`api/routes/workflow.py:37,49,66,87,106`），无新建/复制接口；当前回归禁止改共享种子，因此没有可绑定的发布版本可将新方案启用。不能把门槛正确拒绝本身当产品缺陷。

A16–A23均BLOCKED：无合法且持久化的周期，未执行下发、填报缺证校验/举证提交/撤回、复核退回/重提/通过、计算结果、申诉裁决、确认定稿和归档。结果/复核具体对象的越权写入以及跨组织任务范围也因此未验证；仅其列表权限已实测。

## 每项检查与请求证据

证据序号对应 `.local/regression/assessments-state.json` 的requests.seq。SQL核查记为DB。HTTP摘要只用于定位；PASS还要求脚本内状态、字段、样例分值或数据未改变断言。

| 检查 | 角色 | 结论 | 严重性 | 请求/响应摘要 | 预期与实际 |
|---|---|---|---|---|---|
'''
  rows=[]
  for r in latest.values():
   a,b=r.get('requestStart',0),r.get('requestEnd',0)
   reqs=[x for x in self.state['requests'] if a and a<=x['seq']<=b]
   evidence='；'.join(f"#{x['seq']} {x['method']} {x['path'].replace('/api/assessment/','')} → {x['http']}" for x in reqs) or ('DB' if r['status']=='FAIL' else '未执行：上游阻断')
   if r['status']=='PASS' and r['name'].startswith('AUTH '):
    detail='预期403拒绝；实际全部403' if reqs and all(x['http']==403 for x in reqs) else '预期管理员可读取该列表；实际200且成功解包业务响应（不代表下游流程通过）' if '平台管理员读取' in r['name'] else str(r['detail'])
   else:detail=str(r['detail'])
   detail=detail.replace('|','/').replace('\n',' ')[:450]
   rows.append(f"| {r['name']} | {r['role']} | {r['status']} | {r['severity']} | {evidence} | {detail} |")
  footer='''

## 代码核验与执行记录

- 请求DTO与合法流程：`backend/app/modules/compliance/schemas/assessment.py`，路由`api/routes/assessment.py`，业务`domain/indicator_store.py`、`scheme_store.py`、`cycle_store.py`、`reporting_store.py`、`review_store.py`、`result_store.py`。
- 权限校验：指标`indicator_store.py:769–782`，方案`scheme_store.py:2726–2739`，台账及组织范围`reporting_store.py:552,745,789`，复核`review_store.py:806`，结果`result_store.py:794–811`。权限拒绝实际得到403，并独立读取确认越权写入未生效；没有将422/500当拒绝通过。
- 已运行阶段：`python -X utf8 scripts/regression/assessments.py discover`、`indicator`、`scheme`、`cycle`、`diagnostics`、`ledger`、`permissions`、`boundaries`。脚本按阶段保留状态，证据中的旧失败不覆盖；报告取有效检查的最新结果。
- 只读SQL：通过`docker compose --env-file deploy/local/.env -f deploy/local/compose.yaml exec -T postgres psql -U postgres -d compliance_business`执行`BEGIN READ ONLY; ... COMMIT;`，查询方案、周期和测试台账，未执行更新。
- 日志：`docker compose ... logs --tail 6000 backend`筛出周期外键异常，存`.local/regression/assessments-cycle-error.txt`。未将其他并行回归的异常归到本模块。
- 原始HTTP证据：`.local/regression/assessments-state.json`；复现脚本：`scripts/regression/assessments.py`。这些本地证据不含密码/token。

## 测试准备纠正（不计产品失败）

1. 首次A06请求55将最终等级区间maxScore设置为100，违反“终止区间无上界”；删除maxScore后请求77–78成功。
2. 请求131/140访问了不存在的指标详情GET路由，404不能证明对象权限；已移除该检查。真实指标列表/新增权限通过403验证。
3. 诊断脚本初次用HQ请求branch专属填报列表获403，改用branch后读取成功。此项不作为产品缺陷。
'''
  (ROOT/'docs/testing/regression-assessments.md').write_text(head+'\n'.join(rows)+footer,encoding='utf-8');print(json.dumps(counts));print('report written')

def main():
 parser=argparse.ArgumentParser();parser.add_argument('phase',nargs='?',default='discover');args=parser.parse_args();r=Regression()
 if args.phase not in ('report','final_report'):r.login()
 getattr(r,args.phase)();r.save()
if __name__=='__main__':main()
