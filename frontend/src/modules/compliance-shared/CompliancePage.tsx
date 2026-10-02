import { useState, useEffect, useMemo } from 'react';
import IssueHubPage from './features/issue-hub/IssueHubPage';
import DataReportingHub from './features/assessment/DataReportingHub';
import AssessmentRecordsDashboard from './features/assessment/AssessmentRecordsDashboard';
import HQReviewWorkstation from './features/assessment/HQReviewWorkstation';
import InspectionDashboard from './features/inspection/InspectionDashboard';
import WorkingPaperWorkspace from './features/inspection/WorkingPaperWorkspace';
import InspectionExecutionMonitor from './features/inspection/InspectionExecutionMonitor';
import GlobalGovernanceDashboard from './features/dashboard/GlobalGovernanceDashboard';
import IndicatorLibraryView from './features/assessment/IndicatorLibraryView';
import HQAssessmentDashboard from './features/assessment/HQAssessmentDashboard';
import AssessmentSchemeList from './features/assessment/AssessmentSchemeList';
import UnifiedTaskCenter from './features/dashboard/UnifiedTaskCenter';
import DataCollectionCockpit from './features/assessment/DataCollectionCockpit';
import WorkflowDispatchDetail from './features/assessment/WorkflowDispatchDetail';
import WorkflowDispatchDashboard from './features/assessment/WorkflowDispatchDashboard';
import BranchDailyComplianceLedger from './features/assessment/BranchDailyComplianceLedger';
import OffsiteMaterialSubmission from './features/inspection/OffsiteMaterialSubmission';
import RectificationLedgerView from './features/issue-hub/RectificationLedgerView';
import BranchFactConfirmation from './features/inspection/BranchFactConfirmation';
import WorkflowRoutingDesigner from './features/assessment/WorkflowRoutingDesigner';
import UnifiedReviewWorkbench from './features/assessment/UnifiedReviewWorkbench';
import AssessmentScheduler from './features/assessment/AssessmentScheduler';

import AdjudicationDashboard from './features/inspection/AdjudicationDashboard';
import AdjudicationWorkspace from './features/inspection/AdjudicationWorkspace';

import HolographicPortrait from './features/dashboard/HolographicPortrait';

import OrgPermissionMatrix from './features/system/OrgPermissionMatrix';
import SystemDictionaryManagement from './features/system/SystemDictionaryManagement';

import {useAuth} from '../../platform/AuthProvider';
import {useLocation,useNavigate} from 'react-router-dom';
export default function CompliancePage({menuId}:{menuId:string}){
 const {user}=useAuth();const location=useLocation();const navigate=useNavigate();
 const [adjudicationView,setAdjudicationView]=useState<'dashboard'|'workspace'>('dashboard');const [selectedPlanId,setSelectedPlanId]=useState<string|null>(null);const [workspaceArchived,setWorkspaceArchived]=useState(false);
 const selectedMenu=menuId;
 const handleMenuChange=(id:string)=>navigate(`/${['hq-org','hq-dictionaries'].includes(id)?'system':['branch-reporting','branch-self-assessment','branch-daily-ledger','hq-indicators','hq-rules','hq-workflow-center','hq-review','hq-assessment-dashboard','hq-workflow-designer','hq-scheduler','hq-unified-workbench','hq-data-cockpit'].includes(id)?'assessments':'inspections'}/${id}`);
 if(!user)return null;
 if(menuId==='dispatch-detail')return <WorkflowDispatchDetail/>;
    if (selectedMenu === 'hq-dashboard') {
      return <GlobalGovernanceDashboard />;
    }

    if (selectedMenu === 'hq-adjudication-console') {
      if (adjudicationView === 'workspace' && selectedPlanId) {
        return (
          <AdjudicationWorkspace
            inspectionPlanId={selectedPlanId}
            isArchived={workspaceArchived}
            onBack={() => {
              setAdjudicationView('dashboard');
              setSelectedPlanId(null);
            }}
          />
        );
      }
      return (
        <AdjudicationDashboard
          onEnterConsole={(planId, isArchived) => {
            setSelectedPlanId(planId);
            setWorkspaceArchived(isArchived);
            setAdjudicationView('workspace');
          }}
        />
      );
    }

    if (selectedMenu === 'branch-dashboard' || selectedMenu === 'hq-branch-profile') {
      return <HolographicPortrait />;
    }

    if (selectedMenu === 'hq-tasks' || selectedMenu === 'branch-tasks') {
      return (
        <UnifiedTaskCenter
          onNavigate={handleMenuChange}
          taskView={selectedMenu === 'hq-tasks' ? 'hq' : 'branch'}
          actorLabel={selectedMenu === 'hq-tasks' ? '总部管理待办' : `${user.organizationName}待办`}
        />
      );
    }

    if (selectedMenu === 'branch-upload') {
      return <OffsiteMaterialSubmission />;
    }

    if (selectedMenu === 'branch-confirmation') {
      return <BranchFactConfirmation />;
    }

    if (selectedMenu === 'branch-ledger') {
      return <RectificationLedgerView />;
    }

    if (selectedMenu === 'hq-plans') {
      return <InspectionDashboard />;
    }

    if (selectedMenu === 'hq-monitor') {
      return <InspectionExecutionMonitor />;
    }

    if (selectedMenu === 'hq-issue-hub') {
      return <IssueHubPage />;
    }

    if (selectedMenu === 'hq-workflow-designer') {
      return <WorkflowRoutingDesigner />;
    }

    if (selectedMenu === 'hq-scheduler') {
      return <AssessmentScheduler />;
    }

    if (selectedMenu === 'hq-unified-workbench') {
      return <UnifiedReviewWorkbench />;
    }

    if (selectedMenu === 'hq-indicators') {
      return <IndicatorLibraryView />;
    }

    if (selectedMenu === 'hq-data-cockpit') {
      return <DataCollectionCockpit />;
    }

    if (selectedMenu === 'hq-rules') {
      return <AssessmentSchemeList />;
    }

    if (selectedMenu === 'hq-workflow-center') {
      return <WorkflowDispatchDashboard />;
    }

    if (selectedMenu === 'hq-org') {
      return <OrgPermissionMatrix />;
    }

    if (selectedMenu === 'hq-dictionaries') {
      return <SystemDictionaryManagement />;
    }

    if (selectedMenu === 'hq-review') {
      return <HQReviewWorkstation />;
    }

    if (selectedMenu === 'hq-assessment-dashboard') {
      return <HQAssessmentDashboard />;
    }

    if (selectedMenu === 'branch-reporting') {
      return <DataReportingHub />;
    }

    if (selectedMenu === 'branch-self-assessment') {
      return <AssessmentRecordsDashboard />;
    }

    if (selectedMenu === 'branch-daily-ledger') {
      return <BranchDailyComplianceLedger />;
    }

    return (
      <div className="text-center w-full bg-gray-100 rounded-lg border border-gray-200 border-dashed min-h-[600px] p-8 flex flex-col items-center justify-center">
        <h2 className="text-2xl font-semibold text-gray-800 mb-2">欢迎登录，{user.displayName}。</h2>
        <p className="text-gray-500">请在左侧选择已授权的管理模块。</p>
      </div>
    );

}
