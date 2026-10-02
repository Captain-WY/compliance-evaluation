import React, { useEffect, useState } from 'react';
import { Plus, ChevronDown, ChevronRight, Loader2, ToggleLeft, ToggleRight, Pencil, Trash2, X, Save } from 'lucide-react';
import Button from '../../components/ui/Button';
import {
  listProcessTemplates,
  createProcessTemplate,
  updateProcessTemplate,
  toggleProcessTemplate,
  listTaskTemplates,
  createTaskTemplate,
  updateTaskTemplate,
  deleteTaskTemplate,
  type ProcessTemplateRecord,
  type TaskTemplateRecord,
} from '../../services/case';

// ── 任务模板行内编辑 ──────────────────────────────────────────────────────────

interface TaskRowProps {
  task: TaskTemplateRecord;
  onRefresh: () => void;
}

const TaskRow: React.FC<TaskRowProps> = ({ task, onRefresh }) => {
  const [editing, setEditing] = useState(false);
  const [taskName, setTaskName] = useState(task.taskName);
  const [daysDue, setDaysDue] = useState<string>(task.defaultDaysDue != null ? String(task.defaultDaysDue) : '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await updateTaskTemplate({
      taskTemplateId: task.taskTemplateId,
      taskName: taskName.trim() || null,
      defaultDaysDue: daysDue !== '' ? Number(daysDue) : null,
    });
    setSaving(false);
    setEditing(false);
    onRefresh();
  };

  const handleDelete = async () => {
    if (!window.confirm(`确认删除任务「${task.taskName}」？`)) return;
    setDeleting(true);
    await deleteTaskTemplate(task.taskTemplateId);
    setDeleting(false);
    onRefresh();
  };

  if (editing) {
    return (
      <div className="flex items-center gap-2 py-2 pl-6 pr-3 border-b border-slate-100 bg-slate-50">
        <input
          className="flex-1 border border-slate-300 rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-brand-500"
          value={taskName}
          onChange={e => setTaskName(e.target.value)}
          placeholder="任务名称"
        />
        <input
          type="number"
          className="w-20 border border-slate-300 rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-brand-500"
          value={daysDue}
          onChange={e => setDaysDue(e.target.value)}
          placeholder="天数"
        />
        <button onClick={handleSave} disabled={saving} className="p-1 text-brand-600 hover:bg-brand-50 rounded">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
        </button>
        <button onClick={() => setEditing(false)} className="p-1 text-slate-400 hover:bg-slate-100 rounded">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 py-2 pl-6 pr-3 border-b border-slate-100 group hover:bg-slate-50">
      <div className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0" />
      <span className="flex-1 text-xs text-slate-700">{task.taskName}</span>
      {task.taskCode && <span className="text-xs text-slate-400 font-mono">{task.taskCode}</span>}
      {task.defaultDaysDue != null && (
        <span className="text-xs text-slate-400">{task.defaultDaysDue}天</span>
      )}
      {task.isMilestone && (
        <span className="text-[10px] bg-brand-50 text-brand-600 px-1.5 py-0.5 rounded font-medium">里程碑</span>
      )}
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={() => setEditing(true)} className="p-1 text-slate-400 hover:text-brand-600 rounded hover:bg-brand-50">
          <Pencil className="w-3 h-3" />
        </button>
        <button onClick={handleDelete} disabled={deleting} className="p-1 text-slate-400 hover:text-red-600 rounded hover:bg-red-50">
          {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
        </button>
      </div>
    </div>
  );
};

// ── 流程模板行 ────────────────────────────────────────────────────────────────

interface ProcessRowProps {
  proc: ProcessTemplateRecord;
  onRefresh: () => void;
}

const ProcessRow: React.FC<ProcessRowProps> = ({ proc, onRefresh }) => {
  const [expanded, setExpanded] = useState(false);
  const [tasks, setTasks] = useState<TaskTemplateRecord[]>([]);
  const [tasksLoaded, setTasksLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [stageName, setStageName] = useState(proc.stageName);
  const [addingTask, setAddingTask] = useState(false);
  const [newTaskName, setNewTaskName] = useState('');
  const [saving, setSaving] = useState(false);

  const loadTasks = async () => {
    const items = await listTaskTemplates(proc.processTemplateId);
    setTasks(items);
    setTasksLoaded(true);
  };

  const handleExpand = () => {
    setExpanded(v => !v);
    if (!tasksLoaded) loadTasks();
  };

  const handleSaveProc = async () => {
    if (!stageName.trim()) return;
    setSaving(true);
    await updateProcessTemplate({
      processTemplateId: proc.processTemplateId,
      stageName: stageName.trim(),
      sortOrder: proc.sortOrder,
      isRequired: proc.isRequired,
      description: proc.description,
    });
    setSaving(false);
    setEditing(false);
    onRefresh();
  };

  const handleToggle = async () => {
    await toggleProcessTemplate(proc.processTemplateId, !proc.isActive);
    onRefresh();
  };

  const handleAddTask = async () => {
    if (!newTaskName.trim()) return;
    setSaving(true);
    await createTaskTemplate({ processTemplateId: proc.processTemplateId, taskName: newTaskName.trim() });
    setNewTaskName('');
    setAddingTask(false);
    setSaving(false);
    await loadTasks();
  };

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 bg-white hover:bg-slate-50 transition-colors">
        <button onClick={handleExpand} className="text-slate-400 hover:text-slate-600">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        {editing ? (
          <input
            className="flex-1 border border-slate-300 rounded px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-brand-500"
            value={stageName}
            onChange={e => setStageName(e.target.value)}
            autoFocus
          />
        ) : (
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-slate-800 text-sm">{proc.stageName}</span>
              <span className="text-xs text-slate-400 font-mono">{proc.stageCode}</span>
              {proc.isRequired && <span className="text-[10px] bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded">必要</span>}
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${proc.isActive ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                {proc.isActive ? '启用' : '停用'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">{proc.caseTypeCode} · {proc.taskCount} 个任务</p>
          </div>
        )}

        <div className="flex gap-1 shrink-0">
          {editing ? (
            <>
              <button onClick={handleSaveProc} disabled={saving} className="p-1.5 text-brand-600 hover:bg-brand-50 rounded">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              </button>
              <button onClick={() => setEditing(false)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded">
                <X className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)} className="p-1.5 text-slate-400 hover:text-brand-600 rounded hover:bg-brand-50">
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button onClick={handleToggle} className="p-1.5 text-slate-400 hover:text-emerald-600 rounded hover:bg-emerald-50">
                {proc.isActive ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
              </button>
            </>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50/50">
          {!tasksLoaded ? (
            <div className="py-3 pl-6 text-xs text-slate-400 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> 加载任务...</div>
          ) : (
            <>
              {tasks.map(task => (
                <TaskRow key={task.taskTemplateId} task={task} onRefresh={loadTasks} />
              ))}
              {tasks.length === 0 && <div className="py-3 pl-6 text-xs text-slate-400">暂无任务</div>}
              {addingTask ? (
                <div className="flex items-center gap-2 py-2 pl-6 pr-3 border-t border-slate-100">
                  <input
                    autoFocus
                    className="flex-1 border border-slate-300 rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-brand-500"
                    placeholder="新任务名称"
                    value={newTaskName}
                    onChange={e => setNewTaskName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddTask()}
                  />
                  <button onClick={handleAddTask} disabled={saving} className="text-xs text-brand-600 hover:underline px-2">
                    {saving ? '保存...' : '添加'}
                  </button>
                  <button onClick={() => setAddingTask(false)} className="text-xs text-slate-400 hover:underline">取消</button>
                </div>
              ) : (
                <button
                  onClick={() => setAddingTask(true)}
                  className="w-full text-left py-2 pl-6 text-xs text-brand-600 hover:bg-brand-50 flex items-center gap-1 border-t border-slate-100 transition-colors"
                >
                  <Plus className="w-3 h-3" /> 添加任务
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

// ── 流程模板主组件 ────────────────────────────────────────────────────────────

const ProcessTemplateAdmin: React.FC = () => {
  const [procs, setProcs] = useState<ProcessTemplateRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newForm, setNewForm] = useState({ caseTypeCode: '', stageCode: '', stageName: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const res = await listProcessTemplates({ pageSize: 200 });
    setProcs(res.items);
    setTotal(res.total);
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!newForm.caseTypeCode.trim() || !newForm.stageCode.trim() || !newForm.stageName.trim()) {
      setError('案件类型、阶段代码和阶段名称均为必填');
      return;
    }
    setError(null);
    setSaving(true);
    const res = await createProcessTemplate({
      caseTypeCode: newForm.caseTypeCode.trim(),
      stageCode: newForm.stageCode.trim(),
      stageName: newForm.stageName.trim(),
    });
    setSaving(false);
    if (!res) { setError('创建失败'); return; }
    setCreating(false);
    setNewForm({ caseTypeCode: '', stageCode: '', stageName: '' });
    await load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-500">共 {total} 个流程模板</span>
        <Button size="sm" onClick={() => { setCreating(true); setError(null); }}>
          <Plus className="w-3.5 h-3.5 mr-1" /> 新建流程模板
        </Button>
      </div>

      {creating && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
          <div className="flex justify-between items-center">
            <h4 className="text-sm font-semibold text-slate-700">新建流程模板</h4>
            <button onClick={() => setCreating(false)}><X className="w-4 h-4 text-slate-400" /></button>
          </div>
          {error && <div className="bg-red-50 text-red-700 border border-red-200 text-xs rounded px-3 py-2">{error}</div>}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">案件类型代码 *</label>
              <input className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-brand-500" value={newForm.caseTypeCode} onChange={e => setNewForm(p => ({ ...p, caseTypeCode: e.target.value }))} placeholder="STANDARD" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">阶段代码 *</label>
              <input className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-brand-500" value={newForm.stageCode} onChange={e => setNewForm(p => ({ ...p, stageCode: e.target.value }))} placeholder="FIRST_INSTANCE" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">阶段名称 *</label>
              <input className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-brand-500" value={newForm.stageName} onChange={e => setNewForm(p => ({ ...p, stageName: e.target.value }))} placeholder="一审" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" size="sm" onClick={() => setCreating(false)} disabled={saving}>取消</Button>
            <Button size="sm" onClick={handleCreate} disabled={saving}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Save className="w-3.5 h-3.5 mr-1" />}
              创建
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-32 text-slate-400"><Loader2 className="w-5 h-5 animate-spin mr-2" /> 加载中...</div>
      ) : procs.length === 0 ? (
        <div className="text-center py-12 text-slate-400 text-sm">暂无流程模板</div>
      ) : (
        <div className="space-y-2">
          {procs.map(proc => (
            <ProcessRow key={proc.processTemplateId} proc={proc} onRefresh={load} />
          ))}
        </div>
      )}
    </div>
  );
};

export default ProcessTemplateAdmin;
