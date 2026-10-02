import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  CheckSquare,
  Clock,
  FileText,
  History,
  Layers,
  Loader2,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { GlobalSchemeSelector } from '@/components/common/GlobalSchemeSelector';
import {
  assessmentApi,
  type UnifiedReviewQuickPhrase,
  type UnifiedReviewTaskDetail,
  type UnifiedReviewTaskSummary,
} from '../../services/api';
import { useSchemeStore } from '@/store/useSchemeStore';

type Bucket = 'todo' | 'done' | 'cc';
type Decision = 'approve' | 'return_for_rework' | 'reject_to_previous_level';

const bucketLabels: Record<Bucket, string> = {
  todo: '待处理',
  done: '已处理',
  cc: '抄送',
};

const decisionText: Record<Decision, string> = {
  approve: '通过并流转',
  return_for_rework: '退回重评',
  reject_to_previous_level: '驳回上一环节',
};

const statusText: Record<string, string> = {
  PENDING: '待处理',
  IN_REVIEW: '复核中',
  APPROVED: '已通过',
  RETURNED: '已退回',
  REJECTED: '已驳回',
  CLOSED: '已关闭',
};

const safeItems = (detail: UnifiedReviewTaskDetail | null) =>
  Array.isArray(detail?.sourceContext?.items) ? detail.sourceContext.items : [];

const safeInsights = (detail: UnifiedReviewTaskDetail | null) =>
  Array.isArray(detail?.sourceContext?.aiInsightSnapshots) ? detail.sourceContext.aiInsightSnapshots : [];

const safeEvidence = (item: any) => {
  const direct = item?.evidenceList ?? item?.evidence ?? item?.attachments ?? item?.files;
  return Array.isArray(direct) ? direct : [];
};

const itemName = (item: any, fallback: string) =>
  item?.indicatorSnapshot?.indicatorName ?? item?.indicatorName ?? item?.title ?? fallback;

const itemScore = (item: any, fallback: number) =>
  item?.finalScore ?? item?.preliminaryScore ?? item?.systemInitialScore ?? item?.score ?? fallback;

