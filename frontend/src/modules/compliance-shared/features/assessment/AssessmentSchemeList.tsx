import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Archive,
  Box,
  Copy,
  Edit,
  Eye,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { assessmentApi } from '../../services/api';
import type { AssessmentScheme, Indicator } from '../../types';
import AssessmentSchemeWorkbench, {
  type GradeThresholdDraft,
  type SchemeItemDraft,
  type ScheduleBindingDraft,
  type SchemeCommandName,
  type SchemeDetail,
  type SchemeDraftForm,
  type TargetGroupDraft,
  type VolumeAdjustmentFactorDraft,
  type WorkbenchMode,
} from './AssessmentSchemeWorkbench';

const yearMap: Record<string, string> = {
  all: '全部年份',
  '2026': '2026年',
  '2025': '2025年',
  '2024': '2024年',
};

const statusMap: Record<string, string> = {
  all: '全部状态',
  ACTIVE: '运行中',
  DRAFT: '草稿',
  ARCHIVED: '已归档',
};

const frequencyMap: Record<string, string> = {
  all: '全部频次',
  YEARLY: '年度',
  HALF_YEARLY: '半年度',
  QUARTERLY: '季度',
  MONTHLY: '月度',
  AD_HOC: '临时',
};

const businessLineMap: Record<string, string> = {
  all: '全部业务线',
  财富管理: '财富管理',
  投资银行: '投资银行',
};

const targetScopeModeMap: Record<string, string> = {
  all: '全部范围',
  MANUAL_SELECTION: '手工选择',
  ALL_BRANCHES: '全部营业部',
};

const updatedWindowMap: Record<string, string> = {
  all: '全部时间',
  '7d': '近7天',
  '30d': '近30天',
};

const defaultItems: SchemeItemDraft[] = [];

const defaultGradeThresholds: GradeThresholdDraft[] = [
  { gradeCode: 'A', gradeLabel: '优秀', minScore: 90, maxScore: null },
  { gradeCode: 'B', gradeLabel: '良好', minScore: 75, maxScore: 90 },
  { gradeCode: 'C', gradeLabel: '合格', minScore: 60, maxScore: 75 },
  { gradeCode: 'D', gradeLabel: '待改进', minScore: 0, maxScore: 60 },
];

const defaultVolumeAdjustmentFactors: VolumeAdjustmentFactorDraft[] = [];

const defaultTargetGroups: TargetGroupDraft[] = [
  {
    groupName: '默认考核对象',
    scopeMode: 'MANUAL_SELECTION',
    description: '',
    members: [{ orgId: 'WLZQ-RBC-GZ-LIWAN' }],
  },
];

const defaultScheduleBinding = (frequency = 'YEARLY'): ScheduleBindingDraft => ({
  dispatchMode: 'SCHEDULED',
  periodicRule: {
    frequency: frequency === 'AD_HOC' ? 'QUARTERLY' : frequency,
    workingDayOffset: 5,
    fireTime: '09:30',
    timezone: 'Asia/Shanghai',
    calendarCode: 'WEEKDAY_ONLY',
  },
  manualDispatchPolicy: null,
});

const formSnapshot = (value: SchemeDraftForm) => JSON.stringify(value);

const commandKey = (prefix: string) => {
  const uuid = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return `${prefix}-${uuid}`;
};

const formatError = (error: unknown) => {
  if (error instanceof Error) return error.message;
  return '命令执行失败';
};

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const formatDateTime = (value?: string | null) => {
  if (!value) return null;
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
};

const updatedFromForWindow = (value: string) => {
  if (value === 'all') return undefined;
  const days = value === '7d' ? 7 : 30;
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
};

const readinessTone = (summary?: Record<string, unknown> | null) =>
  summary?.mandatoryReady === true ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200';

const readinessLabel = (summary?: Record<string, unknown> | null) => {
  if (!summary) return 'readiness 未返回';
  if (summary.mandatoryReady === true) return '发布必需项已就绪';
  const ready = Number(summary.readyCount ?? 0);
  const total = Number(summary.mandatoryCount ?? 0);
  return `发布必需项 ${ready}/${total}`;
};

