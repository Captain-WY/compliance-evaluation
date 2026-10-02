import React, { useEffect, useState } from 'react';
import { CommunicationLog } from '../../../types';
import { getCommunicationLogs } from '../../../services/case';
import { MessageSquare, FileText, User, Calendar, Plus, X, Phone, Users } from 'lucide-react';

interface SubLedgerLogProps {
  caseId: string;
}

const SubLedgerLog: React.FC<SubLedgerLogProps> = ({ caseId }) => {
  const [logs, setLogs] = useState<CommunicationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [newRecord, setNewRecord] = useState<Partial<CommunicationLog>>({
    type: '跨部门协同',
    date: new Date().toISOString().split('T')[0],
    summary: '',
    participants: '',
    recorder: '当前用户',
    status: '待办'
  });

  const loadData = () => {
    setLoading(true);
    getCommunicationLogs(caseId).then(data => {
      const sorted = [...data].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setLogs(sorted);
      setLoading(false);
    });
  };

  useEffect(() => {
    loadData();
  }, [caseId]);

  const handleAdd = () => {
    const mockId = `log-${Date.now()}`;
    const record: CommunicationLog = {
      id: mockId,
      caseId,
      type: newRecord.type || '跨部门协同',
      date: newRecord.date || '',
      summary: newRecord.summary || '',
      participants: newRecord.participants || '',
      recorder: newRecord.recorder || '当前用户',
      status: newRecord.status || '待办',
      attachments: []
    };
    
    setLogs(prev => [record, ...prev]);
    setIsAdding(false);
    setNewRecord({
      type: '跨部门协同',
      date: new Date().toISOString().split('T')[0],
      summary: '',
      participants: '',
      recorder: '当前用户',
      status: '待办'
    });
  };

  if (loading) return <div className="p-4 text-center text-slate-400 text-xs">加载沟通日志...</div>;

  const getIcon = (type: string) => {
    switch (type) {
      case '会议': return <Users className="w-3 h-3" />;
      case '电话': return <Phone className="w-3 h-3" />;
      case '邮件': return <FileText className="w-3 h-3" />;
      default: return <MessageSquare className="w-3 h-3" />;
    }
  };

  return (
    <div className="space-y-6 relative">
      {/* Header Controls */}
      <div className="flex justify-end mb-4 sticky top-0 bg-white z-10 py-2 border-b border-slate-100">
        <button 
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-1 text-xs bg-brand-600 text-white px-3 py-1.5 rounded hover:bg-brand-700 transition-colors shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" /> 写日志
        </button>
      </div>

      {/* Quick Add Modal */}
      {isAdding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-xl w-96 p-4 animate-in zoom-in-95">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-bold text-slate-800">新增沟通日志</h3>
              <button onClick={() => setIsAdding(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4"/></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">类型</label>
                  <select 
                    className="w-full text-xs border border-slate-300 rounded p-1.5"
                    value={newRecord.type}
                    onChange={e => setNewRecord({...newRecord, type: e.target.value as any})}
                  >
                    {['跨部门协同', '策略研讨会', '法院沟通', '外聘律师沟通', '其他'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">日期</label>
                  <input 
                    type="date" 
                    className="w-full text-xs border border-slate-300 rounded p-1.5"
                    value={newRecord.date}
                    onChange={e => setNewRecord({...newRecord, date: e.target.value})}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">摘要</label>
                <input 
                  type="text" 
                  className="w-full text-xs border border-slate-300 rounded p-1.5"
                  value={newRecord.summary}
                  onChange={e => setNewRecord({...newRecord, summary: e.target.value})}
                  placeholder="简要描述..."
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">参与方</label>
                <input 
                  type="text" 
                  className="w-full text-xs border border-slate-300 rounded p-1.5"
                  value={newRecord.participants}
                  onChange={e => setNewRecord({...newRecord, participants: e.target.value})}
                  placeholder="例如：王律师, 李法务..."
                />
              </div>
              <button 
                onClick={handleAdd}
                className="w-full bg-brand-600 text-white text-xs py-2 rounded hover:bg-brand-700 font-medium"
              >
                确认保存
              </button>
            </div>
          </div>
        </div>
      )}

      {logs.length === 0 ? (
        <div className="p-8 text-center border-2 border-dashed border-slate-100 rounded-lg bg-slate-50">
          <MessageSquare className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">暂无沟通记录</p>
        </div>
      ) : (
        <>
          {/* Timeline View */}
          <div className="relative border-l-2 border-slate-200 ml-4 space-y-6 pb-4">
            {logs.map((log, index) => (
              <div key={log.id} className="relative pl-6">
                {/* Timeline Dot */}
                <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-white border-2 border-brand-500 flex items-center justify-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-brand-500"></div>
                </div>

                {/* Content Card */}
                <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-bold rounded uppercase tracking-wide flex items-center gap-1">
                        {getIcon(log.type)} {log.type}
                      </span>
                      <span className="text-xs text-slate-400 font-mono flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> {log.date}
                      </span>
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                      log.status === '已确认' ? 'bg-emerald-50 text-emerald-700' :
                      log.status === '归档' ? 'bg-slate-100 text-slate-500' :
                      'bg-amber-50 text-amber-700'
                    }`}>
                      {log.status}
                    </span>
                  </div>

                  <h4 className="text-sm font-bold text-slate-800 mb-1 line-clamp-2">{log.summary}</h4>
                  
                  <div className="flex items-center gap-4 text-xs text-slate-500 mt-2 pt-2 border-t border-slate-50">
                    <div className="flex items-center gap-1" title="参与方">
                      <User className="w-3 h-3 text-slate-400" />
                      <span className="truncate max-w-[150px]">{log.participants}</span>
                    </div>
                    <div className="flex items-center gap-1" title="记录人">
                      <span className="text-slate-400">记录人:</span> {log.recorder}
                    </div>
                  </div>

                  {log.attachments && log.attachments.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {log.attachments.map((file, i) => (
                        <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-slate-50 border border-slate-200 rounded text-[10px] text-brand-600 hover:bg-brand-50 hover:border-brand-200 cursor-pointer transition-colors">
                          <FileText className="w-3 h-3" /> {file}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Compact List View (New Addition) */}
          <div className="mt-8 pt-6 border-t border-slate-100">
             <h4 className="text-xs font-bold text-slate-500 mb-3 uppercase tracking-wider">历史记录列表</h4>
             <div className="overflow-hidden border border-slate-200 rounded-lg">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2 font-medium text-slate-600 w-24">日期</th>
                      <th className="px-3 py-2 font-medium text-slate-600 w-20">类型</th>
                      <th className="px-3 py-2 font-medium text-slate-600">摘要</th>
                      <th className="px-3 py-2 font-medium text-slate-600 w-24">记录人</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {logs.map(log => (
                      <tr key={`list-${log.id}`} className="hover:bg-slate-50">
                        <td className="px-3 py-2 text-slate-600 font-mono">{log.date}</td>
                        <td className="px-3 py-2 text-slate-600">
                          <span className="inline-flex items-center gap-1">
                            {getIcon(log.type)} {log.type}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-slate-800 truncate max-w-md">{log.summary}</td>
                        <td className="px-3 py-2 text-slate-500">{log.recorder}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
             </div>
          </div>
        </>
      )}
    </div>
  );
};

export default SubLedgerLog;
