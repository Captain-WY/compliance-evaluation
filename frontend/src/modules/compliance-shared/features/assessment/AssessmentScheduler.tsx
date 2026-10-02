import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  MousePointerClick,
  PlayCircle,
  RefreshCcw,
  RotateCcw,
  Save,
  Send,
  ShieldAlert,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  assessmentApi,
  type AssessmentScheduleDetail,
  type ScheduleExecution,
} from '../../services/api';

type LoadState = 'idle' | 'loading' | 'ready' | 'error' | 'denied';

const DEFAULT_SCHEDULE_ID =
  import.meta.env.VITE_DEFAULT_ASSESSMENT_SCHEDULE_ID || 'ASCHED-DRAFT-001';

const frequencyLabels: Record<string, string> = {
  MONTHLY: '每月',
  QUARTERLY: '每季度',
  HALF_YEARLY: '每半年度',
  YEARLY: '年度',
};

const statusLabels: Record<string, string> = {
  DRAFT: '草稿',
  ACTIVE: '生效中',
  PAUSED: '暂停',
  EXPIRED: '已过期',
  ARCHIVED: '已归档',
  QUEUED: '等待执行',
  RUNNING: '执行中',
  SUCCEEDED: '成功',
  FAILED: '失败',
  RETRY_REQUESTED: '已请求重试',
  CANCELLED: '已取消',
};

const statusClass = (status: string) => {
  if (status === 'ACTIVE' || status === 'SUCCEEDED') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'FAILED') return 'bg-rose-50 text-rose-700 border-rose-200';
  if (status === 'RETRY_REQUESTED' || status === 'QUEUED' || status === 'RUNNING') return 'bg-blue-50 text-blue-700 border-blue-200';
  return 'bg-slate-50 text-slate-600 border-slate-200';
};

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const isPermissionError = (message: string) =>
  /permission|forbidden|403|无权|未授权|denied/i.test(message);

const scheduleIdFromLocation = () => {
  if (typeof window === 'undefined') return DEFAULT_SCHEDULE_ID;
  return new URLSearchParams(window.location.search).get('scheduleId') || DEFAULT_SCHEDULE_ID;
};