const firstBlockedReason = (summary?: Record<string, unknown> | null) => {
  const blocked = Array.isArray(summary?.blockedSections) ? summary.blockedSections : [];
  const first = blocked[0] as Record<string, unknown> | undefined;
  const finding = first?.firstFinding as Record<string, unknown> | undefined;
  return String(finding?.message ?? first?.label ?? '');
};

const actionExplanation = (scheme: AssessmentScheme) => {
  if (scheme.status === 'DRAFT') {
    const publish = scheme.commandAvailability?.publish;
    return publish?.enabled ? '下一步：校验并发布' : `发布不可用：${publish?.reason ?? '后端未返回原因'}`;
  }
  if (scheme.status === 'ACTIVE') return '下一步：查看配置或复制为草稿';
  if (scheme.status === 'ARCHIVED') return '只读归档：复制能力按后端命令状态显示';
  return '状态动作以 commandAvailability 为准';
};

const newDraftForm = (): SchemeDraftForm => ({
  schemeCode: `WLZQ-ASCH-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`,
  schemeName: '',
  year: '2026',
  frequency: 'YEARLY',
  description: '',
  totalWeight: '100',
  items: defaultItems,
  gradeThresholds: defaultGradeThresholds,
  volumeAdjustmentFactors: defaultVolumeAdjustmentFactors,
  targetGroups: defaultTargetGroups,
  workflowBinding: null,
  scheduleBinding: defaultScheduleBinding('YEARLY'),
});

const formFromDetail = (detail: SchemeDetail): SchemeDraftForm => ({
  schemeCode: detail.schemeCode,
  schemeName: detail.schemeName,
  year: String(detail.year),
  frequency: detail.frequency,
  description: detail.description ?? '',
  totalWeight: String(detail.totalWeight),
  items: detail.items ?? [],
  gradeThresholds: detail.gradeThresholds ?? [],
  volumeAdjustmentFactors: detail.volumeAdjustmentFactors ?? [],
  targetGroups: detail.targetGroups ?? [],
  workflowBinding: detail.workflowBinding ?? null,
  scheduleBinding: detail.scheduleBinding ?? defaultScheduleBinding(detail.frequency),
});

const payloadFromForm = (form: SchemeDraftForm, includeCode: boolean) => ({
  ...(includeCode ? { schemeCode: form.schemeCode.trim() } : {}),
  schemeName: form.schemeName.trim(),
  year: toNumber(form.year, 2026),
  frequency: form.frequency,
  description: form.description,
  totalWeight: toNumber(form.totalWeight, 100),
  items: form.items.map((item) => ({
    indicatorId: item.indicatorId,
    versionId: item.versionId,
    weight: toNumber(item.weight),
    ...(item.scoreCap == null ? {} : { scoreCap: toNumber(item.scoreCap, 100) }),
  })),
  gradeThresholds: form.gradeThresholds.map((threshold) => ({
    gradeCode: threshold.gradeCode,
    gradeLabel: threshold.gradeLabel,
    minScore: toNumber(threshold.minScore),
    maxScore: threshold.maxScore == null ? null : toNumber(threshold.maxScore),
  })),
  volumeAdjustmentFactors: form.volumeAdjustmentFactors.map((factor) => ({
    ...(factor.factorCode ? { factorCode: factor.factorCode } : {}),
    ...(factor.factorName ? { factorName: factor.factorName } : {}),
    metric: factor.metric,
    operator: factor.operator,
    value: factor.value == null ? null : toNumber(factor.value),
    description: factor.description ?? '',
    multiplier: toNumber(factor.multiplier, 1),
    enabled: factor.enabled,
  })),
  targetGroups: form.targetGroups,
  ...(form.workflowBinding ? { workflowBinding: form.workflowBinding } : {}),
  ...(form.scheduleBinding ? { scheduleBinding: form.scheduleBinding } : {}),
});

const canRun = (scheme: AssessmentScheme, command: SchemeCommandName) =>
  scheme.commandAvailability?.[command]?.enabled ?? command === 'view';

