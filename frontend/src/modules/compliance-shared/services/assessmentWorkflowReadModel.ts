import type { TriageRow, WorkflowInstance } from './mock/workflow';

type WorkflowBucket = NonNullable<WorkflowInstance['bucket']>;

type Segment = {
  color: string;
  w: number;
  offset: number;
};

export type WorkflowDashboardSummary = {
  activeCount: number;
  pendingCount: number;
  archivedCount: number;
  totalTargets: number;
  completedTargets: number;
  warningTargets: number;
  overallProgress: number | null;
};

export type WorkflowDetailMetrics = {
  activeStep: number;
  isStep2Done: boolean;
  isStep3Done: boolean;
  pct: string;
  progressValue: number;
  segments: Segment[];
  totals: {
    total: number;
    completed: number;
    reviewing: number;
    filling: number;
    waiting: number;
    returned: number;
    confirmed: number;
    appealing: number;
    resultPending: number;
  };
  dueDateLabel: string;
  dispatchTimeLabel: string;
  reportingTimeLabel: string;
  reviewTimeLabel: string;
  resultTimeLabel: string;
};

const normalizeNumber = (value: unknown, fallback = 0): number => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
};

const clampPercent = (value: number): number => Math.max(0, Math.min(100, Math.round(value)));

const orgNameFromSnapshot = (snapshot: any, fallback = '本机构') =>
  snapshot?.orgName ?? snapshot?.name ?? snapshot?.organizationName ?? fallback;

const formatPeriodLabel = (cycle: any, id: string): string =>
  cycle.periodLabel ?? cycle.period ?? [cycle.periodStart, cycle.periodEnd].filter(Boolean).join(' 至 ') ?? id;

export const formatDateOnly = (value?: string | null): string => {
  if (!value) return '--';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString().slice(0, 10);
};

export const formatDateTimeShort = (value?: string | null): string => {
  if (!value) return '--';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  const hour = String(parsed.getHours()).padStart(2, '0');
  const minute = String(parsed.getMinutes()).padStart(2, '0');
  return `${month}-${day} ${hour}:${minute}`;
};

export const getWorkflowBucket = (status?: string): WorkflowBucket => {
  if (status === 'DRAFT' || status === 'READY_FOR_DISPATCH') return 'pending';
  if (status === 'ARCHIVED' || status === 'CLOSED') return 'archived';
  return 'active';
};

const statusBadge = (bucket: WorkflowBucket, status?: string): string => {
  if (bucket === 'archived') return '🏁 已关闭/归档';
  if (bucket === 'pending') return '🚀 待人工下发';
  if (status === 'REVIEWING') return '🛡️ 多级复核审批中';
  if (status === 'RESULT_CONFIRMING') return '🏁 结果确认中';
  if (status === 'APPEALING') return '⚠️ 申辩处理中';
  return '✍️ 考核数据填报中';
};

const statusBadgeColor = (bucket: WorkflowBucket, status?: string): string => {
  if (bucket === 'archived') return 'text-slate-600 border-slate-200 bg-slate-50';
  if (bucket === 'pending') return 'text-blue-600 border-blue-200 bg-blue-50';
  if (status === 'APPEALING') return 'text-rose-600 border-rose-200 bg-rose-50';
  if (status === 'RESULT_CONFIRMING') return 'text-emerald-600 border-emerald-200 bg-emerald-50';
  return 'text-indigo-600 border-indigo-200 bg-indigo-50';
};

