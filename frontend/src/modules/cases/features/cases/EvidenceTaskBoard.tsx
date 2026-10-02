
import React, { useEffect, useState } from 'react';
import { CollabTask, listCollabTasks, createCollabTask, updateTaskStatus } from '../../services/case';
import { CheckCircle2, Clock, Plus, FileText, Send, UploadCloud } from 'lucide-react';
import Button from '../../components/ui/Button';

interface EvidenceTaskBoardProps {
  caseId: string;
  caseTitle: string;
}

interface TaskCardProps {
  task: CollabTask;
  onArchive: (id: string) => void | Promise<void>;
  onDragStart: (e: React.DragEvent, id: string) => void;
}

const TaskCard: React.FC<TaskCardProps> = ({ task, onArchive, onDragStart }) => (
    <div
        draggable
        onDragStart={(e) => onDragStart(e, task.id)}
        className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-all group relative cursor-grab active:cursor-grabbing"
    >
        <div className="flex justify-between items-start mb-2">
            <span className={`text-[10px] px-2 py-0.5 rounded font-bold border ${
                task.status === 'TODO' ? 'bg-slate-100 text-slate-500 border-slate-200' :
                task.status === 'IN_PROGRESS' ? 'bg-blue-50 text-blue-600 border-blue-200' :
                task.status === 'DONE' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
                'bg-red-50 text-red-600 border-red-200'
            }`}>
                {task.status === 'TODO' ? '待响应' : task.status === 'IN_PROGRESS' ? '待验收' : task.status === 'DONE' ? '已归档' : '已取消'}
            </span>
            <span className="text-xs text-slate-400">{task.createdAt?.split('T')[0]}</span>
        </div>

        <h4 className="font-bold text-sm text-slate-800 mb-1">{task.title}</h4>
        <p className="text-xs text-slate-500 line-clamp-2 mb-3 bg-slate-50 p-2 rounded">{task.description}</p>

        <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="flex items-center gap-1 bg-slate-100 px-1.5 py-0.5 rounded">
                <Send className="w-3 h-3" /> To: {task.assigneeName}
            </span>
            {task.deadline && (
                <span className={`flex items-center gap-1 font-mono ${new Date(task.deadline) < new Date() && task.status !== 'DONE' ? 'text-red-500 font-bold' : ''}`}>
                    <Clock className="w-3 h-3" /> {task.deadline}
                </span>
            )}
        </div>

        {task.status === 'IN_PROGRESS' && (
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                <div className="text-xs text-blue-600 font-medium flex items-center gap-1">
                    <FileText className="w-3 h-3" /> {task.attachmentCount} 附件待审
                </div>
                <div className="flex gap-2">
                    <button onClick={() => onArchive(task.id)} className="text-xs bg-emerald-50 text-emerald-700 px-2 py-1 rounded border border-emerald-200 hover:bg-emerald-100 font-medium">
                        验收归档
                    </button>
                </div>
            </div>
        )}
    </div>
);