const disabledReason = (scheme: AssessmentScheme, command: SchemeCommandName) =>
  scheme.commandAvailability?.[command]?.reason ?? undefined;

export default function AssessmentSchemeList() {
  const [searchTerm, setSearchTerm] = useState('');
  const [year, setYear] = useState('2026');
  const [status, setStatus] = useState('all');
  const [frequency, setFrequency] = useState('all');
  const [businessLine, setBusinessLine] = useState('all');
  const [targetScopeMode, setTargetScopeMode] = useState('all');
  const [updatedWindow, setUpdatedWindow] = useState('all');
  const [schemes, setSchemes] = useState<AssessmentScheme[]>([]);
  const [indicatorPool, setIndicatorPool] = useState<Indicator[]>([]);
  const [indicatorPoolLoading, setIndicatorPoolLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [commandLoading, setCommandLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<WorkbenchMode | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<SchemeDetail | null>(null);
  const [form, setForm] = useState<SchemeDraftForm>(newDraftForm);
  const [savedFormSnapshot, setSavedFormSnapshot] = useState(() => formSnapshot(form));
  const [validationFindings, setValidationFindings] = useState<Array<Record<string, unknown>>>([]);

  const loadSchemes = async () => {
    setLoading(true);
    setError(null);
    try {
      const keyword = searchTerm.trim();
      const items = await assessmentApi.getSchemes({
        ...(keyword ? { keyword } : {}),
        ...(year === 'all' ? {} : { year }),
        ...(status === 'all' ? {} : { status }),
        ...(frequency === 'all' ? {} : { frequency }),
        ...(businessLine === 'all' ? {} : { businessLine }),
        ...(targetScopeMode === 'all' ? {} : { targetScopeMode }),
        ...(updatedWindow === 'all' ? {} : { updatedFrom: updatedFromForWindow(updatedWindow) }),
      });
      setSchemes(items);
    } catch (caught) {
      setSchemes([]);
      setError(formatError(caught));
    } finally {
      setLoading(false);
    }
  };

  const loadIndicatorPool = async () => {
    setIndicatorPoolLoading(true);
    try {
      const items = await assessmentApi.getSchemeIndicatorPool({ pageSize: 100 });
      setIndicatorPool(items);
    } catch (caught) {
      setIndicatorPool([]);
      setError(formatError(caught));
    } finally {
      setIndicatorPoolLoading(false);
    }
  };

  useEffect(() => {
    void loadIndicatorPool();
  }, []);

  useEffect(() => {
    void loadSchemes();
  }, [businessLine, frequency, searchTerm, status, targetScopeMode, updatedWindow, year]);

  const schemeRows = useMemo(
    () =>
      schemes
        .map((scheme) => ({
          ...scheme,
          frequencyLabel: frequencyMap[scheme.frequency ?? ''] ?? scheme.frequency ?? '-',
          businessLineLabel: scheme.businessLineSummary?.label ?? 'API 未返回业务线',
          indicatorCount: scheme.itemCount ?? scheme.items.length,
          weightTotal: `${scheme.totalWeight ?? scheme.items.reduce((sum, item) => sum + item.actualWeight, 0)}%`,
          targetCount: scheme.targetCount ?? scheme.targetGroupCount ?? scheme.targetGroups.length,
          targetScopeLabel: scheme.targetScopeLabel ?? 'API 未返回对象范围',
          targetRuleLabel: scheme.targetRuleLabel ?? 'API 未返回范围规则',
          workflowLabel: String(scheme.workflowSummary?.templateName ?? scheme.workflowSummary?.routeTemplateId ?? 'API 未返回审批路由'),
          workflowCountLabel: scheme.workflowSummary
            ? `${String(scheme.workflowSummary.chainCount ?? 0)} chains / ${String(scheme.workflowSummary.nodeCount ?? 0)} nodes`
            : '无 route summary',
          scheduleModeLabel: String(scheme.scheduleSummary?.modeLabel ?? 'API 未返回下发策略'),
          scheduleRuleLabel: String(scheme.scheduleSummary?.ruleLabel ?? ''),
          nextRunLabel: formatDateTime(scheme.nextRunAt) ?? '无 nextRunAt',
          lastRunLabel: formatDateTime(scheme.lastRunAt) ?? '无 lastRunAt',
          updatedAtLabel: formatDateTime(scheme.updatedAt) ?? 'API 未返回更新时间',
          readinessLabel: readinessLabel(scheme.readinessSummary),
          readinessReason: firstBlockedReason(scheme.readinessSummary),
          publishSnapshotHash: String(scheme.publishSummary?.snapshotHash ?? ''),
          simulationStatus: String(scheme.publishSummary?.simulationStatus ?? 'OPTIONAL_NOT_RUN'),
          sourceTraceLabel: scheme.sourceTraceSummary
            ? `复制自 ${String(scheme.sourceTraceSummary.sourceSchemeCode ?? scheme.sourceTraceSummary.sourceSchemeId ?? '-')}`
            : '',
          actionExplanation: actionExplanation(scheme),
        })),
    [schemes],
  );

  const openCreate = () => {
    const draft = newDraftForm();
    setSelectedDetail(null);
    setValidationFindings([]);
    setForm(draft);
    setSavedFormSnapshot(formSnapshot(draft));
    setEditorMode('create');
    setError(null);
  };

  const openDetail = async (schemeId: string, mode: WorkbenchMode) => {
    setCommandLoading(`${mode}:${schemeId}`);
    setError(null);
    setValidationFindings([]);
    try {
      const detail = await assessmentApi.getSchemeDetail(schemeId);
      const nextForm = formFromDetail(detail);
      setSelectedDetail(detail);
      setForm(nextForm);
      setSavedFormSnapshot(formSnapshot(nextForm));
      setEditorMode(mode);
    } catch (caught) {
      setError(formatError(caught));
    } finally {
      setCommandLoading(null);
    }
  };

  const refetchSelected = async (schemeId = selectedDetail?.schemeId) => {
    if (!schemeId) return false;
    setCommandLoading('refetch');
    setError(null);
    try {
      const detail = await assessmentApi.getSchemeDetail(schemeId);
      const nextForm = formFromDetail(detail);
      setSelectedDetail(detail);
      setForm(nextForm);
      setSavedFormSnapshot(formSnapshot(nextForm));
      await loadSchemes();
      return true;
    } catch (caught) {
      setError(formatError(caught));
      return false;
    } finally {
      setCommandLoading(null);
    }
  };

  const runValidate = async () => {
    setCommandLoading('validate');
    setError(null);
    setValidationFindings([]);
    try {
      const payload = {
        ...payloadFromForm(form, editorMode === 'create'),
        ...(selectedDetail ? { optimisticVersion: selectedDetail.optimisticVersion } : {}),
      };
      const result = await assessmentApi.validateSchemeDraft(payload, selectedDetail?.schemeId);
      const targetScope = result?.readiness?.targetScope ?? result?.targetScope;
      setValidationFindings([
        {
          code: 'VALID',
          field: 'targetGroups',
          message: targetScope
            ? `targetScope ready: ${targetScope.label ?? '-'} / ${targetScope.targetCount ?? 0} targets`
            : 'validation passed',
        },
      ]);
    } catch (caught: any) {
      setValidationFindings(Array.isArray(caught?.details) ? caught.details : []);
      setError(formatError(caught));
    } finally {
      setCommandLoading(null);
    }
  };

  const saveDraft = async () => {
    setCommandLoading('save');
    setError(null);
    try {
      const basePayload = payloadFromForm(form, editorMode === 'create');
      const result =
        editorMode === 'create'
          ? await assessmentApi.createScheme({
              ...basePayload,
              idempotencyKey: commandKey('scheme-create'),
            })
          : await assessmentApi.updateSchemeDraft(selectedDetail!.schemeId, {
              ...basePayload,
              optimisticVersion: selectedDetail!.optimisticVersion,
              idempotencyKey: commandKey('scheme-update'),
            });
      setSelectedDetail(result);
      const nextForm = formFromDetail(result);
      setForm(nextForm);
      setSavedFormSnapshot(formSnapshot(nextForm));
      setEditorMode('edit');
      await loadSchemes();
      return result;
    } catch (caught: any) {
      setValidationFindings(Array.isArray(caught?.details) ? caught.details : []);
      setError(formatError(caught));
      return null;
    } finally {
      setCommandLoading(null);
    }
  };

  const publishSelected = async () => {
    if (!selectedDetail) return;
    setCommandLoading('publish');
    setError(null);
    try {
      const result = await assessmentApi.publishScheme(selectedDetail.schemeId, {
        optimisticVersion: selectedDetail.optimisticVersion,
        idempotencyKey: commandKey('scheme-publish'),
      });
      const nextForm = formFromDetail(result);
      setSelectedDetail(result);
      setForm(nextForm);
      setSavedFormSnapshot(formSnapshot(nextForm));
      setEditorMode('view');
      await loadSchemes();
    } catch (caught: any) {
      setValidationFindings(Array.isArray(caught?.details) ? caught.details : []);
      setError(formatError(caught));
    } finally {
      setCommandLoading(null);
    }
  };

  const copyScheme = async (scheme: AssessmentScheme) => {
    setCommandLoading(`copy:${scheme.id}`);
    setError(null);
    try {
      const result = await assessmentApi.copyScheme(scheme.id, {
        optimisticVersion: scheme.optimisticVersion,
        idempotencyKey: commandKey('scheme-copy'),
      });
      const nextForm = formFromDetail(result);
      setSelectedDetail(result);
      setForm(nextForm);
      setSavedFormSnapshot(formSnapshot(nextForm));
      setEditorMode('copy');
      await loadSchemes();
    } catch (caught) {
      setError(formatError(caught));
    } finally {
      setCommandLoading(null);
    }
  };

  const deleteScheme = async (scheme: AssessmentScheme) => {
    if (!globalThis.confirm(`Delete draft ${scheme.schemeCode ?? scheme.title}?`)) return;
    setCommandLoading(`delete:${scheme.id}`);
    setError(null);
    try {
      await assessmentApi.deleteSchemeDraft(scheme.id, {
        optimisticVersion: scheme.optimisticVersion,
        idempotencyKey: commandKey('scheme-delete'),
      });
      if (selectedDetail?.schemeId === scheme.id) {
        setSelectedDetail(null);
        setEditorMode(null);
      }
      await loadSchemes();
    } catch (caught) {
      setError(formatError(caught));
    } finally {
      setCommandLoading(null);
    }
  };

  const archiveScheme = async (scheme: AssessmentScheme) => {
    if (!globalThis.confirm(`Archive draft ${scheme.schemeCode ?? scheme.title}?`)) return;
    setCommandLoading(`archive:${scheme.id}`);
    setError(null);
    try {
      const result = await assessmentApi.archiveScheme(scheme.id, {
        reason: 'P2-SCHEME-EDITOR-11 draft archive',
        optimisticVersion: scheme.optimisticVersion,
        idempotencyKey: commandKey('scheme-archive'),
      });
      if (selectedDetail?.schemeId === scheme.id) {
        const nextForm = formFromDetail(result);
        setSelectedDetail(result);
        setForm(nextForm);
        setSavedFormSnapshot(formSnapshot(nextForm));
        setEditorMode('view');
      }
      await loadSchemes();
    } catch (caught) {
      setError(formatError(caught));
    } finally {
      setCommandLoading(null);
    }
  };

  if (editorMode) {
    return (
      <div className="h-full min-h-0 bg-slate-100" data-testid="p1-scheme-page">
        <AssessmentSchemeWorkbench
          mode={editorMode}
          detail={selectedDetail}
          form={form}
          indicatorPool={indicatorPool}
          indicatorPoolLoading={indicatorPoolLoading}
          validationFindings={validationFindings}
          dirty={formSnapshot(form) !== savedFormSnapshot}
          commandLoading={commandLoading}
          onChange={setForm}
          onClose={() => setEditorMode(null)}
          onRefetch={refetchSelected}
          onValidate={runValidate}
          onSave={saveDraft}
          onPublish={publishSelected}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-50/50" data-testid="p1-scheme-page">
      <div className="px-6 py-5 bg-white border-b border-slate-200">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center">
              <Box className="w-6 h-6 mr-2 text-indigo-600" />
              考核方案管理 (Assessment Scheme Management)
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              全辖合规考核方案的生命周期管理、状态追踪与配置入口。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => void loadSchemes()}
              disabled={loading}
              data-testid="p1-scheme-refresh"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              刷新
            </Button>
            <Button data-testid="p1-scheme-create" onClick={openCreate}>
              <Plus className="w-4 h-4" />
              新建考核方案
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 p-6 overflow-hidden flex gap-4">
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col h-full min-w-0 flex-1">
          <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center gap-4 bg-slate-50/50">
            <div className="relative flex-1 min-w-[240px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                data-testid="p1-scheme-search"
                placeholder="搜索方案名称..."
                className="pl-9 bg-white"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </div>

            <Select value={year} onValueChange={setYear}>
              <SelectTrigger className="w-[120px] bg-white" data-testid="p1-scheme-year-filter">
                <span className="truncate">{yearMap[year] || '年份'}</span>
              </SelectTrigger>
              <SelectContent position="popper" sideOffset={4}>
                <SelectItem value="all">全部年份</SelectItem>
                <SelectItem value="2026">2026年</SelectItem>
                <SelectItem value="2025">2025年</SelectItem>
                <SelectItem value="2024">2024年</SelectItem>
              </SelectContent>
            </Select>

            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-[140px] bg-white" data-testid="p1-scheme-status-filter">
                <span className="truncate">{statusMap[status] || '方案状态'}</span>
              </SelectTrigger>
              <SelectContent position="popper" sideOffset={4}>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="ACTIVE">运行中</SelectItem>
                <SelectItem value="DRAFT">草稿</SelectItem>
                <SelectItem value="ARCHIVED">已归档</SelectItem>
              </SelectContent>
            </Select>

            <Select value={frequency} onValueChange={setFrequency}>
              <SelectTrigger className="w-[140px] bg-white" data-testid="p1-scheme-frequency-filter">
                <span className="truncate">{frequencyMap[frequency] || '考核频次'}</span>
              </SelectTrigger>
              <SelectContent position="popper" sideOffset={4}>
                <SelectItem value="all">全部频次</SelectItem>
                <SelectItem value="YEARLY">年度</SelectItem>
                <SelectItem value="HALF_YEARLY">半年度</SelectItem>
                <SelectItem value="QUARTERLY">季度</SelectItem>
                <SelectItem value="MONTHLY">月度</SelectItem>
                <SelectItem value="AD_HOC">临时</SelectItem>
              </SelectContent>
            </Select>

            <Select value={businessLine} onValueChange={setBusinessLine}>
              <SelectTrigger className="w-[140px] bg-white" data-testid="asch-scheme-business-line-filter">
                <span className="truncate">{businessLineMap[businessLine] || '业务线'}</span>
              </SelectTrigger>
              <SelectContent position="popper" sideOffset={4}>
                <SelectItem value="all">全部业务线</SelectItem>
                <SelectItem value="财富管理">财富管理</SelectItem>
                <SelectItem value="投资银行">投资银行</SelectItem>
              </SelectContent>
            </Select>

            <Select value={targetScopeMode} onValueChange={setTargetScopeMode}>
              <SelectTrigger className="w-[140px] bg-white" data-testid="asch-scheme-target-scope-filter">
                <span className="truncate">{targetScopeModeMap[targetScopeMode] || '目标范围'}</span>
              </SelectTrigger>
              <SelectContent position="popper" sideOffset={4}>
                <SelectItem value="all">全部范围</SelectItem>
                <SelectItem value="MANUAL_SELECTION">手工选择</SelectItem>
                <SelectItem value="ALL_BRANCHES">全部营业部</SelectItem>
              </SelectContent>
            </Select>

            <Select value={updatedWindow} onValueChange={setUpdatedWindow}>
              <SelectTrigger className="w-[130px] bg-white" data-testid="asch-scheme-updated-filter">
                <span className="truncate">{updatedWindowMap[updatedWindow] || '更新时间'}</span>
              </SelectTrigger>
              <SelectContent position="popper" sideOffset={4}>
                <SelectItem value="all">全部时间</SelectItem>
                <SelectItem value="7d">近7天</SelectItem>
                <SelectItem value="30d">近30天</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {error && (
            <div className="mx-5 mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700" data-testid="p1-scheme-error">
              {error}
            </div>
          )}

          <div className="flex-1 overflow-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider sticky top-0 z-10 shadow-[0_1px_rgba(226,232,240,1)]">
                <tr>
                  <th className="px-6 py-4">方案名称</th>
                  <th className="px-6 py-4">业务线/频次</th>
                  <th className="px-6 py-4">方案体量</th>
                  <th className="px-6 py-4">状态/发布</th>
                  <th className="px-6 py-4">审批路由</th>
                  <th className="px-6 py-4">考核对象</th>
                  <th className="px-6 py-4">下发/运行</th>
                  <th className="px-6 py-4 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {schemeRows.map((scheme) => (
                  <tr key={scheme.id} data-testid={`p1-scheme-row-${scheme.id}`} className="hover:bg-slate-50/80 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center text-slate-800 font-medium">
                          <FileText className="w-4 h-4 mr-2 text-indigo-500" />
                          {scheme.title}
                        </div>
                        <span className="text-xs text-slate-500">{scheme.schemeCode}</span>
                        {scheme.sourceTraceLabel && (
                          <span className="text-[11px] text-indigo-500" data-testid={`asch-scheme-source-trace-${scheme.id}`}>
                            {scheme.sourceTraceLabel}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <Badge variant="secondary" className="w-fit bg-slate-100 text-slate-700" data-testid={`asch-scheme-business-line-${scheme.id}`}>
                          {scheme.businessLineLabel}
                        </Badge>
                        <Badge variant="outline" className="w-fit">{scheme.frequencyLabel}</Badge>
                        <span className="text-xs text-slate-500">{scheme.year ?? '-'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                        <span className="text-sm text-slate-600">
                          {scheme.indicatorCount} 项指标 (权重 {scheme.weightTotal})
                        </span>
                        <div className="text-xs text-slate-400" data-testid={`asch-scheme-updated-at-${scheme.id}`}>
                          更新 {scheme.updatedAtLabel}
                        </div>
                      </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1" data-testid={`asch-scheme-readiness-summary-${scheme.id}`}>
                        {scheme.status === 'ACTIVE' && (
                          <Badge variant="secondary" className="w-fit bg-emerald-50 text-emerald-600 border border-emerald-200/60 font-medium font-sans">
                            <Activity className="w-3 h-3 mr-1" />
                            运行中
                          </Badge>
                        )}
                        {scheme.status === 'DRAFT' && (
                          <Badge variant="secondary" className="w-fit bg-slate-100 text-slate-500 border border-slate-200 font-medium font-sans">
                            草稿
                          </Badge>
                        )}
                        {scheme.status === 'ARCHIVED' && (
                          <Badge variant="secondary" className="w-fit bg-blue-50 text-blue-600 border border-blue-200/60 font-medium font-sans">
                            已归档
                          </Badge>
                        )}
                        <Badge variant="outline" className={`w-fit ${readinessTone(scheme.readinessSummary)}`}>
                          {scheme.readinessLabel}
                        </Badge>
                        {scheme.readinessReason && (
                          <span className="max-w-[180px] truncate text-[11px] text-amber-600" title={scheme.readinessReason}>
                            {scheme.readinessReason}
                          </span>
                        )}
                        <span className="text-[11px] text-slate-400">
                          sim {scheme.simulationStatus}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1" data-testid={`asch-scheme-workflow-summary-${scheme.id}`}>
                        <span className="max-w-[180px] truncate text-sm text-slate-600" title={scheme.workflowLabel}>
                          {scheme.workflowLabel}
                        </span>
                        <span className="text-xs text-slate-400">{scheme.workflowCountLabel}</span>
                        <span className="text-[11px] text-slate-400">v{scheme.optimisticVersion ?? '-'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1" data-testid={`p1-scheme-target-scope-${scheme.id}`}>
                        <Badge variant="secondary" className="bg-blue-50 text-blue-700">
                          {scheme.targetCount} 个对象
                        </Badge>
                        <span className="max-w-[180px] truncate text-xs text-slate-500" title={scheme.targetScopeLabel}>
                          {scheme.targetScopeLabel}
                        </span>
                        <span className="text-[11px] text-slate-400">{scheme.targetRuleLabel}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1" data-testid={`asch-scheme-schedule-summary-${scheme.id}`}>
                        <Badge variant="outline" className="w-fit">{scheme.scheduleModeLabel}</Badge>
                        {scheme.scheduleRuleLabel && (
                          <span className="max-w-[180px] truncate text-xs text-slate-500" title={scheme.scheduleRuleLabel}>
                            {scheme.scheduleRuleLabel}
                          </span>
                        )}
                        <span className="max-w-[180px] truncate text-xs text-slate-500" title={scheme.nextRunLabel}>
                          next {scheme.nextRunLabel}
                        </span>
                        <span className="max-w-[180px] truncate text-[11px] text-slate-400" title={scheme.lastRunLabel}>
                          last {scheme.lastRunLabel}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="mb-2 max-w-[240px] text-right text-[11px] text-slate-400" data-testid={`asch-scheme-action-explanation-${scheme.id}`}>
                        {scheme.actionExplanation}
                      </div>
                      <div className="flex items-center justify-end gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="sm"
                          data-testid={`p1-scheme-view-${scheme.id}`}
                          disabled={commandLoading === `view:${scheme.id}`}
                          onClick={() => void openDetail(scheme.id, 'view')}
                        >
                          <Eye className="w-3.5 h-3.5" />
                          查看
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          data-testid={`p1-scheme-edit-${scheme.id}`}
                          disabled={!canRun(scheme, 'edit') || commandLoading === `edit:${scheme.id}`}
                          title={disabledReason(scheme, 'edit')}
                          onClick={() => void openDetail(scheme.id, 'edit')}
                        >
                          <Edit className="w-3.5 h-3.5" />
                          编辑
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          data-testid={`p1-scheme-copy-${scheme.id}`}
                          disabled={!canRun(scheme, 'copy') || commandLoading === `copy:${scheme.id}`}
                          title={disabledReason(scheme, 'copy')}
                          onClick={() => void copyScheme(scheme)}
                        >
                          <Copy className="w-3.5 h-3.5" />
                          复制
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          data-testid={`p1-scheme-archive-${scheme.id}`}
                          disabled={!canRun(scheme, 'archive') || commandLoading === `archive:${scheme.id}`}
                          title={disabledReason(scheme, 'archive')}
                          onClick={() => void archiveScheme(scheme)}
                        >
                          <Archive className="w-3.5 h-3.5" />
                          归档
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          data-testid={`p1-scheme-delete-${scheme.id}`}
                          disabled={!canRun(scheme, 'delete') || commandLoading === `delete:${scheme.id}`}
                          title={disabledReason(scheme, 'delete')}
                          onClick={() => void deleteScheme(scheme)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          删除
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}

                {schemeRows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-6 py-20 text-center" data-testid="p1-scheme-empty">
                      <div className="flex flex-col items-center justify-center">
                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                          <FileText className="w-8 h-8 text-slate-300" />
                        </div>
                        <h3 className="text-sm font-medium text-slate-900 mb-1">暂无考核方案 (No Assessment Schemes)</h3>
                        <p className="text-sm text-slate-500 mb-4">No real scheme rows returned by the backend.</p>
                        <Button variant="outline" onClick={openCreate}>
                          <Plus className="w-4 h-4 mr-2" />
                          新建考核方案
                        </Button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
