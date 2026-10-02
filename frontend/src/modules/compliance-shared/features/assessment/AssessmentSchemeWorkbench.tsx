import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Building,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  GitBranch,
  GripVertical,
  Layers,
  LayoutTemplate,
  Loader2,
  Network,
  Percent,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  assessmentApi,
  systemApi,
  workflowApi,
  type AssessmentSimulationDetail,
  type OrgNode,
  type WorkflowTemplateDetail,
  type WorkflowTemplateSummary,
} from '../../services/api';
import type { AssessmentScheme, Indicator, IndicatorVersion } from '../../types';
import AssessmentSchemeConfigurator from './AssessmentSchemeConfigurator';
import SchemeDispatchScheduleStep from './SchemeDispatchScheduleStep';
import SchemeSimulationPublishStep from './SchemeSimulationPublishStep';

export type SchemeCommandName = 'view' | 'edit' | 'validate' | 'publish' | 'copy' | 'delete' | 'archive';
export type WorkbenchMode = 'create' | 'edit' | 'copy' | 'view';

export interface SchemeCommandState {
  enabled: boolean;
  reason?: string | null;
}

export interface SchemeItemDraft {
  indicatorId: string;
  versionId: string;
  weight: number;
  scoreCap?: number | null;
  sortOrder?: number;
  indicatorSnapshot?: Record<string, unknown>;
}

export interface GradeThresholdDraft {
  gradeCode: string;
  gradeLabel: string;
  minScore: number;
  maxScore: number | null;
  sortOrder?: number;
}

export interface VolumeAdjustmentFactorDraft {
  factorCode?: string | null;
  factorName?: string | null;
  metric?: string | null;
  operator?: string | null;
  value?: number | null;
  description?: string;
  multiplier: number;
  enabled: boolean;
  sortOrder?: number;
}

export interface TargetGroupDraft {
  targetGroupId?: string;
  groupName: string;
  scopeMode: string;
  description?: string;
  members: Array<{ orgId: string; orgSnapshot?: Record<string, unknown> }>;
}

export interface WorkflowBindingDraft {
  routeTemplateId: string;
  routeTemplateVersionId?: string | null;
  routeOverride?: WorkflowRouteOverrideDraft | null;
}

export interface WorkflowRouteOverrideDraft {
  enabled?: boolean;
  disabledNodeIds?: string[];
  chainNodeOrders?: Array<{ chainId: string; nodeIds: string[] }>;
  finalNodes?: Array<{ chainId?: string | null; nodeId: string; note?: string | null }>;
  note?: string | null;
}

export interface SchedulePeriodicRuleDraft {
  frequency: string;
  workingDayOffset: number;
  fireTime: string;
  timezone: string;
  calendarCode: string;
  validFrom?: string | null;
  validUntil?: string | null;
}

export interface ScheduleBindingDraft {
  dispatchMode: 'SCHEDULED' | 'MANUAL' | string;
  periodicRule?: SchedulePeriodicRuleDraft | null;
  manualDispatchPolicy?: Record<string, unknown> | null;
}

export interface SchemeDetail {
  schemeId: string;
  schemeCode: string;
  schemeName: string;
  year: number;
  frequency: string;
  status: AssessmentScheme['status'];
  description?: string;
  totalWeight: number;
  items: SchemeItemDraft[];
  gradeThresholds: GradeThresholdDraft[];
  volumeAdjustmentFactors: VolumeAdjustmentFactorDraft[];
  targetGroups: TargetGroupDraft[];
  targetCount?: number;
  targetScopeLabel?: string;
  targetRuleLabel?: string;
  scopeSnapshot?: Array<Record<string, unknown>>;
  targetResolutionFindings?: Array<Record<string, unknown>>;
  optimisticVersion: number;
  publishedAtRef?: string | null;
  archivedReason?: string | null;
  sourceSchemeId?: string | null;
  sourceSchemeCode?: string | null;
  sourceTrace?: Record<string, unknown> | null;
  sourceTraceSummary?: Record<string, unknown> | null;
  workflowBinding?: WorkflowBindingDraft | null;
  workflowSummary?: Record<string, unknown> | null;
  scheduleBinding?: ScheduleBindingDraft | null;
  scheduleSummary?: Record<string, unknown> | null;
  nextRunAt?: string | null;
  lastRunAt?: string | null;
  readiness?: {
    baseScoring?: Record<string, unknown>;
    targetScope?: Record<string, unknown>;
    workflowRoute?: Record<string, unknown>;
    schedulingDispatch?: Record<string, unknown>;
    simulation?: Record<string, unknown>;
    mandatoryReady?: boolean;
  };
  readinessSummary?: Record<string, unknown> | null;
  publishSummary?: Record<string, unknown> | null;
  commandAuditSummary?: Record<string, unknown> | null;
  schemeSnapshot?: Record<string, unknown> | null;
  commandAudit?: Array<Record<string, unknown>>;
  commandAvailability?: Record<SchemeCommandName, SchemeCommandState>;
}

export interface SchemeDraftForm {
  schemeCode: string;
  schemeName: string;
  year: string;
  frequency: string;
  description: string;
  totalWeight: string;
  items: SchemeItemDraft[];
  gradeThresholds: GradeThresholdDraft[];
  volumeAdjustmentFactors: VolumeAdjustmentFactorDraft[];
  targetGroups: TargetGroupDraft[];
  workflowBinding?: WorkflowBindingDraft | null;
  scheduleBinding?: ScheduleBindingDraft | null;
}

interface AssessmentSchemeWorkbenchProps {
  mode: WorkbenchMode;
  detail: SchemeDetail | null;
  form: SchemeDraftForm;
  indicatorPool: Indicator[];
  indicatorPoolLoading: boolean;
  validationFindings: Array<Record<string, unknown>>;
  dirty: boolean;
  commandLoading: string | null;
  onChange: (form: SchemeDraftForm) => void;
  onClose: () => void;
  onRefetch: (schemeId?: string) => boolean | Promise<boolean>;
  onValidate: () => void | Promise<void>;
  onSave: () => SchemeDetail | null | Promise<SchemeDetail | null>;
  onPublish: () => void | Promise<void>;
}

type StepId = 'base_scoring' | 'workflow_route' | 'scheduling_dispatch' | 'simulation_publish';
type TargetGranularity = 'sub-branch' | 'branch' | 'business-line';
type StepTwoSaveStatus = 'idle' | 'saving' | 'refetching' | 'success' | 'error';

const steps: Array<{
  id: StepId;
  label: string;
  ownerPacket: string;
  mandatory: boolean;
  helper?: string;
}> = [
  { id: 'base_scoring', label: '基础与计分规则', ownerPacket: 'SIT-ASCH-02', mandatory: true, helper: '发布前需完成' },
  { id: 'workflow_route', label: '矩阵审批路由', ownerPacket: 'SIT-ASCH-03/04', mandatory: true, helper: 'Step 2 critical rebuild owner' },
  { id: 'scheduling_dispatch', label: '下发与调度策略', ownerPacket: 'SIT-ASCH-05', mandatory: true, helper: '发布前需完成' },
  { id: 'simulation_publish', label: '仿真运行与发布', ownerPacket: 'SIT-ASCH-06', mandatory: false, helper: '仿真可选，发布需通过预检' },
];

const modeLabel: Record<WorkbenchMode, string> = {
  create: '新建草稿',
  edit: '编辑草稿',
  copy: '复制草稿',
  view: '只读查看',
};

const statusLabel: Record<string, string> = {
  DRAFT: '草稿',
  ACTIVE: '运行中',
  ARCHIVED: '已归档',
  SUSPENDED: '已暂停',
  EXPIRED: '已结束',
};

const operatorOptions = ['>=', '>', '<=', '<', '=', '=='];
const frequencyOptions = [
  { value: 'YEARLY', label: '年度' },
  { value: 'HALF_YEARLY', label: '半年度' },
  { value: 'QUARTERLY', label: '季度' },
  { value: 'MONTHLY', label: '月度' },
  { value: 'AD_HOC', label: '临时' },
];
const frequencyValues = frequencyOptions.map((option) => option.value);
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
const frequencyLabel = (frequency?: string | null) =>
  frequencyOptions.find((option) => option.value === normalizeFrequency(frequency))?.label ?? '年度';

const factorMetricOptions = [
  { value: 'branchAssetsUnderManagement', label: '资产管理规模(AUM)' },
  { value: 'branchHeadcount', label: '营业部人数' },
  { value: 'customMetric', label: '自定指标' },
];
const normalizeFactorMetric = (metric?: string | null) => {
  if (!metric) return 'customMetric';
  if (factorMetricOptions.some((option) => option.value === metric)) return metric;
  const matched = factorMetricOptions.find((option) => option.label === metric);
  return matched?.value ?? 'customMetric';
};
const factorMetricLabel = (metric?: string | null) =>
  factorMetricOptions.find((option) => option.value === normalizeFactorMetric(metric))?.label ?? '自定指标';

const workflowStatusLabel = (status?: string | null) => {
  const normalized = String(status ?? '').toUpperCase();
  if (normalized === 'ACTIVE' || normalized === 'PUBLISHED') return '已启用';
  if (normalized === 'DRAFT') return '草稿';
  if (normalized === 'ARCHIVED') return '已归档';
  return status || '待启用';
};

const commandReason = (detail: SchemeDetail | null, command: SchemeCommandName) =>
  detail?.commandAvailability?.[command]?.reason ?? undefined;

const commandEnabled = (detail: SchemeDetail | null, command: SchemeCommandName, fallback = false) =>
  detail?.commandAvailability?.[command]?.enabled ?? fallback;

const numeric = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const defaultPeriodicRule = (frequency = 'YEARLY'): SchedulePeriodicRuleDraft => ({
  frequency: normalizeFrequency(frequency) === 'AD_HOC' ? 'QUARTERLY' : normalizeFrequency(frequency),
  workingDayOffset: 5,
  fireTime: '09:30',
  timezone: 'Asia/Shanghai',
  calendarCode: 'WEEKDAY_ONLY',
});

const displayVersion = (indicator?: Indicator | null): IndicatorVersion | undefined =>
  indicator?.displayVersion ?? indicator?.version ?? indicator?.latestVersion;

const rawCodePattern = /^[A-Z0-9_:-]+$/;
const businessCategoryLabel = (indicator?: Indicator | null) => {
  const explicitName = indicator?.categoryName?.trim();
  if (explicitName) return explicitName;
  const category = String(indicator?.category ?? '').trim();
  if (!category) return '业务指标';
  return rawCodePattern.test(category) ? '业务指标' : category;
};

const scoringCodeLabels: Record<string, string> = {
  DIRECT_SCORE: '直接计分',
  INTERVAL: '区间计分',
  QUALITATIVE_RUBRIC: '定性评分',
  PASS_FAIL: '通过/不通过',
  FORMULA: '公式计算',
};

const scoringCodeLabel = (value?: unknown) => {
  const key = String(value ?? '').toUpperCase();
  return scoringCodeLabels[key];
};

const scoringSummary = (indicator?: Indicator | null) => {
  const rule = displayVersion(indicator)?.scoringRule;
  if (!rule) return '未配置评分规则';
  const bandCount = rule.bands?.length ?? 0;
  const primaryLabel = scoringCodeLabel(rule.effect) ?? scoringCodeLabel(rule.ruleType) ?? '评分规则已配置';
  return bandCount ? `${primaryLabel} · ${bandCount}档评分` : primaryLabel;
};

const evidenceSummary = (indicator?: Indicator | null) => {
  const templates = displayVersion(indicator)?.evidenceTemplates ?? [];
  if (!templates.length) return '无需证据';
  const required = templates.filter((item) => item.required).length;
  return required ? '需要证据' : '可补充证据';
};

const itemIndicatorId = (item: SchemeItemDraft) => `${item.indicatorId}::${item.versionId}`;

const findingField = (finding: Record<string, unknown>) => String(finding.field ?? '');

const findingsFor = (findings: Array<Record<string, unknown>>, field: string) =>
  findings.filter((finding) => {
    const current = findingField(finding);
    return current === field || current.startsWith(`${field}.`);
  });

const findingsFromReadiness = (readiness?: Record<string, unknown> | null): Array<Record<string, unknown>> =>
  Array.isArray(readiness?.findings) ? readiness.findings as Array<Record<string, unknown>> : [];

const targetCountFromForm = (groups: TargetGroupDraft[]) =>
  new Set(groups.flatMap((group) => (group.members ?? []).map((member) => member.orgId).filter(Boolean))).size;

const findOrgById = (node: OrgNode | null, id: string): OrgNode | null => {
  if (!node) return null;
  if (node.id === id) return node;
  for (const child of node.children ?? []) {
    const found = findOrgById(child, id);
    if (found) return found;
  }
  return null;
};