const EvidenceTaskBoard: React.FC<EvidenceTaskBoardProps> = ({ caseId, caseTitle: _caseTitle }) => {
  const [tasks, setTasks] = useState<CollabTask[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  const [newTask, setNewTask] = useState({ title: '', description: '', assigneeName: '', deadline: '' });

  useEffect(() => {
    loadTasks();
  }, [caseId]);

  const loadTasks = async () => {
    try {
      const items = await listCollabTasks(caseId);
      setTasks(items);
    } catch {
      // apiClient interceptor already toast.error
    }
  };

  const handleCreate = async () => {
      if (!newTask.title || !newTask.assigneeName) return;
      try {
        const created = await createCollabTask({
            caseId,
            title: newTask.title,
            assigneeName: newTask.assigneeName,
            deadline: newTask.deadline || undefined,
            description: newTask.description,
        });
        setTasks(prev => [...prev, created]);
        setIsCreating(false);
        setNewTask({ title: '', description: '', assigneeName: '', deadline: '' });
      } catch {
        // apiClient 拦截器已 toast.error
      }
  };

  const handleArchive = async (id: string) => {
      try {
        await updateTaskStatus(id, 'DONE');
        setTasks(prev => prev.map(t => t.id === id ? { ...t, status: 'DONE' as const } : t));
      } catch {
        // apiClient 拦截器已 toast.error
      }
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
      setDraggedTaskId(id);
      e.dataTransfer.setData('text/plain', id);
      e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, colId: string) => {
      e.preventDefault();
      if (dragOverColumn !== colId) setDragOverColumn(colId);
  };

  const handleDrop = async (e: React.DragEvent, targetCol: 'TODO' | 'IN_PROGRESS' | 'DONE') => {
      e.preventDefault();
      setDragOverColumn(null);
      const taskId = e.dataTransfer.getData('text/plain');
      if (!taskId || taskId !== draggedTaskId) return;

      const task = tasks.find(t => t.id === taskId);
      if (!task) return;

      const colToStatus: Record<string, CollabTask['status']> = {
        TODO: 'TODO',
        IN_PROGRESS: 'IN_PROGRESS',
        DONE: 'DONE',
      };
      const newStatus = colToStatus[targetCol];
      if (task.status === newStatus || (targetCol === 'TODO' && (task.status === 'TODO' || task.status === 'CANCELLED'))) {
        setDraggedTaskId(null);
        return;
      }

      try {
        await updateTaskStatus(taskId, newStatus);
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
      } catch {
        // apiClient 拦截器已 toast.error，本地状态回滚不操作（保持拖前状态）
      } finally {
        setDraggedTaskId(null);
      }
  };

  const todoTasks = tasks.filter(t => t.status === 'TODO' || t.status === 'CANCELLED');
  const inProgressTasks = tasks.filter(t => t.status === 'IN_PROGRESS');
  const doneTasks = tasks.filter(t => t.status === 'DONE');

  const getColumnStyles = (colId: string) => dragOverColumn === colId ? 'ring-2 ring-brand-300 bg-brand-50/50' : '';

  return (
    <div className="space-y-6">
       <div className="flex justify-between items-center">
           <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                    <Send className="w-5 h-5" />
                </div>
                <div>
                    <h3 className="font-bold text-slate-800">跨部门取证协同</h3>
                    <p className="text-xs text-slate-500">向业务部门发起材料调取需求，支持邮件自动回填。</p>
                </div>
           </div>
           <Button size="sm" onClick={() => setIsCreating(true)}>
               <Plus className="w-4 h-4 mr-1" /> 发起取证
           </Button>
       </div>

       {isCreating && (
           <div className="bg-slate-50 border border-indigo-100 rounded-xl p-5 mb-6 animate-in slide-in-from-top-2">
               <h4 className="font-bold text-sm text-slate-700 mb-4">新建取证任务</h4>
               <div className="grid grid-cols-2 gap-4 mb-4">
                   <div className="col-span-2">
                       <label className="block text-xs font-bold text-slate-500 mb-1">任务标题</label>
                       <input
                         className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                         value={newTask.title} onChange={e => setNewTask({...newTask, title: e.target.value})}
                         placeholder="如：调取客户XX的融资融券合同原件"
                       />
                   </div>
                   <div>
                       <label className="block text-xs font-bold text-slate-500 mb-1">责任人</label>
                       <input
                         className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                         value={newTask.assigneeName} onChange={e => setNewTask({...newTask, assigneeName: e.target.value})}
                         placeholder="如：张三"
                       />
                   </div>
                   <div>
                       <label className="block text-xs font-bold text-slate-500 mb-1">截止时间</label>
                       <input
                         type="date" className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                         value={newTask.deadline} onChange={e => setNewTask({...newTask, deadline: e.target.value})}
                       />
                   </div>
                   <div className="col-span-2">
                       <label className="block text-xs font-bold text-slate-500 mb-1">详细说明</label>
                       <textarea
                         className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm h-16"
                         value={newTask.description} onChange={e => setNewTask({...newTask, description: e.target.value})}
                       />
                   </div>
               </div>
               <div className="flex justify-end gap-2">
                   <Button variant="ghost" size="sm" onClick={() => setIsCreating(false)}>取消</Button>
                   <Button size="sm" onClick={handleCreate}>发布并通知</Button>
               </div>
           </div>
       )}

       <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
           {/* Column 1: TODO + CANCELLED */}
           <div
                onDragOver={(e) => handleDragOver(e, 'TODO')}
                onDrop={(e) => handleDrop(e, 'TODO')}
                className={`bg-slate-50/50 rounded-xl border border-slate-200 p-4 flex flex-col h-[500px] transition-all ${getColumnStyles('TODO')}`}
           >
               <div className="flex justify-between items-center mb-4">
                   <h4 className="font-bold text-slate-600 text-sm flex items-center gap-2">
                       <Clock className="w-4 h-4" /> 等待响应
                   </h4>
                   <span className="bg-slate-200 text-slate-600 text-xs px-2 py-0.5 rounded-full">{todoTasks.length}</span>
               </div>
               <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar">
                   {todoTasks.map(t => <TaskCard key={t.id} task={t} onArchive={handleArchive} onDragStart={handleDragStart} />)}
                   {todoTasks.length === 0 && <div className="text-center text-slate-300 text-xs py-10">无待响应任务</div>}
               </div>
           </div>

           {/* Column 2: IN_PROGRESS */}
           <div
                onDragOver={(e) => handleDragOver(e, 'IN_PROGRESS')}
                onDrop={(e) => handleDrop(e, 'IN_PROGRESS')}
                className={`bg-blue-50/30 rounded-xl border border-blue-100 p-4 flex flex-col h-[500px] transition-all ${getColumnStyles('IN_PROGRESS')}`}
           >
               <div className="flex justify-between items-center mb-4">
                   <h4 className="font-bold text-blue-700 text-sm flex items-center gap-2">
                       <UploadCloud className="w-4 h-4" /> 待验收 (已提交)
                   </h4>
                   <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">{inProgressTasks.length}</span>
               </div>
               <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar">
                   {inProgressTasks.map(t => <TaskCard key={t.id} task={t} onArchive={handleArchive} onDragStart={handleDragStart} />)}
                   {inProgressTasks.length === 0 && <div className="text-center text-slate-300 text-xs py-10">无待验收任务</div>}
               </div>
           </div>

           {/* Column 3: DONE */}
           <div
                onDragOver={(e) => handleDragOver(e, 'DONE')}
                onDrop={(e) => handleDrop(e, 'DONE')}
                className={`bg-slate-50/50 rounded-xl border border-slate-200 p-4 flex flex-col h-[500px] transition-all ${getColumnStyles('DONE')}`}
           >
               <div className="flex justify-between items-center mb-4">
                   <h4 className="font-bold text-slate-600 text-sm flex items-center gap-2">
                       <CheckCircle2 className="w-4 h-4" /> 已归档
                   </h4>
                   <span className="bg-slate-200 text-slate-600 text-xs px-2 py-0.5 rounded-full">{doneTasks.length}</span>
               </div>
               <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar">
                   {doneTasks.map(t => <TaskCard key={t.id} task={t} onArchive={handleArchive} onDragStart={handleDragStart} />)}
                   {doneTasks.length === 0 && <div className="text-center text-slate-300 text-xs py-10">暂无归档记录</div>}
               </div>
           </div>
       </div>
    </div>
  );
};

export default EvidenceTaskBoard;
