
import React, { useEffect, useState } from 'react';
import { ConsistencyResult } from '../../types';
import { runConsistencyCheck, saveReconciliationNote } from '../../services/mock/reporting';
import { AlertCircle, CheckCircle2, RefreshCw, Save, AlertTriangle, Search, Edit3, ExternalLink, TrendingUp, HelpCircle } from 'lucide-react';
import Button from '../../components/ui/Button';

const ConsistencyCheckView: React.FC = () => {
  const [results, setResults] = useState<ConsistencyResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | 'FLAGGED'>('FLAGGED');
  
  // Edit State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState('');

  const loadData = async () => {
    setLoading(true);
    const data = await runConsistencyCheck();
    setResults(data);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleEditNote = (item: ConsistencyResult) => {
      setEditingId(item.id);
      setNoteInput(item.reconciliationNote || '');
  };

  const handleSaveNote = async (item: ConsistencyResult) => {
      await saveReconciliationNote(item.caseId, noteInput);
      setEditingId(null);
      loadData(); // Reload to refresh state
  };

  const fmtMoney = (val: number) => new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(val);

  const filteredResults = filter === 'ALL' ? results : results.filter(r => r.isFlagged);
  const flaggedCount = results.filter(r => r.isFlagged).length;
  const passRate = results.length > 0 ? ((results.length - flaggedCount) / results.length * 100).toFixed(1) : 100;

  // Check if all flagged items have notes
  const allExplained = results.every(r => !r.isFlagged || (r.isFlagged && r.reconciliationNote));

  return (
    <div className="space-y-6">
       {/* Dashboard Header */}
       <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
           <div className={`p-5 rounded-xl border flex items-center justify-between shadow-sm ${flaggedCount > 0 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
               <div>
                   <p className={`text-xs font-bold uppercase ${flaggedCount > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>差异预警 (Data Diff)</p>
                   <p className={`text-2xl font-bold mt-1 ${flaggedCount > 0 ? 'text-amber-800' : 'text-emerald-800'}`}>{flaggedCount} 项异常</p>
               </div>
               <div className={`w-12 h-12 rounded-full flex items-center justify-center ${flaggedCount > 0 ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}`}>
                   {flaggedCount > 0 ? <AlertTriangle className="w-6 h-6" /> : <CheckCircle2 className="w-6 h-6" />}
               </div>
           </div>
           
           <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
               <div>
                   <p className="text-xs font-bold uppercase text-slate-500">自动校验通过率</p>
                   <p className="text-2xl font-bold mt-1 text-slate-800">{passRate}%</p>
               </div>
               <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                   <TrendingUp className="w-6 h-6" />
               </div>
           </div>

           <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-center">
               <div className="flex justify-between items-center mb-2">
                   <span className="text-xs font-bold text-slate-500">调节状态 (Reconciliation)</span>
                   <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${allExplained ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-700 border-red-100'}`}>
                       {allExplained ? 'Ready to Lock' : 'Action Required'}
                   </span>
               </div>
               <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                   <div className={`h-full transition-all duration-500 ${allExplained ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: allExplained ? '100%' : '60%' }}></div>
               </div>
               <p className="text-[10px] text-slate-400 mt-2">
                   * 所有红色高亮差异必须填写调节说明或修正数据后，方可进行快照锁定。
               </p>
           </div>
       </div>

       {/* Toolbar */}
       <div className="flex justify-between items-center bg-slate-50 p-1.5 rounded-lg border border-slate-200">
           <div className="flex gap-1">
               <button 
                 onClick={() => setFilter('FLAGGED')}
                 className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-2 ${filter === 'FLAGGED' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
               >
                   <AlertTriangle className="w-3 h-3" />
                   仅看异常 ({flaggedCount})
               </button>
               <button 
                 onClick={() => setFilter('ALL')}
                 className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-2 ${filter === 'ALL' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
               >
                   <RefreshCw className="w-3 h-3" />
                   全部案件 ({results.length})
               </button>
           </div>
           <Button variant="ghost" size="sm" onClick={loadData} isLoading={loading} className="text-slate-500 hover:text-brand-600 h-8">
               刷新数据源
           </Button>
       </div>

       {/* Comparison Table */}
       <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
           <table className="w-full text-sm text-left">
               <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 text-xs uppercase">
                   <tr>
                       <th className="px-6 py-4 w-64">案件信息 (Case)</th>
                       <th className="px-6 py-4 text-right bg-blue-50/50">
                           <div className="flex items-center justify-end gap-1">
                               监管拟报金额 <HelpCircle className="w-3 h-3 text-slate-400"/>
                           </div>
                           <span className="text-[10px] font-normal opacity-70">Legal System</span>
                       </th>
                       <th className="px-6 py-4 text-right bg-orange-50/50">
                           <div className="flex items-center justify-end gap-1">
                               财务账面金额 <HelpCircle className="w-3 h-3 text-slate-400"/>
                           </div>
                           <span className="text-[10px] font-normal opacity-70">Finance GL</span>
                       </th>
                       <th className="px-6 py-4 text-right">差异额 (Diff)</th>
                       <th className="px-6 py-4 w-96">差异调节说明 (Reconciliation Note)</th>
                   </tr>
               </thead>
               <tbody className="divide-y divide-slate-100">
                   {loading ? (
                       <tr><td colSpan={5} className="p-12 text-center text-slate-400">正在进行业财数据比对...</td></tr>
                   ) : filteredResults.length === 0 ? (
                       <tr><td colSpan={5} className="p-12 text-center text-slate-400 flex flex-col items-center gap-2"><CheckCircle2 className="w-8 h-8 text-emerald-300"/> 暂无异常数据</td></tr>
                   ) : (
                       filteredResults.map(item => (
                           <tr key={item.id} className={`hover:bg-slate-50 transition-colors group ${item.isFlagged ? 'bg-red-50/10' : ''}`}>
                               <td className="px-6 py-4">
                                   <div className="font-bold text-slate-800 text-xs truncate max-w-[200px]" title={item.caseName}>{item.caseName}</div>
                                   <div className="flex items-center gap-2 mt-1">
                                       <span className="text-[10px] text-slate-400 font-mono bg-slate-100 px-1 rounded">{item.caseCode}</span>
                                       {/* Jump Button */}
                                       <button 
                                            onClick={() => window.location.hash = `/cases/${item.caseId}`}
                                            className="text-[10px] flex items-center text-brand-600 hover:text-brand-800 hover:underline opacity-0 group-hover:opacity-100 transition-opacity"
                                            title="跳转至案件详情进行修正"
                                       >
                                           <ExternalLink className="w-3 h-3 mr-1" /> 修正
                                       </button>
                                   </div>
                               </td>
                               <td className="px-6 py-4 text-right font-mono text-blue-700 bg-blue-50/30">
                                   {fmtMoney(item.legalAmount)}
                               </td>
                               <td className="px-6 py-4 text-right font-mono text-orange-700 bg-orange-50/30">
                                   {fmtMoney(item.financeAmount)}
                               </td>
                               <td className="px-6 py-4 text-right">
                                   <div className={`font-mono font-bold ${item.isFlagged ? 'text-red-600' : 'text-slate-400'}`}>
                                       {item.diff > 0 ? '+' : ''}{fmtMoney(item.diff)}
                                   </div>
                                   {item.isFlagged && (
                                       <div className="text-[10px] text-red-500 font-bold bg-red-100 px-1.5 py-0.5 rounded w-fit ml-auto mt-1 border border-red-200">
                                           {item.diffRatio.toFixed(1)}% Diff
                                       </div>
                                   )}
                               </td>
                               <td className="px-6 py-4">
                                   {editingId === item.id ? (
                                       <div className="flex gap-2 items-center">
                                           <input 
                                             type="text" 
                                             className="w-full border border-brand-300 rounded px-3 py-1.5 text-xs focus:ring-2 focus:ring-brand-500 outline-none"
                                             value={noteInput}
                                             onChange={e => setNoteInput(e.target.value)}
                                             placeholder="请输入差异原因 (如：入账时间差)..."
                                             autoFocus
                                             onKeyDown={e => e.key === 'Enter' && handleSaveNote(item)}
                                           />
                                           <button onClick={() => handleSaveNote(item)} className="p-1.5 bg-brand-600 text-white rounded hover:bg-brand-700">
                                               <Save className="w-3 h-3" />
                                           </button>
                                       </div>
                                   ) : (
                                       <div 
                                         className={`text-xs cursor-pointer p-2 rounded border border-transparent hover:border-slate-300 flex justify-between items-center group transition-all ${!item.reconciliationNote && item.isFlagged ? 'bg-red-50 text-red-500 font-medium' : 'text-slate-600 hover:bg-white hover:shadow-sm'}`}
                                         onClick={() => handleEditNote(item)}
                                       >
                                           <span className="truncate">{item.reconciliationNote || (item.isFlagged ? '点击填写调节说明...' : '-')}</span>
                                           <Edit3 className="w-3 h-3 opacity-0 group-hover:opacity-100 text-brand-500" />
                                       </div>
                                   )}
                               </td>
                           </tr>
                       ))
                   )}
               </tbody>
           </table>
       </div>
    </div>
  );
};

export default ConsistencyCheckView;
