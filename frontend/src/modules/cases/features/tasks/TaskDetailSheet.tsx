
import React, { useState } from 'react';
import { ProcessNode, IssueType, NodeStatus } from '../../types';
import { X, CheckCircle2, Clock, User, FileText, Paperclip, MessageSquare, Tag, Calendar, AlertTriangle, Send } from 'lucide-react';
import Button from '../../components/ui/Button';

interface TaskDetailSheetProps {
  task: ProcessNode | any; // Type 'any' to accept EvidenceTask too in future if unified
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

const TaskDetailSheet: React.FC<TaskDetailSheetProps> = ({ task, isOpen, onClose, onComplete }) => {
  const [comment, setComment] = useState('');
  
  if (!isOpen || !task) return null;

  const isCompleted = task.status === NodeStatus.COMPLETED || task.status === 'APPROVED';
  const isProcessNode = task.issueType === IssueType.TASK; // Assuming basic differentiation

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-[1px]" onClick={onClose}></div>
      
      {/* Panel */}
      <div className="relative w-[500px] h-full bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-start bg-slate-50/50">
            <div>
                <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono text-slate-500 bg-white border border-slate-200 px-1.5 rounded">
                        {task.key || `TASK-${task.id}`}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded font-bold ${
                        isCompleted ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                        {task.status}
                    </span>
                </div>
                <h2 className="text-lg font-bold text-slate-800 leading-tight mt-2">{task.title}</h2>
            </div>
            <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-5 h-5" />
            </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
            
            {/* Meta Grid */}
            <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                    <span className="text-slate-400 text-xs font-bold uppercase block mb-1">经办人 (Assignee)</span>
                    <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-500">
                            {task.assignee ? task.assignee.charAt(0) : 'U'}
                        </div>
                        <span className="text-slate-700">{task.assignee || '未指派'}</span>
                    </div>
                </div>
                <div>
                    <span className="text-slate-400 text-xs font-bold uppercase block mb-1">截止日期 (Due Date)</span>
                    <div className="flex items-center gap-2">
                        <Calendar className={`w-4 h-4 ${task.deadline && new Date(task.deadline) < new Date() && !isCompleted ? 'text-red-500' : 'text-slate-400'}`} />
                        <span className={`font-mono ${task.deadline && new Date(task.deadline) < new Date() && !isCompleted ? 'text-red-600 font-bold' : 'text-slate-700'}`}>
                            {task.deadline || '无'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Description */}
            <div>
                <span className="text-slate-400 text-xs font-bold uppercase block mb-2">任务描述 (Description)</span>
                <div className="text-sm text-slate-600 bg-slate-50 p-4 rounded-lg border border-slate-100 leading-relaxed">
                    {task.description || <span className="italic text-slate-400">暂无描述</span>}
                </div>
            </div>

            {/* Constraints / Requirements */}
            {task.requiredDocType && task.requiredDocType.length > 0 && (
                <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 flex gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-xs font-bold text-amber-800 mb-1">前置依赖 (Blocking)</p>
                        <ul className="list-disc list-inside text-xs text-amber-700 space-y-1">
                            {task.requiredDocType.map((doc: string, idx: number) => (
                                <li key={idx}>需上传：{doc}</li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}

            {/* Comments / Activity (Mocked) */}
            <div className="border-t border-slate-100 pt-6">
                <span className="text-slate-400 text-xs font-bold uppercase block mb-3">活动日志 (Activity)</span>
                <div className="space-y-4">
                    <div className="flex gap-3 text-xs">
                        <div className="w-6 h-6 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center font-bold">
                            S
                        </div>
                        <div>
                            <div className="flex gap-2 items-baseline">
                                <span className="font-bold text-slate-700">系统自动生成</span>
                                <span className="text-slate-400">{task.createdAt || '2025-11-15'}</span>
                            </div>
                            <p className="text-slate-600 mt-0.5">任务由流程模版自动创建。</p>
                        </div>
                    </div>
                    {/* Input */}
                    <div className="flex gap-3">
                        <div className="w-6 h-6 rounded-full bg-slate-200"></div>
                        <div className="flex-1 relative">
                            <textarea 
                                className="w-full border border-slate-200 rounded-lg p-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all resize-none h-20"
                                placeholder="添加备注或@同事..."
                                value={comment}
                                onChange={e => setComment(e.target.value)}
                            />
                            <button className="absolute right-2 bottom-2 p-1 bg-slate-100 rounded hover:bg-brand-50 text-slate-400 hover:text-brand-600">
                                <Send className="w-3 h-3" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-200 bg-white flex justify-end gap-3 shrink-0">
            <Button variant="ghost" onClick={onClose}>关闭</Button>
            {!isCompleted ? (
                <Button onClick={onComplete} className="bg-brand-600 hover:bg-brand-700 text-white shadow-lg shadow-brand-500/30">
                    <CheckCircle2 className="w-4 h-4 mr-2" /> 标记完成
                </Button>
            ) : (
                <Button variant="outline" disabled className="opacity-50 cursor-not-allowed">
                    <CheckCircle2 className="w-4 h-4 mr-2" /> 已完成
                </Button>
            )}
        </div>

      </div>
    </div>
  );
};

export default TaskDetailSheet;
