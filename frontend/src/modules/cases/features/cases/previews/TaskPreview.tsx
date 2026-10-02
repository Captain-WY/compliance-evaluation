
import React from 'react';
import { IssueType } from '../../../types';
import { TaskDrawerVO } from '../../../types/case';
import { PropertyField, PropertyGroup } from '../components/IssueProperties';
import { CheckSquare, Upload, Send, Clock, AlertTriangle, X } from 'lucide-react';
import Button from '../../../components/ui/Button';

interface TaskPreviewProps {
  task: TaskDrawerVO;
  onNavigateFull: () => void;
  onClose?: () => void;
}

const TaskPreview: React.FC<TaskPreviewProps> = ({ task, onNavigateFull, onClose }) => {
  return (
    <div className="flex flex-col h-full bg-white relative">
        <div className="px-6 py-5 border-b border-slate-200 bg-blue-50/30 shrink-0 pr-12">
            <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-mono text-blue-600 bg-blue-50 border border-blue-100 px-1.5 rounded">{task.key}</span>
                <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 rounded border border-slate-200">办案任务</span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 leading-tight mb-4">{task.title}</h2>
            
            <div className="flex gap-2">
                <Button size="sm" onClick={() => {}} className="bg-blue-600 hover:bg-blue-700 text-white">
                    <Upload className="w-3.5 h-3.5 mr-1.5" /> 上传/办理
                </Button>
                <Button size="sm" variant="outline">
                    标记完成
                </Button>
            </div>

            {/* Close Button */}
            {onClose && (
                <button 
                    onClick={onClose}
                    className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>
            )}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
            <div className="grid grid-cols-1 gap-6">
                <div className="space-y-6">
                    <section>
                        <h4 className="text-xs font-bold text-slate-900 uppercase mb-2">任务描述</h4>
                        <div className="text-sm text-slate-600 bg-slate-50 p-4 rounded border border-slate-100">
                            {task.description}
                        </div>
                    </section>

                    <PropertyGroup title="任务属性" defaultOpen>
                        <PropertyField label="所属案件" value={task.caseTitle} isLink />
                        <PropertyField label="负责部门" value={task.assigneeDept} icon={Send} />
                        <PropertyField label="发起人" value={task.creator} />
                        <PropertyField 
                            label="截止时间" 
                            value={task.deadline || '-'} 
                            icon={Clock} 
                            className={task.deadline && new Date(task.deadline) < new Date() ? 'text-red-600' : ''}
                        />
                    </PropertyGroup>
                </div>
            </div>
        </div>
    </div>
  );
};

export default TaskPreview;
