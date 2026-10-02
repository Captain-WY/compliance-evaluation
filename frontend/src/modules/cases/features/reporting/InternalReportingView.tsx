
import React, { useEffect, useState } from 'react';
import { getBriefingHistory, getInternalReports, generateInternalReport } from '../../services/mock/internalReporting';
import { getCases, getCaseById } from '../../services/case';
import { getStrategyByCaseId } from '../../services/mock/strategy';
import { getFinanceByCaseId } from '../../services/mock/finance';
import { Case, CaseStage, RiskLevel, CaseStrategy, FinancialRecord, BriefingRecord, InternalReport, InternalReportType, InternalReportSubType } from '../../types';
import { FileText, TrendingUp, Download, Plus, Calendar, ShieldAlert, ArrowRight, Activity, PieChart as PieIcon, Layers, Printer, CheckCircle2, Eye, Edit, FilePlus, Camera, Lock, LayoutDashboard, Briefcase } from 'lucide-react';
import Button from '../../components/ui/Button';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, PieChart, Pie, Legend } from 'recharts';
import InternalReportPreview from './InternalReportPreview';
import CaseBriefingModal from './CaseBriefingModal';
import CaseSelectionModal from './CaseSelectionModal'; 
import ReportComposerModal from './ReportComposerModal'; 
import SnapshotPickerModal from './SnapshotPickerModal'; 
import BusinessAnalysisView from './BusinessAnalysisView';

