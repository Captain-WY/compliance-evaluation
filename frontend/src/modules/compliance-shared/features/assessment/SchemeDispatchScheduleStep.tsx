import React, { useState } from 'react';
import { CheckCircle2, Loader2, MousePointerClick, RefreshCcw, Save } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import type {
  ScheduleBindingDraft,
  SchedulePeriodicRuleDraft,
  SchemeDetail,
} from './AssessmentSchemeWorkbench';

type ScheduleSaveStatus = 'idle' | 'saving' | 'refetching' | 'success' | 'error';

interface FrequencyOption {
  value: string;
  label: string;
}

interface SchemeDispatchScheduleStepProps {
  scheduleBinding?: ScheduleBindingDraft | null;
  frequency: string;
  frequencyOptions: FrequencyOption[];
  readOnly: boolean;
  commandLoading: string | null;
  scheduleSummary?: Record<string, unknown> | null;
  schedulingReadiness?: Record<string, unknown> | null;
  schemeId?: string;
  nextRunAt?: string | null;
  lastRunAt?: string | null;
  onChange: (binding: ScheduleBindingDraft) => void;
  onSave: () => SchemeDetail | null | Promise<SchemeDetail | null>;
  onRefetch: (schemeId?: string) => boolean | Promise<boolean>;
}

const frequencyValues = ['YEARLY', 'HALF_YEARLY', 'QUARTERLY', 'MONTHLY', 'AD_HOC'];
const legacyFrequencyMap: Record<string, string> = {
  ANNUAL: 'YEARLY',
  YEARLY: 'YEARLY',
  HALF_YEARLY: 'HALF_YEARLY',
  HALFYEARLY: 'HALF_YEARLY',
  QUARTERLY: 'QUARTERLY',
  MONTHLY: 'MONTHLY',
  ONETIME: 'AD_HOC',
  ONE_TIME: 'AD_HOC',
  ADHOC: 'AD_HOC',
  AD_HOC: 'AD_HOC',
};

const normalizeFrequency = (frequency?: string | null) => {
  const raw = String(frequency ?? '').trim();
  const key = raw.toUpperCase().replace(/[\s-]/g, '_');
  const compactKey = key.replace(/_/g, '');
  const normalized = legacyFrequencyMap[key] ?? legacyFrequencyMap[compactKey] ?? raw;
  return frequencyValues.includes(normalized) ? normalized : 'YEARLY';
};

const defaultPeriodicRule = (frequency = 'YEARLY'): SchedulePeriodicRuleDraft => ({
  frequency: normalizeFrequency(frequency) === 'AD_HOC' ? 'QUARTERLY' : normalizeFrequency(frequency),
  workingDayOffset: 5,
  fireTime: '09:30',
  timezone: 'Asia/Shanghai',
  calendarCode: 'WEEKDAY_ONLY',
});

const numeric = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const findingsFromReadiness = (readiness?: Record<string, unknown> | null): Array<Record<string, unknown>> =>
  Array.isArray(readiness?.findings) ? readiness.findings as Array<Record<string, unknown>> : [];

const findingText = (finding: Record<string, unknown>) =>
  String(finding.message ?? finding.code ?? 'finding');