const rowFromTarget = (target: any, reportingTasksByTarget: Map<string, any>): TriageRow => {
  const reportingTask = reportingTasksByTarget.get(target.cycleTargetId);
  const targetStatus = target.targetStatus ?? 'PENDING_DISPATCH';
  const reportingStatus = reportingTask?.status;
  const returned = reportingStatus === 'RETURNED' || target.reviewStatus === 'RETURNED_TO_BRANCH';
  let status: TriageRow['status'] = '待启动';
  let statusColor = 'text-slate-500 border-slate-200 bg-slate-50';
  let progress = 0;

  if (returned) {
    status = '被退回';
    statusColor = 'text-rose-500 border-rose-200 bg-rose-50';
    progress = 25;
  } else if (targetStatus === 'REPORTING') {
    status = '填报中';
    statusColor = 'text-amber-500 border-amber-200 bg-amber-50';
    progress = 40;
  } else if (targetStatus === 'SUBMITTED' || targetStatus === 'UNDER_REVIEW') {
    status = '审批流转中';
    statusColor = 'text-blue-500 border-blue-200 bg-blue-50';
    progress = targetStatus === 'UNDER_REVIEW' ? 75 : 60;
  } else if (targetStatus === 'RESULT_PENDING_CONFIRMATION') {
    status = '待确认';
    statusColor = 'text-violet-600 border-violet-200 bg-violet-50';
    progress = 90;
  } else if (targetStatus === 'CONFIRMED') {
    status = '已确认';
    statusColor = 'text-emerald-600 border-emerald-200 bg-emerald-50';
    progress = 95;
  } else if (targetStatus === 'APPEALED') {
    status = '申辩中';
    statusColor = 'text-rose-600 border-rose-200 bg-rose-50';
    progress = 90;
  } else if (targetStatus === 'CLOSED') {
    status = '已完结';
    statusColor = 'text-emerald-500 border-emerald-200 bg-emerald-50';
    progress = 100;
  } else if (target.reportingTaskId || reportingTask) {
    status = '待启动';
    progress = 10;
  }

  return {
    id: target.cycleTargetId ?? target.orgId,
    targetOrgId: target.orgId,
    org: orgNameFromSnapshot(target.orgSnapshot, target.orgId),
    status,
    statusColor,
    progress,
    processor: target.assigneeName ?? '-',
    role: target.assigneeRole ?? '分支合规',
  };
};

export const toWorkflowInstances = (cycles: any[]): Record<string, WorkflowInstance> =>
  Object.fromEntries(cycles.map((cycle: any, index: number) => {
    const id = cycle.cycleId ?? cycle.id ?? `cycle-${index + 1}`;
    const reportingTasks = cycle.reportingTasks ?? [];
    const reportingTasksByTarget = new Map<string, any>(
      reportingTasks.map((task: any) => [task.cycleTargetId, task]),
    );
    const tableData = (cycle.targets ?? []).map((target: any) => rowFromTarget(target, reportingTasksByTarget));
    const targetCount = normalizeNumber(cycle.rollup?.targetCount ?? cycle.targetCount ?? tableData.length);
    const selectedTargetCount = normalizeNumber(cycle.selectedTargetCount ?? cycle.selectedTargetOrgIds?.length);
    const completedCount = tableData.filter(row => row.status === '已完结').length;
    const confirmedCount = tableData.filter(row => row.status === '已确认').length;
    const reviewingCount = tableData.filter(row => row.status === '审批流转中').length;
    const fillingCount = tableData.filter(row => row.status === '填报中').length;
    const waitingCount = tableData.filter(row => row.status === '待启动').length;
    const returnedCount = tableData.filter(row => row.status === '被退回').length;
    const appealingCount = tableData.filter(row => row.status === '申辩中').length;
    const resultPendingCount = tableData.filter(row => row.status === '待确认').length;
    const progress = targetCount > 0
      ? clampPercent(tableData.reduce((sum, row) => sum + row.progress, 0) / targetCount)
      : 0;
    const rawStatus = cycle.status ?? 'DRAFT';
    const bucket = getWorkflowBucket(rawStatus);
    const dueDate = reportingTasks.map((task: any) => task.dueDate).filter(Boolean).sort()[0] ?? null;
    const instance: WorkflowInstance = {
      id,
      title: cycle.cycleName ?? cycle.schemeSnapshot?.schemeName ?? id,
      subtitle: `考核批次: ${formatPeriodLabel(cycle, id)} | 考核对象总数: ${targetCount} 家`,
      status: statusBadge(bucket, rawStatus),
      statusBadgeColor: statusBadgeColor(bucket, rawStatus),
      hoverBorderColor: bucket === 'pending' ? 'hover:border-blue-300' : bucket === 'archived' ? 'hover:border-slate-300' : 'hover:border-indigo-300',
      progress,
      progressText: targetCount > 0 ? `${completedCount + confirmedCount + reviewingCount + fillingCount} / ${targetCount} 家` : '暂无目标机构',
      isArchivingStage: rawStatus === 'CLOSED',
      bucket,
      rawStatus,
      cycleCode: cycle.cycleCode,
      schemeId: cycle.schemeId,
      year: cycle.year,
      periodStart: cycle.periodStart,
      periodEnd: cycle.periodEnd,
      dispatchMode: cycle.dispatchMode,
      targetCount,
      selectedTargetCount,
      completedCount,
      reviewingCount,
      fillingCount,
      waitingCount,
      returnedCount,
      confirmedCount,
      appealingCount,
      resultPendingCount,
      warningCount: returnedCount + appealingCount,
      dueDate,
      createdAt: cycle.createdAt,
      dispatchedAtRef: cycle.dispatchedAtRef,
      closedAtRef: cycle.closedAtRef,
      archivedReason: cycle.archivedReason,
      tableData,
    };
    return [id, instance];
  }));