export default function AssessmentScheduler() {
  const [scheduleId] = useState(scheduleIdFromLocation);
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [schedule, setSchedule] = useState<AssessmentScheduleDetail | null>(null);
  const [executions, setExecutions] = useState<ScheduleExecution[]>([]);
  const [frequency, setFrequency] = useState('QUARTERLY');
  const [dayOffset, setDayOffset] = useState('5');
  const [time, setTime] = useState('10:00');
  const [timezone, setTimezone] = useState('Asia/Shanghai');
  const [loadingExecutions, setLoadingExecutions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const applySchedule = (detail: AssessmentScheduleDetail) => {
    const rule = detail.draftRule || detail.activeRule;
    setSchedule(detail);
    if (rule) {
      setFrequency(rule.frequency);
      setDayOffset(String(rule.workingDayOffset));
      setTime(rule.fireTime);
      setTimezone(rule.timezone);
    }
  };

  const loadExecutions = useCallback(async () => {
    setLoadingExecutions(true);
    try {
      const page = await assessmentApi.listAssessmentScheduleExecutions(scheduleId, { pageSize: 20 });
      setExecutions(page.items);
    } catch (err) {
      setExecutions([]);
      setError(errorMessage(err, '执行记录加载失败'));
    } finally {
      setLoadingExecutions(false);
    }
  }, [scheduleId]);

  const loadSchedule = useCallback(async () => {
    setLoadState('loading');
    setError(null);
    setNotice(null);
    try {
      const detail = await assessmentApi.getAssessmentSchedule(scheduleId);
      applySchedule(detail);
      setLoadState('ready');
      await loadExecutions();
    } catch (err) {
      const message = errorMessage(err, '调度策略加载失败');
      setError(message);
      setSchedule(null);
      setExecutions([]);
      setLoadState(isPermissionError(message) ? 'denied' : 'error');
    }
  }, [loadExecutions, scheduleId]);

  useEffect(() => {
    void loadSchedule();
  }, [loadSchedule]);

  const canEditDraft = schedule?.status === 'DRAFT';
  const currentRule = schedule?.draftRule || schedule?.activeRule;
  const predictionText = schedule?.predictedNextFireAt
    ? new Date(schedule.predictedNextFireAt).toLocaleString('zh-CN', { hour12: false })
    : '待服务器计算';

  const targetSummary = useMemo(() => {
    const count = schedule?.targetOrgIds.length ?? 0;
    return count ? `${count} 个考核对象` : '未配置考核对象';
  }, [schedule?.targetOrgIds.length]);

  const handleSave = async () => {
    if (!schedule) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const detail = await assessmentApi.saveAssessmentScheduleDraft(schedule.scheduleId, {
        frequency,
        workingDayOffset: Number(dayOffset),
        fireTime: time,
        timezone,
        calendarCode: 'WEEKDAY_ONLY',
      });
      applySchedule(detail);
      setNotice('调度草稿已保存');
    } catch (err) {
      setError(errorMessage(err, '保存调度草稿失败'));
    } finally {
      setSaving(false);
    }
  };

  const handleActivate = async () => {
    if (!schedule) return;
    setActivating(true);
    setError(null);
    setNotice(null);
    try {
      const result = await assessmentApi.activateAssessmentSchedule(schedule.scheduleId);
      applySchedule(result.schedule);
      await loadExecutions();
      setNotice('调度策略已激活');
    } catch (err) {
      setError(errorMessage(err, '激活调度策略失败'));
    } finally {
      setActivating(false);
    }
  };

  const handleRetry = async (execution: ScheduleExecution) => {
    setRetryingId(execution.executionId);
    setError(null);
    setNotice(null);
    try {
      const result = await assessmentApi.retryAssessmentScheduleExecution(execution.executionId, {
        reason: 'frontend scheduler retry',
        idempotencyKey: `ui-schedule-retry-${execution.executionId}`,
      });
      await Promise.all([
        assessmentApi.getAssessmentSchedule(scheduleId).then(applySchedule),
        loadExecutions(),
      ]);
      setNotice(result.duplicate ? '该失败执行已有重试请求' : '重试请求已入队');
    } catch (err) {
      setError(errorMessage(err, '重试失败执行失败'));
    } finally {
      setRetryingId(null);
    }
  };

  const handleDispatchNow = async () => {
    if (!schedule) return;
    setDispatching(true);
    setError(null);
    setNotice(null);
    try {
      const result = await assessmentApi.dispatchAssessmentScheduleNow(
        schedule.scheduleId,
        `ui-schedule-dispatch-${schedule.scheduleId}-${Date.now()}`,
      );
      await Promise.all([
        assessmentApi.getAssessmentSchedule(scheduleId).then(applySchedule),
        loadExecutions(),
      ]);
      setNotice(result.duplicate ? '该调度已有正在执行的立即下发' : '立即下发已触发');
    } catch (err) {
      const message = errorMessage(err, '立即下发失败');
      if (/409|INVALID_STATE|状态|state/i.test(message)) {
        setError('当前调度状态不允许立即下发（请确认调度已激活且未在执行中）');
      } else if (isPermissionError(message)) {
        setError('无权执行立即下发操作');
      } else {
        setError(message);
      }
    } finally {
      setDispatching(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-slate-50 pb-20 text-slate-900">
      <div className="shrink-0 border-b border-slate-200 bg-white px-6 py-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">下发与调度策略</h1>
            <p className="mt-1 text-sm text-slate-500">
              {schedule?.scheduleId ?? scheduleId} · {targetSummary}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {schedule && (
              <Badge variant="outline" className={statusClass(schedule.status)}>
                {statusLabels[schedule.status] ?? schedule.status}
              </Badge>
            )}
            <Button variant="outline" size="sm" onClick={() => void loadSchedule()} disabled={loadState === 'loading'}>
              {loadState === 'loading' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
              刷新
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 md:p-8">
        <div className="mx-auto max-w-5xl space-y-6">
          {error && (
            <div className="flex items-start gap-3 rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              {loadState === 'denied' ? <ShieldAlert className="mt-0.5 h-5 w-5" /> : <AlertTriangle className="mt-0.5 h-5 w-5" />}
              <span>{error}</span>
            </div>
          )}
          {notice && (
            <div className="flex items-start gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
              <CheckCircle2 className="mt-0.5 h-5 w-5" />
              <span>{notice}</span>
            </div>
          )}
          {loadState === 'loading' && (
            <div className="flex min-h-[360px] items-center justify-center text-slate-500">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              加载调度策略
            </div>
          )}
          {loadState !== 'loading' && schedule && (
            <>
              <section className="rounded-md border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-6 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h2 className="text-base font-bold tracking-tight text-slate-900">下发模式与频次</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      服务器按冻结工作日策略计算下一次触发时间，前端不本地推算。
                    </p>
                  </div>
                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                    {schedule.prediction.calendarPolicy}
                  </Badge>
                </div>

                <div className="mb-6 flex flex-col gap-4 sm:flex-row">
                  <div className="w-full rounded-md border border-blue-500 bg-blue-50 p-4 text-blue-700 shadow-sm sm:w-[320px]">
                    <RefreshCcw className="mb-2 h-6 w-6" />
                    <h4 className="mb-1 text-base font-semibold">周期性自动下发</h4>
                    <p className="text-xs opacity-80">本包唯一可激活的调度模式</p>
                  </div>
                  <div className="w-full rounded-md border border-slate-200 bg-slate-50 p-4 text-slate-500 sm:w-[320px]">
                    <MousePointerClick className="mb-2 h-6 w-6" />
                    <h4 className="mb-1 text-base font-semibold">单次/临时手动下发</h4>
                    <p className="text-xs">由 P1 周期手动下发处理，不在调度器写入本地状态</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 rounded-md border border-slate-200 bg-slate-50 p-5 text-base font-medium leading-loose text-slate-700">
                  <span>以</span>
                  <Select value={frequency} onValueChange={setFrequency} disabled={!canEditDraft}>
                    <SelectTrigger className="w-[128px] border-slate-300 bg-white font-bold text-indigo-700 shadow-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MONTHLY">每月</SelectItem>
                      <SelectItem value="QUARTERLY">每季度</SelectItem>
                      <SelectItem value="HALF_YEARLY">每半年度</SelectItem>
                      <SelectItem value="YEARLY">年度</SelectItem>
                    </SelectContent>
                  </Select>
                  <span>为周期，在第</span>
                  <Input
                    type="number"
                    value={dayOffset}
                    onChange={(event) => setDayOffset(event.target.value)}
                    disabled={!canEditDraft}
                    className="h-10 w-[80px] border-slate-300 bg-white text-center font-bold text-indigo-700 shadow-sm"
                    min="1"
                    max="23"
                  />
                  <span>个工作日</span>
                  <Select value={time} onValueChange={setTime} disabled={!canEditDraft}>
                    <SelectTrigger className="w-[120px] border-slate-300 bg-white font-bold text-indigo-700 shadow-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="08:00">08:00</SelectItem>
                      <SelectItem value="09:00">09:00</SelectItem>
                      <SelectItem value="10:00">10:00</SelectItem>
                      <SelectItem value="11:00">11:00</SelectItem>
                    </SelectContent>
                  </Select>
                  <span>自动执行下发。</span>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="rounded-md border border-slate-200 bg-white p-4">
                    <p className="text-xs text-slate-500">服务器预测</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{predictionText}</p>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-white p-4">
                    <p className="text-xs text-slate-500">频次</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {frequencyLabels[currentRule?.frequency ?? frequency] ?? frequency}
                    </p>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-white p-4">
                    <p className="text-xs text-slate-500">时区</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{timezone}</p>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  <Button onClick={handleSave} disabled={!canEditDraft || saving}>
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    保存草稿
                  </Button>
                  <Button variant="outline" onClick={handleActivate} disabled={!canEditDraft || activating}>
                    {activating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-2 h-4 w-4" />}
                    激活调度
                  </Button>
                  {schedule.status === 'ACTIVE' && (
                    <Button
                      variant="secondary"
                      onClick={() => void handleDispatchNow()}
                      disabled={dispatching}
                    >
                      {dispatching ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="mr-2 h-4 w-4" />
                      )}
                      立即下发
                    </Button>
                  )}
                  <Button variant="ghost" disabled title="pause/resume 未冻结为本包公共 API">
                    暂停/恢复不可用
                  </Button>
                </div>
              </section>

              <section className="rounded-md border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-6 flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold tracking-tight text-slate-900">近期执行记录</h2>
                    <p className="mt-1 text-sm text-slate-500">失败执行可请求一次受保护重试。</p>
                  </div>
                  {loadingExecutions && <Loader2 className="h-5 w-5 animate-spin text-slate-400" />}
                </div>

                <div className="overflow-hidden rounded-md border border-slate-200">
                  <table className="w-full whitespace-nowrap text-left text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50 font-bold text-slate-500">
                      <tr>
                        <th className="px-4 py-3">执行时间</th>
                        <th className="px-4 py-3">下发对象</th>
                        <th className="px-4 py-3">生成任务</th>
                        <th className="px-4 py-3">状态</th>
                        <th className="px-4 py-3 text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {executions.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                            暂无执行记录
                          </td>
                        </tr>
                      ) : executions.map((execution) => (
                        <tr key={execution.executionId} className="transition-colors hover:bg-slate-50/70">
                          <td className="px-4 py-3 font-mono text-slate-600">
                            {new Date(execution.scheduledAt).toLocaleString('zh-CN', { hour12: false })}
                          </td>
                          <td className="px-4 py-3">{execution.targetCount} 家</td>
                          <td className="px-4 py-3">{execution.generatedTaskCount}</td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className={statusClass(execution.status)}>
                              {statusLabels[execution.status] ?? execution.status}
                            </Badge>
                            {execution.errorCode && (
                              <p className="mt-1 max-w-[280px] truncate text-xs text-rose-600">
                                {execution.errorCode}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {execution.status === 'FAILED' ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-blue-200 text-blue-700 hover:bg-blue-50"
                                onClick={() => void handleRetry(execution)}
                                disabled={retryingId === execution.executionId}
                              >
                                {retryingId === execution.executionId ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                  <RotateCcw className="mr-2 h-4 w-4" />
                                )}
                                重新触发本期
                              </Button>
                            ) : (
                              <span className="px-3 text-xs font-medium text-slate-400">无操作</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
