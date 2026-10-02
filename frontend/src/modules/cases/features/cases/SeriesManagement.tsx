
import React, { useEffect, useState, useMemo } from 'react';
import { Case, CaseStage, FinancialRecord } from '../../types';
import { getCases, batchUpdateCaseStage, getFinanceSnapshot } from '../../services/case';
import { Users, Filter, CheckSquare, Square, Edit, TrendingUp, RefreshCw, Flag, GitBranch, Wallet, Gavel, AlertTriangle, ArrowRight, Layers, BarChart3 } from 'lucide-react';
import Button from '../../components/ui/Button';
import { PieChart as RePie, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface SeriesManagementProps {
  masterCase: Case;
}

const SeriesManagement: React.FC<SeriesManagementProps> = ({ masterCase }) => {
  const [children, setChildren] = useState<Case[]>([]);
  const [finances, setFinances] = useState<Record<string, FinancialRecord>>({});
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  // Bulk Action State
  const [showBulkAction, setShowBulkAction] = useState(false);
  const [targetStage, setTargetStage] = useState<CaseStage | ''>('');
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    loadData();
  }, [masterCase.id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const allCases = await getCases();
      const kids = allCases.filter(c => c.parentId === masterCase.id);
      setChildren(kids);

      // D77: otherFeesPaid is always 0 from BFF snapshot (no breakdown endpoint yet)
      // D78: N+1 Promise.all accepted — series cases typically ≤ 50
      const financeRecords = await Promise.all(kids.map(k => getFinanceSnapshot(k.id)));
      const financeMap: Record<string, FinancialRecord> = {};
      kids.forEach((k, i) => {
        if (financeRecords[i]) {
          financeMap[k.id] = financeRecords[i]!;
        }
      });
      setFinances(financeMap);
    } finally {
      setLoading(false);
    }
  };

  // --- Aggregation Engine ---
  const { stats, pilotCase, stageCounts } = useMemo(() => {
      const total = children.length;
      
      // Finance Aggregation
      let totalExposure = 0;
      let totalProvision = 0;
      let totalLegalCost = 0;
      let totalRecovery = 0;

      children.forEach(c => {
          // Fallback to regulatory amount if finance record missing (unlikely in this mock)
          totalExposure += (finances[c.id]?.claimedAmount || c.regulatoryAttrs?.amountNoInterest || 0);
          totalProvision += (finances[c.id]?.provisionAmount || 0);
          totalLegalCost += (finances[c.id]?.legalFeePaid || 0) + (finances[c.id]?.otherFeesPaid || 0);
          totalRecovery += (finances[c.id]?.executedAmount || 0);
      });

      const stageMap = children.reduce((acc, c) => {
          acc[c.stage] = (acc[c.stage] || 0) + 1;
          return acc;
      }, {} as Record<string, number>);
      
      const chartData = Object.entries(stageMap).map(([name, value]) => ({ name, value }));
      
      const pilot = children.find(c => c.isPilot);
      
      return { 
          stats: { total, totalExposure, totalProvision, totalLegalCost, totalRecovery, chartData }, 
          pilotCase: pilot,
          stageCounts: stageMap
      };
  }, [children, finances]);

  // Check if pilot is ahead
  const showPilotSuggestion = useMemo(() => {
      if (!pilotCase) return false;
      const behindCount = children.filter(c => c.stage !== pilotCase.stage && c.id !== pilotCase.id).length;
      return behindCount > 0;
  }, [pilotCase, children]);

  // Selection
  const toggleSelectAll = () => {
      if (selectedIds.size === children.length) setSelectedIds(new Set());
      else setSelectedIds(new Set(children.map(c => c.id)));
  };

  const toggleSelect = (id: string) => {
      const newSet = new Set(selectedIds);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      setSelectedIds(newSet);
  };

  const handleBulkUpdate = async () => {
      if (!targetStage || selectedIds.size === 0) return;
      
      setIsUpdating(true);
      await batchUpdateCaseStage(Array.from(selectedIds), targetStage);
      await loadData();
      
      setIsUpdating(false);
      setShowBulkAction(false);
      setSelectedIds(new Set());
      setTargetStage('');
  };

  const handleSyncFromPilot = () => {
      if (!pilotCase) return;
      const laggingIds = new Set(children.filter(c => c.stage !== pilotCase.stage && c.id !== pilotCase.id).map(c => c.id));
      setSelectedIds(laggingIds);
      setTargetStage(pilotCase.stage);
      setShowBulkAction(true);
  };

  const fmtMoney = (val: number) => {
      if (val > 100000000) return `¥ ${(val / 100000000).toFixed(2)} 亿`;
      if (val > 10000) return `¥ ${(val / 10000).toFixed(0)} 万`;
      return `¥ ${val}`;
  };

  const getPercentage = (count: number) => {
      if (stats.total === 0) return 0;
      return Math.round((count / stats.total) * 100);
  };

  if (loading) return <div className="p-12 text-center text-slate-400">正在聚合系列案数据...</div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
       
       {/* 1. Pilot Case Recommendation (Sync Engine) */}
       {showPilotSuggestion && pilotCase && (
           <div className="bg-gradient-to-r from-indigo-50 to-white border border-indigo-200 rounded-xl p-4 flex items-center justify-between shadow-sm">
               <div className="flex items-center gap-4">
                   <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 shadow-inner">
                       <Flag className="w-5 h-5" />
                   </div>
                   <div>
                       <h4 className="font-bold text-indigo-900 text-sm flex items-center gap-2">
                           示范效应触发 (Pilot Trigger)
                           <span className="text-[10px] bg-indigo-200 text-indigo-800 px-1.5 py-0.5 rounded-full">Automated</span>
                       </h4>
                       <p className="text-xs text-indigo-700 mt-1">
                           示范案件 <span className="font-mono font-bold mx-1">{pilotCase.code}</span> 已推进至 <span className="font-bold border-b border-indigo-300">{pilotCase.stage}</span>。
                           检测到 <span className="font-bold text-indigo-900">{children.filter(c => c.stage !== pilotCase.stage && c.id !== pilotCase.id).length}</span> 个关联案件滞后，建议批量同步进度。
                       </p>
                   </div>
               </div>
               <Button size="sm" onClick={handleSyncFromPilot} className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-200">
                   <GitBranch className="w-4 h-4 mr-1" /> 一键同步 ({children.filter(c => c.stage !== pilotCase.stage && c.id !== pilotCase.id).length})
               </Button>
           </div>
       )}

       {/* 2. Aggregated Finance Dashboard */}
       <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
           {/* Total Exposure */}
           <div className="bg-slate-900 rounded-xl p-5 text-white shadow-lg relative overflow-hidden group">
               <div className="relative z-10">
                   <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">系列案总敞口 (Exposure)</p>
                   <p className="text-2xl font-bold tracking-tight text-white">{fmtMoney(stats.totalExposure)}</p>
                   <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
                       <Users className="w-3 h-3" />
                       <span>涉及 {stats.total} 位原告</span>
                   </div>
               </div>
               <TrendingUp className="absolute right-3 bottom-3 w-16 h-16 text-slate-800 group-hover:text-slate-700 transition-colors" />
           </div>

           {/* Provision */}
           <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:border-red-300 transition-colors group">
               <div className="flex justify-between items-start">
                   <div>
                       <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">累计计提坏账 (Provision)</p>
                       <p className="text-2xl font-bold text-red-600">{fmtMoney(stats.totalProvision)}</p>
                   </div>
                   <div className="p-2 bg-red-50 rounded-lg text-red-500 group-hover:bg-red-100 transition-colors">
                       <AlertTriangle className="w-5 h-5" />
                   </div>
               </div>
               <div className="mt-4 w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                   <div className="bg-red-500 h-full transition-all duration-1000" style={{ width: `${stats.totalExposure > 0 ? (stats.totalProvision / stats.totalExposure) * 100 : 0}%` }}></div>
               </div>
               <p className="text-[10px] text-slate-400 mt-1 text-right">计提比例 {stats.totalExposure > 0 ? ((stats.totalProvision / stats.totalExposure) * 100).toFixed(1) : '0.0'}%</p>
           </div>

           {/* Legal Cost */}
           <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:border-blue-300 transition-colors group">
               <div className="flex justify-between items-start">
                   <div>
                       <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">累计维权成本 (Cost)</p>
                       <p className="text-2xl font-bold text-blue-600">{fmtMoney(stats.totalLegalCost)}</p>
                   </div>
                   <div className="p-2 bg-blue-50 rounded-lg text-blue-500 group-hover:bg-blue-100 transition-colors">
                       <Gavel className="w-5 h-5" />
                   </div>
               </div>
               <p className="text-xs text-slate-400 mt-4">平均单案成本: {fmtMoney(stats.totalLegalCost / (stats.total || 1))}</p>
           </div>

           {/* Recovery */}
           <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:border-emerald-300 transition-colors group">
               <div className="flex justify-between items-start">
                   <div>
                       <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">累计执行回款 (Recovery)</p>
                       <p className="text-2xl font-bold text-emerald-600">{fmtMoney(stats.totalRecovery)}</p>
                   </div>
                   <div className="p-2 bg-emerald-50 rounded-lg text-emerald-500 group-hover:bg-emerald-100 transition-colors">
                       <Wallet className="w-5 h-5" />
                   </div>
               </div>
               <div className="mt-4 w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                   <div className="bg-emerald-500 h-full transition-all duration-1000" style={{ width: `${stats.totalExposure > 0 ? (stats.totalRecovery / stats.totalExposure) * 100 : 0}%` }}></div>
               </div>
               <p className="text-[10px] text-slate-400 mt-1 text-right">回款率 {stats.totalExposure > 0 ? ((stats.totalRecovery / stats.totalExposure) * 100).toFixed(1) : '0.0'}%</p>
           </div>
       </div>

       {/* 3. Stage Funnel & Analytics */}
       <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
           <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
               <h3 className="font-bold text-slate-800 text-sm mb-6 flex items-center gap-2">
                   <BarChart3 className="w-4 h-4 text-brand-600" /> 审级漏斗分析 (Judicial Funnel)
               </h3>
               <div className="space-y-4">
                   {[CaseStage.FIRST_INSTANCE, CaseStage.SECOND_INSTANCE, CaseStage.ENFORCEMENT, CaseStage.CLOSED].map((stage, idx) => {
                       const count = stageCounts[stage] || 0;
                       const pct = getPercentage(count);
                       const colors = ['bg-blue-500', 'bg-indigo-500', 'bg-amber-500', 'bg-emerald-500'];
                       
                       return (
                           <div key={stage} className="relative">
                               <div className="flex justify-between text-xs mb-1 font-medium text-slate-600">
                                   <span className="flex items-center gap-2">
                                       <span className={`w-2 h-2 rounded-full ${colors[idx % 4]}`}></span>
                                       {stage}
                                   </span>
                                   <span>{count} 案 ({pct}%)</span>
                               </div>
                               <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                                   <div 
                                        className={`h-full ${colors[idx % 4]} transition-all duration-1000 ease-out`} 
                                        style={{ width: `${pct}%` }}
                                   ></div>
                               </div>
                           </div>
                       );
                   })}
               </div>
           </div>

           <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 flex flex-col items-center justify-center text-center space-y-4">
               <div className="p-4 bg-white rounded-full text-brand-600 shadow-sm border border-slate-100">
                   <Layers className="w-8 h-8" />
               </div>
               <div>
                   <h3 className="font-bold text-slate-800">批量作业中心</h3>
                   <p className="text-xs text-slate-500 mt-2 px-6 leading-relaxed">
                       支持对选中的子案件进行状态流转、庭审排期、文书生成等批量操作，大幅提升系列案管理效率。
                   </p>
               </div>
               <Button variant="outline" size="sm" onClick={() => { setSelectedIds(new Set()); setShowBulkAction(true); }}>
                   进入批量模式
               </Button>
           </div>
       </div>

       {/* 4. Child Cases Table */}
       <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
           <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
               <h3 className="font-bold text-slate-800 text-sm">子案件明细 ({children.length})</h3>
               <div className="flex gap-2">
                   <Button size="sm" variant="ghost" className="text-slate-500 hover:text-brand-600">
                       <Filter className="w-4 h-4 mr-1" /> 筛选
                   </Button>
               </div>
           </div>

           {/* Bulk Toolbar */}
           {showBulkAction && (
               <div className="bg-brand-50 px-6 py-3 border-b border-brand-100 flex items-center justify-between animate-in slide-in-from-top-2">
                   <span className="text-sm font-bold text-brand-800 flex items-center gap-2">
                       <CheckSquare className="w-4 h-4" /> 已选 {selectedIds.size} 项
                   </span>
                   <div className="flex items-center gap-3">
                       <span className="text-xs text-brand-700">批量流转至:</span>
                       <select 
                            className="text-sm border border-brand-200 rounded px-2 py-1 outline-none focus:ring-2 focus:ring-brand-500"
                            value={targetStage}
                            onChange={e => setTargetStage(e.target.value as CaseStage)}
                        >
                           <option value="">-- 选择阶段 --</option>
                           {Object.values(CaseStage || {}).map(s => <option key={s} value={s}>{s}</option>)}
                       </select>
                       <Button size="sm" onClick={handleBulkUpdate} isLoading={isUpdating} disabled={!targetStage || selectedIds.size === 0}>
                           确定执行
                       </Button>
                       <Button size="sm" variant="ghost" onClick={() => setShowBulkAction(false)}>退出</Button>
                   </div>
               </div>
           )}

           <div className="overflow-x-auto">
               <table className="w-full text-sm text-left">
                   <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 text-xs uppercase">
                       <tr>
                           <th className="px-6 py-3 w-16 text-center">
                               <button onClick={toggleSelectAll} className="hover:bg-slate-200 rounded p-1">
                                   {selectedIds.size === children.length && children.length > 0 ? <CheckSquare className="w-4 h-4 text-brand-600"/> : <Square className="w-4 h-4 text-slate-400"/>}
                               </button>
                           </th>
                           <th className="px-6 py-3">案号 / 原告</th>
                           <th className="px-6 py-3">当前阶段</th>
                           <th className="px-6 py-3 text-right">索赔金额</th>
                           <th className="px-6 py-3 text-right">已回款</th>
                           <th className="px-6 py-3 text-right">律师费支出</th>
                           <th className="px-6 py-3 text-right">操作</th>
                       </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-100">
                       {children.map(caseItem => {
                           const fin = finances[caseItem.id];
                           return (
                               <tr key={caseItem.id} className={`hover:bg-slate-50 transition-colors ${selectedIds.has(caseItem.id) ? 'bg-blue-50/30' : ''}`}>
                                   <td className="px-6 py-3 text-center">
                                       <button onClick={() => toggleSelect(caseItem.id)} className="hover:bg-slate-200 rounded p-1">
                                           {selectedIds.has(caseItem.id) ? <CheckSquare className="w-4 h-4 text-brand-600"/> : <Square className="w-4 h-4 text-slate-300"/>}
                                       </button>
                                   </td>
                                   <td className="px-6 py-3">
                                       <div className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                                           {caseItem.plaintiff}
                                           {caseItem.isPilot && (
                                               <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-200 flex items-center gap-1 shadow-sm">
                                                   <Flag className="w-3 h-3 fill-indigo-600" /> 示范
                                               </span>
                                           )}
                                       </div>
                                       <div className="text-xs text-slate-400 font-mono mt-0.5">{caseItem.code}</div>
                                   </td>
                                   <td className="px-6 py-3">
                                       <span className={`px-2 py-0.5 rounded text-xs font-medium border ${
                                           caseItem.isPilot ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-slate-100 border-slate-200 text-slate-600'
                                       }`}>
                                           {caseItem.stage}
                                       </span>
                                   </td>
                                   <td className="px-6 py-3 text-right font-mono text-slate-700">
                                       {fmtMoney(fin?.claimedAmount || caseItem.regulatoryAttrs?.amountNoInterest || 0)}
                                   </td>
                                   <td className="px-6 py-3 text-right font-mono text-emerald-600 font-bold">
                                       {fin?.executedAmount ? fmtMoney(fin.executedAmount) : '-'}
                                   </td>
                                   <td className="px-6 py-3 text-right font-mono text-slate-500">
                                       {fin?.legalFeePaid ? fmtMoney(fin.legalFeePaid) : '-'}
                                   </td>
                                   <td className="px-6 py-3 text-right">
                                       <button className="p-1.5 hover:bg-slate-200 rounded text-slate-400 hover:text-brand-600 transition-colors">
                                           <Edit className="w-4 h-4" />
                                       </button>
                                   </td>
                               </tr>
                           );
                       })}
                   </tbody>
               </table>
           </div>
       </div>
    </div>
  );
};

export default SeriesManagement;
