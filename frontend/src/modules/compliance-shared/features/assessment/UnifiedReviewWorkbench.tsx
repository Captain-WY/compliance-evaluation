import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  AlertTriangle,
  CheckCircle2,
  CheckSquare,
  Clock,
  CornerDownRight,
  FileText,
  GitMerge,
  History,
  Loader2,
  MessageSquare,
  RefreshCw,
  Search,
  ShieldAlert,
  ThumbsUp,
  X,
  XCircle,
} from 'lucide-react';
import {
  assessmentApi,
  type UnifiedReviewQuickPhrase,
  type UnifiedReviewTaskDetail,
  type UnifiedReviewTaskSummary,
} from '../../services/api';

type Bucket = 'todo' | 'done' | 'cc';

const bucketLabels: Record<Bucket, string> = {
  todo: '待我处理',
  done: '我已处理',
  cc: '抄送我的',
};

const decisionText: Record<string, string> = {
  approve: '通过并流转',
  return_for_rework: '退回补充',
  reject_to_previous_level: '驳回上一环节',
};

export default function UnifiedReviewWorkbench() {
  const [tasks, setTasks] = useState<UnifiedReviewTaskSummary[]>([]);
  const [summary, setSummary] = useState({ todo: 0, done: 0, cc: 0 });
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<Bucket>('todo');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [viewTask, setViewTask] = useState<UnifiedReviewTaskDetail | null>(null);
  const [comment, setComment] = useState('');
  const [keyword, setKeyword] = useState('');
  const [sourceOrgId, setSourceOrgId] = useState('');
  const [category, setCategory] = useState('');
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await assessmentApi.getUnifiedReviewTasks({
        bucket: activeTab,
        keyword: keyword || undefined,
        sourceOrgId: sourceOrgId || undefined,
        category: category || undefined,
        urgentOnly: urgentOnly || undefined,
        pageSize: 50,
      });
      setTasks(page.items);
      setSummary(page.summary ?? { todo: 0, done: 0, cc: 0 });
      setSelectedTasks(current => current.filter(id => page.items.some(item => item.reviewTaskId === id)));
    } catch (err) {
      setTasks([]);
      setSelectedTasks([]);
      setError(err instanceof Error ? err.message : '统一复核任务加载失败');
    } finally {
      setLoading(false);
    }
  }, [activeTab, category, keyword, sourceOrgId, urgentOnly]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  const sourceOptions = useMemo(() => {
    const rows = new Map<string, string>();
    tasks.forEach(task => rows.set(task.targetOrgId, task.branch));
    return [...rows.entries()];
  }, [tasks]);

  const categoryOptions = useMemo(() => {
    return [...new Set(tasks.map(task => task.category).filter(Boolean))];
  }, [tasks]);

  const handleSelectAll = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) setSelectedTasks(tasks.map(task => task.reviewTaskId));
    else setSelectedTasks([]);
  };

  const handleSelect = (id: string) => {
    setSelectedTasks(prev => (prev.includes(id) ? prev.filter(taskId => taskId !== id) : [...prev, id]));
  };

  const openDrawer = async (task: UnifiedReviewTaskSummary) => {
    setDrawerOpen(true);
    setDetailLoading(true);
    setError(null);
    setNotice(null);
    setComment('');
    try {
      const detail = await assessmentApi.getUnifiedReviewTask(task.reviewTaskId);
      setViewTask(detail);
      setComment(detail.comments?.find(item => item.type === 'DRAFT')?.comment ?? '');
    } catch (err) {
      setViewTask(null);
      setError(err instanceof Error ? err.message : '复核详情加载失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const mergeTask = (task: UnifiedReviewTaskDetail) => {
    setTasks(current => current.map(item => (item.reviewTaskId === task.reviewTaskId ? task : item)));
    setViewTask(task);
  };

  const handleSave = async () => {
    if (!viewTask) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const detail = await assessmentApi.saveUnifiedReviewTask(viewTask.reviewTaskId, {
        comment,
        version: viewTask.version,
      });
      mergeTask(detail);
      setNotice('意见已保存');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDecision = async (decision: 'approve' | 'return_for_rework' | 'reject_to_previous_level') => {
    if (!viewTask) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const detail = await assessmentApi.decideUnifiedReviewTask(viewTask.reviewTaskId, {
        decision,
        reason: comment || decisionText[decision],
        comment,
        version: viewTask.version,
        idempotencyKey: `ui-${viewTask.reviewTaskId}-${decision}-${Date.now()}`,
      });
      mergeTask(detail);
      setComment('');
      setNotice(`${decisionText[decision]}成功`);
      await loadTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : '决策提交失败');
    } finally {
      setSaving(false);
    }
  };

  const handleBatch = async (decision: 'approve' | 'reject_to_previous_level') => {
    const selected = tasks.filter(task => selectedTasks.includes(task.reviewTaskId));
    if (!selected.length) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const result = await assessmentApi.batchDecideUnifiedReviewTasks({
        decision,
        reason: decisionText[decision],
        items: selected.map(task => ({ reviewTaskId: task.reviewTaskId, version: task.version })),
      });
      setSelectedTasks([]);
      setNotice(`批量处理 ${result.successCount} 项，失败 ${result.failureCount} 项`);
      await loadTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : '批量处理失败');
    } finally {
      setSaving(false);
    }
  };

  const applyQuickPhrase = (phrase: UnifiedReviewQuickPhrase) => {
    setComment(phrase.text);
  };

  const currentItems = viewTask?.sourceContext?.items ?? [];
  const canAct = viewTask?.actionEligibility ?? {
    canSaveComment: false,
    canApprove: false,
    canReturn: false,
    canReject: false,
    canBatchDecide: false,
  };

  return (
    <div className="flex h-full bg-slate-50 overflow-hidden">
      <div className="w-56 bg-white border-r border-slate-200 flex flex-col pt-4">
        <div className="px-5 mb-4">
          <h2 className="text-xs font-black text-slate-400 uppercase mb-3">Triage</h2>
          <div className="space-y-1">
            {(['todo', 'done', 'cc'] as Bucket[]).map(bucket => (
              <button
                key={bucket}
                onClick={() => setActiveTab(bucket)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-bold transition-colors ${activeTab === bucket ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                <div className="flex items-center">
                  {bucket === 'todo' ? <CheckSquare className="w-4 h-4 mr-2" /> : bucket === 'done' ? <CheckCircle2 className="w-4 h-4 mr-2" /> : <MessageSquare className="w-4 h-4 mr-2" />}
                  {bucketLabels[bucket]}
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] ${activeTab === bucket ? 'bg-indigo-100' : 'bg-slate-100'}`}>
                  {summary[bucket] ?? 0}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="px-5 mb-4 border-t border-slate-100 pt-4">
          <h2 className="text-xs font-black text-slate-400 uppercase mb-3">Filters</h2>
          <div className="space-y-3">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase">源头机构</label>
              <select
                value={sourceOrgId}
                onChange={event => setSourceOrgId(event.target.value)}
                className="w-full mt-1 border-slate-200 text-xs rounded bg-slate-50"
              >
                <option value="">全部分支机构</option>
                {sourceOptions.map(([orgId, name]) => (
                  <option key={orgId} value={orgId}>{name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase">指标类别</label>
              <select
                value={category}
                onChange={event => setCategory(event.target.value)}
                className="w-full mt-1 border-slate-200 text-xs rounded bg-slate-50"
              >
                <option value="">全部类别</option>
                {categoryOptions.map(item => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center space-x-2 pt-2">
              <input
                type="checkbox"
                id="urgent"
                className="rounded border-slate-300 text-rose-500 focus:ring-rose-200"
                checked={urgentOnly}
                onChange={event => setUrgentOnly(event.target.checked)}
              />
              <label htmlFor="urgent" className="text-xs text-slate-600 font-bold flex items-center">
                仅显示超期 <ShieldAlert className="w-3 h-3 text-rose-500 ml-1" />
              </label>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden relative">
        <div className="bg-white px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0 gap-4">
          <h1 className="text-xl font-bold text-slate-800 flex items-center">
            <GitMerge className="w-6 h-6 mr-2 text-indigo-600" />
            统一审批流转中心
          </h1>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="搜索指标、机构、流水号..."
                value={keyword}
                onChange={event => setKeyword(event.target.value)}
                className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-colors w-64"
              />
            </div>
            <button
              onClick={() => void loadTasks()}
              className="p-2 border border-slate-200 rounded-lg text-slate-500 hover:text-indigo-600 hover:border-indigo-200"
              title="刷新"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {(error || notice) && (
          <div className={`mx-6 mt-4 px-4 py-3 rounded-lg text-sm font-bold border ${error ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`} role={error ? 'alert' : 'status'}>
            {error || notice}
          </div>
        )}

        <AnimatePresence>
          {selectedTasks.length > 0 && (
            <motion.div
              initial={{ y: -50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -50, opacity: 0 }}
              className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-slate-800 text-white px-6 py-3 rounded-full shadow-lg flex items-center space-x-6 border border-slate-700"
            >
              <div className="text-sm font-bold">
                已选 <span className="text-emerald-400 px-1">{selectedTasks.length}</span> 项任务
              </div>
              <div className="w-px h-5 bg-slate-600" />
              <div className="flex space-x-2">
                <button
                  onClick={() => void handleBatch('approve')}
                  disabled={saving}
                  className="flex items-center px-4 py-1.5 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 rounded-full text-sm font-bold transition-colors disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4 mr-1.5" /> 批量通过
                </button>
                <button
                  onClick={() => void handleBatch('reject_to_previous_level')}
                  disabled={saving}
                  className="flex items-center px-4 py-1.5 bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 rounded-full text-sm font-bold transition-colors disabled:opacity-50"
                >
                  <XCircle className="w-4 h-4 mr-1.5" /> 批量驳回
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-1 overflow-auto p-6 bg-slate-50">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase font-black text-slate-500">
                <tr>
                  <th className="px-4 py-3 w-12 text-center">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      checked={selectedTasks.length === tasks.length && tasks.length > 0}
                      onChange={handleSelectAll}
                    />
                  </th>
                  <th className="px-4 py-3">流水号 / 机构名称</th>
                  <th className="px-4 py-3">当前环节</th>
                  <th className="px-4 py-3">考核指标</th>
                  <th className="px-4 py-3">计算得分</th>
                  <th className="px-4 py-3">停留时间</th>
                  <th className="px-4 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-slate-500 font-bold">
                      <Loader2 className="w-5 h-5 inline mr-2 animate-spin" /> 加载中
                    </td>
                  </tr>
                )}
                {!loading && tasks.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-slate-400 font-bold">暂无复核任务</td>
                  </tr>
                )}
                {!loading && tasks.map(task => (
                  <tr
                    key={task.reviewTaskId}
                    className={`hover:bg-slate-50 transition-colors group cursor-pointer ${task.isOverdue ? 'bg-rose-50/30' : ''}`}
                    onClick={() => void openDrawer(task)}
                  >
                    <td className="px-4 py-3 text-center" onClick={event => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        checked={selectedTasks.includes(task.reviewTaskId)}
                        onChange={() => handleSelect(task.reviewTaskId)}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-[10px] text-slate-400 font-mono mb-0.5">{task.reviewTaskId}</div>
                      <div className="font-bold text-slate-800">{task.branch}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-md text-xs font-bold border flex w-max items-center ${
                        task.levelCode === 'L2' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
                        task.levelCode === 'L3' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                        'bg-purple-50 text-purple-700 border-purple-200'
                      }`}>
                        <div className={`w-1.5 h-1.5 rounded-full mr-1.5 ${task.levelCode === 'L2' ? 'bg-indigo-500' : task.levelCode === 'L3' ? 'bg-emerald-500' : 'bg-purple-500'}`} />
                        {task.currentLevelLabel || task.currentLevel}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-700">{task.indicator}</td>
                    <td className="px-4 py-3">
                      <div className="font-mono text-lg font-black text-slate-800">{task.score}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className={`flex items-center text-xs font-bold ${task.isOverdue ? 'text-rose-600' : 'text-slate-500'}`}>
                        {task.isOverdue ? <AlertTriangle className="w-3.5 h-3.5 mr-1" /> : <Clock className="w-3.5 h-3.5 mr-1" />}
                        {task.sla}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button className="text-indigo-600 hover:text-indigo-800 font-bold text-sm px-3 py-1.5 rounded hover:bg-indigo-50 transition-colors opacity-0 group-hover:opacity-100">
                        去审核
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <AnimatePresence>
          {drawerOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-slate-900/40 z-30 backdrop-blur-sm"
                onClick={() => setDrawerOpen(false)}
              />
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="absolute top-0 right-0 bottom-0 w-full max-w-4xl bg-slate-50 shadow-2xl z-40 flex flex-col border-l border-slate-200"
              >
                <div className="bg-white px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
                  <div className="flex items-center space-x-4">
                    <button onClick={() => setDrawerOpen(false)} className="p-2 -ml-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg">
                      <X className="w-5 h-5" />
                    </button>
                    <div>
                      <div className="text-[10px] text-slate-400 font-mono font-bold">
                        {viewTask?.reviewTaskId ?? 'LOADING'} · {viewTask?.branch ?? ''}
                      </div>
                      <h2 className="text-lg font-black text-slate-800">{viewTask?.indicator ?? '复核详情'}</h2>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-slate-500 font-bold uppercase mr-2">当前环节</span>
                    <span className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded text-sm font-black border border-indigo-200">
                      {viewTask?.currentLevelLabel ?? viewTask?.currentLevel ?? '-'}
                    </span>
                  </div>
                </div>

                {detailLoading || !viewTask ? (
                  <div className="flex-1 grid place-items-center text-slate-500 font-bold">
                    <Loader2 className="w-5 h-5 mr-2 animate-spin inline" /> 加载详情
                  </div>
                ) : (
                  <div className="flex-1 flex overflow-hidden">
                    <div className="flex-1 overflow-y-auto p-6 bg-slate-50 border-r border-slate-200">
                      <h3 className="text-sm font-black text-slate-800 uppercase flex items-center mb-6">
                        <FileText className="w-4 h-4 mr-2 text-indigo-500" />
                        原始填报与佐证
                      </h3>

                      <div className="bg-white border-2 border-slate-200 rounded-xl p-5 mb-6 shadow-sm">
                        <div className="text-xs text-slate-400 font-bold uppercase mb-2">上报数据指标值</div>
                        <div className="text-3xl font-mono font-black text-indigo-600 mb-6">{viewTask.value}</div>
                        <div className="text-xs text-slate-400 font-bold uppercase mb-2">当前复核项</div>
                        <div className="space-y-2">
                          {(currentItems.length ? currentItems : [{ reviewItemId: viewTask.reviewTaskId, indicatorSnapshot: { indicatorName: viewTask.indicator }, status: viewTask.status }]).map((item: any) => (
                            <div key={item.reviewItemId ?? item.responseItemId ?? viewTask.reviewTaskId} className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                              <div className="text-sm font-bold text-slate-700">{item.indicatorSnapshot?.indicatorName ?? viewTask.indicator}</div>
                              <div className="text-xs text-slate-500 mt-1">状态 {item.status ?? viewTask.status} · 得分 {item.finalScore ?? item.preliminaryScore ?? viewTask.score}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="bg-slate-900 rounded-xl p-5 shadow-inner">
                        <div className="text-xs text-slate-400 font-bold uppercase mb-3 flex items-center justify-between">
                          <span>计算推演结果</span>
                          <span className="font-mono text-[10px] bg-slate-800 px-2 py-1 rounded border border-slate-700">{viewTask.workflowTemplateVersionId}</span>
                        </div>
                        <div className="flex items-end space-x-3 text-white">
                          <span className="text-5xl font-black font-mono leading-none text-emerald-400">{viewTask.score}</span>
                          <span className="text-sm text-slate-400 font-medium mb-1">当前版本 {viewTask.version}</span>
                        </div>
                      </div>
                    </div>

                    <div className="w-96 flex flex-col bg-white">
                      <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
                        <h3 className="text-sm font-black text-slate-800 uppercase flex items-center mb-6">
                          <History className="w-4 h-4 mr-2 text-indigo-500" />
                          流转溯源
                        </h3>

                        <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px before:h-full before:w-0.5 before:bg-slate-300">
                          {viewTask.auditTrail.map(event => (
                            <div key={event.eventId} className="relative flex items-start justify-between group is-active">
                              <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-white bg-emerald-500 text-white shadow shrink-0 z-10">
                                {event.status === 'approve' ? <CheckCircle2 className="w-5 h-5" /> : <CornerDownRight className="w-5 h-5" />}
                              </div>
                              <div className="w-[calc(100%-3rem)] p-4 rounded border border-slate-200 bg-white shadow-sm overflow-visible relative">
                                <div className="flex items-center justify-between mb-1 gap-2">
                                  <span className="font-black text-slate-800 text-sm">[{event.level}] {event.actorSnapshot?.displayName ?? '系统'}</span>
                                  <span className="text-[10px] text-slate-400 font-mono">{event.time}</span>
                                </div>
                                <div className="text-xs font-bold text-indigo-600 mb-2">{event.action}</div>
                                <div className="text-sm text-slate-600 bg-slate-50 p-2 rounded border border-slate-100">{event.opinion}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="shrink-0 p-6 border-t border-slate-200 bg-white">
                        <h3 className="text-sm font-black text-slate-800 mb-3">当前处理意见</h3>
                        <div className="flex flex-wrap gap-2 mb-3">
                          {viewTask.quickPhrases.map(phrase => (
                            <button
                              key={phrase.phraseId}
                              onClick={() => applyQuickPhrase(phrase)}
                              className="px-2 py-1 bg-slate-100 text-slate-600 hover:bg-slate-200 text-[10px] font-bold rounded border border-slate-200 transition-colors"
                            >
                              {phrase.text}
                            </button>
                          ))}
                        </div>

                        <textarea
                          className="w-full text-sm border-slate-300 rounded-lg p-3 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-100 placeholder-slate-400 mb-4"
                          rows={3}
                          placeholder="输入审核意见..."
                          value={comment}
                          onChange={event => setComment(event.target.value)}
                        />

                        <div className="flex flex-col gap-2">
                          <button
                            onClick={() => void handleSave()}
                            disabled={saving || !canAct.canSaveComment}
                            className="w-full flex items-center justify-center px-4 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 font-bold rounded-lg transition-colors disabled:opacity-50"
                          >
                            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <MessageSquare className="w-4 h-4 mr-2" />} 保存意见
                          </button>
                          <button
                            onClick={() => void handleDecision('approve')}
                            disabled={saving || !canAct.canApprove}
                            className="w-full flex items-center justify-center px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition-colors shadow-sm disabled:opacity-50"
                          >
                            <ThumbsUp className="w-4 h-4 mr-2" /> 通过并流转
                          </button>
                          <div className="flex gap-2">
                            <button
                              onClick={() => void handleDecision('reject_to_previous_level')}
                              disabled={saving || !canAct.canReject}
                              className="flex-1 flex items-center justify-center px-4 py-2 bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200 font-bold rounded-lg transition-colors text-sm disabled:opacity-50"
                            >
                              <CornerDownRight className="w-4 h-4 mr-1.5" /> 驳回
                            </button>
                            <button
                              onClick={() => void handleDecision('return_for_rework')}
                              disabled={saving || !canAct.canReturn}
                              className="flex-1 flex items-center justify-center px-4 py-2 bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200 font-bold rounded-lg transition-colors text-sm disabled:opacity-50"
                            >
                              <AlertTriangle className="w-4 h-4 mr-1.5" /> 退回
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