export default function SchemeDispatchScheduleStep({
  scheduleBinding,
  frequency,
  frequencyOptions,
  readOnly,
  commandLoading,
  schedulingReadiness,
  schemeId,
  onChange,
  onSave,
  onRefetch,
}: SchemeDispatchScheduleStepProps) {
  const [saveState, setSaveState] = useState<{ status: ScheduleSaveStatus; message: string } | null>(null);
  const rawPeriodicRule = scheduleBinding?.periodicRule ?? defaultPeriodicRule(frequency);
  const periodicRule = {
    ...rawPeriodicRule,
    frequency: normalizeFrequency(rawPeriodicRule.frequency) === 'AD_HOC' ? 'QUARTERLY' : normalizeFrequency(rawPeriodicRule.frequency),
  };
  const dispatchMode = scheduleBinding?.dispatchMode ?? 'SCHEDULED';
  const scheduledFrequencyOptions = frequencyOptions.filter((option) => option.value !== 'AD_HOC');
  const periodicFrequencyLabel =
    scheduledFrequencyOptions.find((option) => option.value === normalizeFrequency(periodicRule.frequency))?.label ?? '年度';
  const readinessReady = schedulingReadiness?.ready === true;
  const readinessFindings = findingsFromReadiness(schedulingReadiness);
  const busy = commandLoading === 'save' || commandLoading === 'refetch' || saveState?.status === 'saving' || saveState?.status === 'refetching';

  const emitChange = (binding: ScheduleBindingDraft) => {
    setSaveState(null);
    onChange(binding);
  };

  const updateDispatchMode = (nextMode: 'SCHEDULED' | 'MANUAL') => {
    emitChange(
      nextMode === 'SCHEDULED'
        ? {
            dispatchMode: 'SCHEDULED',
            periodicRule: scheduleBinding?.periodicRule ?? defaultPeriodicRule(frequency),
            manualDispatchPolicy: null,
          }
        : {
            dispatchMode: 'MANUAL',
            periodicRule: null,
            manualDispatchPolicy: {
              boundary: 'MANUAL_DISPATCH_AFTER_PUBLISH',
              requiresSeparateCycleDispatch: true,
              createsNoCycleOnSave: true,
            },
          },
    );
  };

  const updatePeriodicRule = (patch: Partial<SchedulePeriodicRuleDraft>) => {
    emitChange({
      dispatchMode: 'SCHEDULED',
      periodicRule: { ...periodicRule, ...patch },
      manualDispatchPolicy: null,
    });
  };

  const saveAndRefetch = async () => {
    setSaveState({ status: 'saving', message: '正在保存下发与调度策略...' });
    const savedDetail = await onSave();
    if (!savedDetail) {
      setSaveState({ status: 'error', message: '保存失败，未写入成功状态；请根据页面错误修正后重试。' });
      return;
    }
    setSaveState({ status: 'refetching', message: '已保存，正在刷新最新发布前检查状态...' });
    const refetched = await onRefetch(savedDetail.schemeId ?? schemeId);
    if (!refetched) {
      setSaveState({ status: 'error', message: '已提交但刷新失败，请稍后再次保存调度策略确认状态。' });
      return;
    }
    setSaveState({ status: 'success', message: '下发与调度策略已保存。' });
  };

  return (
    <div className="space-y-5" data-testid="asch-step-panel-scheduling-dispatch">
      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm" data-testid="asch-schedule-readiness">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-lg font-semibold text-slate-900">下发与调度策略</div>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
              选择本方案按固定周期自动下发，或发布后由运行调度模块手动发起一次性下发。本步骤只保存方案规则，不会创建考核周期或填报任务。
            </p>
          </div>
          <Badge
            variant={readinessReady ? 'secondary' : 'destructive'}
            className={readinessReady ? 'border border-emerald-200 bg-emerald-50 text-emerald-700' : ''}
            data-testid="asch-schedule-readiness-state"
          >
            {readinessReady ? '调度已就绪' : '调度待完善'}
          </Badge>
        </div>

        <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600" data-testid="asch-schedule-empty-execution">
          暂无真实执行记录。本步骤仅保存方案中的下发策略，不创建考核周期、填报任务或静态执行记录。
        </div>

        <FieldErrors findings={readinessFindings} />
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm" data-testid="asch-schedule-strategy">
        <div className="mb-5">
          <div className="text-base font-semibold text-slate-900">1. 下发模式与频次</div>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            两种方式都会保存为正式方案配置；本轮不触发正式下发。
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <button
            type="button"
            className={`rounded-md border p-4 text-left transition-colors ${
              dispatchMode === 'SCHEDULED'
                ? 'border-blue-500 bg-blue-50 text-blue-800 shadow-sm'
                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
            }`}
            disabled={readOnly}
            onClick={() => updateDispatchMode('SCHEDULED')}
            data-testid="asch-schedule-mode-scheduled"
          >
            <span className="flex items-center gap-2 text-base font-semibold">
              <RefreshCcw className="h-5 w-5" />
              定时自动下发
              {dispatchMode === 'SCHEDULED' && <CheckCircle2 className="ml-auto h-4 w-4" />}
            </span>
            <span className="mt-2 block text-xs leading-5 text-slate-500">
              适用于月度、季度、半年度和年度等常规考核；保存后作为方案发布前的调度策略。
            </span>
          </button>

          <button
            type="button"
            className={`rounded-md border p-4 text-left transition-colors ${
              dispatchMode === 'MANUAL'
                ? 'border-blue-500 bg-blue-50 text-blue-800 shadow-sm'
                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
            }`}
            disabled={readOnly}
            onClick={() => updateDispatchMode('MANUAL')}
            data-testid="asch-schedule-mode-manual"
          >
            <span className="flex items-center gap-2 text-base font-semibold">
              <MousePointerClick className="h-5 w-5" />
              手动一次性下发
              {dispatchMode === 'MANUAL' && <CheckCircle2 className="ml-auto h-4 w-4" />}
            </span>
            <span className="mt-2 block text-xs leading-5 text-slate-500">
              适用于专项排查或临时考核；只保存发布后的手动下发策略。
            </span>
          </button>
        </div>
      </section>

      {dispatchMode === 'SCHEDULED' ? (
        <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm" data-testid="asch-periodic-rule-editor">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-base font-semibold text-slate-900">2. 周期规则</div>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                用业务句式配置频率、工作日偏移和触发时间。
              </p>
            </div>
            <Badge variant="outline">周期滚动</Badge>
          </div>

          <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-base font-medium leading-9 text-slate-700" data-testid="asch-schedule-readable-rule">
            <span>在此方案运行期内，以</span>
            <Select
              value={normalizeFrequency(periodicRule.frequency)}
              disabled={readOnly}
              onValueChange={(value) => updatePeriodicRule({ frequency: normalizeFrequency(value) })}
            >
              <SelectTrigger className="mx-2 inline-flex h-9 w-[128px] bg-white font-semibold text-blue-700" data-testid="asch-schedule-frequency">
                <span className="truncate">{periodicFrequencyLabel}</span>
              </SelectTrigger>
              <SelectContent>
                {scheduledFrequencyOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span>为周期，在第</span>
            <Input
              type="number"
              min={1}
              max={23}
              value={periodicRule.workingDayOffset}
              disabled={readOnly}
              onChange={(event) => updatePeriodicRule({ workingDayOffset: numeric(event.target.value, 5) })}
              className="mx-2 inline-flex h-9 w-20 bg-white text-center font-semibold text-blue-700"
              data-testid="asch-schedule-working-day-offset"
            />
            <span>个工作日</span>
            <Input
              value={periodicRule.fireTime}
              disabled={readOnly}
              onChange={(event) => updatePeriodicRule({ fireTime: event.target.value })}
              className="mx-2 inline-flex h-9 w-24 bg-white text-center font-semibold text-blue-700"
              data-testid="asch-schedule-fire-time"
            />
            <span>自动执行下发。</span>
          </div>

        </section>
      ) : (
        <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm" data-testid="asch-manual-boundary">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-base font-semibold text-slate-900">2. 手动下发边界</div>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
                当前方案配置为一次性考核，无需周期规则。保存草稿只记录发布后的手动下发策略；后续由运行调度模块另行发起。
              </p>
            </div>
            <Badge variant="outline">一次性</Badge>
          </div>
          <div className="mt-4 grid gap-2 text-xs leading-5 text-slate-600 md:grid-cols-2">
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              已明确选择手动一次性下发策略，可进入发布前检查。
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              方案保存时不会创建考核周期或填报任务。
            </div>
          </div>
        </section>
      )}

      <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm" data-testid="asch-schedule-save-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1 text-xs">
            {saveState ? (
              <div
                className={`rounded-md border px-3 py-2 ${
                  saveState.status === 'error'
                    ? 'border-rose-200 bg-rose-50 text-rose-700'
                    : saveState.status === 'success'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-blue-200 bg-blue-50 text-blue-700'
                }`}
                data-testid="asch-schedule-save-status"
              >
                {saveState.message}
              </div>
            ) : (
              <span className="text-slate-500">保存草稿后，本方案会使用当前下发策略参与发布前检查。</span>
            )}
          </div>
          <Button
            type="button"
            disabled={readOnly || busy}
            onClick={() => { void saveAndRefetch(); }}
            data-testid="asch-schedule-save-refetch"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {busy ? '保存中' : '保存调度策略'}
          </Button>
        </div>
      </section>
    </div>
  );
}

function FieldErrors({ findings }: { findings: Array<Record<string, unknown>> }) {
  if (!findings.length) return null;
  return (
    <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800" data-testid="asch-schedule-readiness-findings">
      {findings.map((finding, index) => (
        <div key={`${String(finding.code ?? 'finding')}-${index}`}>{findingText(finding)}</div>
      ))}
    </div>
  );
}
