import React, { useEffect, useState } from 'react';
import { ProcedureRecord } from '../../../types';
import { getProcedureRecords } from '../../../services/case';
import { Clock, CheckCircle, AlertTriangle, Calendar, ChevronRight, Plus, X, List, LayoutList } from 'lucide-react';

interface SubLedgerProcedureProps {
  caseId: string;
}

const SubLedgerProcedure: React.FC<SubLedgerProcedureProps> = ({ caseId }) => {
  const [records, setRecords] = useState<ProcedureRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [viewMode, setViewMode] = useState<'TIMELINE' | 'TABLE'>('TIMELINE');
  const [newRecord, setNewRecord] = useState<Partial<ProcedureRecord>>({
    stage: '一审',
    nodeName: '',
    deadline: '',
    status: 'PENDING'
  });

  const loadData = () => {
    setLoading(true);
    getProcedureRecords(caseId).then(data => {
      const sorted = [...data].sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime());
      setRecords(sorted);
      setLoading(false);
    });
  };

  useEffect(() => {
    loadData();
  }, [caseId]);

  const handleAdd = () => {
    // Mock API Call
    const mockId = `pr-${Date.now()}`;
    const record: ProcedureRecord = {
      id: mockId,
      caseId,
      stage: newRecord.stage || '一审',
      nodeName: newRecord.nodeName || '新节点',
      deadline: newRecord.deadline || new Date().toISOString().split('T')[0],
      status: newRecord.status as any || 'PENDING',
      assignee: '当前用户',
      note: newRecord.note
    };
    
    // Optimistic Update
    setRecords(prev => [...prev, record].sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime()));
    setIsAdding(false);
    setNewRecord({ stage: '一审', nodeName: '', deadline: '', status: 'PENDING' });
  };

  if (loading) return <div className="p-4 text-center text-slate-400 text-xs">加载程序记录...</div>;

  // Group by Stage
  const groupedRecords = records.reduce((acc, record) => {
    if (!acc[record.stage]) acc[record.stage] = [];
    acc[record.stage].push(record);
    return acc;
  }, {} as Record<string, ProcedureRecord[]>);

  const stageOrder = ['一审', '二审', '重一审', '再审', '执行', '结案'];
  const sortedStages = Object.keys(groupedRecords).sort((a, b) => {
    const idxA = stageOrder.indexOf(a);
    const idxB = stageOrder.indexOf(b);
    return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
  });

  return (
    <div className="space-y-4 relative">
      {/* Header Controls */}
      <div className="flex justify-between items-center mb-4 sticky top-0 bg-white z-10 py-2 border-b border-slate-100">
        <div className="flex bg-slate-100 p-0.5 rounded-lg">
          <button 
            onClick={() => setViewMode('TIMELINE')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${viewMode === 'TIMELINE' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <LayoutList className="w-3.5 h-3.5 inline-block mr-1" /> 时间轴
          </button>
          <button 
            onClick={() => setViewMode('TABLE')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${viewMode === 'TABLE' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <List className="w-3.5 h-3.5 inline-block mr-1" /> 列表
          </button>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-1 text-xs bg-brand-600 text-white px-3 py-1.5 rounded hover:bg-brand-700 transition-colors shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" /> 新增节点
        </button>
      </div>

      {/* Quick Add Modal (Inline) */}
      {isAdding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-xl w-80 p-4 animate-in zoom-in-95">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-bold text-slate-800">新增程序节点</h3>
              <button onClick={() => setIsAdding(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4"/></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">阶段</label>
                <select 
                  className="w-full text-xs border border-slate-300 rounded p-1.5"
                  value={newRecord.stage}
                  onChange={e => setNewRecord({...newRecord, stage: e.target.value})}
                >
                  {stageOrder.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">节点名称</label>
                <input 
                  type="text" 
                  className="w-full text-xs border border-slate-300 rounded p-1.5"
                  value={newRecord.nodeName}
                  onChange={e => setNewRecord({...newRecord, nodeName: e.target.value})}
                  placeholder="例如：一审判决"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">截止日期</label>
                <input 
                  type="date" 
                  className="w-full text-xs border border-slate-300 rounded p-1.5"
                  value={newRecord.deadline}
                  onChange={e => setNewRecord({...newRecord, deadline: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">备注</label>
                <textarea 
                  className="w-full text-xs border border-slate-300 rounded p-1.5"
                  rows={2}
                  value={newRecord.note || ''}
                  onChange={e => setNewRecord({...newRecord, note: e.target.value})}
                />
              </div>
              <button 
                onClick={handleAdd}
                className="w-full bg-brand-600 text-white text-xs py-2 rounded hover:bg-brand-700 font-medium"
              >
                确认添加
              </button>
            </div>
          </div>
        </div>
      )}

      {records.length === 0 ? (
        <div className="p-8 text-center border-2 border-dashed border-slate-100 rounded-lg bg-slate-50 mt-8">
          <Clock className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">暂无程序节点记录</p>
        </div>
      ) : (
        <>
          {/* TIMELINE VIEW */}
          {viewMode === 'TIMELINE' && (
            <div className="space-y-6 pl-2">
              {sortedStages.map((stage, stageIdx) => (
                <div key={stage} className="relative">
                  {/* Stage Header */}
                  <div className="flex items-center gap-2 mb-3">
                    <div className="bg-brand-50 text-brand-700 px-3 py-1 rounded-full text-xs font-bold border border-brand-100 shadow-sm z-10">
                      {stage}
                    </div>
                    <div className="h-px bg-slate-200 flex-1"></div>
                  </div>

                  {/* Timeline Container */}
                  <div className="border-l-2 border-slate-200 ml-4 space-y-6 pb-2">
                    {groupedRecords[stage].map((record, idx) => {
                      const isCompleted = record.status === 'COMPLETED';
                      const isOverdue = record.status === 'OVERDUE';
                      
                      return (
                        <div key={record.id} className="relative pl-6 group">
                          {/* Timeline Dot */}
                          <div className={`absolute -left-[9px] top-1.5 w-4 h-4 rounded-full border-2 flex items-center justify-center bg-white transition-colors
                            ${isCompleted ? 'border-emerald-500' : isOverdue ? 'border-red-500' : 'border-slate-300'}
                          `}>
                            {isCompleted && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>}
                            {isOverdue && <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>}
                          </div>

                          {/* Card */}
                          <div className={`p-3 rounded-lg border transition-all hover:shadow-md
                            ${isOverdue ? 'bg-red-50/50 border-red-100' : 'bg-white border-slate-200'}
                          `}>
                            <div className="flex justify-between items-start mb-1">
                              <h4 className={`text-sm font-bold ${isOverdue ? 'text-red-800' : 'text-slate-800'}`}>
                                {record.nodeName}
                              </h4>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium border
                                ${isCompleted ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 
                                  isOverdue ? 'bg-red-100 text-red-700 border-red-200' : 
                                  'bg-slate-100 text-slate-600 border-slate-200'}
                              `}>
                                {record.status === 'COMPLETED' ? '已完成' : record.status === 'OVERDUE' ? '已逾期' : '进行中'}
                              </span>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-xs text-slate-500 mt-2">
                              <div className="flex items-center gap-1">
                                <Calendar className="w-3 h-3 text-slate-400" />
                                <span className="font-mono">截止: {record.deadline}</span>
                              </div>
                              {record.completionDate && (
                                <div className="flex items-center gap-1">
                                  <CheckCircle className="w-3 h-3 text-emerald-500" />
                                  <span className="font-mono">完成: {record.completionDate}</span>
                                </div>
                              )}
                              <div className="col-span-2 flex items-center gap-1 border-t border-slate-100 pt-2 mt-1">
                                <span className="text-slate-400">办理人:</span> {record.assignee}
                              </div>
                              {record.note && (
                                <div className="col-span-2 bg-slate-50 p-2 rounded text-slate-600 mt-1">
                                  {record.note}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* TABLE VIEW */}
          {viewMode === 'TABLE' && (
            <div className="overflow-hidden border border-slate-200 rounded-lg animate-in fade-in slide-in-from-bottom-2 duration-300">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2 font-medium text-slate-600">审级/阶段</th>
                    <th className="px-3 py-2 font-medium text-slate-600">节点名称</th>
                    <th className="px-3 py-2 font-medium text-slate-600">截止日期</th>
                    <th className="px-3 py-2 font-medium text-slate-600">完成日期</th>
                    <th className="px-3 py-2 font-medium text-slate-600">办理人</th>
                    <th className="px-3 py-2 font-medium text-slate-600">状态</th>
                    <th className="px-3 py-2 font-medium text-slate-600 w-1/3">备注</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {records.map(record => (
                    <tr key={record.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 text-slate-600 font-medium">{record.stage}</td>
                      <td className="px-3 py-2 text-slate-800">{record.nodeName}</td>
                      <td className="px-3 py-2 text-slate-600 font-mono">{record.deadline}</td>
                      <td className="px-3 py-2 text-slate-600 font-mono">{record.completionDate || '-'}</td>
                      <td className="px-3 py-2 text-slate-600">{record.assignee}</td>
                      <td className="px-3 py-2">
                        {record.status === 'COMPLETED' && <span className="text-emerald-600">已完成</span>}
                        {record.status === 'PENDING' && <span className="text-blue-600">进行中</span>}
                        {record.status === 'OVERDUE' && <span className="text-red-600 font-bold">已逾期</span>}
                      </td>
                      <td className="px-3 py-2 text-slate-500 truncate max-w-xs" title={record.note}>
                        {record.note || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default SubLedgerProcedure;
