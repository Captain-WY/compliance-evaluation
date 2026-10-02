import DevelopmentNotice from '../platform/DevelopmentNotice';
import {useEffect} from 'react';
import {Navigate,NavLink,useLocation} from 'react-router-dom';
import {LogOut,Shield} from 'lucide-react';
import {useAuth} from '../platform/AuthProvider';
import LoginPage from '../modules/compliance-shared/features/auth/LoginPage';
import {HQ_MENU_GROUPS,BRANCH_MENU_GROUPS} from '../modules/compliance-shared/constants/menu';
import {OffsiteInspectionProvider} from '../modules/compliance-shared/contexts/OffsiteInspectionContext';
import CasesPage from '../modules/cases/CasesPage';
import InspectionPage from '../modules/inspections';
import AssessmentPage from '../modules/assessments';
import {SystemAdministration,ComplianceAdministration} from '../modules/system';
import legacy from './legacy-routes.json';
const assessments=new Set(['hq-indicators','hq-rules','hq-workflow-center','hq-review','hq-assessment-dashboard','hq-workflow-designer','hq-scheduler','hq-unified-workbench','hq-data-cockpit','branch-reporting','branch-self-assessment','branch-daily-ledger','dispatch-detail']);
const ceAliases:Record<string,string>={'/review':'/assessments/hq-review','/issue-hub':'/inspections/hq-issue-hub','/dispatch-detail':'/assessments/dispatch-detail','/hq/inspection/plans':'/inspections/hq-plans','/hq/system/dictionaries':'/system/hq-dictionaries','/hq/assessment/workflow-designer':'/assessments/hq-workflow-designer','/hq/assessment/review-workbench':'/assessments/hq-unified-workbench','/hq/assessment/scheduler':'/assessments/hq-scheduler','/hq/assessment/data-cockpit':'/assessments/hq-data-cockpit'};
const legacyCases=new Set(['inbox','finance','knowledge','reports','clues','vendors','intelligence','approvals','notifications','report','tasks']);
function Unavailable({message='此旧入口尚无等价页面，已登记为后续建设项。'}:{message?:string}){return <div className="rounded-lg border border-slate-200 bg-white p-6" role="alert"><h1 className="text-xl font-semibold mb-2">页面不可用</h1><p className="text-sm text-slate-600">{message}</p></div>;}
export default function App(){
 const {user,isLoading,logout}=useAuth();const location=useLocation();
 useEffect(()=>{document.title='合规与案件管理平台';},[]);
 if(isLoading)return <div className="p-8" role="status">正在验证登录会话…</div>;
 if(!user)return <LoginPage/>;
 const admin=user.role_codes.includes('platform_admin');const lawyer=user.role_codes.includes('external_lawyer');const ceAllowed=admin||user.role_codes.some(r=>['hq_business','branch_business'].includes(r));const branch=user.role_codes.includes('branch_business');
 // Parse old hash paths before fixed aliases and entity routes; preserve only reviewed query fields.
 const raw=location.hash.startsWith('#/')?location.hash.slice(1):location.pathname+location.search;
 const url=new URL(raw,window.location.origin);const path=url.pathname.replace(/^\/compliance(?=\/)/,'');
 const alias=legacy.find(entry=>entry.source===path);
 if(alias?.target){const target=new URL(alias.target,window.location.origin);for(const key of ['issueId','namespace','type','code','keyword','status','instanceId','schemeId','planId','taskId']){const value=url.searchParams.get(key);if(value&&!target.searchParams.has(key))target.searchParams.set(key,value);}if(path==='/dispatch')target.searchParams.set('tab','archived');return <Navigate replace to={target.pathname+target.search}/>;}
 if(path.startsWith('/hq/inspection/plans/'))return <Navigate replace to={'/inspections/hq-plans/'+path.slice('/hq/inspection/plans/'.length)+url.search}/>;
 if(ceAliases[path])return <Navigate replace to={ceAliases[path]+url.search}/>;
 if(location.hash.startsWith('#/'))return <Navigate replace to={path==='/'?'/cases':path+url.search}/>;
 if(path==='/'||path==='/login')return <Navigate replace to="/cases"/>;
 if(path==='/admin')return <Navigate replace to={'/system/admin'+url.search}/>;
 const oldRoot=path.split('/')[1];if(!alias?.gap && legacyCases.has(oldRoot))return <Navigate replace to={'/cases'+path+url.search}/>;
 const module=path.split('/')[1];const menu=path.split('/')[2]||'';
 if(path==='/inspections')return <Navigate replace to={`/inspections/${branch?'branch-upload':'hq-plans'}`}/>;
 if(path==='/assessments')return <Navigate replace to={`/assessments/${branch?'branch-reporting':'hq-rules'}`}/>;
 if(path==='/system')return <Navigate replace to="/system/admin"/>;
 const ceMenus=(branch?BRANCH_MENU_GROUPS:HQ_MENU_GROUPS).flatMap(g=>g.items).filter(item=>user.permittedMenuIds.includes(item.id));
 const navigation=module==='cases'?(lawyer?[['/cases','律师工作台']]:user.role==='BUSINESS_UNIT'?[['/cases','我的上报记录'],['/cases/report','上报线索'],['/cases/tasks','协查任务']]:[['/cases','案件列表'],['/cases/clues','线索管理'],['/cases/report','上报线索'],['/cases/new','新建案件'],['/cases/approvals','审批中心'],['/cases/inbox','智能收件箱'],['/cases/finance','财务中心'],['/cases/reports','报告与监管'],['/cases/vendors','外聘律所'],['/cases/knowledge','知识资源'],['/cases/notifications','通知记录']]):module==='system'?[['/system/admin?tab=dict','公共字典'],['/system/admin?tab=role','角色管理'],['/system/admin?tab=menu','菜单管理'],['/system/admin?tab=process','流程模板'],['/system/hq-org','组织与权限范围'],['/system/hq-dictionaries','合规受保护字典']]:ceMenus.filter(item=>!['hq-org','hq-dictionaries'].includes(item.id)&&(module==='assessments'?assessments.has(item.id):!assessments.has(item.id))).map(item=>[`/${module}/${item.id}`,item.label]);
 let content;
 if(alias?.gap)content=<Unavailable/>;
 else if(module==='cases')content=<CasesPage/>;
 else if(module==='system')content=admin?(menu==='admin'?<SystemAdministration/>:['hq-org','hq-dictionaries'].includes(menu)?<ComplianceAdministration menuId={menu}/>:<Unavailable/>):<Unavailable message="当前账号没有系统管理权限。"/>;
 else if(['inspections','assessments'].includes(module))content=ceAllowed&&(user.permittedMenuIds.includes(menu)||(menu==='dispatch-detail'&&user.permittedMenuIds.includes('hq-workflow-center')))?module==='inspections'?<InspectionPage menuId={menu}/>:<AssessmentPage menuId={menu}/>:<Unavailable message="当前账号没有此业务入口的权限。"/>;
 else content=<Unavailable/>;
 return <div className="min-h-screen bg-slate-50 text-slate-900"><header className="border-b border-slate-800 bg-slate-950 text-white"><div className="flex flex-wrap items-center gap-4 px-5 py-3"><div className="flex items-center gap-2 font-semibold"><Shield size={20}/>合规与案件管理平台</div><nav aria-label="一级导航" className="flex flex-wrap gap-1">{[['cases','案件管理'],...(ceAllowed?[['inspections','合规检查'],['assessments','合规考核']]:[]),...(admin?[['system','系统管理']]:[])].map(([id,label])=><NavLink key={id} to={`/${id}`} className={`rounded-md px-4 py-2 text-sm hover:bg-slate-800 focus-visible:ring-2 ${module===id?'bg-slate-800 text-white':'text-slate-300'}`}>{label}</NavLink>)}</nav><span className="ml-auto text-sm text-slate-300">{user.displayName} · {user.organizationName}</span><button type="button" onClick={()=>void logout()} className="flex items-center gap-1 rounded px-2 py-1 text-sm hover:bg-slate-800 focus-visible:ring-2"><LogOut size={16}/>退出</button></div></header><div className="flex flex-col md:flex-row"><aside className="border-b md:border-r border-slate-200 bg-white md:w-52 md:shrink-0 p-3"><nav aria-label="业务导航" className="flex gap-1 overflow-x-auto md:flex-col">{navigation.map(([href,label])=><NavLink key={href} to={href} end className={({isActive})=>`whitespace-nowrap rounded-md px-3 py-2 text-sm hover:bg-slate-100 focus-visible:ring-2 ${isActive?'bg-blue-50 text-blue-700':'text-slate-600'}`}>{label}</NavLink>)}</nav></aside><main className="min-w-0 flex-1 overflow-x-auto p-4 md:p-6"><OffsiteInspectionProvider><DevelopmentNotice/><div key={location.pathname+location.search}>{content}</div></OffsiteInspectionProvider></main></div></div>;
}
