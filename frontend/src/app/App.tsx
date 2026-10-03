import DevelopmentNotice from '../platform/DevelopmentNotice';
import {useEffect} from 'react';
import {Navigate,useLocation} from 'react-router-dom';
import AppShell from './AppShell';
import {useAuth} from '../platform/AuthProvider';
import LoginPage from '../modules/compliance-shared/features/auth/LoginPage';
import {OffsiteInspectionProvider} from '../modules/compliance-shared/contexts/OffsiteInspectionContext';
import CasesPage from '../modules/cases/CasesPage';
import InspectionPage from '../modules/inspections';
import AssessmentPage from '../modules/assessments';
import {SystemAdministration,ComplianceAdministration} from '../modules/system';
import legacy from './legacy-routes.json';
const ceAliases:Record<string,string>={'/review':'/assessments/hq-review','/issue-hub':'/inspections/hq-issue-hub','/dispatch-detail':'/assessments/dispatch-detail','/hq/inspection/plans':'/inspections/hq-plans','/hq/system/dictionaries':'/system/hq-dictionaries','/hq/assessment/workflow-designer':'/assessments/hq-workflow-designer','/hq/assessment/review-workbench':'/assessments/hq-unified-workbench','/hq/assessment/scheduler':'/assessments/hq-scheduler','/hq/assessment/data-cockpit':'/assessments/hq-data-cockpit'};
const legacyCases=new Set(['inbox','finance','knowledge','reports','clues','vendors','intelligence','approvals','notifications','report','tasks']);
function Unavailable({message='此旧入口尚无等价页面，已登记为后续建设项。'}:{message?:string}){return <div className="rounded-lg border border-slate-200 bg-white p-6" role="alert"><h1 className="text-xl font-semibold mb-2">页面不可用</h1><p className="text-sm text-slate-600">{message}</p></div>;}
export default function App(){
 const {user,isLoading,logout}=useAuth();const location=useLocation();
 useEffect(()=>{document.title='合规与案件管理平台';},[]);
 if(isLoading)return <div className="p-8" role="status">正在验证登录会话…</div>;
 if(!user)return <LoginPage/>;
 const admin=user.role_codes.includes('platform_admin');const ceAllowed=admin||user.role_codes.some(r=>['hq_business','branch_business'].includes(r));const branch=user.role_codes.includes('branch_business');
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
 let content;
 if(alias?.gap)content=<Unavailable/>;
 else if(module==='cases')content=<CasesPage/>;
 else if(module==='system')content=admin?(menu==='admin'?<SystemAdministration/>:['hq-org','hq-dictionaries'].includes(menu)?<ComplianceAdministration menuId={menu}/>:<Unavailable/>):<Unavailable message="当前账号没有系统管理权限。"/>;
 else if(['inspections','assessments'].includes(module))content=ceAllowed&&(user.permittedMenuIds.includes(menu)||(menu==='dispatch-detail'&&user.permittedMenuIds.includes('hq-workflow-center')))?module==='inspections'?<InspectionPage menuId={menu}/>:<AssessmentPage menuId={menu}/>:<Unavailable message="当前账号没有此业务入口的权限。"/>;
 else content=<Unavailable/>;
 return <OffsiteInspectionProvider><AppShell user={user} logout={logout}><DevelopmentNotice/>{content}</AppShell></OffsiteInspectionProvider>;
}