const InternalReportingView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'DASHBOARD' | 'BUSINESS_ANALYSIS'>('DASHBOARD');

  const [briefings, setBriefings] = useState<BriefingRecord[]>([]);
  const [reports, setReports] = useState<InternalReport[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Generator State
  const [isGenerating, setIsGenerating] = useState(false);
  const [reportType, setReportType] = useState<InternalReportType>(InternalReportType.PERIODIC);
  const [reportSubType, setReportSubType] = useState<InternalReportSubType>(InternalReportSubType.MONTHLY);
  
  // Dynamic Cycle State
  const [cycleMonth, setCycleMonth] = useState(new Date().toISOString().slice(0, 7));
  const [cycleYear, setCycleYear] = useState(new Date().getFullYear());
  const [cycleQuarter, setCycleQuarter] = useState('Q1');

  // Preview Modals
  const [selectedReport, setSelectedReport] = useState<InternalReport | null>(null);
  const [selectedBriefingCase, setSelectedBriefingCase] = useState<{caseData: Case, strategy?: CaseStrategy, finance?: FinancialRecord, record?: BriefingRecord} | null>(null);

  // --- Ad-Hoc Reporting Flow States ---
  const [isSelectionModalOpen, setIsSelectionModalOpen] = useState(false);
  const [isDraftingModalOpen, setIsDraftingModalOpen] = useState(false);
  const [selectedCasesForReport, setSelectedCasesForReport] = useState<Case[]>([]);

  // --- Snapshot Picker State ---
  const [isSnapshotPickerOpen, setIsSnapshotPickerOpen] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
        setLoading(true);
        const [b, r, c] = await Promise.all([
            getBriefingHistory(),
            getInternalReports(),
            getCases()
        ]);
        setBriefings(b);
        setReports(r);
        setCases(c);
        setLoading(false);
  };
  
  const handleOpenBriefing = async (record: BriefingRecord) => {
      // Fetch details needed for the modal
      const c = await getCaseById(record.caseId);
      if (c) {
          const [s, f] = await Promise.all([
              getStrategyByCaseId(c.id),
              getFinanceByCaseId(c.id)
          ]);
          setSelectedBriefingCase({
              caseData: c,
              strategy: s || undefined,
              finance: f || undefined,
              record: record
          });
      }
  };

  // Net Capital Calculation (Aggregate)
  const netCapitalDeduction = cases.reduce((sum, c) => {
      if (c.stage === CaseStage.CLOSED) return sum;
      return sum + (c.regulatoryAttrs?.estimatedRiskCapitalDeduction || 0);
  }, 0);

  const totalExposure = cases.reduce((sum, c) => {
      if (c.stage === CaseStage.CLOSED) return sum;
      return sum + (c.regulatoryAttrs?.amountNoInterest || 0);
  }, 0);

  // Chart Data
  const riskDistData = [
      { name: '特大风险', value: cases.filter(c => c.riskLevel === RiskLevel.CRITICAL && c.stage !== CaseStage.CLOSED).length, color: '#ef4444' },
      { name: '重大风险', value: cases.filter(c => c.riskLevel === RiskLevel.HIGH && c.stage !== CaseStage.CLOSED).length, color: '#f97316' },
      { name: '一般关注', value: cases.filter(c => (c.riskLevel === RiskLevel.MEDIUM || c.riskLevel === RiskLevel.LOW) && c.stage !== CaseStage.CLOSED).length, color: '#3b82f6' },
  ];

  // --- Generation Logic ---

  // 1. Initiate Generation
  const handleInitiateReport = () => {
      if (reportType === InternalReportType.EVENT_DRIVEN) {
          setIsSelectionModalOpen(true);
      } else {
          // For Standard reports, first ask for Snapshot
          setIsSnapshotPickerOpen(true);
      }
  };

  // 2. Selection Confirm -> Open Drafting (Ad-hoc)
  const handleSelectionConfirm = (ids: string[]) => {
      const selected = cases.filter(c => ids.includes(c.id));
      setSelectedCasesForReport(selected);
      setIsSelectionModalOpen(false);
      setIsDraftingModalOpen(true);
  };

  // 3. Draft Save (Ad-hoc) -> Generate
  const handleReportSave = async (reportData: Partial<InternalReport>) => {
      setIsGenerating(true);
      
      // Determine final cycle string if not provided
      let finalCycle = reportData.cycle || 'Ad-hoc';
      if (!reportData.cycle) {
          if (reportSubType === InternalReportSubType.MONTHLY) finalCycle = cycleMonth;
          else if (reportSubType === InternalReportSubType.QUARTERLY) finalCycle = `${cycleYear}-${cycleQuarter}`;
          else if (reportSubType === InternalReportSubType.ANNUAL) finalCycle = `${cycleYear}-Annual`;
      }

      const newReport = await generateInternalReport(
          finalCycle, 
          reportType,
          reportSubType,
          selectedCasesForReport.map(c => c.id),
          undefined, // Snapshot ID would go here if we persisted it from the picker
          reportData
      );
      
      const updatedReports = await getInternalReports();
      setReports(updatedReports);
      
      setIsDraftingModalOpen(false);
      setIsGenerating(false);
      setSelectedCasesForReport([]); 
  };

  // 4. Snapshot Selected -> Generate Standard Report
  const handleSnapshotConfirmed = async (snapshotId: string) => {
      setIsSnapshotPickerOpen(false);
      
      // For Periodic reports, we now also use the Composer to allow editing
      // In a real app, we would fetch cases from the snapshot. 
      // Here we just use all active cases as a mock for the snapshot content.
      setSelectedCasesForReport(cases);
      setIsDraftingModalOpen(true);
  };

  // Removed executeGeneration as it is now handled via handleReportSave

  const fmtMoney = (val: number) => `¥${(val/100000000).toFixed(2)}亿`;

  // Helper to map type/subtype to label
  const getReportTypeLabel = (type: InternalReportType, subType: InternalReportSubType) => {
      if (type === InternalReportType.PERIODIC) {
          if (subType === InternalReportSubType.MONTHLY) return '月度综报';
          if (subType === InternalReportSubType.QUARTERLY) return '季度风控报告';
          if (subType === InternalReportSubType.ANNUAL) return '年度总结';
      }
      if (type === InternalReportType.EVENT_DRIVEN) return '专项汇报';
      if (type === InternalReportType.SPECIAL) return '监管报送';
      return `${type} - ${subType}`;
  };

  if (loading) return <div className="p-12 text-center text-slate-400">加载内部汇报数据...</div>;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 relative">
        
        {/* Modals */}
        {selectedReport && (
            <InternalReportPreview 
                report={selectedReport} 
                onClose={() => setSelectedReport(null)} 
            />
        )}

        {/* ... (CaseBriefingModal remains same) */}
        {selectedBriefingCase && (
            <CaseBriefingModal
                isOpen={!!selectedBriefingCase}
                onClose={() => { setSelectedBriefingCase(null); loadData(); }} 
                caseData={selectedBriefingCase.caseData}
                strategy={selectedBriefingCase.strategy || null}
                finance={selectedBriefingCase.finance}
                existingBriefing={selectedBriefingCase.record}
            />
        )}

        <CaseSelectionModal 
            isOpen={isSelectionModalOpen}
            onClose={() => setIsSelectionModalOpen(false)}
            cases={cases}
            onConfirm={handleSelectionConfirm}
        />

        <ReportComposerModal 
            isOpen={isDraftingModalOpen}
            onClose={() => setIsDraftingModalOpen(false)}
            selectedCases={selectedCasesForReport}
            initialType={reportType}
            initialSubType={reportSubType}
            onSave={handleReportSave}
        />

        <SnapshotPickerModal
            isOpen={isSnapshotPickerOpen}
            onClose={() => setIsSnapshotPickerOpen(false)}
            onConfirm={handleSnapshotConfirmed}
            title={`生成${getReportTypeLabel(reportType, reportSubType)} - 选择数据快照`}
        />

        {/* Internal Tabs */}
        {/* ... (Tabs remain same) */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg w-fit border border-slate-200">
            <button
                onClick={() => setActiveTab('DASHBOARD')}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-all ${
                    activeTab === 'DASHBOARD' 
                    ? 'bg-white text-slate-900 shadow-sm' 
                    : 'text-slate-500 hover:text-slate-700'
                }`}
            >
                <LayoutDashboard className="w-4 h-4" /> 综合看板 (Overview)
            </button>
            <button
                onClick={() => setActiveTab('BUSINESS_ANALYSIS')}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-all ${
                    activeTab === 'BUSINESS_ANALYSIS' 
                    ? 'bg-white text-indigo-700 shadow-sm' 
                    : 'text-slate-500 hover:text-slate-700'
                }`}
            >
                <TrendingUp className="w-4 h-4" /> 业务条线透视 (Business Lens)
            </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'BUSINESS_ANALYSIS' ? (
            <BusinessAnalysisView cases={cases} />
        ) : (
            /* Dashboard View */
            <>
                {/* 1. Dashboard Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* ... (Net Capital Card and Risk Dist Chart remain same) */}
                    {/* Net Capital Card */}
                    <div className="bg-gradient-to-br from-red-900 to-slate-900 rounded-xl p-6 text-white shadow-lg relative overflow-hidden group">
                        <div className="relative z-10">
                            <div className="flex items-center gap-2 mb-2">
                                <ShieldAlert className="w-5 h-5 text-red-400" />
                                <span className="text-xs font-bold uppercase text-red-100">净资本风险扣减 (Risk Capital)</span>
                            </div>
                            <p className="text-3xl font-bold tracking-tight">{fmtMoney(netCapitalDeduction)}</p>
                            <div className="mt-4 flex items-center gap-4 text-xs text-slate-300">
                                <span>总风险敞口: {fmtMoney(totalExposure)}</span>
                                <span>扣减率: {totalExposure > 0 ? ((netCapitalDeduction / totalExposure) * 100).toFixed(1) : 0}%</span>
                            </div>
                        </div>
                        <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                            <Activity className="w-32 h-32" />
                        </div>
                    </div>

                    {/* Risk Distribution Mini Chart */}
                    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col">
                        <h4 className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-2">
                            <PieIcon className="w-4 h-4 text-slate-500" /> 在办案件风险分布
                        </h4>
                        <div className="flex-1 flex items-center">
                            <div className="w-1/2 h-24">
                                <ResponsiveContainer>
                                    <PieChart>
                                        <Pie data={riskDistData} innerRadius={25} outerRadius={40} paddingAngle={2} dataKey="value">
                                            {riskDistData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                                        </Pie>
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="w-1/2 space-y-1 text-xs">
                                {riskDistData.map(d => (
                                    <div key={d.name} className="flex justify-between items-center">
                                        <span className="flex items-center gap-1.5">
                                            <div className="w-2 h-2 rounded-full" style={{backgroundColor: d.color}}></div>
                                            {d.name}
                                        </span>
                                        <span className="font-bold">{d.value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Quick Actions / Report Generator */}
                    <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-5 flex flex-col justify-between">
                        <div>
                            <h4 className="text-sm font-bold text-indigo-900 mb-1 flex items-center gap-2">
                                <Printer className="w-4 h-4" /> 综合汇报生成器
                            </h4>
                            <p className="text-xs text-indigo-700/80 mb-4">一键生成包含财务、风险、案件进展的综合管理报表。</p>
                        </div>
                        <div className="space-y-3">
                            <div className="flex gap-2">
                                {/* Report Type Selector */}
                                <div className="flex-1">
                                    <select 
                                        className="w-full text-xs border border-indigo-200 rounded px-2 py-1.5 bg-white outline-none focus:ring-2 focus:ring-indigo-500"
                                        value={`${reportType}|${reportSubType}`}
                                        onChange={(e) => {
                                            const [t, st] = e.target.value.split('|') as [InternalReportType, InternalReportSubType];
                                            setReportType(t);
                                            setReportSubType(st);
                                        }}
                                    >
                                        <option value={`${InternalReportType.PERIODIC}|${InternalReportSubType.MONTHLY}`}>月度综报</option>
                                        <option value={`${InternalReportType.PERIODIC}|${InternalReportSubType.QUARTERLY}`}>季度风控报告</option>
                                        <option value={`${InternalReportType.PERIODIC}|${InternalReportSubType.ANNUAL}`}>年度总结</option>
                                        <option value={`${InternalReportType.EVENT_DRIVEN}|${InternalReportSubType.CASE_BRIEF}`}>专项汇报</option>
                                    </select>
                                </div>

                                {/* Dynamic Time Selector */}
                                <div className="w-32 flex gap-1">
                                    {reportSubType === InternalReportSubType.MONTHLY && (
                                        <input 
                                            type="month" 
                                            className="w-full text-xs border border-indigo-200 rounded px-2 py-1.5 bg-white outline-none focus:ring-2 focus:ring-indigo-500"
                                            value={cycleMonth}
                                            onChange={(e) => setCycleMonth(e.target.value)}
                                        />
                                    )}
                                    
                                    {reportSubType === InternalReportSubType.QUARTERLY && (
                                        <>
                                            <select 
                                                className="w-16 text-xs border border-indigo-200 rounded px-1 py-1.5 bg-white outline-none"
                                                value={cycleYear}
                                                onChange={(e) => setCycleYear(Number(e.target.value))}
                                            >
                                                {[2026, 2025, 2024].map(y => <option key={y} value={y}>{y}</option>)}
                                            </select>
                                            <select 
                                                className="flex-1 text-xs border border-indigo-200 rounded px-1 py-1.5 bg-white outline-none"
                                                value={cycleQuarter}
                                                onChange={(e) => setCycleQuarter(e.target.value)}
                                            >
                                                {['Q1','Q2','Q3','Q4'].map(q => <option key={q} value={q}>{q}</option>)}
                                            </select>
                                        </>
                                    )}

                                    {reportSubType === InternalReportSubType.ANNUAL && (
                                        <select 
                                            className="w-full text-xs border border-indigo-200 rounded px-2 py-1.5 bg-white outline-none"
                                            value={cycleYear}
                                            onChange={(e) => setCycleYear(Number(e.target.value))}
                                        >
                                            {[2026, 2025, 2024].map(y => <option key={y} value={y}>{y}年</option>)}
                                        </select>
                                    )}

                                    {/* Ad-hoc hides time selector or shows disabled placeholder */}
                                    {reportType === InternalReportType.EVENT_DRIVEN && (
                                        <div className="w-full text-xs border border-transparent rounded px-2 py-1.5 text-indigo-400 italic text-center">
                                            无需周期
                                        </div>
                                    )}
                                </div>
                            </div>
                            
                            <Button 
                                onClick={handleInitiateReport} 
                                isLoading={isGenerating} 
                                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
                            >
                                {reportType === InternalReportType.EVENT_DRIVEN ? <FilePlus className="w-3 h-3 mr-1"/> : <Download className="w-3 h-3 mr-1" />}
                                {reportType === InternalReportType.EVENT_DRIVEN ? '创建专项报告' : '生成 Word/PPT 底稿'}
                            </Button>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    
                    {/* 2. Management Reports History */}
                    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col h-[400px]">
                        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                            <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                <Layers className="w-4 h-4 text-brand-600" /> 综合管理报表 (Management Reports)
                            </h3>
                            <button onClick={loadData} className="text-xs text-brand-600 hover:underline">刷新</button>
                        </div>
                        <div className="flex-1 overflow-y-auto">
                            {reports.length === 0 ? (
                                <div className="p-8 text-center text-slate-400">暂无报表记录</div>
                            ) : (
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-50 text-slate-500 font-medium text-xs">
                                        <tr>
                                            <th className="px-6 py-3">报告名称</th>
                                            <th className="px-6 py-3">周期</th>
                                            <th className="px-6 py-3">类型</th>
                                            <th className="px-6 py-3 text-right">操作</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {reports.map(rpt => (
                                            <tr key={rpt.id} className="hover:bg-slate-50">
                                                <td className="px-6 py-3">
                                                    <div className="flex items-center gap-2 cursor-pointer" onClick={() => setSelectedReport(rpt)}>
                                                        <div className="p-1.5 bg-blue-50 text-blue-600 rounded">
                                                            <FileText className="w-4 h-4" />
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="font-medium text-slate-700 hover:text-brand-600 hover:underline">{rpt.title}</span>
                                                            <span className="text-[10px] text-slate-400">{rpt.generatedAt}</span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-3 text-xs font-mono text-slate-500">{rpt.cycle}</td>
                                                <td className="px-6 py-3 text-xs">
                                                    <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded">
                                                        {getReportTypeLabel(rpt.type, rpt.subType)}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-3 text-right">
                                                    <button 
                                                        onClick={() => setSelectedReport(rpt)}
                                                        className="text-xs text-slate-500 hover:text-brand-600 hover:underline flex items-center justify-end gap-1 ml-auto"
                                                    >
                                                        <Eye className="w-3 h-3" /> 预览
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>

                    {/* 3. Major Case Briefings */}
                    {/* ... (remains same) */}
                    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col h-[400px]">
                        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                            <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                <FileText className="w-4 h-4 text-red-600" /> 重大案件签报 (Case Briefings)
                            </h3>
                            <button onClick={loadData} className="text-xs text-brand-600 hover:underline">刷新</button>
                        </div>
                        <div className="flex-1 overflow-y-auto">
                            {briefings.length === 0 ? (
                                <div className="p-8 text-center text-slate-400">暂无签报记录</div>
                            ) : (
                                <div className="divide-y divide-slate-100">
                                    {briefings.map(b => (
                                        <div key={b.id} className="p-4 hover:bg-slate-50 transition-colors flex items-center justify-between group">
                                            <div className="flex items-start gap-3">
                                                <div className="mt-1 p-1.5 bg-red-50 text-red-600 rounded border border-red-100">
                                                    <ShieldAlert className="w-4 h-4" />
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-xs font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">
                                                            {b.type}
                                                        </span>
                                                        <span className="text-sm font-bold text-slate-800 line-clamp-1 max-w-[180px]" title={b.caseTitle}>
                                                            {b.caseTitle}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-3 text-xs text-slate-400">
                                                        <span>{b.generatedAt}</span>
                                                        <span>By {b.generator}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                {/* Status Badge */}
                                                <span className={`text-[10px] px-2 py-0.5 rounded-full mb-1 inline-block ${
                                                    b.status === 'OA审批中' ? 'bg-amber-50 text-amber-600' :
                                                    b.status === '已归档' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'
                                                }`}>
                                                    {b.status}
                                                </span>
                                                {/* Action Button: Visible on Hover or always visible for better UX */}
                                                <div className="mt-1">
                                                    <button 
                                                        className="text-xs flex items-center gap-1 text-brand-600 hover:text-brand-800 bg-brand-50 hover:bg-brand-100 px-2 py-1 rounded transition-colors"
                                                        onClick={() => handleOpenBriefing(b)}
                                                    >
                                                        <Edit className="w-3 h-3" /> 预览 / 编辑
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                </div>
            </>
        )}
    </div>
  );
};

export default InternalReportingView;