export const buildDashboardSummary = (instances: WorkflowInstance[]): WorkflowDashboardSummary => {
  const active = instances.filter(instance => instance.bucket === 'active');
  const totalTargets = active.reduce((sum, instance) => sum + (instance.targetCount ?? instance.tableData.length), 0);
  const weightedProgress = active.reduce(
    (sum, instance) => sum + (instance.progress * (instance.targetCount ?? instance.tableData.length)),
    0,
  );
  return {
    activeCount: active.length,
    pendingCount: instances.filter(instance => instance.bucket === 'pending').length,
    archivedCount: instances.filter(instance => instance.bucket === 'archived').length,
    totalTargets,
    completedTargets: active.reduce((sum, instance) => sum + (instance.completedCount ?? 0), 0),
    warningTargets: active.reduce((sum, instance) => sum + (instance.warningCount ?? 0), 0),
    overallProgress: totalTargets > 0 ? clampPercent(weightedProgress / totalTargets) : null,
  };
};

export const buildWorkflowDetailMetrics = (instance: WorkflowInstance): WorkflowDetailMetrics => {
  const rawStatus = instance.rawStatus ?? '';
  const activeStep = rawStatus === 'DRAFT'
    ? 1
    : rawStatus === 'DISPATCHED' || rawStatus === 'REPORTING'
      ? 2
      : rawStatus === 'REVIEWING'
        ? 3
        : 4;
  const totals = {
    total: instance.targetCount ?? instance.tableData.length,
    completed: instance.completedCount ?? instance.tableData.filter(row => row.status === '已完结').length,
    reviewing: instance.reviewingCount ?? instance.tableData.filter(row => row.status === '审批流转中').length,
    filling: instance.fillingCount ?? instance.tableData.filter(row => row.status === '填报中').length,
    waiting: instance.waitingCount ?? instance.tableData.filter(row => row.status === '待启动').length,
    returned: instance.returnedCount ?? instance.tableData.filter(row => row.status === '被退回').length,
    confirmed: instance.confirmedCount ?? instance.tableData.filter(row => row.status === '已确认').length,
    appealing: instance.appealingCount ?? instance.tableData.filter(row => row.status === '申辩中').length,
    resultPending: instance.resultPendingCount ?? instance.tableData.filter(row => row.status === '待确认').length,
  };
  const segments: Segment[] = [
    { color: 'text-emerald-500', w: totals.total ? (totals.completed / totals.total) * 100 : 0, offset: 0 },
    { color: 'text-teal-500', w: totals.total ? (totals.confirmed / totals.total) * 100 : 0, offset: 0 },
    { color: 'text-violet-500', w: totals.total ? (totals.resultPending / totals.total) * 100 : 0, offset: 0 },
    { color: 'text-blue-500', w: totals.total ? (totals.reviewing / totals.total) * 100 : 0, offset: 0 },
    { color: 'text-amber-500', w: totals.total ? (totals.filling / totals.total) * 100 : 0, offset: 0 },
    { color: 'text-slate-400', w: totals.total ? (totals.waiting / totals.total) * 100 : 0, offset: 0 },
    { color: 'text-rose-500', w: totals.total ? ((totals.returned + totals.appealing) / totals.total) * 100 : 0, offset: 0 },
  ];
  let offset = 0;
  const offsetSegments = segments.map(segment => {
    const next = { ...segment, w: clampPercent(segment.w), offset: -offset };
    offset += next.w;
    return next;
  });
  const progressValue = totals.total > 0 ? instance.progress : 0;

  return {
    activeStep,
    isStep2Done: activeStep > 2,
    isStep3Done: activeStep > 3,
    pct: totals.total > 0 ? `${progressValue}%` : '--',
    progressValue,
    segments: offsetSegments,
    totals,
    dueDateLabel: formatDateOnly(instance.dueDate ?? instance.periodEnd),
    dispatchTimeLabel: formatDateTimeShort(instance.dispatchedAtRef),
    reportingTimeLabel: activeStep >= 2 ? formatDateTimeShort(instance.dispatchedAtRef) : '--',
    reviewTimeLabel: activeStep >= 3 ? '已进入复核，暂无具体时间字段' : '--',
    resultTimeLabel: instance.closedAtRef ? formatDateTimeShort(instance.closedAtRef) : '--',
  };
};