const dedupeOrgTree = (node: OrgNode): OrgNode => {
  const seen = new Map<string, OrgNode>();
  const collect = (current: OrgNode) => {
    const existing = seen.get(current.id);
    if (!existing || ((current.children?.length ?? 0) > (existing.children?.length ?? 0))) {
      seen.set(current.id, { ...current, children: current.children ? [...current.children] : undefined });
    }
    current.children?.forEach(collect);
  };
  collect(node);
  const build = (current: OrgNode): OrgNode => ({
    ...seen.get(current.id)!,
    children: seen.get(current.id)?.children?.map(build),
  });
  return build(node);
};

const defaultExpandedOrgNodes = (node: OrgNode | null, depth = 0): string[] => {
  if (!node || depth > 1) return [];
  return [node.id, ...(node.children ?? []).flatMap((child) => defaultExpandedOrgNodes(child, depth + 1))];
};

const orgTypeLabel = (type: OrgNode['type']) => {
  if (type === 'branch') return '分公司';
  if (type === 'sub-branch') return '营业部';
  if (type === 'dept') return '部门/条线';
  return '根节点';
};

const targetOrgSelectable = (node: OrgNode, granularity: TargetGranularity) =>
  (granularity === 'branch' && node.type === 'branch') ||
  (granularity === 'sub-branch' && node.type === 'sub-branch');

const collectOrgNodes = (node: OrgNode | null, predicate: (node: OrgNode) => boolean): OrgNode[] => {
  if (!node) return [];
  return [
    ...(predicate(node) ? [node] : []),
    ...(node.children ?? []).flatMap((child) => collectOrgNodes(child, predicate)),
  ];
};

const orgBusinessLineLabel = (node?: OrgNode | null) => {
  const raw = String(
    (node as unknown as { businessLine?: unknown })?.businessLine ??
      (node as unknown as { lineName?: unknown })?.lineName ??
      '',
  );
  if (!raw) return null;
  return raw;
};

const businessLineLabel = (value?: unknown) => {
  const raw = String(value ?? '').trim().toUpperCase();
  if (!raw) return null;
  if (raw.includes('WEALTH')) return '财富线营业部';
  if (raw.includes('INVEST')) return '投行业务营业部';
  if (raw.includes('INSTITUTION')) return '机构业务营业部';
  if (raw.includes('BROKERAGE')) return '经纪业务营业部';
  return null;
};

const workflowRoleLabels: Record<string, string> = {
  ROLE_BRANCH_COMPLIANCE_OFFICER: '营业部合规岗',
  ROLE_BRANCH_MANAGER: '营业部负责人',
  ROLE_BUSINESS_LINE_MANAGER: '条线复核岗',
  ROLE_COMPLIANCE_DIRECTOR: '总部合规负责人',
};

const workflowLevelLabels: Record<string, string> = {
  L0_SELF_CHECK: '营业部合规岗',
  L1_BRANCH_REVIEW: '营业部负责人',
  L2_LINE_REVIEW: '条线复核岗',
  L3_HQ_FINAL: '总部终审岗',
};

const cleanWorkflowLabel = (value?: unknown) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const normalized = raw.toUpperCase();
  if (workflowRoleLabels[normalized]) return workflowRoleLabels[normalized];
  if (workflowLevelLabels[normalized]) return workflowLevelLabels[normalized];
  if (normalized.includes('BRANCH') && normalized.includes('COMPLIANCE')) return '营业部合规岗';
  if (normalized.includes('BRANCH') && normalized.includes('MANAGER')) return '营业部负责人';
  if (normalized.includes('BUSINESS') || normalized.includes('LINE')) return '条线复核岗';
  if (normalized.includes('FINAL') || normalized.includes('HQ')) return '总部终审岗';
  if (rawCodePattern.test(raw)) return '';
  return raw;
};

interface ApprovalChainPreviewNode {
  nodeId: string;
  label: string;
  meta: string;
  level?: string;
  isFinal?: boolean;
}

interface ApprovalChainPreview {
  id: string;
  title: string;
  subtitle: string;
  nodes: ApprovalChainPreviewNode[];
}

const approvalChainsFromWorkflow = (chains: Array<Record<string, unknown>>): ApprovalChainPreview[] =>
  chains.map((chain, chainIndex) => {
    const levels = (chain.levels as Array<Record<string, unknown>> | undefined) ?? [];
    const nodes = (chain.nodes as Array<Record<string, unknown>> | undefined) ?? [];
    const levelNodes = levels.flatMap((level) => {
      const levelNodeItems = (level.nodes as Array<Record<string, unknown>> | undefined) ?? [];
      return levelNodeItems.map((node) => ({
        ...node,
        level: level.level,
        approverCount: level.approverCount,
      }));
    });
    const previewNodes = nodes.length > 0
      ? nodes
      : levelNodes.length > 0
        ? levelNodes
        : levels.map((level) => ({
          label: String(level.label ?? level.level ?? '-'),
          approverCount: level.approverCount,
        }));
    const targetScope = chain.targetScope as Record<string, unknown> | undefined;
    const lineLabel = businessLineLabel(targetScope?.businessLine ?? chain.businessLine ?? chain.name);
    return {
      id: String(chain.chainId ?? chainIndex),
      title: `针对：${lineLabel ?? `考核对象分组 ${chainIndex + 1}`}`,
      subtitle: '基于已选对象和组织架构自动推导',
      nodes: previewNodes.map((node) => ({
        nodeId: String(node.nodeId ?? `${chain.chainId ?? chainIndex}-${node.level ?? node.label}`),
        label: workflowPreviewNodeLabel(node),
        meta: workflowPreviewNodeMeta(node),
        level: node.level == null ? undefined : String(node.level),
        isFinal: node.isFinal === true,
      })),
    };
  });

const fallbackApprovalChains: ApprovalChainPreview[] = [
  {
    id: 'wealth-branch',
    title: '营业部考核链路',
    subtitle: '基于组织架构和财富业务线规则预演',
    nodes: [
      { nodeId: 'fallback-branch-review', label: '分公司合规岗', meta: '岗位审批' },
      { nodeId: 'fallback-hq-review', label: '总部财富合规专员', meta: '岗位审批' },
    ],
  },
  {
    id: 'investment-branch',
    title: '条线协同链路',
    subtitle: '条线对象未启用时仅作为审批路径预览',
    nodes: [
      { nodeId: 'fallback-investment-quality', label: '投行质控部', meta: '部门复核' },
      { nodeId: 'fallback-investment-compliance', label: '总部投行业务合规', meta: '岗位审批' },
    ],
  },
];

const workflowPreviewNodeLabel = (node: Record<string, unknown>) => {
  const approverSelector = node.approverSelector as Record<string, unknown> | undefined;
  return (
    cleanWorkflowLabel(approverSelector?.roleCode) ||
    cleanWorkflowLabel(node.label) ||
    cleanWorkflowLabel(node.level) ||
    cleanWorkflowLabel(node.nodeType) ||
    '审批节点'
  );
};

const workflowPreviewNodeMeta = (node: Record<string, unknown>) => {
  const approverSelector = node.approverSelector as Record<string, unknown> | undefined;
  const level = String(node.level ?? '').toUpperCase();
  const selectorType = String(approverSelector?.selectorType ?? node.nodeType ?? '').toUpperCase();
  const scopeRule = String(approverSelector?.orgScopeRule ?? '').toUpperCase();
  const base =
    level === 'L3_HQ_FINAL' || selectorType === 'FINAL_APPROVER'
      ? '总部终审'
      : scopeRule === 'TARGET_ORG'
        ? '本机构岗位'
        : scopeRule === 'TARGET_PARENT_BRANCH'
          ? '上级机构复核'
          : scopeRule === 'BUSINESS_LINE_HQ'
            ? '条线复核'
            : scopeRule === 'HQ_GLOBAL'
              ? '总部审批'
              : selectorType === 'USER'
                ? '指定人员'
                : '岗位审批';
  return node.approverCount != null ? `${base} · ${String(node.approverCount)} 人` : base;
};

const workflowFinalNodeText = (node?: { nodeId: string; label?: string } | null) =>
  cleanWorkflowLabel(node?.label) || '默认终审';

const routeOverrideActive = (override?: WorkflowRouteOverrideDraft | null) =>
  Boolean(
    override?.enabled !== false &&
      ((override?.disabledNodeIds?.length ?? 0) > 0 ||
        (override?.chainNodeOrders?.length ?? 0) > 0 ||
        (override?.finalNodes?.length ?? 0) > 0 ||
        Boolean(override?.note)),
  );

const applyRouteOverridePreview = (
  chains: ApprovalChainPreview[],
  override?: WorkflowRouteOverrideDraft | null,
): ApprovalChainPreview[] => {
  if (!routeOverrideActive(override)) return chains;
  const disabled = new Set(override?.disabledNodeIds ?? []);
  const orderByChain = new Map(
    (override?.chainNodeOrders ?? []).map((item) => [item.chainId, item.nodeIds]),
  );
  const finalNodeIds = new Set((override?.finalNodes ?? []).map((item) => item.nodeId));
  return chains.map((chain) => {
    const order = orderByChain.get(chain.id) ?? [];
    const orderIndex = new Map(order.map((nodeId, index) => [nodeId, index]));
    const nodes = chain.nodes
      .filter((node) => !disabled.has(node.nodeId))
      .sort((left, right) => {
        const leftIndex = orderIndex.has(left.nodeId) ? orderIndex.get(left.nodeId)! : Number.MAX_SAFE_INTEGER;
        const rightIndex = orderIndex.has(right.nodeId) ? orderIndex.get(right.nodeId)! : Number.MAX_SAFE_INTEGER;
        return leftIndex - rightIndex;
      })
      .map((node) => ({
        ...node,
        isFinal: finalNodeIds.size > 0 ? finalNodeIds.has(node.nodeId) : node.isFinal,
      }));
    return { ...chain, nodes };
  });
};

const thresholdWarnings = (thresholds: GradeThresholdDraft[]) => {
  if (!thresholds.length) return ['请至少配置 1 个等级区间'];
  const warnings: string[] = [];
  const ascending = [...thresholds].sort((a, b) => numeric(a.minScore) - numeric(b.minScore));
  if (numeric(ascending[0]?.minScore) !== 0) warnings.push('等级区间需从 0 分开始');
  let previousMax: number | null = null;
  ascending.forEach((threshold, index) => {
    const min = numeric(threshold.minScore);
    const max = threshold.maxScore == null ? null : numeric(threshold.maxScore);
    const label = threshold.gradeCode || `第 ${index + 1} 档`;
    if (max != null && min >= max) warnings.push(`${label} 的下限需小于上限`);
    if (previousMax != null && min !== previousMax) warnings.push(`${label} 与上一档之间存在分值断档`);
    if (max == null && index !== ascending.length - 1) warnings.push(`${label} 的开放上限只能放在最后一档`);
    previousMax = max;
  });
  if (ascending[ascending.length - 1]?.maxScore != null) warnings.push('等级区间需覆盖最高分以上的开放区间');
  return Array.from(new Set(warnings));
};

