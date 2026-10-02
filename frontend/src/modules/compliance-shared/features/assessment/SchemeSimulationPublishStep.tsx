import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  Info,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import type { AssessmentSimulationDetail } from '../../services/api';
import type { SchemeDetail } from './AssessmentSchemeWorkbench';

type SummaryTone = 'default' | 'ok' | 'warn';

export interface SimulationPublishReadinessRow {
  key: string;
  label: string;
  description?: string;
  ready: boolean;
  optional: boolean;
  findings: Array<Record<string, unknown>>;
}

interface SchemeSimulationPublishStepProps {
  detail: SchemeDetail | null;
  readOnly: boolean;
  canPublish: boolean;
  publishCommandReason?: string;
  targetCount: number;
  mandatoryReady: boolean;
  readinessRows: SimulationPublishReadinessRow[];
  readinessSummary: Record<string, unknown> | null;
  publishSummary: Record<string, unknown> | null;
  sourceTraceSummary: Record<string, unknown> | null;
  commandAuditSummary: Record<string, unknown> | null;
  commandAudit: Array<Record<string, unknown>>;
  schemeSnapshot: Record<string, unknown> | null;
  snapshotReadiness: Record<string, unknown> | null;
  simulationReferencePeriod: string;
  simulationPolicy: string;
  simulationLoading: boolean;
  simulationError: string | null;
  simulationDetail: AssessmentSimulationDetail | null;
  simulationSkipped: boolean;
  onSimulationReferencePeriodChange: (value: string) => void;
  onSimulationPolicyChange: (value: string) => void;
  onRunSimulation: () => void | Promise<void>;
  onSkipSimulation: () => void;
}

const simulationPolicyOptions = [
  { value: 'exclude', label: '缺失样本不计入均值' },
  { value: 'zero_fill', label: '缺失项按 0 分填补' },
  { value: 'carry_forward', label: '沿用最近历史值' },
];

const simulationPolicyLabel = (policy?: string | null) =>
  simulationPolicyOptions.find((option) => option.value === policy)?.label ?? '缺失样本不计入均值';

const simulationRunStatusLabel = (status?: string | null) => {
  const normalized = String(status ?? '').toUpperCase();
  if (normalized === 'COMPLETED' || normalized === 'SUCCESS') return '已完成';
  if (normalized === 'RUNNING') return '运行中';
  if (normalized === 'FAILED') return '运行失败';
  return status || '待运行';
};

