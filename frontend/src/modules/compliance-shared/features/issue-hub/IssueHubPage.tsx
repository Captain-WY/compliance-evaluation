import React, { useState } from 'react';
import { ListTodo, FolderKanban, BarChart3 } from 'lucide-react';
import IssueLedgerTable from './IssueLedgerTable';
import ProjectTrackerTab from './ProjectTrackerTab';
import AnalyticsDashboardTab from './AnalyticsDashboardTab';

import RectificationWorkspace from '../inspection/RectificationWorkspace';

export default function IssueHubPage() {
  const [activeTab, setActiveTab] = useState<'LEDGER' | 'PROJECTS' | 'DASHBOARD'>('LEDGER');
  const [currentView, setCurrentView] = useState<'dashboard' | 'workspace'>('dashboard');
  const [workspaceParams, setWorkspaceParams] = useState({ isReadOnly: false, issueId: '' });
  const [ledgerFilters, setLedgerFilters] = useState<Record<string, string> | undefined>();

  const handleNavigateToWorkspace = (isReadOnly: boolean, issueId: string) => {
    setWorkspaceParams({ isReadOnly, issueId });
    setCurrentView('workspace');
  };

  if (currentView === 'workspace') {
    return (
      <RectificationWorkspace 
        isReadOnly={workspaceParams.isReadOnly} 
        defaultIssueId={workspaceParams.issueId} 
        onBack={() => {
          setCurrentView('dashboard');
          setActiveTab('LEDGER');
        }} 
      />
    );
  }

  return (
    <div data-testid="p2-issue-hub-page" className="w-full h-full flex flex-col px-6 pt-6 pb-6 overflow-hidden">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">中央问题库与督办中心</h1>
          <p className="text-sm text-gray-500 mt-1">统一管理全系统合规检查发现的问题与整改追踪</p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4">
          {/* Main Tabs */}
          <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 overflow-x-auto max-w-full no-scrollbar">
            <button
              data-testid="p2-issue-tab-ledger"
              onClick={() => {
                setLedgerFilters(undefined);
                setActiveTab('LEDGER');
              }}
              className={`flex items-center px-4 py-2 whitespace-nowrap ${
                activeTab === 'LEDGER'
                  ? 'bg-white text-indigo-700 shadow-sm rounded-md font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50 rounded-md font-medium'
              } text-sm transition-all`}
            >
              <ListTodo className="w-4 h-4 mr-2 shrink-0" />
              缺陷总库
            </button>
            <button
               data-testid="p2-issue-tab-projects"
               onClick={() => setActiveTab('PROJECTS')}
              className={`flex items-center px-4 py-2 whitespace-nowrap ${
                activeTab === 'PROJECTS'
                  ? 'bg-white text-indigo-700 shadow-sm rounded-md font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50 rounded-md font-medium'
              } text-sm transition-all`}
            >
              <FolderKanban className="w-4 h-4 mr-2 shrink-0" />
              项目跟踪大盘
            </button>
            <button
               data-testid="p2-issue-tab-dashboard"
               onClick={() => setActiveTab('DASHBOARD')}
              className={`flex items-center px-4 py-2 whitespace-nowrap ${
                activeTab === 'DASHBOARD'
                  ? 'bg-white text-indigo-700 shadow-sm rounded-md font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50 rounded-md font-medium'
              } text-sm transition-all`}
            >
              <BarChart3 className="w-4 h-4 mr-2 shrink-0" />
              数据驾驶舱
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 w-full relative overflow-y-auto">
        {activeTab === 'LEDGER' && <IssueLedgerTable onNavigateToWorkspace={handleNavigateToWorkspace} initialFilters={ledgerFilters} />}
        {activeTab === 'PROJECTS' && <ProjectTrackerTab onDrillDown={(filters) => {
          setLedgerFilters(filters);
          setActiveTab('LEDGER');
        }} />}
        {activeTab === 'DASHBOARD' && <AnalyticsDashboardTab />}
      </div>
    </div>
  );
}
