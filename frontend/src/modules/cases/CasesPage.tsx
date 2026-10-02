import React,{useEffect,useState} from 'react';
import {useLocation,useNavigate} from 'react-router-dom';
import {useAuth} from '../../platform/AuthProvider';
import {UserRole, type User} from './types';
// Import Features explicitly
import ClueReportFormComp from './features/clues/ClueReportForm';
import ClueListComp from './features/clues/ClueList';
import ClueDetailComp from './features/clues/ClueDetail';
import NewCaseFormComp from './features/cases/NewCaseForm';
import CaseDetailComp from './features/cases/CaseDetail';
import CaseListComp from './features/cases/CaseList';
import FinancialCenterComp from './features/finance/FinancialCenter';
import LegalBrainComp from './features/intelligence/LegalBrain';
import VendorListComp from './features/vendors/VendorList';
import VendorDashboardComp from './features/vendor_portal/VendorDashboard';
import ReportingHubComp from './features/reporting/ReportingHub';
import EvidenceResponseComp from './features/business_portal/EvidenceResponse';
import SmartInboxComp from './features/inbox/SmartInbox';
import KnowledgeResourcesComp from './features/knowledge/KnowledgeResources';
import AdminHubComp from './features/admin/AdminHub';
import ApprovalInboxComp from './features/approvals/ApprovalInbox';
import NotificationHistoryComp from './features/notifications/NotificationHistory';

import { listClues, type ClueRecord } from './services/case';




export default function CasesPage(){
 const {user}=useAuth(); const location=useLocation(); const go=useNavigate();
 const path=location.pathname;const [clues,setClues]=useState<ClueRecord[]>([]);const [error,setError]=useState('');const [loading,setLoading]=useState(true);
 const refreshData=async()=>{try{setError('');setClues(await listClues());}catch(e){setError(e instanceof Error?e.message:'线索加载失败');}finally{setLoading(false);}};
 useEffect(()=>{if(user?.role!=='EXTERNAL_LAWYER')void refreshData();else setLoading(false);},[user?.id]);
 const navigate=(old:string)=>go(old==='/'?'/cases':old.startsWith('/cases/')?old:`/cases${old}`);
 if(!user)return null;const appUser={...user,role:user.role as UserRole} as User;
 const unavailable=<div role="alert" className="p-6 border rounded-lg bg-white">当前角色无权访问此案件页面，或该页面尚未接入。</div>;
 if(!['EXTERNAL_LAWYER','BUSINESS_UNIT','LEGAL_ADMIN'].includes(user.role))return unavailable;
 if(user.role==='EXTERNAL_LAWYER')return path==='/cases'||path==='/cases/vendor-portal'?<VendorDashboardComp user={appUser}/>:unavailable;
 if(path==='/cases/report')return <ClueReportFormComp currentUser={user.displayName} onSuccess={()=>{void refreshData();go('/cases/clues');}}/>;
 if(user.role==='BUSINESS_UNIT'){
  if(path==='/cases/tasks')return <EvidenceResponseComp/>;
  if(path!=='/cases' && path!=='/cases/clues')return unavailable;
  return <div className="bg-white border rounded-lg p-5"><h1 className="text-xl font-semibold mb-4">我的上报记录</h1>{loading?<p>正在加载…</p>:error?<p role="alert">{error}</p>:clues.length===0?<p>暂无上报记录。</p>:clues.map(c=><div className="border-t py-3" key={c.clueId}>{c.clueTitle}<span className="ml-3 text-slate-500">{c.statusName}</span></div>)}</div>;
 }
 if(path==='/cases')return <CaseListComp onNavigate={navigate}/>;
 if(path==='/cases/new')return <NewCaseFormComp onCancel={()=>go('/cases')} onSuccess={id=>go(id?`/cases/${id}`:'/cases')}/>;
 if(path==='/cases/clues')return <>{error&&<p role="alert">{error}</p>}<ClueListComp clues={clues} onSelectClue={id=>go(`/cases/clues/${id}`)}/></>;
 if(path.startsWith('/cases/clues/'))return <ClueDetailComp clueId={decodeURIComponent(path.split('/')[3])} onBack={()=>go('/cases/clues')} onCaseCreated={async()=>{await refreshData();go('/cases');}}/>;
 if(path==='/cases/inbox')return <SmartInboxComp/>;
 if(path==='/cases/finance')return <FinancialCenterComp/>;
 if(path==='/cases/knowledge')return <KnowledgeResourcesComp/>;
 if(path==='/cases/reports')return <ReportingHubComp/>;
 if(path==='/cases/vendors')return <VendorListComp/>;
 if(path==='/cases/intelligence')return <LegalBrainComp/>;
 if(path==='/cases/approvals')return <ApprovalInboxComp/>;
 if(path==='/cases/notifications')return <NotificationHistoryComp/>;
 if(/^\/cases\/[^/]+$/.test(path))return <CaseDetailComp caseId={decodeURIComponent(path.split('/')[2])} onBack={()=>go('/cases')}/>;
 return unavailable;
}