const formatPercent = (value?: number | null) =>
  typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value * 100)}%` : '-';

const formatScore = (value?: number | null) =>
  typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : '-';

const findingText = (finding: Record<string, unknown>) =>
  String(finding.message ?? finding.code ?? 'finding');

const statusLabel: Record<string, string> = {
  DRAFT: '草稿',
  ACTIVE: '运行中',
  ARCHIVED: '已归档',
  SUSPENDED: '已暂停',
  EXPIRED: '已结束',
};

export default function SchemeSimulationPublishStep({
  detail,
  readOnly,
  canPublish,
  publishCommandReason,
  targetCount,
  mandatoryReady,
  readinessRows,
  readinessSummary,
  publishSummary,
  schemeSnapshot,
  snapshotReadiness,
  simulationReferencePeriod,
  simulationPolicy,
  simulationLoading,
  simulationError,
  simulationDetail,
  simulationSkipped,
  onSimulationReferencePeriodChange,
  onSimulationPolicyChange,
  onRunSimulation,
  onSkipSimulation,
}: SchemeSimulationPublishStepProps) {
  const topSimulationSamples = simulationDetail?.resultSummary.topSamples?.length
    ? simulationDetail.resultSummary.topSamples
    : simulationDetail?.orgResults.slice(0, 3) ?? [];
  const bottomSimulationSamples = simulationDetail?.resultSummary.bottomSamples?.length
    ? simulationDetail.resultSummary.bottomSamples
    : simulationDetail?.orgResults.slice(-3).reverse() ?? [];
  const simulationStatusText = simulationDetail
    ? `本次回测${simulationRunStatusLabel(simulationDetail.status)}，参照期为 ${simulationDetail.referencePeriod}`
    : simulationSkipped
      ? '已跳过仿真；不会阻塞发布。'
      : detail?.schemeId
        ? '历史回测可选执行；跳过不会影响强制预检。'
        : '保存草稿后可运行真实仿真。';
  const mandatoryReadyCount = readinessRows.filter((row) => !row.optional && row.ready).length;
  const publishedSnapshotExists = Boolean(publishSummary?.snapshotHash || schemeSnapshot?.snapshotHash);
  const canRunSimulation = Boolean(detail?.schemeId) && !simulationLoading && !readOnly;
  const imputationNoteText = simulationDetail
    ? simulationDetail.imputationNotes.length > 0
      ? `本次回测有 ${simulationDetail.imputationNotes.length} 条样本触发缺失数据处理，处理方式为${simulationPolicyLabel(simulationDetail.imputationPolicy)}；结果仅用于发布前趋势判断。`
      : '本次回测未发现需要补数的样本。'
    : '';

  return (
    <div className="space-y-4" data-testid="asch-step-panel-simulation-publish">
      <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm" data-testid="asch-publish-readiness-checklist">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <ClipboardCheck className="mt-0.5 h-5 w-5 text-indigo-600" />
            <div>
              <div className="text-base font-semibold text-slate-900">方案发布预检清单</div>
              <div className="mt-1 text-xs leading-5 text-slate-500">
                后端会在发布时重新执行发布前检查；计分规则、审批路由、下发调度为强制项，历史回测建议执行但非强制。
              </div>
            </div>
          </div>
          <Badge
            variant={mandatoryReady ? 'secondary' : 'destructive'}
            className={mandatoryReady ? 'border border-emerald-200 bg-emerald-50 text-emerald-700' : ''}
            data-testid="asch-publish-mandatory-state"
          >
            {mandatoryReady ? '必填项已通过' : '必填项未通过'}
          </Badge>
        </div>
        <div className="mt-4 grid gap-2" data-testid="asch-publish-readiness-rows">
          {readinessRows.map((row) => (
            <div key={row.key}>
              <ReadinessLine
                testId={`asch-readiness-${row.key}`}
                label={row.label}
                description={row.description}
                ready={row.ready}
                optional={row.optional}
                skipped={row.key === 'simulation' && simulationSkipped}
                findings={row.findings}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm" data-testid="asch-simulation-runner">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <BarChart3 className="mt-0.5 h-5 w-5 text-slate-700" />
            <div>
              <div className="text-base font-semibold text-slate-900">历史数据回测沙盘</div>
              <div className="mt-1 text-xs leading-5 text-slate-500" data-testid="asch-simulation-status-text">
                {simulationStatusText}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={onSkipSimulation}
              disabled={simulationLoading || readOnly}
              data-testid="asch-simulation-skip"
            >
              跳过仿真
            </Button>
            <Button
              size="sm"
              type="button"
              onClick={onRunSimulation}
              disabled={!canRunSimulation}
              data-testid="asch-simulation-run"
            >
              {simulationLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {simulationLoading ? '沙盘推演中' : '运行历史回测'}
            </Button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="text-xs font-medium text-slate-600 md:col-span-1">
            参照期
            <Select
              value={simulationReferencePeriod || 'current'}
              disabled
              onValueChange={onSimulationReferencePeriodChange}
            >
              <SelectTrigger className="mt-1 bg-slate-50 text-slate-700" data-testid="asch-simulation-reference-period">
                <span className="truncate">{simulationReferencePeriod || '当前方案默认参照期'}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={simulationReferencePeriod || 'current'}>
                  {simulationReferencePeriod || '当前方案默认参照期'}
                </SelectItem>
              </SelectContent>
            </Select>
            <div className="mt-1 text-[11px] leading-4 text-slate-500">真实历史数据周期选择待后续契约接入。</div>
          </label>
          <label className="text-xs font-medium text-slate-600 md:col-span-1">
            缺失数据处理
            <Select value={simulationPolicy} onValueChange={onSimulationPolicyChange} disabled={simulationLoading || readOnly}>
              <SelectTrigger className="mt-1" data-testid="asch-simulation-imputation-policy">
                <span className="truncate">{simulationPolicyLabel(simulationPolicy)}</span>
              </SelectTrigger>
              <SelectContent>
                {simulationPolicyOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs leading-5 text-blue-800 md:col-span-1">
            <div className="flex gap-2">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <span>仿真只产生试算结果，不创建正式周期、考核结果、任务或通知；跳过仿真不影响发布按钮是否可用。</span>
            </div>
          </div>
        </div>
        {simulationSkipped && (
          <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600" data-testid="asch-simulation-skipped">
            已跳过仿真；发布仍只受强制预检和后端命令可用性控制。
          </div>
        )}
        {simulationError && (
          <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700" data-testid="asch-simulation-error">
            {simulationError}
          </div>
        )}
      </div>

      {simulationDetail ? (
        <div className="space-y-4 rounded-md border border-slate-200 bg-white p-4 shadow-sm" data-testid="asch-simulation-result">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-base font-semibold text-slate-900">仿真结果</div>
              <div className="mt-1 text-xs text-slate-500">
                {simulationRunStatusLabel(simulationDetail.status)} · 参照期 {simulationDetail.referencePeriod}
              </div>
            </div>
            <Badge variant="outline" data-testid="asch-simulation-only-flag">
              试算结果
            </Badge>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" data-testid="asch-simulation-summary">
            <SummaryCell label="回测状态" value={simulationRunStatusLabel(simulationDetail.status)} tone="ok" />
            <SummaryCell label="最高分" value={formatScore(simulationDetail.resultSummary.highestScore)} />
            <SummaryCell label="平均分" value={formatScore(simulationDetail.resultSummary.averageSimulatedScore)} />
            <SummaryCell label="最低分" value={formatScore(simulationDetail.resultSummary.lowestScore)} />
          </div>

          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800" data-testid="asch-simulation-imputation-banner">
            <span className="font-semibold">缺失数据说明：</span>
            {imputationNoteText}
          </div>

          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs" data-testid="asch-simulation-grade-distribution">
            <div className="font-semibold text-slate-700">等级分布</div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {Object.entries(simulationDetail.resultSummary.gradeDistribution).map(([grade, count]) => (
                <div key={grade} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-center">
                  <div className="text-lg font-semibold text-slate-900">{count}</div>
                  <div className="mt-1 text-slate-500">{grade}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <SimulationSampleList title="头部样本" samples={topSimulationSamples} testId="asch-simulation-top-samples" />
            <SimulationSampleList title="尾部样本" samples={bottomSimulationSamples} testId="asch-simulation-bottom-samples" />
          </div>
        </div>
      ) : (
        <div className="rounded-md border border-slate-200 bg-white p-4 text-xs leading-5 text-slate-600 shadow-sm" data-testid="asch-simulation-empty-state">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div>
              <div className="font-semibold text-slate-800">暂无仿真结果</div>
              <p className="mt-1">
                可先运行历史回测查看分数分布，也可以跳过仿真进入发布确认。跳过不会影响强制预检。
              </p>
            </div>
          </div>
        </div>
      )}

      {detail && (
        <div className="space-y-4 rounded-md border border-slate-200 bg-white p-4 shadow-sm" data-testid="asch-detail-readmodel-summary">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-base font-semibold text-slate-900">发布确认区</div>
              <div className="mt-1 text-xs leading-5 text-slate-500">
                当前状态：{statusLabel[detail.status] ?? detail.status} · 修订版本 v{detail.optimisticVersion}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className={canPublish ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}
                data-testid="asch-detail-action-state"
              >
                {canPublish ? '可以发布' : '暂不可发布'}
              </Badge>
            </div>
          </div>

          {!canPublish && publishCommandReason && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800" data-testid="asch-publish-command-reason">
              发布条件仍需补齐，请查看上方预检清单。
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" data-testid="asch-detail-summary-cells">
            <SummaryCell
              label="目标对象"
              value={`${detail.targetCount ?? targetCount}`}
              tone={(detail.targetCount ?? targetCount) > 0 ? 'ok' : 'warn'}
            />
            <SummaryCell
              label="强制预检"
              value={`${readinessSummary?.readyCount ?? mandatoryReadyCount}/${readinessSummary?.mandatoryCount ?? 4}`}
              tone={mandatoryReady ? 'ok' : 'warn'}
            />
            <SummaryCell
              label="发布快照"
              value={publishedSnapshotExists ? '已生成' : '待发布生成'}
              tone={publishedSnapshotExists ? 'ok' : 'warn'}
            />
            <SummaryCell
              label="历史回测"
              value={simulationDetail ? '已运行' : simulationSkipped ? '已跳过' : '建议执行'}
              tone={simulationDetail || simulationSkipped ? 'ok' : 'warn'}
            />
          </div>

          <div className="grid gap-3 text-xs lg:grid-cols-2">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3" data-testid="asch-publish-snapshot-summary">
              <div className="font-semibold text-slate-700">发布回读</div>
              <div className="mt-2 grid gap-1 text-slate-600">
                <div>发布批次：{detail.publishedAtRef || publishSummary?.publishedAtRef ? '已生成' : '待生成'}</div>
                <div>快照固化：{publishedSnapshotExists ? '已固化' : '待固化'}</div>
                <div>强制预检：{snapshotReadiness?.mandatoryReady ?? publishSummary?.mandatoryReady ?? mandatoryReady ? '已通过' : '待补齐'}</div>
                <div>历史回测：{simulationDetail ? '已运行' : simulationSkipped ? '已跳过' : '建议执行，可跳过'}</div>
              </div>
            </div>

            <div className="rounded-md border border-slate-200 bg-slate-50 p-3" data-testid="asch-publish-next-step-summary">
              <div className="font-semibold text-slate-700">发布后生效范围</div>
              <div className="mt-2 grid gap-1 text-slate-600">
                <div>目标对象：{detail.targetCount ?? targetCount} 个</div>
                <div>下发调度：发布后按已保存策略执行</div>
                <div>历史回测：仅作为发布前参考，不写入正式结果</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCell({ label, value, tone = 'default' }: { label: string; value: string; tone?: SummaryTone }) {
  const toneClass =
    tone === 'ok'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : tone === 'warn'
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : 'border-slate-200 bg-slate-50 text-slate-800';
  return (
    <div className={`rounded-md border p-2 ${toneClass}`}>
      <div className="text-[11px] opacity-75">{label}</div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
    </div>
  );
}

function SimulationSampleList({
  title,
  samples,
  testId,
}: {
  title: string;
  samples: AssessmentSimulationDetail['orgResults'];
  testId: string;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs" data-testid={testId}>
      <div className="font-semibold text-slate-700">{title}</div>
      <div className="mt-2 grid gap-1">
        {samples.length ? (
          samples.slice(0, 3).map((sample) => (
            <div key={`${testId}-${sample.orgId}`} className="rounded-md border border-slate-200 bg-white px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium text-slate-700">{sample.orgSnapshot.orgName ?? sample.orgId}</span>
                <span className="shrink-0 font-semibold text-slate-900">{formatScore(sample.score)} · {sample.grade}</span>
              </div>
              <div className="mt-1 text-slate-500">
                样本覆盖 {formatPercent(sample.coverage.coverageRatio)}，缺失项 {sample.coverage.missingItems}
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-500">后端未返回样本明细</div>
        )}
      </div>
    </div>
  );
}

function ReadinessLine({
  label,
  description,
  ready,
  optional,
  skipped = false,
  findings,
  testId,
}: {
  label: string;
  description?: string;
  ready: boolean;
  optional: boolean;
  skipped?: boolean;
  findings: Array<Record<string, unknown>>;
  testId: string;
}) {
  const state = optional
    ? ready
      ? 'ready'
      : skipped
        ? 'skipped'
        : 'optional'
    : ready
      ? 'ready'
      : 'blocked';
  const badgeClass =
    state === 'ready'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : state === 'blocked'
        ? 'border-rose-200 bg-rose-50 text-rose-700'
        : 'border-slate-200 bg-slate-50 text-slate-600';
  const Icon = state === 'ready' ? CheckCircle2 : state === 'blocked' ? AlertTriangle : Info;
  const iconClass =
    state === 'ready'
      ? 'text-emerald-600'
      : state === 'blocked'
        ? 'text-rose-600'
        : 'text-slate-500';
  return (
    <div className="rounded-md border border-slate-200 bg-white px-4 py-3" data-testid={testId}>
      <div className="flex items-start gap-3">
        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconClass}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium text-slate-800">{label}</span>
            <Badge variant="outline" className={badgeClass} data-testid={`${testId}-state`}>
              {state === 'ready' ? '已通过' : state === 'blocked' ? '需补齐' : state === 'skipped' ? '已跳过' : '建议执行'}
            </Badge>
          </div>
          {description && <div className="mt-1 text-[11px] leading-4 text-slate-500">{description}</div>}
          {state === 'blocked' && findings.length > 0 && (
            <div className="mt-1 text-[11px] leading-4 text-rose-600">请先补齐本项配置，再继续发布。</div>
          )}
        </div>
      </div>
    </div>
  );
}
