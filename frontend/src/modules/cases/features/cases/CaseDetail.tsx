
import React, { useEffect, useState } from 'react';
import { Case, FinancialRecord, CaseType, CaseStage } from '../../types'; 
import { getCaseById, updateCaseDeadline, updateCaseStage, getFinanceSnapshot } from '../../services/case';
import Button from '../../components/ui/Button';
import {
  ArrowLeft, Printer, Calculator, X,
  LayoutDashboard, GitMerge, Wallet, FolderOpen, Lock, ShieldAlert, Users, Archive, Send,
  Layers, ChevronDown, Check, Gavel
} from 'lucide-react';

// Feature Components
import CaseOverview from './CaseOverview';
import ProcessTimeline from './ProcessTimeline';
import CaseFinanceView from '../finance/CaseFinanceView';
import ElectronicDossier from './ElectronicDossier';
import AssetList from '../assets/AssetList';
import CaseComplianceView from './CaseComplianceView';
import ContractManager from '../finance/ContractManager';
import CaseClosing from './CaseClosing';
import EvidenceTaskBoard from './EvidenceTaskBoard';
import CaseSidebar from './components/CaseSidebar';
import SeriesManagement from './SeriesManagement';
import ExternalCounselTab from './components/ExternalCounselTab';
import CasePartiesTab from './components/CasePartiesTab';

import { CaseDetailSkeleton } from '../../components/Loading';

interface CaseDetailProps {
  caseId: string;
  onBack: () => void;
}

type TabType = 'overview' | 'parties' | 'series' | 'process' | 'finance' | 'docs' | 'assets' | 'compliance' | 'contract' | 'closing' | 'collab';

const DEADLINE_RULES = [
    { id: '1', label: '收到一审判决书 (上诉期)', days: 15, desc: '《民事诉讼法》第164条：当事人不服地方人民法院第一审判决的，有权在判决书送达之日起十五日内向上一级人民法院提起上诉。' },
    { id: '2', label: '收到裁定书 (上诉期)', days: 10, desc: '《民事诉讼法》第164条：当事人不服地方人民法院第一审裁定的，有权在裁定书送达之日起十日内向上一级人民法院提起上诉。' },
    { id: '3', label: '收到应诉通知 (答辩期)', days: 15, desc: '《民事诉讼法》第125条：被告在收到起诉状副本之日起十五日内提出答辩状。' },
    { id: '4', label: '收到举证通知 (举证期)', days: 30, desc: '《最高人民法院关于民事诉讼证据的若干规定》：举证期限由人民法院确定，通常不少于三十日。' },
    { id: '5', label: '判决生效 (申请执行)', days: 730, desc: '《民事诉讼法》第239条：申请执行的期间为二年。' }
];

