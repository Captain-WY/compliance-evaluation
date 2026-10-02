
import React, { useState, useEffect, useMemo } from 'react';
import { Case, RiskLevel } from '../../types';
import {
  getReportDefinitions,
  createReportingTaskBff,
  createSnapshotBff,
  listGovernanceIssues,
  getCases,
  type ReportDefinitionFromRule,
  type DataQualityIssueRecord,
} from '../../services/case';
import {
  CheckCircle2, ChevronRight, FileSpreadsheet, FileText, AlertTriangle,
  Download, Send, Loader2, Calendar, Lock, Database, Filter, Plus,
  RefreshCw, Search, ArrowUpDown, X, ListFilter, Edit2, AlertOctagon,
} from 'lucide-react';
import Button from '../../components/ui/Button';

interface ReportGeneratorWizardProps {
  onClose: () => void;
  onSuccess: () => void;
  definitions: ReportDefinitionFromRule[];
  initialDefinitionId?: string;
}

type CycleType = 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'CUSTOM';

// D97: BLOCKER 检查结果展示组件
const BlockerAlert: React.FC<{ issues: DataQualityIssueRecord[]; onClose: () => void }> = ({ issues, onClose }) => (
  <div className="fixed inset-0 z-[200] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
    <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
      <div className="bg-red-50 px-6 py-4 border-b border-red-100 flex justify-between items-center">
        <h3 className="font-bold text-red-800 flex items-center gap-2">
          <AlertOctagon className="w-5 h-5" /> 数据治理阻断 — 无法生成快照
        </h3>
        <button onClick={onClose}><X className="w-5 h-5 text-red-400 hover:text-red-600" /></button>
      </div>
      <div className="p-6 space-y-4">
        <p className="text-sm text-slate-600">
          以下 <span className="font-bold text-red-600">{issues.length} 项 BLOCKER 级数据质量问题</span>
          未解决，无法生成快照。请先在"数据质量治理"页面处理后再操作。
        </p>
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {issues.map(issue => (
            <div key={issue.issueId} className="bg-red-50 border border-red-100 rounded p-3 text-xs">
              <div className="flex items-start gap-2">
                <AlertOctagon className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-mono text-slate-500 mr-2">{issue.caseCode || '—'}</span>
                  <span className="text-slate-800">{issue.description}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end">
        <Button onClick={onClose}>知道了，去处理</Button>
      </div>
    </div>
  </div>
);

const ReportGeneratorWizard: React.FC<ReportGeneratorWizardProps> = ({
  onClose, onSuccess, definitions: externalDefs, initialDefinitionId,
}) => {
  const [step, setStep] = useState(1);
  const [selectedDef, setSelectedDef] = useState<ReportDefinitionFromRule | null>(null);
  const [taskName, setTaskName] = useState('');

  // D95: 若外部传空数组则从 BFF 加载
  const [defs, setDefs] = useState<ReportDefinitionFromRule[]>(externalDefs);
  const [defsLoading, setDefsLoading] = useState(false);

  // 周期
  const [cycleType, setCycleType] = useState<CycleType>('MONTHLY');
  const [yearVal, setYearVal] = useState(new Date().getFullYear());
  const [quarterVal, setQuarterVal] = useState('Q1');
  const [monthVal, setMonthVal] = useState(new Date().toISOString().slice(0, 7));
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [cycleValue, setCycleValue] = useState('');
  const [lockDate, setLockDate] = useState('');

  const [loading, setLoading] = useState(false);

  // D97: BLOCKER 检查
  const [blockerIssues, setBlockerIssues] = useState<DataQualityIssueRecord[]>([]);
  const [showBlockerAlert, setShowBlockerAlert] = useState(false);

  // 任务创建结果
  const [createdTaskId, setCreatedTaskId] = useState<string | null>(null);
  const [createdSnapshotId, setCreatedSnapshotId] = useState<string | null>(null);

  // Step 2
  const [previewData, setPreviewData] = useState<Case[]>([]);
  const [excludedCaseIds, setExcludedCaseIds] = useState<Set<string>>(new Set());
  const [w2Search, setW2Search] = useState('');
  const [w2RiskFilter, setW2RiskFilter] = useState('ALL');
  const [w2Sort, setW2Sort] = useState<'AMOUNT_DESC' | 'AMOUNT_ASC'>('AMOUNT_DESC');

  // D95: 加载 definitions
  useEffect(() => {
    if (externalDefs.length === 0) {
      setDefsLoading(true);
      getReportDefinitions().then(d => {
        setDefs(d);
        setDefsLoading(false);
      }).catch(() => setDefsLoading(false));
    } else {
      setDefs(externalDefs);
    }
  }, [externalDefs]);

  useEffect(() => {
    if (initialDefinitionId && defs.length > 0) {
      const def = defs.find(d => d.id === initialDefinitionId);
      if (def) handleDefSelection(def);
    }
  }, [initialDefinitionId, defs]);

  // 周期值计算
  useEffect(() => {
    let finalCycle = '';
    let idealLock = '';
    if (cycleType === 'ANNUAL') {
      finalCycle = `${yearVal}`;
      idealLock = `${yearVal}-12-31`;
    } else if (cycleType === 'QUARTERLY') {
      finalCycle = `${yearVal}-${quarterVal}`;
      const qMap: Record<string, string> = { Q1: '03-31', Q2: '06-30', Q3: '09-30', Q4: '12-31' };
      idealLock = `${yearVal}-${qMap[quarterVal]}`;
    } else if (cycleType === 'MONTHLY') {
      finalCycle = monthVal;
      const [y, m] = monthVal.split('-').map(Number);
      if (y && m) idealLock = `${monthVal}-${new Date(y, m, 0).getDate()}`;
    } else if (cycleType === 'CUSTOM' && rangeStart && rangeEnd) {
      finalCycle = `${rangeStart}~${rangeEnd}`;
      idealLock = rangeEnd;
    }
    setCycleValue(finalCycle);
    setLockDate(idealLock || new Date().toISOString().split('T')[0]);
    if (selectedDef) setTaskName(`${selectedDef.name} - ${finalCycle || '未定周期'}`);
  }, [cycleType, yearVal, quarterVal, monthVal, rangeStart, rangeEnd, selectedDef]);

  const handleDefSelection = (def: ReportDefinitionFromRule) => {
    setSelectedDef(def);
    if (def.frequency === 'ANNUAL') setCycleType('ANNUAL');
    else if (def.frequency === 'QUARTERLY') setCycleType('QUARTERLY');
    else if (def.triggerType === 'EVENT_TRIGGERED') setCycleType('CUSTOM');
    else setCycleType('MONTHLY');
  };

  // D97: Step 1 → Step 2 — 创建任务 + 快照 (含 BLOCKER 检查)
  const handleNextToPreview = async () => {
    if (!selectedDef || !cycleValue) return;
    setLoading(true);
    try {
      // D97: 先检查 BLOCKER 问题
      const blockers = await listGovernanceIssues({ severity: 'BLOCKER', status: 'PENDING' });
      if (blockers.length > 0) {
        setBlockerIssues(blockers);
        setShowBlockerAlert(true);
        return;
      }

      // 创建任务
      const taskResult = await createReportingTaskBff({
        taskName,
        cycleValue,
        dueDate: lockDate,
      });
      if (!taskResult) throw new Error('创建任务失败');
      setCreatedTaskId(taskResult.taskId);

      // 创建快照 (D9: 后端再次检查 BLOCKER, 返回 4210 则抛出)
      try {
        const snapResult = await createSnapshotBff({
          taskId: taskResult.taskId,
          snapshotName: `${taskName}_快照_${lockDate}`,
          lockDate,
        });
        setCreatedSnapshotId(snapResult.snapshotId);
      } catch (snapErr: unknown) {
        // 4210: BLOCKER 阻断 (后端二次校验)
        const code = (snapErr as { response?: { data?: { code?: number } } })?.response?.data?.code;
        if (code === 4210) {
          const freshBlockers = await listGovernanceIssues({ severity: 'BLOCKER', status: 'PENDING' });
          setBlockerIssues(freshBlockers);
          setShowBlockerAlert(true);
          return;
        }
        throw snapErr;
      }

      const cases = await getCases();
      setPreviewData(cases);
      setStep(2);
    } catch {
      // 静默处理，用户可重试
    } finally {
      setLoading(false);
    }
  };

  const filteredPreview = useMemo(() => {
    let result = previewData;
    if (w2Search) {
      const q = w2Search.toLowerCase();
      result = result.filter(c =>
        c.title.toLowerCase().includes(q) || c.code.toLowerCase().includes(q) || c.plaintiff.includes(w2Search),
      );
    }
    if (w2RiskFilter !== 'ALL') result = result.filter(c => c.riskLevel === w2RiskFilter);
    result = [...result].sort((a, b) => {
      const amtA = a.regulatoryAttrs?.amountNoInterest || 0;
      const amtB = b.regulatoryAttrs?.amountNoInterest || 0;
      return w2Sort === 'AMOUNT_DESC' ? amtB - amtA : amtA - amtB;
    });
    return result;
  }, [previewData, w2Search, w2RiskFilter, w2Sort]);

  const toggleExclude = (id: string) => {
    const s = new Set(excludedCaseIds);
    if (s.has(id)) s.delete(id); else s.add(id);
    setExcludedCaseIds(s);
  };

  const handleBulkExclude = (exclude: boolean) => {
    const s = new Set(excludedCaseIds);
    filteredPreview.forEach(c => { if (exclude) s.add(c.id); else s.delete(c.id); });
    setExcludedCaseIds(s);
  };

  // Step 2 → Step 3: 锁定案件 (无额外 API 调用，案件圈定已在快照阶段完成)
  const handleConfirmCases = () => {
    setStep(3);
  };

  const renderCycleSelector = () => (
    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
      <label className="block text-xs font-bold text-slate-500 uppercase mb-3">报送周期设定</label>
      <div className="flex bg-slate-200 p-1 rounded-lg mb-4">
        {[{ id: 'MONTHLY', label: '月度' }, { id: 'QUARTERLY', label: '季度' }, { id: 'ANNUAL', label: '年度' }, { id: 'CUSTOM', label: '自定义区间' }].map(tab => (
          <button
            key={tab.id}
            onClick={() => setCycleType(tab.id as CycleType)}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
              cycleType === tab.id ? 'bg-white text-brand-600 shadow-sm font-bold' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3 animate-in fade-in">
        <Calendar className="w-4 h-4 text-slate-400" />
        {cycleType === 'MONTHLY' && (
          <input type="month" className="flex-1 border border-slate-300 rounded px-3 py-2 text-sm outline-none focus:border-brand-500" value={monthVal} onChange={e => setMonthVal(e.target.value)} />
        )}
        {cycleType === 'QUARTERLY' && (
          <div className="flex-1 flex gap-2">
            <select className="w-1/2 border border-slate-300 rounded px-3 py-2 text-sm outline-none" value={yearVal} onChange={e => setYearVal(Number(e.target.value))}>
              {[2026, 2025, 2024, 2023].map(y => <option key={y} value={y}>{y}年</option>)}
            </select>
            <select className="w-1/2 border border-slate-300 rounded px-3 py-2 text-sm outline-none" value={quarterVal} onChange={e => setQuarterVal(e.target.value)}>
              <option value="Q1">第一季度 (Q1)</option>
              <option value="Q2">第二季度 (Q2)</option>
              <option value="Q3">第三季度 (Q3)</option>
              <option value="Q4">第四季度 (Q4)</option>
            </select>
          </div>
        )}
        {cycleType === 'ANNUAL' && (
          <select className="flex-1 border border-slate-300 rounded px-3 py-2 text-sm outline-none" value={yearVal} onChange={e => setYearVal(Number(e.target.value))}>
            {[2026, 2025, 2024, 2023].map(y => <option key={y} value={y}>{y} 年度</option>)}
          </select>
        )}
        {cycleType === 'CUSTOM' && (
          <div className="flex-1 flex items-center gap-2">
            <input type="date" className="w-1/2 border border-slate-300 rounded px-2 py-2 text-xs" value={rangeStart} onChange={e => setRangeStart(e.target.value)} />
            <span className="text-slate-400">-</span>
            <input type="date" className="w-1/2 border border-slate-300 rounded px-2 py-2 text-xs" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} />
          </div>
        )}
      </div>
      <p className="text-[10px] text-slate-400 mt-2 text-right">
        快照锁定日 (As-Of): <span className="font-mono font-bold text-slate-600">{lockDate || '--'}</span>
      </p>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-slate-900/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
      {showBlockerAlert && (
        <BlockerAlert issues={blockerIssues} onClose={() => setShowBlockerAlert(false)} />
      )}

      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col h-[650px] max-h-[90vh]">
        {/* Header */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex justify-between items-center shrink-0">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-brand-600" /> 报送任务生成向导
          </h3>
          <div className="flex items-center gap-2 text-xs font-bold">
            {[{ n: 1, label: '选模板 & 定源' }, { n: 2, label: '清洗 & 锁定' }, { n: 3, label: '生成任务' }].map(s => (
              <React.Fragment key={s.n}>
                {s.n > 1 && <span className="text-slate-300"><ChevronRight className="w-3 h-3" /></span>}
                <span className={`px-2 py-1 rounded ${step >= s.n ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-500'}`}>{s.n}. {s.label}</span>
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-8 overflow-hidden">

          {/* STEP 1 */}
          {step === 1 && (
            <div className="flex h-full gap-6">
              <div className="w-5/12 flex flex-col border-r border-slate-100 pr-6">
                <h4 className="text-xs font-bold text-slate-500 uppercase mb-4">1. 选择报表规则</h4>
                {defsLoading ? (
                  <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" /> 加载报表规则...
                  </div>
                ) : defs.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center text-slate-400 text-sm text-center">
                    <div>
                      <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p>暂无可用报表规则</p>
                      <p className="text-xs mt-1">请在"规则配置"中将规则动作设为"生成报送任务"</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 overflow-y-auto pr-2 flex-1">
                    {defs.map(def => (
                      <div
                        key={def.id}
                        onClick={() => handleDefSelection(def)}
                        className={`p-3 border rounded-xl cursor-pointer transition-all relative ${
                          selectedDef?.id === def.id
                            ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500'
                            : 'border-slate-200 hover:border-brand-300 hover:shadow-sm'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                            def.format === 'EXCEL' ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-100 text-blue-600'
                          }`}>
                            {def.format === 'EXCEL' ? <FileSpreadsheet className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                          </div>
                          <div>
                            <h4 className="font-bold text-sm text-slate-800">{def.name}</h4>
                            <div className="flex gap-2 mt-1">
                              <span className="text-[10px] text-slate-500 bg-white px-1.5 py-0.5 rounded border">{def.targetOrg}</span>
                              <span className="text-[10px] text-slate-400">{def.triggerType === 'TIME_TRIGGERED' ? '定时触发' : '事件触发'}</span>
                            </div>
                          </div>
                        </div>
                        {selectedDef?.id === def.id && (
                          <div className="absolute top-3 right-3 text-brand-600"><CheckCircle2 className="w-4 h-4" /></div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="w-7/12 flex flex-col overflow-y-auto pr-2 space-y-4">
                {renderCycleSelector()}

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">任务名称</label>
                  <div className="relative">
                    <input
                      type="text"
                      className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none pr-8"
                      value={taskName}
                      onChange={e => setTaskName(e.target.value)}
                      placeholder="系统自动生成，可手动修改"
                    />
                    <Edit2 className="w-4 h-4 absolute right-2.5 top-2.5 text-slate-400 pointer-events-none" />
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                  <div className="flex items-start gap-2 text-xs text-blue-700">
                    <Database className="w-4 h-4 shrink-0 mt-0.5 text-blue-500" />
                    <div>
                      <p className="font-bold mb-1">数据快照说明</p>
                      <p>点击"下一步"将自动检查数据质量（BLOCKER 阻断项清零后）并生成锁定快照，快照日期为 <span className="font-mono font-bold">{lockDate || '--'}</span>。</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <div className="space-y-4 flex flex-col h-full">
              <div className="flex items-center justify-between bg-emerald-50 p-3 rounded-lg border border-emerald-100 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded bg-emerald-100 text-emerald-600">
                    <Lock className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 font-bold uppercase">快照已生成</p>
                    <p className="text-sm font-bold text-slate-800 font-mono">{createdSnapshotId?.slice(0, 16)}...</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500">纳入统计案件</p>
                  <p className="text-lg font-bold text-brand-600 font-mono">
                    {filteredPreview.length - excludedCaseIds.size} <span className="text-xs text-slate-400">/ {previewData.length}</span>
                  </p>
                </div>
              </div>

              <div className="flex gap-3 items-center bg-white p-2 border border-slate-200 rounded-lg shrink-0 shadow-sm">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="搜索案号、名称..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded focus:ring-2 focus:ring-brand-500 outline-none"
                    value={w2Search}
                    onChange={e => setW2Search(e.target.value)}
                  />
                </div>
                <div className="h-6 w-px bg-slate-200"></div>
                <select
                  className="text-xs border border-slate-300 rounded py-1.5 px-2 outline-none focus:border-brand-500"
                  value={w2RiskFilter}
                  onChange={e => setW2RiskFilter(e.target.value)}
                >
                  <option value="ALL">全部风险等级</option>
                  {Object.values(RiskLevel).map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <button
                  onClick={() => setW2Sort(w2Sort === 'AMOUNT_DESC' ? 'AMOUNT_ASC' : 'AMOUNT_DESC')}
                  className="flex items-center gap-1 px-3 py-1.5 rounded border text-xs bg-brand-50 border-brand-200 text-brand-700"
                >
                  <ArrowUpDown className="w-3 h-3" />
                  {w2Sort === 'AMOUNT_DESC' ? '金额降序' : '金额升序'}
                </button>
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden flex-1 relative flex flex-col bg-white">
                <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex justify-between items-center shrink-0">
                  <span className="text-xs font-bold text-slate-500 flex items-center gap-2">
                    <ListFilter className="w-3 h-3" /> 数据清洗列表（勾选则剔除）
                  </span>
                  <div className="flex gap-2">
                    <button onClick={() => handleBulkExclude(true)} className="text-[10px] bg-white border border-slate-200 hover:border-red-300 text-slate-600 hover:text-red-600 px-2 py-1 rounded transition-colors">
                      全选剔除
                    </button>
                    <button onClick={() => handleBulkExclude(false)} className="text-[10px] bg-white border border-slate-200 hover:border-emerald-300 text-slate-600 hover:text-emerald-600 px-2 py-1 rounded transition-colors">
                      全选保留
                    </button>
                  </div>
                </div>
                <div className="overflow-auto flex-1">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 font-bold text-slate-500 sticky top-0 z-10 shadow-sm">
                      <tr>
                        <th className="px-4 py-2 w-16 text-center">剔除</th>
                        <th className="px-4 py-2">案号</th>
                        <th className="px-4 py-2">案件名称</th>
                        <th className="px-4 py-2">阶段</th>
                        <th className="px-4 py-2 text-right">涉案金额</th>
                        <th className="px-4 py-2 text-center">风险</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredPreview.length === 0 ? (
                        <tr><td colSpan={6} className="p-8 text-center text-slate-400">无符合条件的案件</td></tr>
                      ) : filteredPreview.map(c => (
                        <tr key={c.id} className={`transition-colors ${excludedCaseIds.has(c.id) ? 'bg-slate-50 opacity-50 grayscale' : 'hover:bg-blue-50/30'}`}>
                          <td className="px-4 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={excludedCaseIds.has(c.id)}
                              onChange={() => toggleExclude(c.id)}
                              className="rounded text-red-500 focus:ring-red-500 cursor-pointer w-4 h-4 border-slate-300"
                            />
                          </td>
                          <td className="px-4 py-2 font-mono text-slate-600">{c.code}</td>
                          <td className="px-4 py-2 truncate max-w-[180px]" title={c.title}>{c.title}</td>
                          <td className="px-4 py-2 truncate">{c.stage}</td>
                          <td className="px-4 py-2 text-right font-mono">¥{(c.regulatoryAttrs?.amountNoInterest || 0).toLocaleString()}</td>
                          <td className="px-4 py-2 text-center">
                            <span className={`px-1.5 py-0.5 rounded ${c.riskLevel === '特大' ? 'bg-red-100 text-red-700' : 'bg-slate-100'}`}>
                              {c.riskLevel}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3 */}
          {step === 3 && (
            <div className="text-center py-8 space-y-6 flex flex-col items-center justify-center h-full animate-in fade-in zoom-in-95">
              <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center animate-bounce">
                <CheckCircle2 className="w-10 h-10 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-800">报送任务已创建</h3>
                <p className="text-slate-500 mt-2">
                  任务 ID: <span className="font-mono font-bold text-slate-700">{createdTaskId?.slice(0, 16)}...</span>
                </p>
              </div>

              <div className="bg-slate-50 rounded-lg p-6 max-w-sm w-full border border-slate-200 text-left space-y-3 shadow-sm">
                <div className="flex justify-between text-sm border-b border-slate-200 pb-2 mb-2">
                  <span className="text-slate-500">任务名称:</span>
                  <span className="font-bold text-slate-800 truncate max-w-[160px]">{taskName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">数据源:</span>
                  <span className="font-bold text-slate-800 flex items-center gap-1">
                    <Lock className="w-3 h-3 text-emerald-600" /> 快照已锁定
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">报送周期:</span>
                  <span className="font-mono font-bold text-slate-800">{cycleValue}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">快照日期:</span>
                  <span className="font-mono text-slate-800">{lockDate}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">纳入案件:</span>
                  <span className="font-mono text-slate-800">{previewData.length - excludedCaseIds.size} 件</span>
                </div>
                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-200 text-xs text-slate-400">
                  <AlertTriangle className="w-3 h-3 text-amber-500" />
                  AI 摘要与定稿渲染可在工作台详情页操作
                </div>
              </div>

              <div className="flex justify-center gap-4 mt-4">
                <Button variant="outline" onClick={onClose}>
                  <Download className="w-4 h-4 mr-2" /> 返回工作台
                </Button>
                <Button onClick={onSuccess}>
                  <Send className="w-4 h-4 mr-2" /> 前往提交审批
                </Button>
              </div>
            </div>
          )}
        </div>

        {step < 3 && (
          <div className="px-6 py-4 border-t border-slate-200 flex justify-between items-center bg-white shrink-0">
            <Button variant="ghost" onClick={step === 1 ? onClose : () => setStep(step - 1)}>
              {step === 1 ? '取消' : '上一步'}
            </Button>
            <Button
              onClick={step === 1 ? handleNextToPreview : handleConfirmCases}
              isLoading={loading}
              disabled={step === 1 && (!selectedDef || !cycleValue)}
            >
              {step === 1 ? '下一步（生成快照）' : '确认并生成任务'} <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportGeneratorWizard;
