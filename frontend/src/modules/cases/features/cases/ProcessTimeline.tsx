
import React, { useEffect, useState } from 'react';
import { NodeStatus, NodeType, ProcessNode, Case } from '../../types';
import { getCaseById, updateCase, getProcessTimeline, completeProcessNode, getMemos, addMemo, MemoItem } from '../../services/case';
import { 
    CheckCircle2, Circle, Clock, FileText, Lock, MessageSquare, Plus, 
    MoreHorizontal, Calendar, Diamond, PlayCircle, CreditCard, UploadCloud, 
    ChevronRight, Loader2, ArrowDown, User, AlertCircle, Gavel, XCircle, StopCircle
} from 'lucide-react';
import Button from '../../components/ui/Button';
import CalendarView, { CalendarEvent } from '../../components/ui/CalendarView';
import StageNodeEditModal from './components/StageNodeEditModal';

import StageProgressCard from './components/StageProgressCard';

interface ProcessTimelineProps {
    caseId: string;
}

const ProcessTimeline: React.FC<ProcessTimelineProps> = ({ caseId }) => {
  const [processData, setProcessData] = useState<any>(null);
  const [caseData, setCaseData] = useState<Case | null>(null);
  const [collabLogs, setCollabLogs] = useState<MemoItem[]>([]);
  const [isAddingLog, setIsAddingLog] = useState(false);
  const [newLog, setNewLog] = useState({ content: '' });
  
  // Stage Node Edit Modal State
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editNodeKey, setEditNodeKey] = useState<string>('');
  const [editStageType, setEditStageType] = useState<'PRE_LITIGATION' | 'TRIAL'>('TRIAL');
  const [editNodeData, setEditNodeData] = useState<any>(null);
  const [currentStageKey, setCurrentStageKey] = useState<'preLitigation' | 'firstInstance' | 'secondInstance'>('firstInstance');

  useEffect(() => {
    refreshData();
  }, [caseId]);

  const refreshData = async () => {
    try {
      const [instances, cData, memos] = await Promise.all([
        getProcessTimeline(caseId),
        getCaseById(caseId),
        getMemos(caseId),
      ]);
      setProcessData(instances);
      setCaseData(cData);
      setCollabLogs(memos);
    } catch {
      // apiClient 拦截器已 toast.error，组件保持现有状态
    }
  };

  const handleNodeClick = (instanceId: string, node: ProcessNode) => {
    // Logic for node click
  };

  const handleCompleteNode = async (_instanceId: string, nodeId: string) => {
      try {
        await completeProcessNode(nodeId);
        refreshData();
      } catch {
        // apiClient 拦截器已 toast.error
      }
  };

  const handleAddLog = async () => {
      if (!newLog.content) return;
      try {
        await addMemo(caseId, newLog.content);
        setNewLog({ content: '' });
        setIsAddingLog(false);
        refreshData();
      } catch {
        // apiClient 拦截器已 toast.error，表单保持不变
      }
  };

  const getDaysRemaining = (deadline?: string) => {
      if (!deadline) return null;
      const today = new Date();
      const target = new Date(deadline);
      const diffTime = target.getTime() - today.getTime();
      return Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
  };

  const handleStageNodeClick = (nodeKey: string, data: any, stageType: 'PRE_LITIGATION' | 'TRIAL', stageKey: 'preLitigation' | 'firstInstance' | 'secondInstance') => {
      setEditNodeKey(nodeKey);
      setEditNodeData(data);
      setEditStageType(stageType);
      setCurrentStageKey(stageKey);
      setEditModalOpen(true);
  };

  const handleStageNodeSave = async (updatedData: any) => {
      if (!caseData) return;
      
      const currentStageDetails = caseData.stageDetails || {};
      const stageData = currentStageDetails[currentStageKey] || {};
      
      const newStageData = {
          ...stageData,
          [editNodeKey]: updatedData
      };

      const newStageDetails = {
          ...currentStageDetails,
          [currentStageKey]: newStageData
      };

      await updateCase(caseData.id, { stageDetails: newStageDetails });
      refreshData();
      setEditModalOpen(false);
  };

  // ... (render)

  return (
    <div className="flex gap-8 relative h-full">
      
      {/* Stage Node Edit Modal */}
      <StageNodeEditModal 
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        nodeKey={editNodeKey}
        stageType={editStageType}
        initialData={editNodeData}
        onSave={handleStageNodeSave}
      />

      {/* Left: Process Timeline (70%) */}
      <div className="flex-1 overflow-y-auto pr-4 custom-scrollbar">
          {Array.isArray(processData) && processData.map((inst: any, index: number) => (
              <div key={inst.id} className="mb-12 relative">
                  {/* Instance Header */}
                  <div className="flex items-center gap-3 mb-6 sticky top-0 bg-slate-50/95 backdrop-blur z-20 py-2 border-b border-slate-200">
                      <div className="w-8 h-8 rounded-lg bg-brand-600 text-white flex items-center justify-center font-bold shadow-sm">
                          {index + 1}
                      </div>
                      <div>
                          <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                              {inst.stageName}
                              <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                                  inst.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'
                              }`}>
                                  {inst.status === 'ACTIVE' ? '进行中' : '已完成'}
                              </span>
                          </h3>
                      </div>
                  </div>

                    {/* --- STAGE DETAIL CARD INJECTION --- */}
                    {/* Inject Pre-Litigation Card if this is the first instance and stage matches */}
                    {inst.stageName.includes('一审') && (
                        <div className="pl-12 mb-6">
                            <StageProgressCard 
                                stageName="诉前准备" 
                                type="PRE_LITIGATION" 
                                data={caseData?.stageDetails?.preLitigation}
                                onUpdate={() => {}} 
                                onNodeClick={(key, data) => handleStageNodeClick(key, data, 'PRE_LITIGATION', 'preLitigation')}
                            />
                        </div>
                    )}

                    {/* Inject Trial Phase Card */}
                    {(inst.stageName.includes('一审') || inst.stageName.includes('二审')) && (
                        <div className="pl-12 mb-6">
                            <StageProgressCard 
                                stageName={`${inst.stageName}阶段详情`} 
                                type="TRIAL" 
                                data={inst.stageName.includes('一审') ? caseData?.stageDetails?.firstInstance : caseData?.stageDetails?.secondInstance}
                                onUpdate={() => {}} 
                                onNodeClick={(key, data) => handleStageNodeClick(key, data, 'TRIAL', inst.stageName.includes('一审') ? 'firstInstance' : 'secondInstance')}
                            />
                        </div>
                    )}
                    
      {/* ... */}


                    <div className="space-y-8">
                        {inst.nodes.map((node, idx) => {
                            const isCompleted = node.status === NodeStatus.COMPLETED;
                            const isActive = node.status === NodeStatus.ACTIVE;
                            const daysLeft = getDaysRemaining(node.deadline);
                            const isUrgent = daysLeft !== null && daysLeft <= 3 && daysLeft >= 0;

                            return (
                                <div key={node.id} className="relative pl-12 group">
                                    {/* Node Icon */}
                                    <div className={`absolute left-0 top-0 w-10 h-10 rounded-full border-4 flex items-center justify-center z-10 transition-all ${
                                        isCompleted ? 'bg-emerald-500 border-emerald-100 text-white' :
                                        isActive ? 'bg-white border-brand-500 text-brand-600 shadow-md scale-110' :
                                        'bg-slate-50 border-slate-200 text-slate-300'
                                    }`}>
                                        {isCompleted ? <CheckCircle2 className="w-5 h-5" /> :
                                         node.type === NodeType.MILESTONE ? <Diamond className="w-4 h-4 fill-current" /> :
                                         <Circle className="w-4 h-4" />}
                                    </div>

                                    {/* Card - Clickable to open sheet */}
                                    <div 
                                        className={`rounded-lg border p-4 transition-all cursor-pointer hover:shadow-md ${
                                            isActive ? 'bg-white border-brand-300 shadow-lg shadow-brand-500/10 ring-1 ring-brand-100' :
                                            isCompleted ? 'bg-slate-50/50 border-slate-200 opacity-80' :
                                            'bg-slate-50 border-slate-100 opacity-60'
                                        }`}
                                        onClick={() => handleNodeClick(inst.id, node)}
                                    >
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    {node.key && <span className="text-[10px] bg-slate-100 border border-slate-200 px-1 rounded text-slate-500 font-mono">{node.key}</span>}
                                                    <h5 className={`font-bold text-sm ${isActive ? 'text-slate-800' : 'text-slate-600'}`}>
                                                        {node.title}
                                                    </h5>
                                                </div>
                                                {node.description && <p className="text-xs text-slate-500 mt-1 line-clamp-1">{node.description}</p>}
                                                
                                                {/* Meta Badges */}
                                                <div className="flex gap-2 mt-2">
                                                    {node.type === NodeType.MILESTONE && <span className="text-[10px] px-1.5 py-0.5 bg-purple-50 text-purple-700 rounded border border-purple-100">里程碑</span>}
                                                    {node.assignee && <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded flex items-center gap-1"><User className="w-3 h-3"/> {node.assignee}</span>}
                                                </div>
                                            </div>

                                            {/* Action / Status */}
                                            <div className="text-right">
                                                {node.deadline && !isCompleted && (
                                                    <div className={`text-xs font-mono font-bold mb-2 ${isUrgent ? 'text-red-600' : 'text-slate-500'}`}>
                                                        {node.deadline}
                                                        {isUrgent && <span className="ml-1 animate-pulse">🔥</span>}
                                                    </div>
                                                )}
                                                
                                                {isActive && (
                                                    <div className="flex gap-2 justify-end" onClick={e => e.stopPropagation()}>
                                                        <button 
                                                            onClick={() => handleCompleteNode(inst.id, node.id)}
                                                            className="px-2 py-1 text-xs border border-slate-300 rounded hover:bg-slate-50 text-slate-600 transition-colors"
                                                        >
                                                            快速完成
                                                        </button>
                                                    </div>
                                                )}
                                                {isCompleted && (
                                                    <span className="text-xs text-emerald-600 font-medium flex items-center gap-1 justify-end">
                                                        {node.completedDate} 完成
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Interlock Warning */}
                                        {node.requiredDocType && !isCompleted && (
                                            <div className="mt-3 pt-2 border-t border-dashed border-slate-200 flex items-center gap-2 text-xs text-amber-600">
                                                <Lock className="w-3 h-3" />
                                                <span className="font-medium">前置条件：</span>
                                                需上传 {node.requiredDocType.join(', ')}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}

                        {/* Arbitration Dead End Visualization */}
                        {inst.templateId?.includes('ARBITRATION') && (
                            <div className="pl-12 pt-2 relative opacity-60">
                                 {/* Dashed Line extension */}
                                 <div className="absolute left-[39px] top-0 h-8 w-0.5 border-l-2 border-dashed border-slate-300"></div>
                                 <div className="flex items-center gap-3">
                                     <div className="w-10 h-10 rounded-full bg-slate-100 border-2 border-slate-300 flex items-center justify-center shrink-0 z-10">
                                         <StopCircle className="w-5 h-5 text-slate-400" />
                                     </div>
                                     <div className="bg-slate-50 px-4 py-3 rounded-lg border border-slate-200 w-full flex items-center gap-3">
                                         <div className="p-2 bg-orange-100 rounded-full">
                                             <Gavel className="w-4 h-4 text-orange-600" />
                                         </div>
                                         <div>
                                             <p className="text-xs font-bold text-slate-700">程序终止 (Final)</p>
                                             <p className="text-[10px] text-slate-500 mt-0.5">根据《仲裁法》规定，裁决为终局，对双方均有约束力，不得上诉。</p>
                                         </div>
                                     </div>
                                 </div>
                            </div>
                        )}
                    </div>
                </div>
        ))}
      </div>

      {/* Right: Smart Memo (30%) */}
      <div className="w-80 shrink-0 flex flex-col h-[600px] sticky top-0">
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 flex flex-col h-full shadow-sm">
              <div className="flex justify-between items-center mb-4 pb-2 border-b border-amber-200/50">
                  <h4 className="font-bold text-amber-900 flex items-center gap-2">
                      <MessageSquare className="w-4 h-4" /> 案件备忘录 (Memos)
                  </h4>
                  <button onClick={() => setIsAddingLog(!isAddingLog)} className="p-1 hover:bg-amber-100 rounded text-amber-700">
                      <Plus className="w-4 h-4" />
                  </button>
              </div>

              {isAddingLog && (
                  <div className="bg-white p-3 rounded-lg shadow-sm mb-4 animate-in fade-in">
                      <textarea 
                        className="w-full text-xs border border-amber-200 rounded p-2 outline-none focus:ring-2 focus:ring-amber-400 mb-2 resize-none h-20"
                        placeholder="记录线下沟通、电话会议要点..."
                        value={newLog.content}
                        onChange={e => setNewLog({...newLog, content: e.target.value})}
                        autoFocus
                      />
                      <div className="flex justify-end">
                          <Button size="sm" onClick={handleAddLog} className="h-7 text-xs bg-amber-600 hover:bg-amber-700 border-transparent">
                              保存
                          </Button>
                      </div>
                  </div>
              )}

              <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-1">
                  {collabLogs.length === 0 ? (
                      <div className="text-center text-amber-800/50 py-10 text-xs">暂无备忘记录</div>
                  ) : collabLogs.map(log => (
                      <div key={log.id} className="bg-white p-3 rounded-lg border border-amber-100 shadow-sm relative group">
                          <p className="text-xs text-slate-700 leading-relaxed mb-2">{log.content}</p>
                          <div className="text-[10px] text-slate-400">
                              <span>{log.actorName} • {log.createdAt?.split('T')[0]}</span>
                          </div>
                      </div>
                  ))}
              </div>
          </div>
      </div>

    </div>
  );
};

export default ProcessTimeline;