const CaseDetail: React.FC<CaseDetailProps> = ({ caseId, onBack }) => {
  const [caseData, setCaseData] = useState<Case | null>(null);
  const [finance, setFinance] = useState<FinancialRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  // Interactive Header State
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // Calibration State
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibForm, setCalibForm] = useState({
      ruleId: '1',
      triggerDate: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    load();
  }, [caseId]);

  const load = async () => {
    setLoading(true);
    try {
      const [c, f] = await Promise.all([
        getCaseById(caseId),
        getFinanceSnapshot(caseId),
      ]);
      if (c) setCaseData(c);
      if (f) setFinance(f);
    } catch {
      // apiClient 拦截器已 toast.error
    } finally {
      setLoading(false);
    }
  };

  const handleCalibrate = async () => {
      if (!caseData) return;
      const rule = DEADLINE_RULES.find(r => r.id === calibForm.ruleId);
      if (!rule) return;

      const trigger = new Date(calibForm.triggerDate);
      trigger.setDate(trigger.getDate() + rule.days);
      const newDeadline = trigger.toISOString().split('T')[0];

      try {
          await updateCaseDeadline(caseData.id, newDeadline);
          setCaseData({ ...caseData, nextDeadline: newDeadline });
      } catch {
          // apiClient 拦截器已 toast.error
      } finally {
          setIsCalibrating(false);
      }
  };

  const handleStatusChange = async (newStage: CaseStage) => {
      if (!caseData) return;
      setIsUpdatingStatus(true);
      try {
          const updated = await updateCaseStage(caseData.id, newStage);
          setCaseData(updated);
      } finally {
          setIsUpdatingStatus(false);
          setIsStatusOpen(false);
      }
  };

  const getCalculatedDate = () => {
      const rule = DEADLINE_RULES.find(r => r.id === calibForm.ruleId);
      if (!rule) return '--';
      const trigger = new Date(calibForm.triggerDate);
      trigger.setDate(trigger.getDate() + rule.days);
      return trigger.toISOString().split('T')[0];
  };

  if (loading) return <CaseDetailSkeleton />;
  
  if (!caseData) return <div className="p-10 text-center">案件不存在</div>;

  // Safe access to enums
  const isSeriesMaster = caseData.caseType === (CaseType?.SERIES_MASTER || 'SERIES_MASTER');
  const isClosed = caseData.stage === (CaseStage?.CLOSED || '已结案');

  const TABS: { id: TabType; label: string; icon: React.ElementType }[] = [
      { id: 'overview', label: '概览', icon: LayoutDashboard },
      { id: 'parties', label: '当事人', icon: Users },
      ...(isSeriesMaster
          ? [{ id: 'series' as TabType, label: '系列案', icon: Layers }]
          : []),
      { id: 'process', label: '流程', icon: GitMerge },
      { id: 'collab', label: '协作', icon: Send },
      { id: 'docs', label: '卷宗', icon: FolderOpen },
      { id: 'finance', label: '财务', icon: Wallet },
      { id: 'assets', label: '资产保全', icon: Lock },
      { id: 'compliance', label: '合规', icon: ShieldAlert },
      { id: 'contract', label: '外聘律师', icon: Users },
      { id: 'closing', label: '结案', icon: Archive },
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-white -m-6 relative overflow-hidden">
      
      {/* === 1. App Header (Slim & Interactive) === */}
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex justify-between items-center z-20 shrink-0 shadow-sm">
         <div className="flex items-center gap-4 overflow-hidden">
             <button onClick={onBack} className="hover:bg-slate-100 p-1.5 rounded text-slate-500 transition-colors">
                <ArrowLeft className="w-4 h-4" />
             </button>
             
             <div className="flex flex-col">
                 <div className="flex items-center text-xs text-slate-500 gap-2 mb-0.5">
                    <div className="flex items-center gap-1">
                        <span className="font-mono">{caseData.code}</span>
                        {isSeriesMaster && (
                            <span className="bg-indigo-100 text-indigo-700 px-1.5 rounded text-[10px] font-bold">系列总案</span>
                        )}
                        {/* Arbitration Badge */}
                        {(caseData.tags?.includes('商事仲裁') || caseData.stage === CaseStage.ARBITRATION || caseData.procedureType === 'ARBITRATION') && (
                            <span className="bg-orange-50 text-orange-700 px-1.5 rounded text-[10px] font-bold border border-orange-200 flex items-center gap-1">
                                <Gavel className="w-3 h-3" /> 一裁终局
                            </span>
                        )}
                    </div>
                    {/* Interactive Status Pill */}
                    <div className="relative">
                        <button 
                            onClick={() => setIsStatusOpen(!isStatusOpen)}
                            disabled={isUpdatingStatus}
                            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border cursor-pointer hover:shadow-md transition-all ${
                                isUpdatingStatus ? 'opacity-50 cursor-wait' : 
                                isClosed ? 'bg-slate-100 text-slate-600 border-slate-200' :
                                'bg-brand-50 text-brand-700 border-brand-200'
                            }`}
                        >
                            {isUpdatingStatus ? '更新中...' : caseData.stage}
                            <ChevronDown className="w-3 h-3" />
                        </button>
                        
                        {isStatusOpen && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setIsStatusOpen(false)}></div>
                                <div className="absolute top-full left-0 mt-1 w-40 bg-white border border-slate-200 rounded-lg shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95">
                                    <div className="px-3 py-2 bg-slate-50 text-[10px] text-slate-500 font-bold uppercase border-b border-slate-100">
                                        流转至...
                                    </div>
                                    {Object.values(CaseStage || {}).map(stage => (
                                        <button
                                            key={stage}
                                            onClick={() => handleStatusChange(stage)}
                                            className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex items-center justify-between ${
                                                caseData.stage === stage ? 'text-brand-600 font-bold bg-brand-50' : 'text-slate-700'
                                            }`}
                                        >
                                            {stage}
                                            {caseData.stage === stage && <Check className="w-3 h-3" />}
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                 </div>
                 <h1 className="text-lg font-bold text-slate-900 truncate max-w-xl" title={caseData.title}>
                    {caseData.title}
                 </h1>
             </div>
         </div>

         {/* Actions */}
         <div className="flex items-center gap-2">
             <button 
                onClick={() => setIsCalibrating(true)}
                className="text-xs flex items-center gap-1 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded hover:bg-white hover:border-brand-300 transition-all text-slate-600"
             >
                 <Calculator className="w-3.5 h-3.5" /> 时效校准
             </button>
             <div className="h-6 w-px bg-slate-200 mx-1"></div>
             <Button variant="outline" size="sm" className="h-8"><Printer className="w-3.5 h-3.5 mr-1"/> 导出</Button>
         </div>
      </header>

      {/* === 2. Main Layout (2 Columns) === */}
      <div className="flex-1 flex overflow-hidden">
          
          {/* Left Column: Main Content (Flexible) */}
          <div className="flex-1 flex flex-col min-w-0 bg-white">
              
              {/* Tabs Bar */}
              <div className="px-6 border-b border-slate-200 flex items-center gap-6 overflow-x-auto no-scrollbar shrink-0">
                  {TABS.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`group flex items-center gap-2 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
                            activeTab === tab.id 
                            ? 'border-brand-600 text-brand-600' 
                            : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                        }`}
                    >
                        <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? 'stroke-[2.5px]' : 'group-hover:stroke-[2px]'}`} />
                        {tab.label}
                    </button>
                  ))}
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto p-8 bg-white">
                  <div className="max-w-5xl mx-auto">
                    {activeTab === 'overview' && <CaseOverview caseData={caseData} finance={finance || undefined} />}
                    {activeTab === 'parties' && <CasePartiesTab caseId={caseData.id} />}
                    {/* Series Management Tab */}
                    {activeTab === 'series' && caseData.caseType === CaseType.SERIES_MASTER && <SeriesManagement masterCase={caseData} />}
                    
                    {activeTab === 'process' && <ProcessTimeline caseId={caseData.id} />}
                    {activeTab === 'collab' && <EvidenceTaskBoard caseId={caseData.id} caseTitle={caseData.title} />}
                    {activeTab === 'finance' && <CaseFinanceView caseId={caseData.id} />}
                    {activeTab === 'docs' && <ElectronicDossier caseId={caseData.id} stage={caseData.stage} />}
                    {activeTab === 'assets' && <AssetList caseId={caseData.id} />}
                    {activeTab === 'compliance' && <CaseComplianceView caseData={caseData} />}
                    {activeTab === 'contract' && <ExternalCounselTab caseData={caseData} />}
                    {activeTab === 'closing' && <CaseClosing caseData={caseData} onSuccess={() => {}} onCancel={() => setActiveTab('overview')} />}
                  </div>
              </div>
          </div>

          {/* Right Column: Persistent Sidebar (Fixed Width) */}
          <CaseSidebar caseData={caseData} finance={finance || undefined} onCaseUpdated={(patch) => setCaseData(prev => prev ? { ...prev, ...patch } : prev)} />

      </div>

      {/* --- Calibration Modal --- */}
      {isCalibrating && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
              <div className="bg-white rounded-xl shadow-xl w-[450px] overflow-hidden border border-slate-200">
                  <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                      <h3 className="font-bold text-slate-800 flex items-center gap-2">
                          <Calculator className="w-5 h-5 text-brand-600" /> 智能时效校准 (Deadline Calibration)
                      </h3>
                      <button onClick={() => setIsCalibrating(false)} className="text-slate-400 hover:text-slate-600">
                          <X className="w-5 h-5" />
                      </button>
                  </div>
                  
                  <div className="p-6 space-y-5">
                      <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1">触发事件 / 收到文书</label>
                          <select 
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                            value={calibForm.ruleId}
                            onChange={e => setCalibForm({...calibForm, ruleId: e.target.value})}
                          >
                              {DEADLINE_RULES.map(r => (
                                  <option key={r.id} value={r.id}>{r.label}</option>
                              ))}
                          </select>
                      </div>

                      <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1">文书送达日期 / 触发日期</label>
                          <input 
                            type="date"
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                            value={calibForm.triggerDate}
                            onChange={e => setCalibForm({...calibForm, triggerDate: e.target.value})}
                          />
                      </div>

                      <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                          <p className="text-xs font-bold text-blue-700 mb-1">法律依据：</p>
                          <p className="text-xs text-blue-600 leading-relaxed">
                              {DEADLINE_RULES.find(r => r.id === calibForm.ruleId)?.desc}
                          </p>
                      </div>

                      <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-lg">
                          <span className="text-sm font-bold text-slate-600">计算结果：法定截止日</span>
                          <span className="text-lg font-mono font-bold text-brand-600">{getCalculatedDate()}</span>
                      </div>
                  </div>

                  <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
                      <Button variant="ghost" onClick={() => setIsCalibrating(false)}>取消</Button>
                      <Button onClick={handleCalibrate}>确认并更新</Button>
                  </div>
              </div>
          </div>
      )}

    </div>
  );
};

export default CaseDetail;