export default function HQReviewWorkstation() {
  const { selectedSchemeId, selectedSchemeName } = useSchemeStore();
  const [tasks, setTasks] = useState<UnifiedReviewTaskSummary[]>([]);
  const [summary, setSummary] = useState({ todo: 0, done: 0, cc: 0 });
  const [activeBucket, setActiveBucket] = useState<Bucket>('todo');
  const [keyword, setKeyword] = useState('');
  const [sourceOrgId, setSourceOrgId] = useState('');
  const [category, setCategory] = useState('');
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);
  const [detail, setDetail] = useState<UnifiedReviewTaskDetail | null>(null);
  const [comment, setComment] = useState('');
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
        bucket: activeBucket,
        keyword: keyword || undefined,
        sourceOrgId: sourceOrgId || undefined,
        category: category || undefined,
        urgentOnly: urgentOnly || undefined,
        pageSize: 100,
      });
      setTasks(page.items ?? []);
      setSummary(page.summary ?? { todo: 0, done: 0, cc: 0 });
      setSelectedTasks(current => current.filter(id => page.items?.some(item => item.reviewTaskId === id)));
      if (!selectedTaskId && page.items?.[0]) setSelectedTaskId(page.items[0].reviewTaskId);
      if (selectedTaskId && !page.items?.some(item => item.reviewTaskId === selectedTaskId)) {
        setSelectedTaskId(page.items?.[0]?.reviewTaskId ?? null);
      }
    } catch (err) {
      setTasks([]);
      setSelectedTasks([]);
      setError(err instanceof Error ? err.message : '复核任务加载失败');
    } finally {
      setLoading(false);
    }
  }, [activeBucket, category, keyword, selectedTaskId, sourceOrgId, urgentOnly]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    if (!selectedTaskId) {
      setDetail(null);
      setComment('');
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setError(null);
    setNotice(null);
    assessmentApi.getUnifiedReviewTask(selectedTaskId)
      .then(nextDetail => {
        if (cancelled) return;
        setDetail(nextDetail);
        const draft = nextDetail.comments?.find(item => item.type === 'DRAFT');
        setComment(String(draft?.comment ?? ''));
      })
      .catch(err => {
        if (cancelled) return;
        setDetail(null);
        setError(err instanceof Error ? err.message : '复核详情加载失败');
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedTaskId]);

  const sourceOptions = useMemo(() => {
    const rows = new Map<string, string>();
    tasks.forEach(task => rows.set(task.targetOrgId, task.branch));
    return [...rows.entries()];
  }, [tasks]);

  const categoryOptions = useMemo(() => [...new Set(tasks.map(task => task.category).filter(Boolean))], [tasks]);
  const currentItems = safeItems(detail);
  const insights = safeInsights(detail);
  const canAct = detail?.actionEligibility ?? {
    canSaveComment: false,
    canApprove: false,
    canReturn: false,
    canReject: false,
    canBatchDecide: false,
  };

  const mergeDetail = (nextDetail: UnifiedReviewTaskDetail) => {
    setDetail(nextDetail);
    setTasks(current => current.map(task => (task.reviewTaskId === nextDetail.reviewTaskId ? nextDetail : task)));
  };

  const handleSelect = (taskId: string) => {
    setSelectedTasks(current => (
      current.includes(taskId) ? current.filter(id => id !== taskId) : [...current, taskId]
    ));
  };

  const handleSave = async () => {
    if (!detail) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const nextDetail = await assessmentApi.saveUnifiedReviewTask(detail.reviewTaskId, {
        comment,
        version: detail.version,
      });
      mergeDetail(nextDetail);
      setNotice('复核意见已保存');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDecision = async (decision: Decision) => {
    if (!detail) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const nextDetail = await assessmentApi.decideUnifiedReviewTask(detail.reviewTaskId, {
        decision,
        reason: comment || decisionText[decision],
        comment,
        version: detail.version,
        idempotencyKey: `hq-review-${detail.reviewTaskId}-${decision}-${Date.now()}`,
      });
      mergeDetail(nextDetail);
      setComment('');
      setNotice(`${decisionText[decision]}成功`);
      await loadTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : '决策提交失败');
    } finally {
      setSaving(false);
    }
  };

  const handleBatchDecision = async (decision: 'approve' | 'reject_to_previous_level') => {
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

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50 overflow-hidden" data-testid="p1-review-page">
      <div className="shrink-0 border-b border-slate-200 bg-white px-5 py-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-indigo-50 text-indigo-600">
              <Layers className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-black text-slate-900">集中复核审批</h1>
              <p className="text-xs font-medium text-slate-500">
                三栏复核工作台 · 真实 `/api/review-workbench` 流程数据
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <GlobalSchemeSelector />
            <Button variant="outline" onClick={() => void loadTasks()} disabled={loading} title="刷新复核任务">
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              刷新
            </Button>
            <Button
              variant="outline"
              disabled={saving || selectedTasks.length === 0 || !canAct.canBatchDecide}
              onClick={() => void handleBatchDecision('reject_to_previous_level')}
              title={!canAct.canBatchDecide ? '当前账号不可批量驳回' : '批量驳回所选任务'}
            >
              <XCircle className="mr-2 h-4 w-4" />
              批量驳回
            </Button>
            <Button
              disabled={saving || selectedTasks.length === 0 || !canAct.canBatchDecide}
              onClick={() => void handleBatchDecision('approve')}
              title={!canAct.canBatchDecide ? '当前账号不可批量通过' : '批量通过所选任务'}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              批量通过
            </Button>
          </div>
        </div>
        {selectedSchemeId ? (
          <div className="mt-3 text-xs font-medium text-slate-500">当前方案上下文：{selectedSchemeName ?? selectedSchemeId}</div>
        ) : (
          <div className="mt-3 text-xs font-medium text-amber-700">未选择考核方案；任务仍按真实复核队列展示。</div>
        )}
      </div>

      {(error || notice) && (
        <div className={`mx-5 mt-4 rounded-lg border px-4 py-3 text-sm font-bold ${error ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`} role={error ? 'alert' : 'status'}>
          {error || notice}
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden p-5 xl:grid-cols-[320px_minmax(480px,1fr)_360px]">
        <aside className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-4">
            <div className="mb-4 grid grid-cols-3 gap-2">
              {(['todo', 'done', 'cc'] as Bucket[]).map(bucket => (
                <button
                  key={bucket}
                  type="button"
                  onClick={() => setActiveBucket(bucket)}
                  className={`rounded-lg border px-2 py-2 text-left transition-colors ${activeBucket === bucket ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                >
                  <div className="text-[11px] font-bold">{bucketLabels[bucket]}</div>
                  <div className="mt-1 text-lg font-black">{summary[bucket]}</div>
                </button>
              ))}
            </div>
            <div className="relative mb-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={keyword}
                onChange={event => setKeyword(event.target.value)}
                placeholder="搜索机构、指标、流水号"
                className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none focus:border-indigo-300 focus:bg-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={sourceOrgId}
                onChange={event => setSourceOrgId(event.target.value)}
                className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700"
              >
                <option value="">全部机构</option>
                {sourceOptions.map(([orgId, name]) => (
                  <option key={orgId} value={orgId}>{name}</option>
                ))}
              </select>
              <select
                value={category}
                onChange={event => setCategory(event.target.value)}
                className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700"
              >
                <option value="">全部类别</option>
                {categoryOptions.map(item => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>
            <label className="mt-3 flex items-center gap-2 text-xs font-bold text-slate-600">
              <input
                type="checkbox"
                checked={urgentOnly}
                onChange={event => setUrgentOnly(event.target.checked)}
                className="rounded border-slate-300 text-rose-600"
              />
              仅显示超期
              <ShieldAlert className="h-3.5 w-3.5 text-rose-500" />
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <div className="grid h-40 place-items-center text-sm font-bold text-slate-500">
                <span><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />加载任务</span>
              </div>
            ) : tasks.length === 0 ? (
              <div className="p-6 text-center text-sm font-bold text-slate-400">暂无真实复核任务</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {tasks.map(task => (
                  <button
                    key={task.reviewTaskId}
                    type="button"
                    onClick={() => setSelectedTaskId(task.reviewTaskId)}
                    className={`w-full p-4 text-left transition-colors ${selectedTaskId === task.reviewTaskId ? 'bg-indigo-50/80' : 'bg-white hover:bg-slate-50'}`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selectedTasks.includes(task.reviewTaskId)}
                        onClick={event => event.stopPropagation()}
                        onChange={() => handleSelect(task.reviewTaskId)}
                        className="mt-1 rounded border-slate-300 text-indigo-600"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-black text-slate-800">{task.branch}</div>
                        <div className="mt-1 truncate text-xs font-medium text-slate-500">{task.indicator}</div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className="border-indigo-200 bg-indigo-50 text-indigo-700">
                            {task.currentLevelLabel || task.currentLevel}
                          </Badge>
                          <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                            {statusText[task.status] ?? task.status}
                          </Badge>
                          <span className={`inline-flex items-center text-[11px] font-bold ${task.isOverdue ? 'text-rose-600' : 'text-slate-500'}`}>
                            {task.isOverdue ? <AlertTriangle className="mr-1 h-3.5 w-3.5" /> : <Clock className="mr-1 h-3.5 w-3.5" />}
                            {task.sla}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>

        <main className="min-h-0 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          {!selectedTaskId ? (
            <div className="grid h-full min-h-[420px] place-items-center p-8 text-center">
              <div>
                <CheckSquare className="mx-auto mb-3 h-12 w-12 text-slate-300" />
                <h2 className="text-lg font-black text-slate-700">请选择复核任务</h2>
                <p className="mt-2 text-sm text-slate-500">左侧列表来自真实复核队列。</p>
              </div>
            </div>
          ) : detailLoading || !detail ? (
            <div className="grid h-full min-h-[420px] place-items-center text-sm font-bold text-slate-500">
              <span><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />加载复核详情</span>
            </div>
          ) : (
            <div className="space-y-5 p-5">
              <section className="flex flex-col gap-4 border-b border-slate-100 pb-5 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="text-[11px] font-mono font-bold text-slate-400">{detail.reviewTaskId}</div>
                  <h2 className="mt-1 text-xl font-black text-slate-900">{detail.title}</h2>
                  <p className="mt-1 text-sm font-medium text-slate-500">{detail.indicator} · {detail.category}</p>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <Card className="rounded-lg border-slate-200 p-3 shadow-none">
                    <div className="text-[11px] font-bold text-slate-500">当前分数</div>
                    <div className="mt-1 text-2xl font-black text-slate-900">{detail.score}</div>
                  </Card>
                  <Card className="rounded-lg border-slate-200 p-3 shadow-none">
                    <div className="text-[11px] font-bold text-slate-500">指标值</div>
                    <div className="mt-1 max-w-24 truncate text-lg font-black text-indigo-700">{detail.value}</div>
                  </Card>
                  <Card className="rounded-lg border-slate-200 p-3 shadow-none">
                    <div className="text-[11px] font-bold text-slate-500">版本</div>
                    <div className="mt-1 text-lg font-black text-slate-900">{detail.version}</div>
                  </Card>
                </div>
              </section>

              <section>
                <h3 className="mb-3 flex items-center text-sm font-black text-slate-800">
                  <FileText className="mr-2 h-4 w-4 text-indigo-500" />
                  指标复核区
                </h3>
                {currentItems.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm font-bold text-slate-400">
                    当前详情未返回指标明细
                  </div>
                ) : (
                  <div className="space-y-3">
                    {currentItems.map((item: any) => (
                      <div key={item.reviewItemId ?? item.responseItemId ?? item.indicatorId ?? itemName(item, detail.indicator)} className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0">
                            <div className="font-black text-slate-800">{itemName(item, detail.indicator)}</div>
                            <div className="mt-1 text-xs font-medium text-slate-500">
                              状态 {item.status ?? detail.status} · 来源值 {item.responseValue ?? item.reportedValue ?? detail.value}
                            </div>
                          </div>
                          <Badge variant="outline" className="w-fit border-emerald-200 bg-emerald-50 text-emerald-700">
                            得分 {itemScore(item, detail.score)}
                          </Badge>
                        </div>
                        {safeEvidence(item).length > 0 ? (
                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            {safeEvidence(item).map((evidence: any, index: number) => (
                              <div key={evidence.fileId ?? evidence.id ?? index} className="rounded border border-slate-200 bg-white px-3 py-2 text-xs">
                                <div className="truncate font-bold text-slate-700">{evidence.fileName ?? evidence.name ?? evidence.title ?? evidence.fileId ?? '附件'}</div>
                                <div className="mt-1 text-slate-500">{evidence.fileSize ?? evidence.uploadTime ?? evidence.status ?? '真实附件元数据'}</div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-3 rounded border border-dashed border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-400">
                            该指标未返回证据附件字段
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section>
                <h3 className="mb-3 flex items-center text-sm font-black text-slate-800">
                  <History className="mr-2 h-4 w-4 text-indigo-500" />
                  L0/L1/L2/L3 流转轨迹
                </h3>
                <div className="grid gap-2 lg:grid-cols-4">
                  {detail.routeSnapshot.levels.map(level => (
                    <div key={`${level.level}-${level.nodeId}`} className={`rounded-lg border p-3 ${level.isCurrent ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                      <div className="text-[11px] font-mono font-bold">{level.level}</div>
                      <div className="mt-1 text-sm font-black">{level.label}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 space-y-3">
                  {detail.auditTrail.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-200 p-4 text-sm font-bold text-slate-400">暂无流转事件</div>
                  ) : detail.auditTrail.map(event => (
                    <div key={event.eventId} className="rounded-lg border border-slate-200 bg-white p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-black text-slate-800">[{event.level}] {event.actorSnapshot?.displayName ?? event.actorSnapshot?.username ?? '系统'}</div>
                        <div className="text-[11px] font-mono text-slate-400">{event.time}</div>
                      </div>
                      <div className="mt-1 text-xs font-bold text-indigo-600">{event.action || event.decision}</div>
                      <div className="mt-2 rounded bg-slate-50 p-2 text-sm text-slate-600">{event.opinion || event.status}</div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex flex-wrap gap-2">
                  {detail.quickPhrases.map(phrase => (
                    <button
                      key={phrase.phraseId}
                      type="button"
                      onClick={() => applyQuickPhrase(phrase)}
                      className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-100"
                    >
                      {phrase.text}
                    </button>
                  ))}
                </div>
                <Textarea
                  value={comment}
                  onChange={event => setComment(event.target.value)}
                  placeholder="输入复核意见；保存、通过、退回和驳回均提交到真实复核 API。"
                  className="min-h-28 bg-white"
                />
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <Button variant="outline" disabled={saving || !canAct.canSaveComment} onClick={() => void handleSave()}>
                    <MessageSquare className="mr-2 h-4 w-4" />
                    保存意见
                  </Button>
                  <Button variant="outline" disabled={saving || !canAct.canReject} onClick={() => void handleDecision('reject_to_previous_level')}>
                    <XCircle className="mr-2 h-4 w-4" />
                    驳回
                  </Button>
                  <Button variant="outline" disabled={saving || !canAct.canReturn} onClick={() => void handleDecision('return_for_rework')}>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    退回重评
                  </Button>
                  <Button disabled={saving || !canAct.canApprove} onClick={() => void handleDecision('approve')}>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    通过
                  </Button>
                </div>
              </section>
            </div>
          )}
        </main>

        <aside className="min-h-0 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-4">
            <h3 className="flex items-center text-sm font-black text-slate-800">
              <Bot className="mr-2 h-4 w-4 text-indigo-500" />
              AI 证据核验
            </h3>
            <p className="mt-1 text-xs font-medium text-slate-500">仅展示后端 sourceContext 返回的真实快照与附件字段。</p>
          </div>
          <div className="space-y-4 p-4">
            {insights.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 p-5 text-center">
                <Sparkles className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                <div className="text-sm font-black text-slate-500">暂无 AI 核验快照</div>
                <div className="mt-1 text-xs text-slate-400">不会恢复 MVP 中的 mock AI 面板。</div>
              </div>
            ) : insights.map((insight: any, index: number) => (
              <div key={insight.snapshotId ?? insight.id ?? index} className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-4">
                <div className="text-sm font-black text-slate-800">{insight.summary ?? insight.title ?? 'AI 核验摘要'}</div>
                {Array.isArray(insight.highlights) && insight.highlights.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {insight.highlights.map((highlight: any, highlightIndex: number) => (
                      <div key={highlight.id ?? highlightIndex} className="rounded border border-white bg-white/80 p-2 text-xs">
                        <div className="font-bold text-slate-700">{highlight.location ?? highlight.matchStatus ?? '证据锚点'}</div>
                        <div className="mt-1 text-slate-500">{highlight.keyQuote ?? highlight.summary ?? highlight.text}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 text-sm font-black text-slate-800">当前任务附件</div>
              {currentItems.flatMap(safeEvidence).length === 0 ? (
                <div className="rounded border border-dashed border-slate-200 bg-white p-4 text-center text-xs font-bold text-slate-400">
                  详情未返回可预览附件字段
                </div>
              ) : (
                <div className="space-y-2">
                  {currentItems.flatMap(safeEvidence).map((evidence: any, index: number) => (
                    <div key={evidence.fileId ?? evidence.id ?? index} className="rounded border border-slate-200 bg-white p-3 text-xs">
                      <div className="truncate font-bold text-slate-700">{evidence.fileName ?? evidence.name ?? evidence.fileId ?? '附件'}</div>
                      <div className="mt-1 text-slate-500">{evidence.status ?? evidence.fileSize ?? '真实附件元数据'}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
