
import React, { useState } from 'react';
import type { ReportDefinitionFromRule } from '../../services/case';
import { Calendar, ShieldCheck, Database, LayoutDashboard, Camera, Activity, PieChart } from 'lucide-react';
import ReportGeneratorWizard from './ReportGeneratorWizard';
import ConsistencyCheckView from './ConsistencyCheckView';
import TemplateFactory from './TemplateFactory';
import RegulatoryCalendar from './RegulatoryCalendar';
import RiskRulesPanel from './RiskRulesPanel';
import ReportingWorkbench from './ReportingWorkbench';
import SnapshotBrowser from './SnapshotBrowser';
import RiskMonitor from './RiskMonitor';
import InternalReportingView from './InternalReportingView'; // New Import

const ReportingHub: React.FC = () => {
  // Level 1: Domain
  const [domain, setDomain] = useState<'REGULATORY' | 'INTERNAL'>(() => new URLSearchParams(window.location.search).get('domain') === 'INTERNAL' ? 'INTERNAL' : 'REGULATORY');
  
  // Level 2: Tabs within Regulatory
  const [activeRegTab, setActiveRegTab] = useState<'RISK_COCKPIT' | 'CALENDAR' | 'WORKBENCH' | 'SNAPSHOTS' | 'GOVERNANCE' | 'ARCHIVES'>(()=>{const tab=new URLSearchParams(window.location.search).get('tab');return (['RISK_COCKPIT','CALENDAR','WORKBENCH','SNAPSHOTS','GOVERNANCE','ARCHIVES'].includes(tab||'')?tab:'RISK_COCKPIT') as 'RISK_COCKPIT';});
  
  const [showWizard, setShowWizard] = useState(false);
  // D95=A: R24 已解决 — getReportDefinitions() 在 Wizard 内部自动加载 (listComplianceRules → CREATE_TASK filter)
  const definitions: ReportDefinitionFromRule[] = [];

  const [preselectedDefId, setPreselectedDefId] = useState<string | undefined>(undefined);

  const handleOpenWizard = (defId?: string) => {
      setPreselectedDefId(defId);
      setShowWizard(true);
  };

  const REGULATORY_TABS = [
      { id: 'RISK_COCKPIT', label: '风险驾驶舱', icon: Activity },
      { id: 'CALENDAR', label: '规则与日历', icon: Calendar },
      { id: 'WORKBENCH', label: '报送工作台', icon: LayoutDashboard },
      { id: 'SNAPSHOTS', label: '数据快照', icon: Camera },
      { id: 'GOVERNANCE', label: '数据治理', icon: ShieldCheck },
      { id: 'ARCHIVES', label: '模版与档案', icon: Database },
  ];

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-500">
      
      {/* Wizard Modal */}
      {showWizard && (
          <ReportGeneratorWizard 
            definitions={definitions}
            initialDefinitionId={preselectedDefId}
            onClose={() => setShowWizard(false)}
            onSuccess={() => {
                setShowWizard(false);
                setActiveRegTab('WORKBENCH'); // Switch to workbench
            }}
          />
      )}

      {/* Top Header & Navigation */}
      <div className="flex-none mb-6">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">报送与披露中心 (Reporting Center)</h2>
              <p className="text-sm text-slate-500 mt-1">集成对外监管合规报送与对内经营管理汇报。</p>
            </div>
            
            {/* Domain Switcher */}
            <div className="bg-slate-100 p-1 rounded-lg flex border border-slate-200">
                <button
                    onClick={() => setDomain('REGULATORY')}
                    className={`flex items-center gap-2 px-6 py-2 rounded-md text-sm font-bold transition-all ${
                        domain === 'REGULATORY' 
                        ? 'bg-white text-brand-700 shadow-sm' 
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                >
                    <ShieldCheck className="w-4 h-4" /> 监管合规 (Regulatory)
                </button>
                <button
                    onClick={() => setDomain('INTERNAL')}
                    className={`flex items-center gap-2 px-6 py-2 rounded-md text-sm font-bold transition-all ${
                        domain === 'INTERNAL' 
                        ? 'bg-white text-indigo-700 shadow-sm' 
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                >
                    <PieChart className="w-4 h-4" /> 内部汇报 (Internal)
                </button>
            </div>
          </div>

          {/* Sub Navigation (Only for Regulatory) */}
          {domain === 'REGULATORY' && (
              <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 w-fit shadow-sm overflow-x-auto">
                  {REGULATORY_TABS.map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveRegTab(tab.id as any)}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${
                            activeRegTab === tab.id 
                            ? 'bg-slate-900 text-white shadow-md' 
                            : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                        }`}
                      >
                          <tab.icon className={`w-4 h-4 ${activeRegTab === tab.id ? 'text-brand-300' : ''}`} />
                          {tab.label}
                      </button>
                  ))}
              </div>
          )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-h-0">
          {domain === 'INTERNAL' ? (
              <InternalReportingView />
          ) : (
              // Regulatory Views
              <>
                  {activeRegTab === 'RISK_COCKPIT' && <RiskMonitor />}
                  
                  {activeRegTab === 'CALENDAR' && (
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
                          <div className="lg:col-span-2 h-full">
                              <RegulatoryCalendar onInitiateTask={handleOpenWizard} />
                          </div>
                          <div className="lg:col-span-1 h-full">
                              <RiskRulesPanel />
                          </div>
                      </div>
                  )}

                  {activeRegTab === 'WORKBENCH' && (
                      <ReportingWorkbench 
                        onCreateTask={() => handleOpenWizard()} 
                        onRiskConversion={(defId) => handleOpenWizard(defId)}
                      />
                  )}

                  {activeRegTab === 'SNAPSHOTS' && <SnapshotBrowser />}

                  {activeRegTab === 'GOVERNANCE' && <ConsistencyCheckView />}

                  {activeRegTab === 'ARCHIVES' && <TemplateFactory />}
              </>
          )}
      </div>
    </div>
  );
};

export default ReportingHub;