export default function AssessmentSchemeWorkbench({
  mode,
  detail,
  form,
  indicatorPool,
  indicatorPoolLoading,
  validationFindings,
  dirty,
  commandLoading,
  onChange,
  onClose,
  onRefetch,
  onValidate,
  onSave,
  onPublish,
}: AssessmentSchemeWorkbenchProps) {
  const [activeStep, setActiveStep] = useState<StepId>('base_scoring');
  const [indicatorSearch, setIndicatorSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [draggedIndicatorKey, setDraggedIndicatorKey] = useState<string | null>(null);
  const [orgTree, setOrgTree] = useState<OrgNode | null>(null);
  const [orgTreeLoading, setOrgTreeLoading] = useState(false);
  const [orgTreeError, setOrgTreeError] = useState<string | null>(null);
  const [expandedOrgNodes, setExpandedOrgNodes] = useState<Set<string>>(() => new Set());
  const [targetPickerOpen, setTargetPickerOpen] = useState(false);
  const [targetGranularity, setTargetGranularity] = useState<TargetGranularity>('sub-branch');
  const [stepTwoSaveState, setStepTwoSaveState] = useState<{ status: StepTwoSaveStatus; message: string } | null>(null);
  const [workflowTemplates, setWorkflowTemplates] = useState<WorkflowTemplateSummary[]>([]);
  const [workflowTemplateDetail, setWorkflowTemplateDetail] = useState<WorkflowTemplateDetail | null>(null);
  const [workflowLoading, setWorkflowLoading] = useState(false);
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const [workflowInsertDraft, setWorkflowInsertDraft] = useState<{
    chainId: string;
    insertIndex: number;
    nodeId: string;
  } | null>(null);
  const [simulationReferencePeriod, setSimulationReferencePeriod] = useState('2025Q4');
  const [simulationPolicy, setSimulationPolicy] = useState('exclude');
  const [simulationLoading, setSimulationLoading] = useState(false);
  const [simulationError, setSimulationError] = useState<string | null>(null);
  const [simulationDetail, setSimulationDetail] = useState<AssessmentSimulationDetail | null>(null);
  const [simulationSkipped, setSimulationSkipped] = useState(false);
  const readOnly = mode === 'view';
  const currentStepIndex = steps.findIndex((step) => step.id === activeStep);
  const canSave = !readOnly && (mode === 'create' || mode === 'copy' || commandEnabled(detail, 'edit'));
  const canValidate = !readOnly && (mode === 'create' || mode === 'copy' || commandEnabled(detail, 'validate', true));
  const canPublish = Boolean(detail) && commandEnabled(detail, 'publish');

  const indicatorById = useMemo(() => {
    const map = new Map<string, Indicator>();
    indicatorPool.forEach((indicator) => {
      map.set(indicator.id, indicator);
    });
    return map;
  }, [indicatorPool]);

  const publishedIndicatorPool = useMemo(
    () => indicatorPool.filter((indicator) => {
      const version = displayVersion(indicator);
      const status = indicator.status ?? indicator.latestStatus ?? version?.status ?? '';
      return status === 'PUBLISHED';
    }),
    [indicatorPool],
  );

  const categories = useMemo(
    () => Array.from(new Set(publishedIndicatorPool.map((item) => businessCategoryLabel(item)).filter(Boolean))).sort(),
    [publishedIndicatorPool],
  );

  const selectedItemKeys = useMemo(() => new Set(form.items.map(itemIndicatorId)), [form.items]);
  const filteredIndicators = useMemo(() => {
    const keyword = indicatorSearch.trim().toLowerCase();
    return publishedIndicatorPool
      .filter((indicator) => {
        const category = businessCategoryLabel(indicator);
        if (categoryFilter !== 'all' && category !== categoryFilter) return false;
        if (!keyword) return true;
        return (
          indicator.name.toLowerCase().includes(keyword) ||
          indicator.code.toLowerCase().includes(keyword) ||
          String(indicator.businessLine ?? '').toLowerCase().includes(keyword)
        );
      })
      .slice(0, 50);
  }, [categoryFilter, indicatorSearch, publishedIndicatorPool]);

  const weightTotal = form.items.reduce((sum, item) => sum + numeric(item.weight), 0);
  const expectedWeight = numeric(form.totalWeight, 100);
  const weightOk = Math.abs(weightTotal - expectedWeight) < 0.0001;
  const thresholdIssues = thresholdWarnings(form.gradeThresholds);
  const baseScoringReadiness = detail?.readiness?.baseScoring ?? null;
  const baseScoringReady =
    typeof baseScoringReadiness?.ready === 'boolean'
      ? baseScoringReadiness.ready === true
      : form.items.length > 0 && weightOk && !thresholdIssues.length;
  const factorsEnabled = form.volumeAdjustmentFactors.length > 0;
  const primaryTargetGroup: TargetGroupDraft = form.targetGroups[0] ?? {
    groupName: '默认考核对象',
    scopeMode: 'MANUAL_SELECTION',
    description: '',
    members: [],
  };
  const selectedTargetOrgIds = Array.from(
    new Set((primaryTargetGroup.members ?? []).map((member) => member.orgId).filter(Boolean)),
  );
  const selectedTargetOrgs = selectedTargetOrgIds.map((orgId) => ({
    orgId,
    node: findOrgById(orgTree, orgId),
  }));
  const branchNodes = useMemo(() => collectOrgNodes(orgTree, (node) => node.type === 'branch'), [orgTree]);
  const subBranchNodes = useMemo(() => collectOrgNodes(orgTree, (node) => node.type === 'sub-branch'), [orgTree]);
  const selectedBranchCount = selectedTargetOrgs.filter(({ node }) => node?.type === 'branch').length;
  const selectedSubBranchCount = selectedTargetOrgs.filter(({ node }) => node?.type === 'sub-branch').length;
  const targetGranularityLabel = targetGranularity === 'branch' ? '分公司级' : '营业部级';
  const selectedBusinessLineTags = Array.from(
    new Set(selectedTargetOrgs.map(({ node }) => orgBusinessLineLabel(node)).filter(Boolean) as string[]),
  );
  const formTargetCount = targetCountFromForm(form.targetGroups);
  const targetCount = primaryTargetGroup.scopeMode === 'MANUAL_SELECTION'
    ? formTargetCount
    : detail?.targetCount ?? formTargetCount;
  const targetScopeLabel =
    primaryTargetGroup.scopeMode === 'MANUAL_SELECTION'
      ? `${selectedTargetOrgIds.length ? '圈选考核对象' : '尚未圈选'}（${targetCount} 家）`
      : detail?.targetScopeLabel ?? '全部营业部（保存后解析）';
  const frequencyText = frequencyLabel(form.frequency);
  const scopeSnapshot = detail?.scopeSnapshot ?? [];
  const targetResolutionFindings = detail?.targetResolutionFindings ?? [];
  const targetScopeReadiness = detail?.readiness?.targetScope ?? null;
  const targetScopeReady =
    typeof targetScopeReadiness?.ready === 'boolean'
      ? targetScopeReadiness.ready === true
      : targetCount > 0;
  const selectedWorkflowTemplateId = form.workflowBinding?.routeTemplateId ?? '';
  const defaultWorkflowTemplate = workflowTemplates.find((template) =>
    template.status === 'ACTIVE' && Boolean(template.currentVersionId) && template.templateId.includes('ASSESS'),
  ) ?? workflowTemplates.find((template) => template.status === 'ACTIVE' && Boolean(template.currentVersionId));
  const workflowRouteReadiness = detail?.readiness?.workflowRoute ?? null;
  const workflowRouteReady = workflowRouteReadiness?.ready === true;
  const workflowRouteFindings = Array.isArray(workflowRouteReadiness?.findings)
    ? workflowRouteReadiness.findings as Array<Record<string, unknown>>
    : [];
  const workflowSummary = detail?.workflowSummary ?? null;
  const workflowChains =
    (workflowSummary?.chains as Array<Record<string, unknown>> | undefined) ??
    (workflowTemplateDetail?.chains as unknown as Array<Record<string, unknown>> | undefined) ??
    [];
  const approvalChainPreviews = workflowChains.length ? approvalChainsFromWorkflow(workflowChains) : fallbackApprovalChains;
  const currentRouteOverride = form.workflowBinding?.routeOverride ?? null;
  const routeOverrideInUse = routeOverrideActive(currentRouteOverride);
  const effectiveApprovalChainPreviews = applyRouteOverridePreview(approvalChainPreviews, currentRouteOverride);
  const finalNodeCandidates = effectiveApprovalChainPreviews.flatMap((chain) =>
    chain.nodes
      .filter((node) => node.level === 'L3_HQ_FINAL' || node.isFinal)
      .map((node) => ({ chainId: chain.id, ...node })),
  );
  const selectedFinalNode =
    currentRouteOverride?.finalNodes?.[0] ??
    finalNodeCandidates.find((node) => node.isFinal) ??
    finalNodeCandidates[0] ??
    null;
  const selectedFinalNodePreview =
    finalNodeCandidates.find((node) => node.nodeId === selectedFinalNode?.nodeId) ?? selectedFinalNode;
  const selectedFinalNote = currentRouteOverride?.finalNodes?.[0]?.note ?? currentRouteOverride?.note ?? '';
  const disabledWorkflowNodeIds = new Set(currentRouteOverride?.disabledNodeIds ?? []);
  const schedulingDispatchReadiness = detail?.readiness?.schedulingDispatch ?? null;
  const schedulingDispatchReady = schedulingDispatchReadiness?.ready === true;
  const schedulingDispatchFindings = Array.isArray(schedulingDispatchReadiness?.findings)
    ? schedulingDispatchReadiness.findings as Array<Record<string, unknown>>
    : [];
  const scheduleSummary =
    (detail?.scheduleSummary ?? schedulingDispatchReadiness?.summary ?? null) as Record<string, unknown> | null;
  const readinessRows = [
    {
      key: 'base-scoring',
      label: '计分规则与权重校验',
      description: '指标、权重、等级区间和调节因子满足发布前必填要求。',
      ready: baseScoringReady,
      optional: false,
      findings: findingsFromReadiness(baseScoringReadiness),
    },
    {
      key: 'target-scope',
      label: '目标对象范围',
      description: '已明确本方案覆盖的组织对象，并可由后端解析目标快照。',
      ready: targetScopeReady,
      optional: false,
      findings: findingsFromReadiness(targetScopeReadiness),
    },
    {
      key: 'workflow-route',
      label: '审批流程路由',
      description: '已确认有效审批链路，满足发布前检查。',
      ready: workflowRouteReady,
      optional: false,
      findings: workflowRouteFindings,
    },
    {
      key: 'scheduling-dispatch',
      label: '下发调度策略',
      description: '已选择定时自动下发或手动一次性下发策略。',
      ready: schedulingDispatchReady,
      optional: false,
      findings: schedulingDispatchFindings,
    },
    {
      key: 'simulation',
      label: '历史回测仿真',
      description: '可选项；运行或跳过都不会改变正式发布前检查。',
      ready: simulationDetail?.simulationOnly === true,
      optional: true,
      findings: simulationDetail?.preflightFindings ?? findingsFromReadiness(detail?.readiness?.simulation ?? null),
    },
  ];
  const mandatoryReady =
    typeof detail?.readiness?.mandatoryReady === 'boolean'
      ? detail.readiness.mandatoryReady
      : baseScoringReady && targetScopeReady && workflowRouteReady && schedulingDispatchReady;
  const publishSummary = (detail?.publishSummary ?? null) as Record<string, unknown> | null;
  const readinessSummary = (detail?.readinessSummary ?? null) as Record<string, unknown> | null;
  const sourceTraceSummary = (detail?.sourceTraceSummary ?? detail?.sourceTrace ?? null) as Record<string, unknown> | null;
  const commandAuditSummary = (detail?.commandAuditSummary ?? null) as Record<string, unknown> | null;
  const commandAudit = detail?.commandAudit ?? [];
  const schemeSnapshot = (detail?.schemeSnapshot ?? null) as Record<string, unknown> | null;
  const snapshotReadiness = (schemeSnapshot?.readiness ?? null) as Record<string, unknown> | null;
  const publishCommandReason = commandReason(detail, 'publish');

  const updateForm = (patch: Partial<SchemeDraftForm>) => onChange({ ...form, ...patch });
  const updateWorkflowRouteOverride = (override: WorkflowRouteOverrideDraft | null) => {
    const binding = form.workflowBinding;
    if (!binding?.routeTemplateId) return;
    setStepTwoSaveState(null);
    updateForm({
      workflowBinding: {
        ...binding,
        routeOverride: override,
      },
    });
  };

  const mergeWorkflowRouteOverride = (patch: Partial<WorkflowRouteOverrideDraft>) => {
    updateWorkflowRouteOverride({
      enabled: true,
      disabledNodeIds: currentRouteOverride?.disabledNodeIds ?? [],
      chainNodeOrders: currentRouteOverride?.chainNodeOrders ?? [],
      finalNodes: currentRouteOverride?.finalNodes ?? [],
      note: currentRouteOverride?.note ?? null,
      ...patch,
    });
  };

  const toggleWorkflowNode = (nodeId: string) => {
    const disabled = new Set(currentRouteOverride?.disabledNodeIds ?? []);
    if (disabled.has(nodeId)) {
      disabled.delete(nodeId);
    } else {
      disabled.add(nodeId);
    }
    mergeWorkflowRouteOverride({ disabledNodeIds: Array.from(disabled) });
  };

  const insertWorkflowNodeAt = (chain: ApprovalChainPreview, insertIndex: number, nodeId: string) => {
    const disabled = new Set(currentRouteOverride?.disabledNodeIds ?? []);
    const sourceChain = approvalChainPreviews.find((item) => item.id === chain.id);
    const candidate = sourceChain?.nodes.find((node) => node.nodeId === nodeId && disabled.has(node.nodeId) && !node.isFinal);
    if (!candidate) return;
    disabled.delete(candidate.nodeId);
    const order = chain.nodes.map((node) => node.nodeId);
    order.splice(insertIndex, 0, candidate.nodeId);
    const nextOrders = [
      ...(currentRouteOverride?.chainNodeOrders ?? []).filter((item) => item.chainId !== chain.id),
      { chainId: chain.id, nodeIds: order },
    ];
    mergeWorkflowRouteOverride({
      disabledNodeIds: Array.from(disabled),
      chainNodeOrders: nextOrders,
    });
    setWorkflowInsertDraft(null);
  };

  const selectFinalWorkflowNode = (chainId: string, nodeId: string, note = selectedFinalNote) => {
    mergeWorkflowRouteOverride({
      finalNodes: [{ chainId, nodeId, note: note || null }],
      note: note || null,
    });
  };
  const renderWorkflowNodeCapsule = (node: ApprovalChainPreviewNode, action: 'delete' | 'restore') => (
    <Popover>
      <PopoverTrigger
        type="button"
        className={`shrink-0 rounded-full border px-4 py-2 text-sm font-medium shadow-sm transition ${
          action === 'restore'
            ? 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-white'
            : 'border-blue-200 bg-white text-blue-700 hover:bg-blue-50'
        }`}
        data-testid={`asch-workflow-node-${action}-${node.nodeId}`}
      >
        {node.label}
      </PopoverTrigger>
      <PopoverContent className="w-80 border border-slate-200 bg-white p-4 text-xs shadow-lg" align="center">
        <div className="space-y-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">{node.label}</div>
            <div className="mt-1 text-slate-500">{node.meta}</div>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-600">
            指定人员待真实人员目录和审计契约补齐后开放。
          </div>
          <Button
            type="button"
            size="sm"
            variant={action === 'delete' ? 'destructive' : 'outline'}
            className="w-full justify-center"
            disabled={readOnly}
            onClick={() => toggleWorkflowNode(node.nodeId)}
            data-testid={`asch-workflow-node-${action}-action-${node.nodeId}`}
          >
            {action === 'delete' ? (
              <>
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                删除此节点
              </>
            ) : (
              <>
                <RefreshCw className="mr-1 h-3.5 w-3.5" />
                恢复此节点
              </>
            )}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
  const stepTwoBusy = commandLoading === 'save' || stepTwoSaveState?.status === 'saving' || stepTwoSaveState?.status === 'refetching';
  const saveStepTwoAndRefetch = async (context: 'target' | 'route') => {
    const label = context === 'target' ? '考核对象' : '审批链路';
    setStepTwoSaveState({ status: 'saving', message: `正在保存${label}调整...` });
    const savedDetail = await onSave();
    if (!savedDetail) {
      setStepTwoSaveState({
        status: 'error',
        message: `${label}保存失败，当前面板已保留，请根据页面错误修正后重试。`,
      });
      return false;
    }
    setStepTwoSaveState({ status: 'refetching', message: `${label}已保存，正在从后端回读真实摘要...` });
    const refetched = await onRefetch(savedDetail.schemeId ?? detail?.schemeId);
    if (!refetched) {
      setStepTwoSaveState({
        status: 'error',
        message: `${label}已提交但回读失败，请点击刷新或再次保存回读确认。`,
      });
      return false;
    }
    setStepTwoSaveState({
      status: 'success',
      message: `${label}已保存并完成后端回读。`,
    });
    return true;
  };

  const updateFrequency = (frequency: string) => {
    const normalizedFrequency = normalizeFrequency(frequency);
    const currentSchedule = form.scheduleBinding;
    updateForm({
      frequency: normalizedFrequency,
      scheduleBinding:
        currentSchedule?.dispatchMode === 'SCHEDULED'
          ? {
              ...currentSchedule,
              periodicRule: {
                ...defaultPeriodicRule(normalizedFrequency),
                ...(currentSchedule.periodicRule ?? {}),
                frequency: normalizedFrequency === 'AD_HOC' ? 'QUARTERLY' : normalizedFrequency,
              },
            }
          : currentSchedule,
    });
  };
  const updatePrimaryTargetGroup = (patch: Partial<TargetGroupDraft>) => {
    const nextGroup = { ...primaryTargetGroup, ...patch };
    setStepTwoSaveState(null);
    updateForm({ targetGroups: [nextGroup] });
  };
  const updateTargetScopeMode = (scopeMode: string) => {
    updatePrimaryTargetGroup({
      scopeMode,
      groupName: scopeMode === 'ALL_BRANCHES' ? '全部营业部' : '圈选考核对象',
      description: scopeMode === 'ALL_BRANCHES'
        ? '后端按真实组织树动态解析全部 active 营业部'
        : '通过组织树圈选纳入本方案的考核对象',
      members: scopeMode === 'ALL_BRANCHES' ? [] : primaryTargetGroup.members,
    });
  };
  const selectTargetGranularity = (granularity: TargetGranularity) => {
    if (granularity === 'business-line' || readOnly) return;
    setTargetGranularity(granularity);
    const members = orgTree
      ? selectedTargetOrgIds
          .filter((orgId) => findOrgById(orgTree, orgId)?.type === granularity)
          .map((orgId) => ({ orgId }))
      : primaryTargetGroup.members;
    updatePrimaryTargetGroup({
      scopeMode: 'MANUAL_SELECTION',
      groupName: granularity === 'branch' ? '分公司级考核对象' : '营业部级考核对象',
      description: granularity === 'branch'
        ? '通过组织树圈选纳入本方案的分公司级考核对象'
        : '通过组织树圈选纳入本方案的营业部级考核对象',
      members,
    });
  };
  const toggleOrgNode = (nodeId: string) => {
    setExpandedOrgNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };
  const toggleTargetOrgSelection = (node: OrgNode) => {
    if (readOnly || !targetOrgSelectable(node, targetGranularity)) return;
    const selected = selectedTargetOrgIds.includes(node.id);
    const members = selected
      ? selectedTargetOrgIds.filter((orgId) => orgId !== node.id).map((orgId) => ({ orgId }))
      : [...selectedTargetOrgIds, node.id].map((orgId) => ({ orgId }));
    updatePrimaryTargetGroup({
      scopeMode: 'MANUAL_SELECTION',
      groupName: '圈选考核对象',
      description: '通过组织树圈选纳入本方案的考核对象',
      members,
    });
  };
  const removeTargetOrgSelection = (orgId: string) => {
    if (readOnly) return;
    updatePrimaryTargetGroup({
      members: selectedTargetOrgIds.filter((current) => current !== orgId).map((current) => ({ orgId: current })),
    });
  };
  const renderTargetOrgTree = (node: OrgNode, depth = 0): React.ReactNode => {
    const expanded = expandedOrgNodes.has(node.id);
    const selectable = targetOrgSelectable(node, targetGranularity);
    const selected = selectedTargetOrgIds.includes(node.id);
    const hasChildren = (node.children?.length ?? 0) > 0;

    return (
      <div key={node.id}>
        <div
          className="flex items-center rounded-md py-1.5 text-sm hover:bg-slate-50"
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          <button
            type="button"
            className="mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-0"
            disabled={!hasChildren}
            onClick={() => toggleOrgNode(node.id)}
            aria-label={expanded ? '收起组织节点' : '展开组织节点'}
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            disabled={!selectable || readOnly}
            onClick={() => toggleTargetOrgSelection(node)}
            className={`mr-2 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
              selected
                ? 'border-indigo-600 bg-indigo-600 text-white'
                : selectable
                  ? 'border-slate-300 bg-white hover:border-indigo-400'
                  : 'border-slate-200 bg-slate-100'
            }`}
            data-testid={`asch-target-org-${node.id}`}
          >
            {selected && <CheckCircle2 className="h-3 w-3" />}
          </button>
          <span className={`min-w-0 flex-1 truncate ${selected ? 'font-medium text-indigo-700' : 'text-slate-700'}`}>
            {node.name}
          </span>
          <span className="ml-2 shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
            {orgTypeLabel(node.type)}
          </span>
        </div>
        {expanded && hasChildren && (
          <div>
            {node.children!.map((child) => renderTargetOrgTree(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };
  const updateItem = (index: number, patch: Partial<SchemeItemDraft>) => {
    const items = form.items.map((item, current) => (current === index ? { ...item, ...patch } : item));
    updateForm({ items });
  };
  const updateThreshold = (index: number, patch: Partial<GradeThresholdDraft>) => {
    const gradeThresholds = form.gradeThresholds.map((item, current) => (current === index ? { ...item, ...patch } : item));
    updateForm({ gradeThresholds });
  };
  const updateFactor = (index: number, patch: Partial<VolumeAdjustmentFactorDraft>) => {
    const volumeAdjustmentFactors = form.volumeAdjustmentFactors.map((item, current) => (current === index ? { ...item, ...patch } : item));
    updateForm({ volumeAdjustmentFactors });
  };
  const moveItem = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= form.items.length) return;
    const items = [...form.items];
    [items[index], items[nextIndex]] = [items[nextIndex], items[index]];
    updateForm({ items });
  };
  const addIndicator = (indicator: Indicator) => {
    const version = displayVersion(indicator);
    if (!version) return;
    if (selectedItemKeys.has(`${indicator.id}::${version.versionId}`)) return;
    const remainingWeight = Math.max(expectedWeight - weightTotal, 0);
    updateForm({
      items: [
        ...form.items,
        {
          indicatorId: indicator.id,
          versionId: version.versionId,
          weight: indicator.defaultWeight || (form.items.length ? remainingWeight : expectedWeight),
          scoreCap: version.maxScore ?? 100,
        },
      ],
    });
  };
  const addIndicatorByKey = (indicatorKey: string | null) => {
    if (!indicatorKey || readOnly) return;
    const indicator = indicatorPool.find((item) => {
      const version = displayVersion(item);
      return version ? `${item.id}::${version.versionId}` === indicatorKey : false;
    });
    if (indicator) addIndicator(indicator);
  };
  const removeItem = (index: number) => {
    updateForm({ items: form.items.filter((_, current) => current !== index) });
  };
  const addThreshold = () => {
    updateForm({
      gradeThresholds: [
        ...form.gradeThresholds,
        { gradeCode: '', gradeLabel: '', minScore: 0, maxScore: null },
      ],
    });
  };
  const removeThreshold = (index: number) => {
    updateForm({ gradeThresholds: form.gradeThresholds.filter((_, current) => current !== index) });
  };
  const setFactorsEnabled = (enabled: boolean) => {
    updateForm({
      volumeAdjustmentFactors: enabled
        ? [
            {
              factorCode: 'SIZE-001',
              factorName: '体量调整系数',
              metric: 'branchAssetsUnderManagement',
              operator: '>',
              value: 100,
              multiplier: 1.05,
              enabled: true,
            },
          ]
        : [],
    });
  };
  const addFactor = () => {
    updateForm({
      volumeAdjustmentFactors: [
        ...form.volumeAdjustmentFactors,
        {
          factorCode: `SIZE-${String(form.volumeAdjustmentFactors.length + 1).padStart(3, '0')}`,
          factorName: '体量调整系数',
          metric: 'branchAssetsUnderManagement',
          operator: '>',
          value: 100,
          multiplier: 1.05,
          enabled: true,
        },
      ],
    });
  };
  const removeFactor = (index: number) => {
    updateForm({ volumeAdjustmentFactors: form.volumeAdjustmentFactors.filter((_, current) => current !== index) });
  };
  const runSimulation = async () => {
    if (!detail?.schemeId) {
      setSimulationError('请先保存草稿后再运行仿真');
      return;
    }
    setSimulationLoading(true);
    setSimulationError(null);
    setSimulationSkipped(false);
    try {
      const result = await assessmentApi.runAssessmentSimulation({
        schemeId: detail.schemeId,
        schemeVersionId: detail.status === 'DRAFT'
          ? `DRAFT-${detail.optimisticVersion}`
          : detail.publishedAtRef ?? undefined,
        referencePeriod: simulationReferencePeriod,
        imputationPolicy: simulationPolicy,
        schemeDraftSnapshot: detail.status === 'DRAFT'
          ? {
              ...detail,
              draftForm: form,
              simulationOnly: true,
            }
          : undefined,
        requestId: `asch-${detail.schemeId}-${Date.now()}`,
      });
      setSimulationDetail(result);
    } catch (caught: unknown) {
      setSimulationDetail(null);
      setSimulationError(caught instanceof Error ? caught.message : '仿真运行失败');
    } finally {
      setSimulationLoading(false);
    }
  };
  const skipSimulation = () => {
    setSimulationSkipped(true);
    setSimulationError(null);
  };

  const goStep = (direction: -1 | 1) => {
    const next = steps[currentStepIndex + direction];
    if (next) setActiveStep(next.id);
  };
  const baseStepBlockers = [
    ...(form.schemeName.trim().length > 0 ? [] : ['请填写方案名称']),
    ...(form.items.length > 0 ? [] : ['请至少添加 1 个指标']),
    ...(weightOk ? [] : [`权重合计需为 ${expectedWeight}`]),
    ...(thresholdIssues.length ? ['等级区间需覆盖完整分值'] : []),
  ];
  const baseStepCanContinue = readOnly || baseStepBlockers.length === 0;
  const nextDisabled =
    currentStepIndex >= steps.length - 1 ||
    (activeStep === 'base_scoring' && !baseStepCanContinue);

  useEffect(() => {
    let mounted = true;
    setOrgTreeLoading(true);
    setOrgTreeError(null);
    systemApi.getOrgTree()
      .then((tree) => {
        if (!mounted) return;
        const nextTree = tree ? dedupeOrgTree(tree) : null;
        setOrgTree(nextTree);
        setExpandedOrgNodes(new Set(defaultExpandedOrgNodes(nextTree)));
      })
      .catch((error: unknown) => {
        if (!mounted) return;
        setOrgTree(null);
        setOrgTreeError(error instanceof Error ? error.message : '组织树读取失败');
      })
      .finally(() => {
        if (mounted) setOrgTreeLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (selectedBranchCount > 0 && selectedSubBranchCount === 0) {
      setTargetGranularity('branch');
    } else if (selectedSubBranchCount > 0 && selectedBranchCount === 0) {
      setTargetGranularity('sub-branch');
    }
  }, [selectedBranchCount, selectedSubBranchCount]);

  useEffect(() => {
    let mounted = true;
    setWorkflowLoading(true);
    setWorkflowError(null);
    workflowApi.listTemplates()
      .then((page) => {
        if (!mounted) return;
        setWorkflowTemplates(page.items ?? []);
      })
      .catch((error: unknown) => {
        if (!mounted) return;
        setWorkflowTemplates([]);
        setWorkflowError(error instanceof Error ? error.message : '审批链路配置读取失败');
      })
      .finally(() => {
        if (mounted) setWorkflowLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (readOnly || form.workflowBinding?.routeTemplateId || !defaultWorkflowTemplate?.currentVersionId) return;
    updateForm({
      workflowBinding: {
        routeTemplateId: defaultWorkflowTemplate.templateId,
        routeTemplateVersionId: defaultWorkflowTemplate.currentVersionId,
      },
    });
  }, [defaultWorkflowTemplate, form.workflowBinding?.routeTemplateId, readOnly]);

  useEffect(() => {
    let mounted = true;
    if (!selectedWorkflowTemplateId) {
      setWorkflowTemplateDetail(null);
      return () => {
        mounted = false;
      };
    }
    setWorkflowLoading(true);
    setWorkflowError(null);
    workflowApi.getTemplate(selectedWorkflowTemplateId)
      .then((nextDetail) => {
        if (!mounted) return;
        setWorkflowTemplateDetail(nextDetail);
      })
      .catch((error: unknown) => {
        if (!mounted) return;
        setWorkflowTemplateDetail(null);
        setWorkflowError(error instanceof Error ? error.message : '审批链路详情读取失败');
      })
      .finally(() => {
        if (mounted) setWorkflowLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [selectedWorkflowTemplateId]);

  useEffect(() => {
    setSimulationDetail(null);
    setSimulationSkipped(false);
    setSimulationError(null);
  }, [detail?.schemeId, detail?.optimisticVersion]);

  return (
    <AssessmentSchemeConfigurator
      activeStep={activeStep}
      steps={steps}
      title={form.schemeName}
      readOnly={readOnly}
      modeLabel={modeLabel[mode]}
      statusLabel={detail ? statusLabel[detail.status] ?? detail.status : '草稿'}
      versionLabel={detail ? `${detail.schemeCode} · v${detail.optimisticVersion}` : `${form.schemeCode} · DRAFT`}
      frequencyValue={normalizeFrequency(form.frequency)}
      frequencyLabel={frequencyText}
      frequencyOptions={frequencyOptions}
      targetScopeLabel={targetScopeLabel}
      dirty={dirty}
      commandLoading={commandLoading}
      canSave={canSave}
      canValidate={canValidate}
      canPublish={canPublish}
      detailExists={Boolean(detail)}
      showPublish={activeStep === 'simulation_publish' && Boolean(detail)}
      nextDisabled={nextDisabled}
      nextDisabledReason={!baseStepCanContinue && activeStep === 'base_scoring' ? baseStepBlockers.join('；') : undefined}
      baseStepBlockers={activeStep === 'base_scoring' ? baseStepBlockers : []}
      editCommandReason={commandReason(detail, 'edit')}
      validateCommandReason={commandReason(detail, 'validate')}
      publishCommandReason={commandReason(detail, 'publish')}
      onClose={onClose}
      onTitleChange={(schemeName) => updateForm({ schemeName })}
      onFrequencyChange={updateFrequency}
      onStepChange={setActiveStep}
      onPreviousStep={() => goStep(-1)}
      onNextStep={() => goStep(1)}
      onSave={() => { void onSave(); }}
      onValidate={() => { void onValidate(); }}
      onRefetch={() => { void onRefetch(); }}
      onPublish={() => { void onPublish(); }}
    >
        {activeStep === 'base_scoring' && (
          <div className="flex min-h-[720px] flex-col space-y-4" data-testid="asch-step-panel-base-scoring">
            <div className="grid grid-cols-1 gap-3 rounded-md border border-slate-200 bg-white p-3 md:grid-cols-[1fr_120px] xl:grid-cols-[minmax(220px,1fr)_120px_minmax(280px,0.9fr)]">
              <label className="text-xs font-medium text-slate-600">
                方案编码
                <Input
                  value={form.schemeCode}
                  disabled={readOnly || mode === 'edit' || mode === 'copy'}
                  onChange={(event) => updateForm({ schemeCode: event.target.value })}
                  data-testid="asch-form-code"
                />
              </label>
              <label className="text-xs font-medium text-slate-600">
                总权重
                <Input
                  value={form.totalWeight}
                  disabled={readOnly}
                  type="number"
                  onChange={(event) => updateForm({ totalWeight: event.target.value })}
                  data-testid="asch-form-total-weight"
                />
              </label>
              <label className="text-xs font-medium text-slate-600">
                方案描述
                <Textarea
                  value={form.description}
                  disabled={readOnly}
                  onChange={(event) => updateForm({ description: event.target.value })}
                  data-testid="asch-form-description"
                  className="min-h-9 resize-none"
                  rows={1}
                  placeholder="补充说明，可稍后完善"
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2 md:grid-cols-4" data-testid="asch-base-summary">
              <SummaryCell label="指标项" value={`${form.items.length}`} />
              <SummaryCell label="权重合计" value={`${weightTotal}/${expectedWeight}`} tone={weightOk ? 'ok' : 'warn'} />
              <SummaryCell label="等级阈值" value={`${form.gradeThresholds.length}`} tone={thresholdIssues.length ? 'warn' : 'ok'} />
              <SummaryCell label="调节因子" value={`${form.volumeAdjustmentFactors.length}`} />
            </div>
            {baseStepBlockers.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800" data-testid="asch-base-local-blockers">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span className="font-semibold">进入下一步前需补齐：</span>
                {baseStepBlockers.map((blocker) => (
                  <span key={blocker} className="rounded-full bg-white px-2 py-1 font-medium">{blocker}</span>
                ))}
              </div>
            )}
            <FieldErrors findings={findingsFor(validationFindings, 'items')} />
            <FieldErrors findings={findingsFor(validationFindings, 'gradeThresholds')} />
            <FieldErrors findings={findingsFor(validationFindings, 'volumeAdjustmentFactors')} />

            <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(320px,30%)_minmax(0,1fr)]">
              <div className="flex min-h-[640px] flex-col rounded-md border border-slate-200 bg-white shadow-sm" data-testid="asch-indicator-pool">
                <div className="border-b border-slate-100 bg-slate-50/70 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-800">指标资源池</div>
                  {indicatorPoolLoading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
                </div>
                <div className="mt-3 grid gap-2">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={indicatorSearch}
                      onChange={(event) => setIndicatorSearch(event.target.value)}
                      placeholder="搜索指标..."
                      className="pl-8"
                      data-testid="asch-indicator-search"
                    />
                  </div>
                </div>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="mt-2" data-testid="asch-indicator-category-filter">
                    <span className="truncate">{categoryFilter === 'all' ? '全部分类' : categoryFilter}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部分类</SelectItem>
                    {categories.map((category) => (
                      <SelectItem value={category} key={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                </div>
                <div className="flex-1 space-y-2 overflow-auto bg-slate-50/40 p-3">
                  {filteredIndicators.map((indicator) => {
                    const version = displayVersion(indicator);
                    const selected = version ? selectedItemKeys.has(`${indicator.id}::${version.versionId}`) : false;
                    const indicatorKey = version ? `${indicator.id}::${version.versionId}` : '';
                    return (
                      <div
                        key={`${indicator.id}-${version?.versionId ?? 'no-version'}`}
                        draggable={!readOnly && !selected && Boolean(version)}
                        onDragStart={(event) => {
                          if (!version || selected || readOnly) return;
                          event.dataTransfer.setData('text/plain', indicatorKey);
                          event.dataTransfer.effectAllowed = 'copy';
                          setDraggedIndicatorKey(indicatorKey);
                        }}
                        onDragEnd={() => setDraggedIndicatorKey(null)}
                        onClick={() => {
                          if (!readOnly && !selected && version) addIndicator(indicator);
                        }}
                        className={`group relative rounded-md border p-3 transition-all ${
                          selected
                            ? 'border-slate-200 bg-slate-50 opacity-60'
                            : version && !readOnly
                              ? 'cursor-grab border-slate-200 bg-white hover:border-indigo-300 hover:shadow-md active:cursor-grabbing'
                              : 'border-slate-200 bg-white'
                        }`}
                        data-testid={`asch-indicator-pool-item-${indicator.id}`}
                      >
                        {selected && (
                          <Badge variant="secondary" className="absolute right-2 top-2 bg-slate-100 text-slate-500">
                            已添加
                          </Badge>
                        )}
                        <div className="flex items-start justify-between gap-2">
                          <GripVertical className={`mt-1 h-4 w-4 shrink-0 ${selected ? 'text-slate-300' : 'text-slate-400 group-hover:text-indigo-400'}`} />
                          <div className="min-w-0">
                            <div className={`truncate pr-16 text-sm font-semibold ${selected ? 'text-slate-500' : 'text-slate-800'}`}>{indicator.name}</div>
                            <div className="mt-1 flex flex-wrap gap-1">
                              <Badge variant="outline">{businessCategoryLabel(indicator)}</Badge>
                              <Badge variant="secondary">{indicator.businessLine ?? '通用业务'}</Badge>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant={selected ? 'secondary' : 'outline'}
                            disabled={readOnly || selected || !version}
                            onClick={(event) => {
                              event.stopPropagation();
                              addIndicator(indicator);
                            }}
                            data-testid={`asch-indicator-add-${indicator.id}`}
                          >
                            {selected ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                        {!selected && version && !readOnly && (
                          <div className="mt-2 inline-flex items-center rounded border border-indigo-100 bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-600 opacity-0 transition-opacity group-hover:opacity-100">
                            <Plus className="mr-0.5 h-3 w-3" />
                            点击添加
                          </div>
                        )}
                        <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">{scoringSummary(indicator)}</span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">{evidenceSummary(indicator)}</span>
                        </div>
                      </div>
                    );
                  })}
                  {!filteredIndicators.length && (
                    <div className="rounded-md border border-dashed border-slate-300 bg-white p-4 text-center text-xs text-slate-500" data-testid="asch-indicator-pool-empty">
                      无匹配指标
                    </div>
                  )}
                </div>
              </div>

              <div className="flex min-h-[640px] flex-col space-y-4">
                <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm" data-testid="asch-weight-engine">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center text-sm font-bold text-slate-800">
                        <Percent className="mr-2 h-4 w-4 text-indigo-500" />
                        权重校验引擎
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        当前总权重 {weightTotal}% / 目标 {expectedWeight}%
                      </div>
                    </div>
                    <Badge
                      variant={weightOk ? 'secondary' : 'destructive'}
                      className={weightOk ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : undefined}
                      data-testid="asch-weight-total-state"
                    >
                      {weightOk ? '100% OK' : weightTotal > expectedWeight ? '超过目标权重' : '低于目标权重'}
                    </Badge>
                  </div>
                  <div className="mt-3 h-2.5 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                    <div
                      className={`h-full rounded-full transition-all ${
                        weightOk ? 'bg-emerald-500' : weightTotal > expectedWeight ? 'bg-rose-500' : 'bg-amber-500'
                      }`}
                      style={{ width: `${Math.min(Math.max((weightTotal / Math.max(expectedWeight, 1)) * 100, 0), 100)}%` }}
                    />
                  </div>
                  <div className={`mt-2 flex items-center gap-2 text-xs font-medium ${
                    weightOk ? 'text-emerald-700' : weightTotal > expectedWeight ? 'text-rose-700' : 'text-amber-700'
                  }`}>
                    {weightOk ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                    {weightOk
                      ? '权重校验通过，方案 Step 1 可进入下一步。'
                      : weightTotal > expectedWeight
                        ? '方案总权重超过目标权重，请调低部分指标权重。'
                        : '方案总权重不足目标权重，请继续添加指标或调整权重。'}
                  </div>
                  <FieldErrors findings={findingsFor(validationFindings, 'totalWeight')} />
                  <FieldErrors findings={findingsFor(validationFindings, 'items')} />
                </div>

                <div
                  className={`flex-1 rounded-md border bg-white shadow-sm transition-colors ${
                    draggedIndicatorKey ? 'border-indigo-300 ring-2 ring-indigo-100' : 'border-slate-200'
                  }`}
                  data-testid="asch-indicator-canvas"
                  onDragOver={(event) => {
                    if (readOnly) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'copy';
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const indicatorKey = event.dataTransfer.getData('text/plain') || draggedIndicatorKey;
                    addIndicatorByKey(indicatorKey);
                    setDraggedIndicatorKey(null);
                  }}
                >
                  <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
                    <div className="text-sm font-semibold text-slate-800">方案指标画布</div>
                    <Badge variant="outline">
                      {form.items.length} 项指标
                    </Badge>
                  </div>
                  <div className="grid gap-3 p-4 xl:grid-cols-2">
                    {form.items.map((item, index) => {
                      const indicator = indicatorById.get(item.indicatorId);
                      const snapshot = item.indicatorSnapshot ?? {};
                      const name = indicator?.name ?? String(snapshot.indicatorName ?? item.indicatorId);
                      return (
                        <div
                          key={`${item.indicatorId}-${item.versionId}-${index}`}
                          className="flex min-h-[172px] flex-col rounded-md border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                          data-testid={`asch-canvas-item-${item.indicatorId}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold leading-5 text-slate-900">{name}</div>
                              <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                                <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-medium text-indigo-700">{businessCategoryLabel(indicator)}</span>
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">{scoringSummary(indicator)}</span>
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">{evidenceSummary(indicator)}</span>
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <Button variant="ghost" size="sm" disabled={readOnly || index === 0} onClick={() => moveItem(index, -1)} data-testid={`asch-item-move-up-${item.indicatorId}`}>
                                <ArrowUp className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="sm" disabled={readOnly || index === form.items.length - 1} onClick={() => moveItem(index, 1)} data-testid={`asch-item-move-down-${item.indicatorId}`}>
                                <ArrowDown className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="sm" disabled={readOnly} onClick={() => removeItem(index)} data-testid={`asch-item-remove-${item.indicatorId}`}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>

                          <div className="mt-auto grid grid-cols-2 gap-3 pt-4">
                            <label className="text-[11px] font-medium text-slate-500">
                              权重
                              <div className="mt-1 flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1">
                                <Input
                                  type="number"
                                  value={item.weight}
                                  disabled={readOnly}
                                  onChange={(event) => updateItem(index, { weight: numeric(event.target.value) })}
                                  data-testid={`asch-item-weight-${item.indicatorId}`}
                                  className="h-8 border-0 bg-transparent px-1 text-sm font-semibold text-slate-900 shadow-none focus-visible:ring-0"
                                />
                                <span className="text-xs text-slate-500">%</span>
                              </div>
                            </label>
                            <label className="text-[11px] font-medium text-slate-500">
                              分值上限
                              <Input
                                type="number"
                                value={item.scoreCap ?? ''}
                                disabled={readOnly}
                                onChange={(event) => updateItem(index, { scoreCap: event.target.value === '' ? null : numeric(event.target.value) })}
                                data-testid={`asch-item-score-cap-${item.indicatorId}`}
                                className="mt-1 h-10 bg-slate-50 font-semibold text-slate-900"
                              />
                            </label>
                          </div>
                        </div>
                      );
                    })}
                    {!form.items.length && (
                      <div className="m-4 flex min-h-[220px] flex-col items-center justify-center rounded-lg border-2 border-dashed border-blue-200 bg-blue-50/60 px-6 py-10 text-center" data-testid="asch-canvas-empty">
                        <LayoutTemplate className="mb-4 h-12 w-12 text-blue-300" />
                        <div className="text-base font-semibold text-slate-700">考核方案画布为空</div>
                        <p className="mt-1 text-sm text-slate-500">拖拽左侧指标至此以组装考核方案</p>
                        <p className="mt-2 text-xs text-slate-400">也可以直接点击左侧指标卡片添加。</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-md border border-slate-200 bg-white" data-testid="asch-threshold-editor">
                  <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
                    <div>
                      <div className="text-sm font-semibold text-slate-800">考核等级临界值配置</div>
                      <div className="mt-0.5 text-[11px] text-slate-500">保留后端 gradeThresholds 区间校验语义。</div>
                    </div>
                    <Button size="sm" variant="outline" disabled={readOnly} onClick={addThreshold} data-testid="asch-threshold-add">
                      <Plus className="h-3.5 w-3.5" />
                      添加
                    </Button>
                  </div>
                  <div className="space-y-2 p-3">
                    <div className="grid grid-cols-1 gap-3 xl:grid-cols-4">
                      {form.gradeThresholds.map((threshold, index) => {
                        const tone = [
                          'border-emerald-200 bg-emerald-50/60 text-emerald-700',
                          'border-blue-200 bg-blue-50/60 text-blue-700',
                          'border-amber-200 bg-amber-50/60 text-amber-700',
                          'border-rose-200 bg-rose-50/60 text-rose-700',
                        ][index % 4];
                        return (
                          <div key={`${threshold.gradeCode}-${index}`} className={`rounded-md border p-3 ${tone}`} data-testid={`asch-threshold-row-${index}`}>
                            <div className="mb-3 flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <Input
                                  value={threshold.gradeCode}
                                  disabled={readOnly}
                                  onChange={(event) => updateThreshold(index, { gradeCode: event.target.value })}
                                  aria-label="等级徽标"
                                  className="h-8 w-12 border-white bg-white text-center text-sm font-black shadow-sm"
                                  data-testid={`asch-threshold-code-${index}`}
                                />
                                <span className="text-xs font-bold text-slate-600">等级区间</span>
                              </div>
                              <Button variant="ghost" size="sm" disabled={readOnly} onClick={() => removeThreshold(index)} data-testid={`asch-threshold-remove-${index}`}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                            <Input
                              value={threshold.gradeLabel}
                              disabled={readOnly}
                              onChange={(event) => updateThreshold(index, { gradeLabel: event.target.value })}
                              className="mb-2 h-8 bg-white text-sm font-semibold"
                              data-testid={`asch-threshold-label-${index}`}
                            />
                            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                              <Input
                                type="number"
                                value={threshold.minScore}
                                disabled={readOnly}
                                onChange={(event) => updateThreshold(index, { minScore: numeric(event.target.value) })}
                                aria-label="区间下限"
                                className="bg-white text-center font-mono font-bold"
                                data-testid={`asch-threshold-min-${index}`}
                              />
                              <span className="text-sm font-bold text-slate-400">-</span>
                              <Input
                                type="number"
                                value={threshold.maxScore ?? ''}
                                disabled={readOnly}
                                onChange={(event) => updateThreshold(index, { maxScore: event.target.value === '' ? null : numeric(event.target.value) })}
                                aria-label="区间上限"
                                className="bg-white text-center font-mono font-bold"
                                data-testid={`asch-threshold-max-${index}`}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {thresholdIssues.length > 0 && (
                      <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800" data-testid="asch-threshold-local-errors">
                        {thresholdIssues.join('；')}
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-md border border-slate-200 bg-white" data-testid="asch-factor-editor">
                  <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
                    <div>
                      <div className="text-sm font-semibold text-slate-800">高级计分策略：体量调整系数</div>
                      <label className="mt-1 flex items-center gap-2 text-sm font-semibold text-slate-600">
                        <input
                          type="checkbox"
                          checked={factorsEnabled}
                          disabled={readOnly}
                          onChange={(event) => setFactorsEnabled(event.target.checked)}
                          data-testid="asch-factor-toggle"
                        />
                        启用调整系数
                      </label>
                      <p className="mt-0.5 text-[11px] text-slate-500">针对不同规模或业务体量的机构进行总分加权微调，避免“一刀切”考核。</p>
                    </div>
                    <Button size="sm" variant="outline" disabled={readOnly || !factorsEnabled} onClick={addFactor} data-testid="asch-factor-add">
                      <Plus className="h-3.5 w-3.5" />
                      添加调整因子
                    </Button>
                  </div>
                  {factorsEnabled ? (
                    <div className="space-y-2 p-3">
                      {form.volumeAdjustmentFactors.map((factor, index) => (
                        <div key={`${factor.factorCode ?? index}`} className="flex items-center gap-2 overflow-x-auto rounded-md border border-slate-200 bg-slate-50 p-3 text-sm" data-testid={`asch-factor-row-${index}`}>
                          <span className="shrink-0 font-medium text-slate-500">基于</span>
                          <Select
                            value={normalizeFactorMetric(factor.metric)}
                            disabled={readOnly}
                            onValueChange={(value) => updateFactor(index, { metric: value, factorName: factorMetricLabel(value) })}
                          >
                            <SelectTrigger className="h-8 min-w-[170px] bg-white" data-testid={`asch-factor-metric-${index}`}>
                              <span className="truncate">{factorMetricLabel(factor.metric)}</span>
                            </SelectTrigger>
                            <SelectContent>
                              {factorMetricOptions.map((option) => (
                                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <span className="shrink-0 font-medium text-slate-500">当数值</span>
                          <Select value={factor.operator ?? '>'} disabled={readOnly} onValueChange={(value) => updateFactor(index, { operator: value })}>
                              <SelectTrigger className="h-8 w-20 bg-white" data-testid={`asch-factor-operator-${index}`}>
                                <span className="truncate">{factor.operator ?? '>'}</span>
                              </SelectTrigger>
                              <SelectContent>
                                {operatorOptions.map((operator) => (
                                  <SelectItem key={operator} value={operator}>
                                    {operator}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          <Input
                            type="number"
                            value={factor.value ?? ''}
                            disabled={readOnly}
                            onChange={(event) => updateFactor(index, { value: event.target.value === '' ? null : numeric(event.target.value) })}
                            className="h-8 w-24 bg-white text-center font-mono"
                            data-testid={`asch-factor-value-${index}`}
                          />
                          <span className="shrink-0 font-medium text-slate-500">亿/人时，总分调整为 原始分 <span className="font-bold text-slate-700">×</span></span>
                          <Input
                            type="number"
                            step="0.01"
                            value={factor.multiplier}
                            disabled={readOnly}
                            onChange={(event) => updateFactor(index, { multiplier: numeric(event.target.value, 1) })}
                            className="h-8 w-20 bg-white text-center font-mono font-bold"
                            data-testid={`asch-factor-multiplier-${index}`}
                          />
                          <label className="flex items-center gap-1 text-[11px] font-medium text-slate-500">
                            <input type="checkbox" checked={factor.enabled} disabled={readOnly} onChange={(event) => updateFactor(index, { enabled: event.target.checked })} data-testid={`asch-factor-enabled-${index}`} />
                            启用
                          </label>
                          <Button variant="ghost" size="sm" disabled={readOnly} onClick={() => removeFactor(index)} data-testid={`asch-factor-remove-${index}`}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="px-3 py-4 text-xs text-slate-500" data-testid="asch-factor-disabled-state">
                      未启用
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeStep === 'workflow_route' && (
          <div className="space-y-5" data-testid="asch-step-panel-target-scope">
            <div className="rounded-md border border-slate-200 bg-white shadow-sm" data-testid="asch-target-scope-editor">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <div>
                  <div className="inline-flex items-center gap-2 text-base font-bold text-slate-900">
                    <Users className="h-5 w-5 text-indigo-500" />
                    考核对象圈选与审批链路
                  </div>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    确认本方案覆盖的机构范围，系统根据组织架构和默认审批规则生成上报链路预演。
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={targetScopeReady ? 'secondary' : 'destructive'} data-testid="asch-target-scope-readiness">
                    {targetScopeReady ? '对象范围可用' : '对象范围待完善'}
                  </Badge>
                  <Badge variant={workflowRouteReady ? 'secondary' : 'outline'} data-testid="asch-workflow-route-readiness">
                    {workflowRouteReady ? '审批链路可用' : '审批链路待保存确认'}
                  </Badge>
                </div>
              </div>

              <div className="space-y-5 p-5">
                <section>
                  <div className="mb-4">
                    <div className="text-sm font-bold text-slate-900">1. 考核维度与对象</div>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      先选择考核颗粒度，再从真实组织架构中圈选对象。条线级暂缺真实解析规则，保持不可选。
                    </p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-3" data-testid="asch-target-granularity-cards">
                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={() => selectTargetGranularity('sub-branch')}
                      className={`relative flex min-h-32 flex-col rounded-md border p-4 text-left transition-colors ${
                        targetGranularity === 'sub-branch' && primaryTargetGroup.scopeMode === 'MANUAL_SELECTION'
                          ? 'border-blue-400 bg-blue-50 text-blue-900 shadow-sm'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-blue-200'
                      }`}
                      data-testid="asch-granularity-sub-branch"
                    >
                      {targetGranularity === 'sub-branch' && primaryTargetGroup.scopeMode === 'MANUAL_SELECTION' && (
                        <CheckCircle2 className="absolute right-3 top-3 h-4 w-4 text-blue-600" />
                      )}
                      <Building className="mb-3 h-6 w-6 text-blue-500" />
                      <div className="font-semibold">营业部级</div>
                      <p className="mt-1 text-xs leading-5 text-slate-500">针对底层具体网点考核</p>
                      <div className="mt-auto pt-3 text-xs font-medium text-slate-600">
                        已选 {selectedSubBranchCount} 家 / 可选 {subBranchNodes.length} 家
                      </div>
                    </button>

                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={() => selectTargetGranularity('branch')}
                      className={`relative flex min-h-32 flex-col rounded-md border p-4 text-left transition-colors ${
                        targetGranularity === 'branch' && primaryTargetGroup.scopeMode === 'MANUAL_SELECTION'
                          ? 'border-indigo-400 bg-indigo-50 text-indigo-900 shadow-sm'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-200'
                      }`}
                      data-testid="asch-granularity-branch"
                    >
                      {targetGranularity === 'branch' && primaryTargetGroup.scopeMode === 'MANUAL_SELECTION' && (
                        <CheckCircle2 className="absolute right-3 top-3 h-4 w-4 text-indigo-600" />
                      )}
                      <Network className="mb-3 h-6 w-6 text-indigo-500" />
                      <div className="font-semibold">分公司级</div>
                      <p className="mt-1 text-xs leading-5 text-slate-500">针对二级分公司考核</p>
                      <div className="mt-auto pt-3 text-xs font-medium text-slate-600">
                        已选 {selectedBranchCount} 家 / 可选 {branchNodes.length} 家
                      </div>
                    </button>

                    <div
                      className="flex min-h-32 flex-col rounded-md border border-slate-200 bg-slate-50 p-4 text-left text-slate-500"
                      data-testid="asch-granularity-business-line-disabled"
                    >
                      <Layers className="mb-3 h-6 w-6 text-slate-400" />
                      <div className="font-semibold text-slate-700">条线级</div>
                      <p className="mt-1 text-xs leading-5">针对条线总部考核</p>
                      <div className="mt-auto rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
                        缺少已冻结条线 resolver 与 seed，暂不开放
                      </div>
                    </div>
                  </div>
                </section>

                <section className="rounded-md border border-slate-200 bg-slate-50 p-4" data-testid="asch-target-selected-summary">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-base font-bold text-slate-900">考核对象</div>
                      <div className="mt-1 text-sm text-slate-500">
                        {primaryTargetGroup.scopeMode === 'ALL_BRANCHES'
                          ? `全部营业部动态覆盖${detail?.targetCount ? `，已回读 ${detail.targetCount} 家` : ''}`
                          : `${targetGranularityLabel} · 共选中 ${targetCount} 家`}
                      </div>
                    </div>
                    {!readOnly && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setStepTwoSaveState(null);
                          setTargetPickerOpen(true);
                        }}
                        data-testid="asch-target-retune"
                      >
                        <Plus className="mr-1 h-3.5 w-3.5" />
                        {selectedTargetOrgIds.length || primaryTargetGroup.scopeMode === 'ALL_BRANCHES' ? '重新微调名单' : '圈选考核对象'}
                      </Button>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge variant="secondary" className="border border-blue-200 bg-blue-50 text-blue-700">
                      营业部 {primaryTargetGroup.scopeMode === 'ALL_BRANCHES' ? (detail?.targetCount ?? subBranchNodes.length) : selectedSubBranchCount} 家
                    </Badge>
                    <Badge variant="secondary" className="border border-indigo-200 bg-indigo-50 text-indigo-700">
                      分公司 {selectedBranchCount} 家
                    </Badge>
                    {selectedBusinessLineTags.length > 0 ? selectedBusinessLineTags.slice(0, 4).map((tag) => (
                      <Badge key={tag} variant="outline">{tag}</Badge>
                    )) : (
                      <Badge variant="outline">真实组织架构</Badge>
                    )}
                  </div>
                  {primaryTargetGroup.scopeMode === 'MANUAL_SELECTION' && (
                    <div className="mt-4 flex max-h-36 flex-wrap gap-2 overflow-auto" data-testid="asch-target-selected-chips">
                      {selectedTargetOrgs.length > 0 ? selectedTargetOrgs.map(({ orgId, node }) => (
                        <span
                          key={orgId}
                          className="inline-flex max-w-full items-center gap-1 rounded-full border border-indigo-200 bg-white px-2 py-1 text-xs text-indigo-800"
                        >
                          <span className="truncate">{node?.name ?? orgId}</span>
                          <span className="text-[10px] text-indigo-500">{node ? orgTypeLabel(node.type) : '待解析'}</span>
                          {!readOnly && (
                            <button
                              type="button"
                              className="ml-1 rounded-full px-1 text-indigo-400 hover:bg-indigo-50 hover:text-indigo-700"
                              onClick={() => removeTargetOrgSelection(orgId)}
                              aria-label="移除考核对象"
                            >
                              ×
                            </button>
                          )}
                        </span>
                      )) : (
                        <div className="w-full rounded-md border border-dashed border-slate-300 bg-white px-3 py-4 text-center text-xs text-slate-500">
                          还没有圈选考核对象
                        </div>
                      )}
                    </div>
                  )}
                  {scopeSnapshot.length > 0 && (
                    <div className="mt-4 rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-600" data-testid="asch-target-scope-snapshot">
                      <div className="font-semibold text-slate-700">保存回读摘要</div>
                      <div className="mt-2 grid gap-1">
                        {scopeSnapshot.slice(0, 3).map((snapshot, index) => (
                          <div key={`${snapshot.targetGroupId ?? index}`}>
                            {String(snapshot.label ?? snapshot.groupName ?? '对象范围')}：{String(snapshot.targetCount ?? 0)} 家
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {targetResolutionFindings.length > 0 && (
                    <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800" data-testid="asch-target-resolution-findings">
                      {targetResolutionFindings.map((finding, index) => (
                        <div key={`${finding.code ?? index}`}>{String(finding.message ?? finding.code ?? '')}</div>
                      ))}
                    </div>
                  )}
                  <FieldErrors findings={findingsFor(validationFindings, 'targetGroups')} />
                </section>
              </div>
            </div>

            <div className="rounded-md border border-slate-200 bg-white shadow-sm" data-testid="asch-workflow-route-binding">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <div>
                  <div className="inline-flex items-center gap-2 text-base font-bold text-slate-900">
                    <GitBranch className="h-5 w-5 text-indigo-500" />
                    2. 智能审批链路预演
                  </div>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    系统已按当前对象范围生成默认上报路径；保存后仍由真实审批配置和发布前校验确认。
                  </p>
                </div>
                <Badge variant={workflowRouteReady ? 'secondary' : 'outline'}>
                  {workflowRouteReady ? (routeOverrideInUse ? '自定义链路已确认' : '默认链路已确认') : workflowLoading ? '正在读取默认链路' : '保存后确认链路'}
                </Badge>
              </div>
              <div className="space-y-5 p-5">
                {workflowError && (
                  <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700" data-testid="asch-workflow-load-error">
                    {workflowError}
                  </div>
                )}
                {!workflowTemplates.some((template) => template.status === 'ACTIVE' && template.currentVersionId) && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800" data-testid="asch-workflow-no-active-template">
                    当前没有可用的已启用审批链路配置，请先完成流程配置后再发布方案。
                  </div>
                )}

                <div className="rounded-md border border-indigo-200 bg-indigo-50 p-4 text-xs leading-5 text-indigo-900" data-testid="asch-route-customization-actions">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-indigo-950">本方案审批链路微调</div>
                      <p className="mt-1 text-indigo-800">
                        可删除本次不适用的审批节点，并通过节点间的加号恢复已有角色节点；保存后只影响当前方案。
                      </p>
                    </div>
                    <Badge variant={routeOverrideInUse ? 'secondary' : 'outline'}>
                      {routeOverrideInUse ? '已按本方案微调' : '使用默认路径'}
                    </Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={readOnly || !form.workflowBinding?.routeTemplateId}
                      onClick={() => mergeWorkflowRouteOverride({ note: selectedFinalNote || '方案级审批链路自定义调整' })}
                      data-testid="asch-route-customize-enable"
                    >
                      允许微调
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={readOnly || !routeOverrideInUse}
                      onClick={() => updateWorkflowRouteOverride(null)}
                      data-testid="asch-route-customize-reset"
                    >
                      <RefreshCw className="mr-1 h-3.5 w-3.5" />
                      恢复默认路径
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={readOnly || stepTwoBusy || !form.workflowBinding?.routeTemplateId}
                      onClick={() => { void saveStepTwoAndRefetch('route'); }}
                      data-testid="asch-route-customize-save"
                    >
                      {stepTwoBusy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
                      {stepTwoBusy ? '保存中' : '保存审批链路'}
                    </Button>
                  </div>
                  {stepTwoSaveState && (
                    <div
                      className={`mt-3 rounded-md border px-3 py-2 text-xs ${
                        stepTwoSaveState.status === 'error'
                          ? 'border-rose-200 bg-rose-50 text-rose-700'
                          : stepTwoSaveState.status === 'success'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-blue-200 bg-blue-50 text-blue-700'
                      }`}
                      data-testid="asch-step-two-save-status"
                    >
                      {stepTwoSaveState.message}
                    </div>
                  )}
                </div>

                <div className="grid gap-3 md:grid-cols-3" data-testid="asch-workflow-route-summary">
                  <SummaryCell label="当前路径" value={routeOverrideInUse ? '本方案已微调' : '默认上报路径'} />
                  <SummaryCell label="确认状态" value={workflowStatusLabel(workflowTemplateDetail?.status ?? defaultWorkflowTemplate?.status)} tone={workflowRouteReady ? 'ok' : 'warn'} />
                  <SummaryCell
                    label="预演节点"
                    value={String(workflowSummary?.nodeCount ?? workflowTemplateDetail?.nodeCount ?? effectiveApprovalChainPreviews.reduce((sum, chain) => sum + chain.nodes.length + 1, 0))}
                  />
                </div>

                <div className="space-y-4" data-testid="asch-workflow-chain-list">
                  {effectiveApprovalChainPreviews.map((chain, chainIndex) => {
                    const chainHiddenNodes = approvalChainPreviews
                      .find((item) => item.id === chain.id)
                      ?.nodes.filter((node) => disabledWorkflowNodeIds.has(node.nodeId)) ?? [];
                    const insertableHiddenNodes = chainHiddenNodes.filter((node) => !node.isFinal);
                    const visibleNodes = chain.nodes.filter((node) => !node.isFinal);
                    const canOpenInsertNode = !readOnly && Boolean(form.workflowBinding?.routeTemplateId);
                    const renderInsertPoint = (insertIndex: number) => {
                      const insertDraftOpen =
                        workflowInsertDraft?.chainId === chain.id &&
                        workflowInsertDraft.insertIndex === insertIndex;
                      const selectedInsertNodeId =
                        insertDraftOpen && insertableHiddenNodes.some((node) => node.nodeId === workflowInsertDraft?.nodeId)
                          ? workflowInsertDraft.nodeId
                          : insertableHiddenNodes[0]?.nodeId ?? '';
                      return (
                        <>
                        <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                        <Popover
                          open={insertDraftOpen}
                          onOpenChange={(open) => {
                            if (open) {
                              setWorkflowInsertDraft({
                                chainId: chain.id,
                                insertIndex,
                                nodeId: insertableHiddenNodes[0]?.nodeId ?? '',
                              });
                            } else if (insertDraftOpen) {
                              setWorkflowInsertDraft(null);
                            }
                          }}
                        >
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition ${
                                canOpenInsertNode
                                  ? 'border-indigo-200 bg-white text-indigo-600 hover:bg-indigo-50'
                                  : 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-300'
                              }`}
                              disabled={!canOpenInsertNode}
                              title="插入审核节点"
                              aria-label="插入审核节点"
                              data-testid={`asch-workflow-insert-open-${chain.id}-${insertIndex}`}
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[22rem] border border-slate-200 bg-white p-4 text-xs shadow-lg" align="center">
                            <div className="space-y-4">
                              <div>
                                <div className="text-sm font-semibold text-slate-900">插入审核节点</div>
                                <div className="mt-1 text-slate-500">仅可恢复当前链路中已删除的已知节点，并插入到本加号所在位置。</div>
                              </div>
                              <div className="grid gap-2">
                                <div className="font-medium text-slate-700">插入方式</div>
                                <div className="grid gap-2">
                                  <div className="flex items-center justify-between rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-indigo-800">
                                    <span className="flex items-center gap-2">
                                      <span className="h-2.5 w-2.5 rounded-full border-2 border-indigo-600 bg-white ring-2 ring-indigo-100" />
                                      按岗位角色
                                    </span>
                                    <Badge variant="secondary" className="bg-white text-indigo-700">可用</Badge>
                                  </div>
                                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-400">
                                    <div className="flex items-center gap-2">
                                      <span className="h-2.5 w-2.5 rounded-full border border-slate-300" />
                                      按指定人员
                                    </div>
                                    <div className="mt-1 pl-4 text-[11px] leading-4 text-slate-500">
                                      待真实人员目录和审计契约补齐后开放。
                                    </div>
                                  </div>
                                </div>
                              </div>
                              <label className="grid gap-2 font-medium text-slate-700">
                                选择可插入的已知节点
                                {insertableHiddenNodes.length > 0 ? (
                                  <Select
                                    value={selectedInsertNodeId}
                                    onValueChange={(nodeId) =>
                                      setWorkflowInsertDraft({
                                        chainId: chain.id,
                                        insertIndex,
                                        nodeId,
                                      })
                                    }
                                  >
                                    <SelectTrigger data-testid={`asch-workflow-insert-node-select-${chain.id}-${insertIndex}`}>
                                      <span className="truncate">
                                        {insertableHiddenNodes.find((node) => node.nodeId === selectedInsertNodeId)?.label ?? '选择节点'}
                                      </span>
                                    </SelectTrigger>
                                    <SelectContent>
                                      {insertableHiddenNodes.map((node) => (
                                        <SelectItem key={node.nodeId} value={node.nodeId}>{node.label}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <div
                                    className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-500"
                                    data-testid={`asch-workflow-insert-empty-${chain.id}-${insertIndex}`}
                                  >
                                    暂无可恢复节点
                                  </div>
                                )}
                              </label>
                              <Button
                                type="button"
                                size="sm"
                                className="w-full justify-center"
                                disabled={!selectedInsertNodeId}
                                onClick={() => insertWorkflowNodeAt(chain, insertIndex, selectedInsertNodeId)}
                                data-testid={`asch-workflow-insert-confirm-${chain.id}-${insertIndex}`}
                              >
                                确认插入
                              </Button>
                            </div>
                          </PopoverContent>
                        </Popover>
                      </>
                      );
                    };
                    return (
                      <div key={chain.id} className="rounded-md border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600" data-testid={`asch-workflow-chain-${chainIndex}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="font-semibold text-slate-800">{chain.title}</div>
                            <div className="mt-1 text-[11px] text-slate-500">{chain.subtitle}</div>
                          </div>
                          <Badge variant="outline">{routeOverrideInUse ? '本方案微调预演' : '默认路径预演'}</Badge>
                        </div>
                        <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-1">
                          <Badge className="shrink-0 border-slate-200 bg-white px-3 py-2 text-slate-600 hover:bg-white">
                            被考核机构（发起）
                          </Badge>
                          {renderInsertPoint(0)}
                          {visibleNodes.map((node, nodeIndex) => (
                            <React.Fragment key={`${chain.id}-${node.nodeId}`}>
                              {renderWorkflowNodeCapsule(node, 'delete')}
                              {renderInsertPoint(nodeIndex + 1)}
                            </React.Fragment>
                          ))}
                          <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                          <Badge className="shrink-0 rounded-full border border-slate-200 bg-slate-100 px-4 py-2 text-slate-600 hover:bg-slate-100">
                            {workflowFinalNodeText(selectedFinalNodePreview)}
                          </Badge>
                        </div>
                        {chainHiddenNodes.length > 0 && (
                          <div className="mt-3 text-[11px] text-slate-500">
                            已移除节点可通过加号恢复：{chainHiddenNodes.map((node) => node.label).join('、')}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {disabledWorkflowNodeIds.size > 0 && (
                  <div className="rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-600" data-testid="asch-workflow-disabled-nodes">
                    <div className="font-semibold text-slate-800">已移除节点</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {approvalChainPreviews.flatMap((chain) =>
                        chain.nodes
                          .filter((node) => disabledWorkflowNodeIds.has(node.nodeId))
                          .map((node) => (
                            <React.Fragment key={`${chain.id}-${node.nodeId}`}>
                              {renderWorkflowNodeCapsule(node, 'restore')}
                            </React.Fragment>
                          )),
                      )}
                    </div>
                  </div>
                )}

                <div className="rounded-md border border-slate-200 bg-slate-100 p-4" data-testid="asch-global-final-approver">
                  <div className="flex items-center gap-3">
                    <ShieldCheck className="h-8 w-8 shrink-0 text-slate-500" />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-slate-800">全局终审节点</div>
                      <p className="mt-1 text-sm text-slate-500">
                        所有分组最终汇聚到同一个终审角色；具体审批人指派待真实人员目录和审计契约补齐后开放。
                      </p>
                      <Popover>
                        <PopoverTrigger
                          type="button"
                          className="mt-3 inline-flex rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
                          data-testid="asch-global-final-approver-trigger"
                        >
                          {workflowFinalNodeText(selectedFinalNodePreview)}
                        </PopoverTrigger>
                        <PopoverContent className="w-80 border border-slate-200 bg-white p-4 text-xs shadow-lg" align="start">
                          <div className="space-y-3">
                            <div>
                              <div className="text-sm font-semibold text-slate-900">{workflowFinalNodeText(selectedFinalNodePreview)}</div>
                              <div className="mt-1 text-slate-500">总部终审</div>
                            </div>
                            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-600">
                              指定人员待真实人员目录和审计契约补齐后开放。
                            </div>
                            {finalNodeCandidates.length > 0 && (
                              <div className="space-y-2">
                                <div className="font-medium text-slate-700">选择已有终审角色</div>
                                <div className="flex flex-wrap gap-2">
                                  {finalNodeCandidates.map((node) => (
                                    <Button
                                      key={`${node.chainId}-${node.nodeId}`}
                                      type="button"
                                      size="sm"
                                      variant={selectedFinalNodePreview?.nodeId === node.nodeId ? 'default' : 'outline'}
                                      disabled={readOnly}
                                      onClick={() => selectFinalWorkflowNode(node.chainId, node.nodeId)}
                                      data-testid={`asch-global-final-approver-option-${node.nodeId}`}
                                    >
                                      {node.label}
                                    </Button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </PopoverContent>
                      </Popover>
                      {finalNodeCandidates.length === 0 && (
                        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                          暂未回读到可选择的终审角色，请先保存草稿并确认审批路径。
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {workflowRouteFindings.length > 0 && (
                  <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800" data-testid="asch-workflow-readiness-findings">
                    {workflowRouteFindings.map((finding, index) => (
                      <div key={`${finding.code ?? index}`}>{String(finding.message ?? finding.code ?? '')}</div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <Sheet
              open={targetPickerOpen}
              onOpenChange={(open) => {
                if (stepTwoBusy) return;
                setTargetPickerOpen(open);
              }}
            >
              <SheetContent className="w-full overflow-hidden bg-slate-50 p-0 sm:max-w-[640px]">
                <SheetHeader className="border-b border-slate-200 bg-white p-5">
                  <SheetTitle>圈选考核对象</SheetTitle>
                  <SheetDescription>
                    当前按{targetGranularityLabel}圈选；保存会写入真实 targetGroups，并从后端回读对象摘要。
                  </SheetDescription>
                </SheetHeader>
                <div className="min-h-0 flex-1 overflow-auto p-5">
                  <div className="mb-4 grid gap-3 sm:grid-cols-3">
                    <Button
                      type="button"
                      variant={targetGranularity === 'sub-branch' ? 'default' : 'outline'}
                      disabled={readOnly}
                      onClick={() => selectTargetGranularity('sub-branch')}
                      data-testid="asch-target-picker-sub-branch"
                    >
                      营业部级
                    </Button>
                    <Button
                      type="button"
                      variant={targetGranularity === 'branch' ? 'default' : 'outline'}
                      disabled={readOnly}
                      onClick={() => selectTargetGranularity('branch')}
                      data-testid="asch-target-picker-branch"
                    >
                      分公司级
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled
                      title="缺少已冻结条线 resolver 与 seed"
                      data-testid="asch-target-picker-business-line-disabled"
                    >
                      条线级
                    </Button>
                  </div>

                  <div className="mb-4 rounded-md border border-slate-200 bg-white p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs text-slate-500">
                        已选 {selectedTargetOrgIds.length} 个对象；当前只允许选择{targetGranularityLabel === '分公司级' ? '分公司' : '营业部'}节点。
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={readOnly}
                          onClick={() => updateTargetScopeMode('ALL_BRANCHES')}
                          data-testid="asch-target-mode-all-branches"
                        >
                          全部营业部动态覆盖
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={readOnly || selectedTargetOrgIds.length === 0}
                          onClick={() => updatePrimaryTargetGroup({ members: [] })}
                          data-testid="asch-target-clear-selection"
                        >
                          清空
                        </Button>
                      </div>
                    </div>
                  </div>

                  {primaryTargetGroup.scopeMode === 'ALL_BRANCHES' ? (
                    <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900" data-testid="asch-target-all-branches-note">
                      <div className="font-semibold">已选择全部营业部动态覆盖</div>
                      <p className="mt-1 text-xs leading-5 text-emerald-800">
                        保存或校验时由后端按真实组织数据解析对象数量；前端不静态写入名单。
                      </p>
                      {!readOnly && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-3 bg-white"
                          onClick={() => selectTargetGranularity('sub-branch')}
                          data-testid="asch-target-back-to-manual"
                        >
                          改为手动圈选
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-md border border-slate-200 bg-white" data-testid="asch-target-org-tree-selector">
                      <div className="border-b border-slate-200 px-3 py-2">
                        <div className="text-sm font-semibold text-slate-800">组织架构名单</div>
                        <div className="text-xs text-slate-500">组织树来自真实 systemApi.getOrgTree()。</div>
                      </div>
                      <div className="max-h-[520px] overflow-auto p-2">
                        {orgTreeLoading ? (
                          <div className="flex items-center gap-2 px-3 py-6 text-sm text-slate-500">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            正在读取组织架构...
                          </div>
                        ) : orgTreeError ? (
                          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700" data-testid="asch-target-org-tree-error">
                            {orgTreeError}
                          </div>
                        ) : orgTree ? (
                          renderTargetOrgTree(orgTree)
                        ) : (
                          <div className="px-3 py-6 text-sm text-slate-500">暂无可用组织架构</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <SheetFooter className="border-t border-slate-200 bg-white p-4">
                  <div className="flex w-full flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 flex-1 text-xs">
                      {stepTwoSaveState ? (
                        <div
                          className={`rounded-md border px-3 py-2 ${
                            stepTwoSaveState.status === 'error'
                              ? 'border-rose-200 bg-rose-50 text-rose-700'
                              : stepTwoSaveState.status === 'success'
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : 'border-blue-200 bg-blue-50 text-blue-700'
                          }`}
                          data-testid="asch-target-save-status"
                        >
                          {stepTwoSaveState.message}
                        </div>
                      ) : (
                        <span className="text-slate-500">保存成功后会立即回读后端对象摘要；失败时本面板保持打开。</span>
                      )}
                    </div>
                    <Button type="button" variant="outline" disabled={stepTwoBusy} onClick={() => setTargetPickerOpen(false)}>
                      关闭
                    </Button>
                    <Button
                      type="button"
                      disabled={readOnly || stepTwoBusy}
                      onClick={() => {
                        void saveStepTwoAndRefetch('target').then((saved) => {
                          if (saved) setTargetPickerOpen(false);
                        });
                      }}
                      data-testid="asch-target-save-refetch"
                    >
                      {stepTwoBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      {stepTwoBusy ? '保存回读中' : '保存并回读'}
                    </Button>
                  </div>
                </SheetFooter>
              </SheetContent>
            </Sheet>
          </div>
        )}

        {activeStep === 'scheduling_dispatch' && (
          <SchemeDispatchScheduleStep
            scheduleBinding={form.scheduleBinding}
            frequency={form.frequency}
            frequencyOptions={frequencyOptions}
            readOnly={readOnly}
            commandLoading={commandLoading}
            scheduleSummary={scheduleSummary}
            schedulingReadiness={schedulingDispatchReadiness}
            schemeId={detail?.schemeId}
            nextRunAt={detail?.nextRunAt ?? null}
            lastRunAt={detail?.lastRunAt ?? null}
            onChange={(scheduleBinding) => updateForm({ scheduleBinding })}
            onSave={onSave}
            onRefetch={onRefetch}
          />
        )}

        {activeStep === 'simulation_publish' && (
          <SchemeSimulationPublishStep
            detail={detail}
            readOnly={readOnly}
            canPublish={canPublish}
            publishCommandReason={publishCommandReason}
            targetCount={targetCount}
            mandatoryReady={mandatoryReady}
            readinessRows={readinessRows}
            readinessSummary={readinessSummary}
            publishSummary={publishSummary}
            sourceTraceSummary={sourceTraceSummary}
            commandAuditSummary={commandAuditSummary}
            commandAudit={commandAudit}
            schemeSnapshot={schemeSnapshot}
            snapshotReadiness={snapshotReadiness}
            simulationReferencePeriod={simulationReferencePeriod}
            simulationPolicy={simulationPolicy}
            simulationLoading={simulationLoading}
            simulationError={simulationError}
            simulationDetail={simulationDetail}
            simulationSkipped={simulationSkipped}
            onSimulationReferencePeriodChange={setSimulationReferencePeriod}
            onSimulationPolicyChange={setSimulationPolicy}
            onRunSimulation={runSimulation}
            onSkipSimulation={skipSimulation}
          />
        )}

        {validationFindings.length > 0 && (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700" data-testid="asch-validation-findings">
            {validationFindings.map((finding, index) => (
              <div key={`${finding.code ?? index}`}>
                {String(finding.message ?? finding.code ?? '请检查当前配置')}
              </div>
            ))}
          </div>
        )}

    </AssessmentSchemeConfigurator>
  );
}

function SummaryCell({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'ok' | 'warn' }) {
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

function FieldErrors({ findings }: { findings: Array<Record<string, unknown>> }) {
  if (!findings.length) return null;
  return (
    <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700" data-testid="asch-field-errors">
      {findings.map((finding, index) => (
        <div key={`${finding.code ?? index}`}>{String(finding.message ?? finding.code ?? '请检查当前配置')}</div>
      ))}
    </div>
  );
}

function DeferredBlock({ testId, title, body }: { testId: string; title: string; body: string }) {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-3" data-testid={testId}>
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div>
          <div className="text-sm font-semibold text-amber-900">{title}</div>
          <p className="mt-1 text-xs leading-5 text-amber-800">{body}</p>
        </div>
      </div>
    </div>
  );
}
