import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { useLocation, useNavigate } from 'react-router-dom';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { 
  Plus, 
  LayoutList, 
  Calendar as CalendarIcon, 
  Search, 
  Filter, 
  MoreVertical,
  PlayCircle,
  PauseCircle,
  FileText,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  RotateCcw,
  Send,
  ShieldCheck
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { inspectionApi, notificationApi, systemApi, taskApi } from '../../services/api';
import type { ConfigDictionaryItem } from '../../services/api';
import {
  getDictionaryLabel,
  getInspectionPhaseLabel,
  getInspectionPhaseShortLabel,
  getInspectionProgressIndex,
  INSPECTION_STATUS_DICTIONARY,
  INSPECTION_PROGRESS_PHASES,
} from '../../services/dictionaryMapper';
import { InspectionPlan, InspectionPhase, InspectionStatus } from '../../types';
import InspectionPlanWizard from './InspectionPlanWizard';
import EKPLaunchOverlay from './EKPLaunchOverlay';
import EKPStatusCard from './EKPStatusCard';
import InspectionPlanHeader from './InspectionPlanHeader';
import type {
  InspectionPlanTransitionAction,
  InspectionPlanTransitionPayload,
} from './InspectionPlanHeader';
import InteractiveStageStepper from './InteractiveStageStepper';
import StageWorkspaceArea from './StageWorkspaceArea';
import WorkingPaperWorkspace from './WorkingPaperWorkspace';

const PHASES: InspectionPhase[] = [...INSPECTION_PROGRESS_PHASES];
const PHASE_LABELS = PHASES.map(getInspectionPhaseShortLabel);
const INSPECTION_PLAN_LIST_ROUTE = '/inspections/hq-plans';
const INSPECTION_PLAN_ROUTE_PREFIXES = [
  '/inspections/hq-plans/',
  '/compliance/hq/inspection/plans/',
  '/hq/inspection/plans/',
];
const INSPECTION_PLAN_PAGE_SIZE_OPTIONS = [10, 20, 50] as const;
const DEFAULT_INSPECTION_PLAN_PAGE_SIZE = 10;
const INSPECTION_PLAN_SUMMARY_PAGE_SIZE = 100;
type StageTab = 'prep' | 'exec' | 'report' | 'rectify';

type InspectionPlanWizardData = {
  title: string;
  inspectCode: string;
  type: InspectionPlan['type'];
  frequency: InspectionPlan['frequency'];
  confidentialityLevel?: string;
  leader: string;
  leaderUserId?: string;
  teamMembers: string[];
  teamMemberUserIds?: string[];
  targetDept: string;
  targetOrgIds?: string[];
  targetPersonnelIds?: string[];
  startDate: string;
  endDate: string;
  files?: Array<{ attachmentType: string; fileId: string }>;
};

// --- Subcomponents ---

const PhaseProgressBar = ({ currentPhase, progress }: { currentPhase: InspectionPhase, progress: number }) => {
  const currentIndex = getInspectionProgressIndex(currentPhase);

  return (
    <div className="flex flex-col w-full max-w-[240px]">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-gray-700">{getInspectionPhaseLabel(currentPhase)}</span>
        <span className="text-xs font-bold text-blue-600">{progress}%</span>
      </div>
      <div className="flex items-center space-x-1">
        {PHASES.map((phase, idx) => {
          const isCompleted = idx < currentIndex;
          const isActive = idx === currentIndex;
          const isPending = idx > currentIndex;

          let bgColor = 'bg-gray-200';
          if (isCompleted) bgColor = 'bg-blue-500';
          if (isActive) bgColor = 'bg-blue-400 animate-pulse';

          return (
            <div key={phase} className="flex-1 flex flex-col items-center group relative">
              <div className={`h-2 w-full rounded-full ${bgColor} transition-colors duration-300`} />
              {/* Tooltip */}
              <div className="absolute -bottom-6 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-gray-500 whitespace-nowrap">
                {PHASE_LABELS[idx]}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const StatusBadge = ({ status }: { status: InspectionStatus }) => {
  switch (status) {
    case 'DRAFT':
      return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">草稿</span>;
    case 'APPROVING':
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping mr-1.5"></span>
          审批中
        </span>
      );
    case 'IN_PROGRESS':
      return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">进行中</span>;
    case 'COMPLETED':
      return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">已结项</span>;
    case 'SUSPENDED':
      return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">已暂停</span>;
    case 'TERMINATED':
      return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-900 text-slate-100 border border-slate-800">已终止</span>;
    default:
      return null;
  }
};

const newIdempotencyKey = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : '操作失败';

const reportPreparationBlocker = (plan: InspectionPlan | null) => {
  const blockers = plan?.reportReadiness?.blockers ?? [];
  return blockers[0]?.message ?? null;
};

const hasReportPreparationAction = (plan: InspectionPlan | null) =>
  Boolean(plan?.allowedActions?.includes('enter_report_preparation'));

const hasPlanAction = (plan: InspectionPlan | null, action: InspectionPlanTransitionAction) =>
  Boolean(plan?.allowedActions?.includes(action));

const LIST_VISIBLE_ACTIONS: InspectionPlanTransitionAction[] = [
  'submit_approval',
  'approve',
  'launch',
  'suspend',
  'resume',
  'complete',
];

const PLAN_ACTION_META: Record<InspectionPlanTransitionAction, {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  buttonClass: string;
}> = {
  submit_approval: {
    label: '提交审批',
    icon: Send,
    buttonClass: 'text-indigo-700 border-indigo-200 hover:bg-indigo-50',
  },
  approve: {
    label: '批准',
    icon: ShieldCheck,
    buttonClass: 'text-emerald-700 border-emerald-200 hover:bg-emerald-50',
  },
  launch: {
    label: '启动',
    icon: PlayCircle,
    buttonClass: 'text-blue-700 border-blue-200 hover:bg-blue-50',
  },
  suspend: {
    label: '暂停',
    icon: PauseCircle,
    buttonClass: 'text-amber-700 border-amber-200 hover:bg-amber-50',
  },
  resume: {
    label: '恢复',
    icon: RotateCcw,
    buttonClass: 'text-emerald-700 border-emerald-200 hover:bg-emerald-50',
  },
  terminate: {
    label: '终止',
    icon: AlertCircle,
    buttonClass: 'text-rose-700 border-rose-200 hover:bg-rose-50',
  },
  complete: {
    label: '完成',
    icon: CheckCircle2,
    buttonClass: 'text-slate-700 border-slate-200 hover:bg-slate-50',
  },
  enter_report_preparation: {
    label: '进入报告编制',
    icon: FileText,
    buttonClass: 'text-emerald-700 border-emerald-200 hover:bg-emerald-50',
  },
};

const PLAN_DICTIONARY_TYPES = ['inspection_plan_type', 'inspection_plan_frequency'];

type InspectionPlanListFilters = {
  year?: string;
  type?: string;
  frequency?: string;
  status?: string;
  keyword?: string;
};

type InspectionPlanFilterDraft = {
  year: string;
  types: string[];
  frequencies: string[];
  status: string;
  keyword: string;
};

const ALL_STATUS_FILTER = 'ALL';
const YEAR_FILTER_PATTERN = /^\d{4}$/;

const DEFAULT_FILTER_DRAFT: InspectionPlanFilterDraft = {
  year: '2026',
  types: [],
  frequencies: [],
  status: ALL_STATUS_FILTER,
  keyword: '',
};

const DEFAULT_CALENDAR_COLORS: Record<string, string> = {
  ROUTINE_INSPECTION: '#2563eb',
  SPECIAL_INSPECTION: '#7c3aed',
  DEPARTURE_AUDIT: '#ea580c',
};

const BADGE_TONE_CLASSES: Record<string, string> = {
  blue: 'bg-blue-50 text-blue-700 border-blue-100',
  purple: 'bg-purple-50 text-purple-700 border-purple-100',
  orange: 'bg-orange-50 text-orange-700 border-orange-100',
  sky: 'bg-sky-50 text-sky-700 border-sky-100',
  slate: 'bg-slate-50 text-slate-700 border-slate-100',
};

const dictionaryErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : '配置字典加载失败';

const badgeClassFor = (item?: ConfigDictionaryItem) => {
  const tone = item?.uiMeta?.badgeTone;
  return typeof tone === 'string' && BADGE_TONE_CLASSES[tone]
    ? BADGE_TONE_CLASSES[tone]
    : BADGE_TONE_CLASSES.purple;
};

const calendarColorFor = (items: ConfigDictionaryItem[], code: string) => {
  const configured = items.find(item => item.dictCode === code)?.uiMeta?.calendarColor;
  return typeof configured === 'string' && configured.trim()
    ? configured
    : (DEFAULT_CALENDAR_COLORS[code] ?? '#64748b');
};

const segmentStyle = (color: string, opacity = 1): React.CSSProperties => ({
  backgroundColor: color,
  opacity,
});

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const CALENDAR_MONTH_WIDTH = 120;
const CALENDAR_MIN_WIDTH = 900;

const parsePlanDate = (value?: string): Date | null => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
};

const formatMonth = (date: Date) =>
  `${String(date.getFullYear()).slice(2)}-${String(date.getMonth() + 1).padStart(2, '0')}`;

const formatShortDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const buildTimelineMonths = (minDate: Date, maxDate: Date) => {
  const months: Date[] = [];
  const cursor = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  const end = new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);
  while (cursor <= end) {
    months.push(new Date(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
};

const csvFromKnownCodes = (values: string[], allowedCodes: Set<string>) => {
  const filtered = values.map(item => item.trim()).filter(item => allowedCodes.has(item));
  return filtered.length ? Array.from(new Set(filtered)).join(',') : undefined;
};

const buildPlanFilters = (
  draft: InspectionPlanFilterDraft,
  allowedTypeCodes: Set<string>,
  allowedFrequencyCodes: Set<string>,
): InspectionPlanListFilters => {
  const keyword = draft.keyword.trim();
  const year = draft.year.trim();
  return {
    year: YEAR_FILTER_PATTERN.test(year) ? year : undefined,
    type: csvFromKnownCodes(draft.types, allowedTypeCodes),
    frequency: csvFromKnownCodes(draft.frequencies, allowedFrequencyCodes),
    status: draft.status && draft.status !== ALL_STATUS_FILTER ? draft.status : undefined,
    keyword: keyword || undefined,
  };
};

const loadFilteredPlanSummary = async (
  filters: InspectionPlanListFilters,
): Promise<InspectionPlan[]> => {
  const firstPage = await inspectionApi.getPlans({
    ...filters,
    page: 1,
    pageSize: INSPECTION_PLAN_SUMMARY_PAGE_SIZE,
  });
  const totalPages = Math.ceil(firstPage.total / INSPECTION_PLAN_SUMMARY_PAGE_SIZE);
  if (totalPages <= 1) return firstPage.items;

  const restPages = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) =>
      inspectionApi.getPlans({
        ...filters,
        page: index + 2,
        pageSize: INSPECTION_PLAN_SUMMARY_PAGE_SIZE,
      }),
    ),
  );
  return [
    ...firstPage.items,
    ...restPages.flatMap(page => page.items),
  ];
};

const stageTabForPhase = (phase: InspectionPhase): StageTab => {
  const index = getInspectionProgressIndex(phase);
  if (index <= 0) return 'prep';
  if (index === 1) return 'exec';
  if (index === 2) return 'report';
  return 'rectify';
};

const stageTabFromSearch = (search: string): StageTab | null => {
  const tab = new URLSearchParams(search).get('tab');
  if (tab === 'prep' || tab === 'exec' || tab === 'report' || tab === 'rectify') {
    return tab;
  }
  return null;
};

const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const planIdFromInspectionPlanPath = (pathname: string): string | null => {
  for (const prefix of INSPECTION_PLAN_ROUTE_PREFIXES) {
    if (pathname.startsWith(prefix)) {
      const planId = pathname.slice(prefix.length).split('/')[0];
      return planId ? safeDecode(planId) : null;
    }
  }
  return null;
};

const isInspectionPlanListPath = (pathname: string) =>
  pathname === INSPECTION_PLAN_LIST_ROUTE || pathname === '/hq/inspection/plans';

// --- Main Dashboard Component ---

export default function InspectionDashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const detailRoutePlanId = useMemo(
    () => planIdFromInspectionPlanPath(location.pathname),
    [location.pathname],
  );
  const [view, setView] = useState<'list' | 'calendar' | 'detail' | 'workspace'>('list');
  const [selectedPlan, setSelectedPlan] = useState<InspectionPlan | null>(null);
  const [isLoadingPlanDetail, setIsLoadingPlanDetail] = useState(false);
  const [planDetailError, setPlanDetailError] = useState<string | null>(null);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<StageTab>('exec');

  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filterDraft, setFilterDraft] = useState<InspectionPlanFilterDraft>(DEFAULT_FILTER_DRAFT);
  const [appliedFilters, setAppliedFilters] = useState<InspectionPlanListFilters>({});
  const [planTypeOptions, setPlanTypeOptions] = useState<ConfigDictionaryItem[]>([]);
  const [frequencyOptions, setFrequencyOptions] = useState<ConfigDictionaryItem[]>([]);
  const [isLoadingDictionaries, setIsLoadingDictionaries] = useState(true);
  const [dictionaryLoadError, setDictionaryLoadError] = useState<string | null>(null);

  const [plans, setPlans] = useState<InspectionPlan[]>([]);
  const [summaryPlans, setSummaryPlans] = useState<InspectionPlan[]>([]);
  const [isLoadingPlans, setIsLoadingPlans] = useState(true);
  const [planLoadError, setPlanLoadError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_INSPECTION_PLAN_PAGE_SIZE);
  const [totalPlans, setTotalPlans] = useState(0);
  const totalPages = Math.max(1, Math.ceil(totalPlans / pageSize));
  
  // EKP State
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchingPlanId, setLaunchingPlanId] = useState<string | null>(null);
  const [viewingEKPPlan, setViewingEKPPlan] = useState<InspectionPlan | null>(null);
  const [transitioningPlanId, setTransitioningPlanId] = useState<string | null>(null);
  const [transitioningPlanAction, setTransitioningPlanAction] = useState<InspectionPlanTransitionAction | null>(null);

  const planTypeByCode = useMemo(
    () => new Map(planTypeOptions.map(item => [item.dictCode, item])),
    [planTypeOptions],
  );
  const frequencyByCode = useMemo(
    () => new Map(frequencyOptions.map(item => [item.dictCode, item])),
    [frequencyOptions],
  );
  const planTypeCodeSet = useMemo(
    () => new Set(planTypeOptions.map(item => item.dictCode)),
    [planTypeOptions],
  );
  const frequencyCodeSet = useMemo(
    () => new Set(frequencyOptions.map(item => item.dictCode)),
    [frequencyOptions],
  );
  const selectedFilterYearDate = useMemo(() => {
    const year = Number(filterDraft.year);
    return YEAR_FILTER_PATTERN.test(filterDraft.year) && Number.isFinite(year)
      ? new Date(year, 0, 1)
      : null;
  }, [filterDraft.year]);
  const hasActiveFilters = useMemo(
    () => Object.values(appliedFilters).some(value => Boolean(value)),
    [appliedFilters],
  );

  // Statistics
  const stats = useMemo(() => {
    const now = new Date();
    return {
      total: totalPlans,
      inProgress: summaryPlans.filter(p => p.status === 'IN_PROGRESS').length,
      pendingRectification: summaryPlans.filter(p => p.currentPhase === 'RECTIFICATION' && p.status !== 'COMPLETED').length,
      overdue: summaryPlans.filter((p) => {
        const endDate = parsePlanDate(p.plannedEndDate);
        return Boolean(endDate && endDate < now && p.status !== 'COMPLETED');
      }).length
    };
  }, [summaryPlans, totalPlans]);

  // Calendar/Gantt Calculations
  const ganttData = useMemo(() => {
    const datedPlans = summaryPlans
      .map((plan) => {
        const startDate = parsePlanDate(plan.plannedStartDate);
        const endDate = parsePlanDate(plan.plannedEndDate);
        if (!startDate || !endDate || endDate < startDate) return null;
        return { plan, startDate, endDate };
      })
      .filter((item): item is { plan: InspectionPlan; startDate: Date; endDate: Date } => Boolean(item));

    if (datedPlans.length === 0) {
      return {
        minDate: new Date(),
        maxDate: new Date(),
        months: [] as Date[],
        totalDuration: MS_PER_DAY,
        plans: [] as Array<InspectionPlan & {
          startDate: Date;
          endDate: Date;
          left: number;
          width: number;
          color: string;
          typeLabel: string;
          frequencyLabel: string;
          statusLabel: string;
        }>,
        noDateCount: summaryPlans.length,
        currentDateLeft: null as number | null,
      };
    }

    const rawMinDate = new Date(Math.min(...datedPlans.map(item => item.startDate.getTime())) - 15 * MS_PER_DAY);
    const rawMaxDate = new Date(Math.max(...datedPlans.map(item => item.endDate.getTime())) + 15 * MS_PER_DAY);
    const minDate = new Date(rawMinDate.getFullYear(), rawMinDate.getMonth(), 1);
    const maxDate = new Date(rawMaxDate.getFullYear(), rawMaxDate.getMonth() + 1, 0);
    const totalDuration = Math.max(maxDate.getTime() - minDate.getTime(), MS_PER_DAY);
    const months = buildTimelineMonths(minDate, maxDate);
    const now = new Date();
    const currentDateLeft = now >= minDate && now <= maxDate
      ? ((now.getTime() - minDate.getTime()) / totalDuration) * 100
      : null;

    const mappedPlans = datedPlans.map(({ plan, startDate, endDate }) => {
      const normalizedEnd = new Date(Math.max(endDate.getTime(), startDate.getTime() + MS_PER_DAY));
      const left = ((startDate.getTime() - minDate.getTime()) / totalDuration) * 100;
      const width = Math.max(((normalizedEnd.getTime() - startDate.getTime()) / totalDuration) * 100, 2);
      return {
        ...plan,
        startDate,
        endDate,
        left: Math.max(0, Math.min(left, 100)),
        width: Math.min(width, 100),
        color: calendarColorFor(planTypeOptions, plan.type),
        typeLabel: planTypeByCode.get(plan.type)?.dictLabel ?? plan.type,
        frequencyLabel: frequencyByCode.get(plan.frequency)?.dictLabel ?? plan.frequency,
        statusLabel: getDictionaryLabel('inspection_status', plan.status),
      };
    });

    return {
      minDate,
      maxDate,
      totalDuration,
      months,
      plans: mappedPlans,
      noDateCount: summaryPlans.length - datedPlans.length,
      currentDateLeft,
    };
  }, [frequencyByCode, planTypeByCode, planTypeOptions, summaryPlans]);

  const loadPlanDictionaries = useCallback(async () => {
    setIsLoadingDictionaries(true);
    setDictionaryLoadError(null);
    try {
      const response = await systemApi.getConfigDictionaries(PLAN_DICTIONARY_TYPES);
      setPlanTypeOptions(response.dictionaries.inspection_plan_type ?? []);
      setFrequencyOptions(response.dictionaries.inspection_plan_frequency ?? []);
    } catch (error) {
      setPlanTypeOptions([]);
      setFrequencyOptions([]);
      setDictionaryLoadError(dictionaryErrorMessage(error));
    } finally {
      setIsLoadingDictionaries(false);
    }
  }, []);

  const loadPlanPage = useCallback(async (
    filters: InspectionPlanListFilters = {},
    page = 1,
    nextPageSize = DEFAULT_INSPECTION_PLAN_PAGE_SIZE,
  ) => {
    setIsLoadingPlans(true);
    setPlanLoadError(null);
    try {
      const data = await inspectionApi.getPlans({
        ...filters,
        page,
        pageSize: nextPageSize,
      });
      setPlans(data.items);
      setTotalPlans(data.total);
      if (data.page !== page) setCurrentPage(data.page);
      if (data.pageSize !== nextPageSize) setPageSize(data.pageSize);
      return data;
    } catch (error) {
      setPlanLoadError(error instanceof Error ? error.message : '检查计划加载失败');
      throw error;
    } finally {
      setIsLoadingPlans(false);
    }
  }, []);

  const loadPlanSummary = useCallback(async (filters: InspectionPlanListFilters = {}) => {
    try {
      const data = await loadFilteredPlanSummary(filters);
      setSummaryPlans(data);
      return data;
    } catch (error) {
      setPlanLoadError(error instanceof Error ? error.message : '检查计划统计加载失败');
      throw error;
    }
  }, []);

  const returnToPlanList = useCallback(() => {
    setView('list');
    setSelectedPlan(null);
    setPlanDetailError(null);
    setIsLoadingPlanDetail(false);
    navigate(INSPECTION_PLAN_LIST_ROUTE);
  }, [navigate]);

  const openPlanDetail = useCallback((plan: InspectionPlan) => {
    setSelectedPlan(plan);
    setActiveTab(stageTabFromSearch(location.search) ?? stageTabForPhase(plan.currentPhase));
    setPlanDetailError(null);
    setIsLoadingPlanDetail(true);
    setView('detail');
    navigate(`${INSPECTION_PLAN_LIST_ROUTE}/${encodeURIComponent(plan.id)}`);
  }, [location.search, navigate]);

  useEffect(() => {
    loadPlanDictionaries().catch(() => undefined);
  }, [loadPlanDictionaries]);

  useEffect(() => {
    loadPlanPage(appliedFilters, currentPage, pageSize).catch(() => undefined);
  }, [appliedFilters, currentPage, loadPlanPage, pageSize]);

  useEffect(() => {
    loadPlanSummary(appliedFilters).catch(() => undefined);
  }, [appliedFilters, loadPlanSummary]);

  useEffect(() => {
    if (!detailRoutePlanId) {
      if (isInspectionPlanListPath(location.pathname)) {
        setView('list');
        setSelectedPlan(null);
        setPlanDetailError(null);
        setIsLoadingPlanDetail(false);
      }
      return undefined;
    }

    let cancelled = false;
    setView('detail');
    setPlanDetailError(null);
    setIsLoadingPlanDetail(true);

    inspectionApi.getPlan(detailRoutePlanId)
      .then(detail => {
        if (cancelled) return;
        setSelectedPlan(detail);
        setActiveTab(stageTabFromSearch(location.search) ?? stageTabForPhase(detail.currentPhase));
        setPlans(prev => prev.map(plan => (plan.id === detail.id ? detail : plan)));
        setSummaryPlans(prev => prev.map(plan => (plan.id === detail.id ? detail : plan)));
      })
      .catch(error => {
        if (cancelled) return;
        setSelectedPlan(null);
        setPlanDetailError(error instanceof Error ? error.message : '检查计划详情加载失败');
      })
      .finally(() => {
        if (!cancelled) setIsLoadingPlanDetail(false);
      });

    return () => {
      cancelled = true;
    };
  }, [detailRoutePlanId, location.pathname, location.search]);

  useEffect(() => {
    if (view !== 'detail' || !selectedPlan) return;
    setActiveTab(stageTabFromSearch(location.search) ?? stageTabForPhase(selectedPlan.currentPhase));
  }, [location.search, selectedPlan?.currentPhase, selectedPlan?.id, view]);

  const toggleDraftFilter = (key: 'types' | 'frequencies', code: string) => {
    setFilterDraft(prev => {
      const current = prev[key];
      return {
        ...prev,
        [key]: current.includes(code)
          ? current.filter(item => item !== code)
          : [...current, code],
      };
    });
  };

  const handleApplyFilters = () => {
    setCurrentPage(1);
    setAppliedFilters(buildPlanFilters(filterDraft, planTypeCodeSet, frequencyCodeSet));
    setIsFilterOpen(false);
  };

  const handleKeywordSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    handleApplyFilters();
  };

  const handleStatusFilterChange = (status: string) => {
    const nextDraft = { ...filterDraft, status };
    setFilterDraft(nextDraft);
    setCurrentPage(1);
    setAppliedFilters(buildPlanFilters(nextDraft, planTypeCodeSet, frequencyCodeSet));
  };

  const handleResetFilters = () => {
    setFilterDraft(DEFAULT_FILTER_DRAFT);
    setCurrentPage(1);
    setAppliedFilters({});
    setIsFilterOpen(false);
  };

  const handleWizardSubmit = async (planData: InspectionPlanWizardData) => {
    const newPlan = await inspectionApi.createPlan(planData);
    setFilterDraft(DEFAULT_FILTER_DRAFT);
    setCurrentPage(1);
    setAppliedFilters({});
    await Promise.all([
      loadPlanPage({}, 1, pageSize),
      loadPlanSummary({}),
    ]);
    setView('list');
    setIsWizardOpen(false);
    toast.success(`已创建检查计划：${newPlan.title}`);
  };

  const handleLaunchDraft = (planId: string) => {
    const plan = plans.find(item => item.id === planId);
    if (plan) {
      handlePlanTransitionAction(plan, 'submit_approval');
    }
  };

  const handleLaunchComplete = () => {
    setIsLaunching(false);
    setLaunchingPlanId(null);
  };

  const refreshAfterPlanTransition = async (
    planId: string,
    fallbackPlan: InspectionPlan,
    options: { includeReportSideEffects?: boolean } = {},
  ) => {
    const readbacks: Array<Promise<unknown>> = [
      inspectionApi.getPlan(planId).catch(() => fallbackPlan),
      loadPlanPage(appliedFilters, currentPage, pageSize).catch(() => null),
      loadPlanSummary(appliedFilters).catch(() => null),
    ];
    if (options.includeReportSideEffects) {
      readbacks.push(
        inspectionApi.getReportWorkspace(planId).catch(() => null),
        taskApi.getCounts({ category: 'INSPECTION' }).catch(() => null),
        notificationApi.unreadCount().catch(() => null),
      );
    }
    const [detail] = await Promise.all(readbacks) as [InspectionPlan, ...unknown[]];
    setPlans(prev => prev.map(plan => (plan.id === planId ? detail : plan)));
    setSummaryPlans(prev => prev.map(plan => (plan.id === planId ? detail : plan)));
    setSelectedPlan(prev => (prev?.id === planId ? detail : prev));
  };

  const handlePlanUpdate = useCallback((updatedPlan: InspectionPlan) => {
    setPlans(prev => prev.map(plan => (plan.id === updatedPlan.id ? updatedPlan : plan)));
    setSummaryPlans(prev => prev.map(plan => (plan.id === updatedPlan.id ? updatedPlan : plan)));
    setSelectedPlan(prev => (prev?.id === updatedPlan.id ? updatedPlan : prev));
  }, []);

  const handlePlanTransitionAction = async (
    plan: InspectionPlan,
    action: InspectionPlanTransitionAction,
    payload: InspectionPlanTransitionPayload = {},
  ) => {
    if (!hasPlanAction(plan, action)) {
      toast.error(`当前状态或权限不允许${PLAN_ACTION_META[action].label}`);
      return;
    }
    if (action === 'enter_report_preparation') {
      const blocker = reportPreparationBlocker(plan);
      if (blocker) {
        toast.error(blocker);
        return;
      }
    }
    if (action === 'terminate' && !payload.reason?.trim()) {
      toast.error('终止计划需要填写原因');
      return;
    }
    setTransitioningPlanId(plan.id);
    setTransitioningPlanAction(action);
    try {
      const isReportPreparation = action === 'enter_report_preparation';
      const updatedPlan = await inspectionApi.transitionPlan(plan.id, action, {
        ...payload,
        comment: payload.comment ?? `${PLAN_ACTION_META[action].label} from inspection plan UI`,
        idempotencyKey: isReportPreparation
          ? newIdempotencyKey('enter-report-preparation')
          : undefined,
        optimisticVersion: plan.optimisticVersion,
      });
      await refreshAfterPlanTransition(plan.id, updatedPlan, {
        includeReportSideEffects: isReportPreparation,
      });
      if (isReportPreparation) {
        setActiveTab('report');
      }
      toast.success(`已${PLAN_ACTION_META[action].label}`);
    } catch (error) {
      toast.error(`${PLAN_ACTION_META[action].label}失败：${errorMessage(error)}`);
      if ((error as { code?: string })?.code === 'IDEMPOTENCY_KEY_CONFLICT') {
        await refreshAfterPlanTransition(plan.id, plan, {
          includeReportSideEffects: action === 'enter_report_preparation',
        });
      }
    } finally {
      setTransitioningPlanId(null);
      setTransitioningPlanAction(null);
    }
  };

  const handleEnterReportPreparation = async (plan: InspectionPlan) => {
    await handlePlanTransitionAction(plan, 'enter_report_preparation', {
      comment: 'Open report preparation from inspection plan UI',
    });
  };

  const routineCalendarColor = calendarColorFor(planTypeOptions, 'ROUTINE_INSPECTION');
  const specialCalendarColor = calendarColorFor(planTypeOptions, 'SPECIAL_INSPECTION');
  const departureAuditCalendarColor = calendarColorFor(planTypeOptions, 'DEPARTURE_AUDIT');
  const calendarTimelineWidth = Math.max(
    CALENDAR_MIN_WIDTH,
    ganttData.months.length * CALENDAR_MONTH_WIDTH,
  );
  const handlePageChange = (page: number) => {
    if (page < 1 || page > totalPages || page === currentPage || isLoadingPlans) return;
    setCurrentPage(page);
  };
  const handlePageSizeChange = (value: string) => {
    const nextPageSize = Number(value);
    if (!INSPECTION_PLAN_PAGE_SIZE_OPTIONS.some(option => option === nextPageSize)) return;
    setCurrentPage(1);
    setPageSize(nextPageSize);
  };
  const isPreviousPageDisabled = currentPage <= 1 || isLoadingPlans;
  const isNextPageDisabled = currentPage >= totalPages || isLoadingPlans;

  return (
    <div className="flex flex-col h-full min-h-[calc(100vh-4rem)] bg-gray-50/50 p-6 relative">
      
      {/* Page Header */}
      {view !== 'detail' && view !== 'workspace' && (
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">检查计划与立项大盘</h1>
            <p className="text-sm text-gray-500 mt-1">全局监控合规检查项目的全生命周期进度与状态。</p>
          </div>
          
          <div className="flex items-center space-x-4">
            {/* View Switcher */}
            <div className="flex items-center bg-white border border-gray-200 rounded-lg p-1 shadow-sm">
              <button
                onClick={() => setView('list')}
                className={`flex items-center px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  view === 'list' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <LayoutList className="w-4 h-4 mr-1.5" />
                列表看板
              </button>
              <button
                onClick={() => setView('calendar')}
                className={`flex items-center px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  view === 'calendar' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <CalendarIcon className="w-4 h-4 mr-1.5" />
                计划日历
              </button>
            </div>

            <button 
              onClick={() => setIsWizardOpen(true)}
              data-testid="inspection-plan-create"
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              新增检查计划
            </button>
          </div>
        </div>
      )}

      {view !== 'detail' && view !== 'workspace' && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 mb-1">计划总数</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
          </div>
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 mb-1">执行中项目</p>
              <p className="text-2xl font-bold text-gray-900">{stats.inProgress}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center">
              <PlayCircle className="w-5 h-5 text-green-600" />
            </div>
          </div>
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 mb-1">待整改闭环</p>
              <p className="text-2xl font-bold text-gray-900">{stats.pendingRectification}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-orange-600" />
            </div>
          </div>
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 mb-1">逾期预警</p>
              <p className="text-2xl font-bold text-red-600">{stats.overdue}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-red-600" />
            </div>
          </div>
        </div>
      )}

      {view !== 'detail' && view !== 'workspace' && planLoadError && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {planLoadError}
        </div>
      )}

      {/* Main Content Area with Animation */}
      <div className="flex-1 relative">
        <AnimatePresence mode="wait">
          {view === 'list' ? (
            <motion.div
              key="list"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden"
            >
              {/* Toolbar */}
              <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                <div className="flex items-center space-x-4">
                  <form className="relative w-72" onSubmit={handleKeywordSubmit}>
                    <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
                    <input 
                      type="text" 
                      value={filterDraft.keyword}
                      onChange={event => setFilterDraft(prev => ({ ...prev, keyword: event.target.value }))}
                      placeholder="搜索项目名称、编号或组长..."
                      className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </form>
                  <select
                    aria-label="检查计划状态"
                    value={filterDraft.status}
                    onChange={event => handleStatusFilterChange(event.target.value)}
                    className="h-9 w-[150px] rounded-md border border-gray-200 bg-white px-3 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value={ALL_STATUS_FILTER}>全部状态</option>
                    {INSPECTION_STATUS_DICTIONARY.map(item => (
                      <option key={item.code} value={item.code}>{item.label}</option>
                    ))}
                  </select>
                </div>
                <Popover open={isFilterOpen} onOpenChange={setIsFilterOpen}>
                  <PopoverTrigger className="flex items-center px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition-colors focus:outline-none">
                    <Filter className="w-4 h-4 mr-2" />
                    高级筛选
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-5 bg-white shadow-lg border-slate-200" align="end">
                    <div className="space-y-4">
                      {/* Section 1: Project Type */}
                      <div>
                        <h4 className="text-sm font-medium text-slate-700 mb-2">项目类型</h4>
                        <div className="grid grid-cols-2 gap-2">
                          {isLoadingDictionaries ? (
                            <div
                              data-testid="inspection-plan-filter-dictionaries-loading"
                              className="col-span-2 text-xs font-medium text-slate-500"
                            >
                              正在加载配置字典...
                            </div>
                          ) : dictionaryLoadError ? (
                            <div
                              data-testid="inspection-plan-filter-dictionaries-error"
                              className="col-span-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700"
                            >
                              {dictionaryLoadError}
                            </div>
                          ) : planTypeOptions.length === 0 ? (
                            <div
                              data-testid="inspection-plan-filter-type-empty"
                              className="col-span-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700"
                            >
                              暂无可用检查类型
                            </div>
                          ) : planTypeOptions.map(item => (
                            <label
                              key={item.dictId}
                              className="flex items-center space-x-2 text-sm text-slate-700 cursor-pointer"
                              data-testid={`inspection-plan-filter-type-${item.dictId}`}
                            >
                              <input
                                type="checkbox"
                                value={item.dictCode}
                                checked={filterDraft.types.includes(item.dictCode)}
                                onChange={() => toggleDraftFilter('types', item.dictCode)}
                                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                              />
                              <span>{item.dictLabel}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                      {/* Section 2: Frequency */}
                      <div>
                        <h4 className="text-sm font-medium text-slate-700 mb-2">检查频率</h4>
                        <div className="grid grid-cols-2 gap-2">
                          {isLoadingDictionaries ? (
                            <div className="col-span-2 text-xs font-medium text-slate-500">
                              正在加载配置字典...
                            </div>
                          ) : dictionaryLoadError ? (
                            <div className="col-span-2 text-xs font-medium text-rose-700">
                              字典加载失败，筛选暂不可用
                            </div>
                          ) : frequencyOptions.length === 0 ? (
                            <div
                              data-testid="inspection-plan-filter-frequency-empty"
                              className="col-span-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700"
                            >
                              暂无可用检查频率
                            </div>
                          ) : frequencyOptions.map(item => (
                            <label
                              key={item.dictId}
                              className="flex items-center space-x-2 text-sm text-slate-700 cursor-pointer"
                              data-testid={`inspection-plan-filter-frequency-${item.dictId}`}
                            >
                              <input
                                type="checkbox"
                                value={item.dictCode}
                                checked={filterDraft.frequencies.includes(item.dictCode)}
                                onChange={() => toggleDraftFilter('frequencies', item.dictCode)}
                                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                              />
                              <span>{item.dictLabel}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                      {/* Section 3: Year */}
                      <div>
                        <h4 className="text-sm font-medium text-slate-700 mb-2">年份</h4>
                        <div data-testid="inspection-plan-filter-year-picker">
                          <DatePicker
                            selected={selectedFilterYearDate}
                            onChange={(date: Date | null) =>
                              setFilterDraft(prev => ({
                                ...prev,
                                year: date ? String(date.getFullYear()) : '',
                              }))
                            }
                            showYearPicker
                            isClearable
                            dateFormat="yyyy年"
                            placeholderText="选择年份"
                            yearItemNumber={12}
                            showPopperArrow={false}
                            popperClassName="z-[60]"
                            ariaLabelClose="清除年份"
                            clearButtonTitle="清除年份"
                            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2 pt-4 mt-4 border-t border-slate-100">
                        <Button variant="outline" onClick={handleResetFilters}>取消/重置</Button>
                        <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleApplyFilters}>应用</Button>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-gray-600">
                  <thead className="bg-gray-50 text-gray-700 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-4 font-semibold">项目信息 (Project)</th>
                      <th className="px-6 py-4 font-semibold w-32">类型与频率 (Type)</th>
                      <th className="px-6 py-4 font-semibold w-48">被检查对象 (Target)</th>
                      <th className="px-6 py-4 font-semibold w-32">项目组长 (Leader)</th>
                      <th className="px-6 py-4 font-semibold w-48">进度全景 (4-Stage Progress)</th>
                      <th className="px-6 py-4 font-semibold w-32 text-center">状态 (Status)</th>
                      <th className="px-6 py-4 font-semibold w-72 text-right">操作 (Action)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {isLoadingPlans ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-10 text-center text-slate-500">
                          正在加载检查计划...
                        </td>
                      </tr>
                    ) : plans.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-10 text-center text-slate-500">
                          {hasActiveFilters ? '没有符合当前筛选条件的检查计划' : '暂无检查计划'}
                        </td>
                      </tr>
                    ) : plans.map(plan => {
                      const typeItem = planTypeByCode.get(plan.type);
                      const frequencyLabel = frequencyByCode.get(plan.frequency)?.dictLabel ?? plan.frequency;
                      return (
                        <tr
                          key={plan.id}
                          className="hover:bg-slate-50 transition-colors"
                          data-testid={`inspection-plan-row-${plan.id}`}
                        >
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className="font-semibold text-gray-900">{plan.title}</span>
                              <span className="text-xs text-gray-400 mt-0.5 font-mono">{plan.inspectCode}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col items-start space-y-1">
                              <span
                                data-testid={`inspection-plan-type-label-${plan.id}`}
                                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${badgeClassFor(typeItem)}`}
                              >
                                {typeItem?.dictLabel ?? plan.type}
                              </span>
                              <span
                                data-testid={`inspection-plan-frequency-label-${plan.id}`}
                                className="text-xs text-gray-500"
                              >
                                {frequencyLabel}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-sm text-gray-700 line-clamp-2">{plan.targetDept}</span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center text-sm font-medium">
                              <div className="w-6 h-6 mr-2 rounded-full bg-slate-200 text-xs text-slate-600 flex items-center justify-center">
                                {(plan.leader || '未')[0]}
                              </div>
                              {plan.leader || '未指定'}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <PhaseProgressBar currentPhase={plan.currentPhase} progress={plan.phaseProgress} />
                          </td>
                          <td className="px-6 py-4 text-center">
                            <StatusBadge status={plan.status} />
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {LIST_VISIBLE_ACTIONS
                                .filter(action => hasPlanAction(plan, action))
                                .map(action => {
                                  const meta = PLAN_ACTION_META[action];
                                  const Icon = meta.icon;
                                  const isRunning = transitioningPlanId === plan.id
                                    && transitioningPlanAction === action;
                                  return (
                                    <Button
                                      key={action}
                                      variant="outline"
                                      className={meta.buttonClass}
                                      data-testid={`inspection-plan-action-${action}-${plan.id}`}
                                      disabled={Boolean(transitioningPlanId)}
                                      title={meta.label}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handlePlanTransitionAction(plan, action);
                                      }}
                                    >
                                      <Icon className="w-4 h-4 mr-1" />
                                      {isRunning ? '处理中' : meta.label}
                                    </Button>
                                  );
                                })}
                              {hasReportPreparationAction(plan) && (
                                <Button
                                  variant="outline"
                                  className="text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                                  data-testid={`enter-report-preparation-${plan.id}`}
                                  disabled={
                                    Boolean(reportPreparationBlocker(plan))
                                    || Boolean(transitioningPlanId)
                                  }
                                  title={reportPreparationBlocker(plan) ?? '进入报告编制'}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEnterReportPreparation(plan);
                                  }}
                                >
                                  <FileText className="w-4 h-4 mr-1" />
                                  {transitioningPlanId === plan.id && transitioningPlanAction === 'enter_report_preparation'
                                    ? '进入中'
                                    : '进入报告编制'}
                                </Button>
                              )}
                              <Button variant="outline" className="text-blue-600 border-blue-200" onClick={(e) => { e.stopPropagation(); openPlanDetail(plan); }}>
                                <ExternalLink className="w-4 h-4 mr-1" /> 查看详情
                              </Button>
                              <button className="text-gray-400 hover:text-gray-600 transition-colors"><MoreVertical className="w-4 h-4" /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {false && (
                      <>
                    {/* Row 1: Overdue (Red Warning) */}
                    <tr className="bg-rose-50/40 border-l-4 border-rose-500 hover:bg-rose-50/60 transition-colors">
                      <td className="px-6 py-4 pl-5">
                        <div className="flex flex-col">
                          <span className="font-semibold text-gray-900">2026年Q2自营业务日常检查</span>
                          <span className="text-xs text-gray-400 mt-0.5 font-mono">IP-2026-081</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col items-start space-y-1">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">例行检查</span>
                          <span className="text-xs text-gray-500">季度</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-700 line-clamp-2">自营业务部</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center text-sm font-medium">
                          <div className="w-6 h-6 mr-2 rounded-full bg-slate-200 text-xs text-slate-600 flex items-center justify-center">张</div>张伟
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1 w-32">
                          <div className="flex gap-1 w-full h-2">
                            <div className="flex-1 bg-blue-500 rounded-sm"></div>
                            <div className="flex-1 bg-blue-500 animate-pulse rounded-sm"></div>
                            <div className="flex-1 bg-slate-200 rounded-sm"></div>
                            <div className="flex-1 bg-slate-200 rounded-sm"></div>
                          </div>
                          <div className="flex justify-between text-[10px] text-slate-500 px-0.5"><span>准备</span><span>实施</span><span>报告</span><span>整改</span></div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold text-rose-600 border border-rose-200 bg-rose-50">🔴 逾期未进场</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end space-x-3">
                          <Button variant="outline" className="text-blue-600 border-blue-200" onClick={(e) => { e.stopPropagation(); const plan = plans[2] ?? plans[0]; if (plan) openPlanDetail(plan); }}>
                            <ExternalLink className="w-4 h-4 mr-1" /> 查看详情
                          </Button>
                          <button className="text-gray-400 hover:text-gray-600 transition-colors"><MoreVertical className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>

                    {/* Row 2: In Progress */}
                    <tr className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-semibold text-gray-900">2026年财富管理条线合规检查</span>
                          <span className="text-xs text-gray-400 mt-0.5 font-mono">IP-2026-082</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col items-start space-y-1">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-50 text-purple-700 border border-purple-100">专项检查</span>
                          <span className="text-xs text-gray-500">年度</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-700 line-clamp-2">财富管理委员会</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center text-sm font-medium">
                          <div className="w-6 h-6 mr-2 rounded-full bg-slate-200 text-xs text-slate-600 flex items-center justify-center">李</div>李娜
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1 w-32">
                          <div className="flex gap-1 w-full h-2">
                            <div className="flex-1 bg-blue-500 rounded-sm"></div>
                            <div className="flex-1 bg-blue-500 rounded-sm"></div>
                            <div className="flex-1 bg-blue-500 animate-pulse rounded-sm"></div>
                            <div className="flex-1 bg-slate-200 rounded-sm"></div>
                          </div>
                          <div className="flex justify-between text-[10px] text-slate-500 px-0.5"><span>准备</span><span>实施</span><span>报告</span><span>整改</span></div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-blue-600 border border-blue-200 bg-blue-50">进行中 (报告撰写)</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end space-x-3">
                          <Button variant="outline" className="text-blue-600 border-blue-200" onClick={(e) => { e.stopPropagation(); const plan = plans[3] ?? plans[0]; if (plan) openPlanDetail(plan); }}>
                            <ExternalLink className="w-4 h-4 mr-1" /> 查看详情
                          </Button>
                          <button className="text-gray-400 hover:text-gray-600 transition-colors"><MoreVertical className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>

                    {/* Row 3: Pending Rectification */}
                    <tr className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-semibold text-gray-900">2026年反洗钱(AML)专项检查</span>
                          <span className="text-xs text-gray-400 mt-0.5 font-mono">IP-2026-083</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col items-start space-y-1">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-50 text-purple-700 border border-purple-100">专项检查</span>
                          <span className="text-xs text-gray-500">半年度</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1 items-center">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">上海分公司</span>
                          <Popover>
                            <PopoverTrigger className="focus:outline-none">
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 cursor-pointer transition-colors">+35</span>
                            </PopoverTrigger>
                            <PopoverContent className="w-64 p-3 bg-white shadow-lg border-slate-200">
                              <p className="text-sm font-semibold mb-2 text-slate-800 border-b border-slate-100 pb-2">其余 35 家分支机构</p>
                              <div className="flex flex-col gap-1 max-h-[200px] overflow-y-auto pr-1">
                                {['北京分公司', '深圳分公司', '广州分公司', '杭州营业部', '南京营业部', '成都分公司', '武汉分公司', '西安分公司', '重庆营业部'].map((branch, branchIndex) => (
                                  <span key={`${branch}-${branchIndex}`} className="text-sm text-slate-600 py-1.5 border-b border-slate-50 last:border-0">{branch}</span>
                                ))}
                                <span className="text-xs text-slate-400 py-1 text-center mt-1">...等26家机构</span>
                              </div>
                            </PopoverContent>
                          </Popover>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center text-sm font-medium">
                          <div className="w-6 h-6 mr-2 rounded-full bg-slate-200 text-xs text-slate-600 flex items-center justify-center">王</div>王强
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1 w-32">
                          <div className="flex gap-1 w-full h-2">
                            <div className="flex-1 bg-green-500 rounded-sm"></div>
                            <div className="flex-1 bg-green-500 rounded-sm"></div>
                            <div className="flex-1 bg-green-500 rounded-sm"></div>
                            <div className="flex-1 bg-amber-500 animate-pulse rounded-sm"></div>
                          </div>
                          <div className="flex justify-between text-[10px] text-slate-500 px-0.5"><span>准备</span><span>实施</span><span>报告</span><span>整改</span></div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-amber-600 border border-amber-200 bg-amber-50">🟡 待整改闭环</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end space-x-3">
                          <Button variant="outline" className="text-blue-600 border-blue-200" onClick={(e) => { e.stopPropagation(); const plan = plans[4] ?? plans[0]; if (plan) openPlanDetail(plan); }}>
                            <ExternalLink className="w-4 h-4 mr-1" /> 查看详情
                          </Button>
                          <button className="text-gray-400 hover:text-gray-600 transition-colors"><MoreVertical className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>

                    {/* Row 4: Prepare Stage (Newly added) */}
                    <tr className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-semibold text-gray-900">2026年Q2自营业务异常交易专项排查</span>
                          <span className="text-xs text-gray-400 mt-0.5 font-mono">INSP-2026-001</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col items-start space-y-1">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-50 text-purple-700 border border-purple-100">专项检查</span>
                          <span className="text-xs text-gray-500">临时</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-700 line-clamp-2">自营业务部</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center text-sm font-medium">
                          <div className="w-6 h-6 mr-2 rounded-full bg-slate-200 text-xs text-slate-600 flex items-center justify-center">张</div>张建国
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1 w-32">
                          <div className="flex gap-1 w-full h-2">
                            <div className="flex-1 bg-blue-500 animate-pulse rounded-sm"></div>
                            <div className="flex-1 bg-slate-200 rounded-sm"></div>
                            <div className="flex-1 bg-slate-200 rounded-sm"></div>
                            <div className="flex-1 bg-slate-200 rounded-sm"></div>
                          </div>
                          <div className="flex justify-between text-[10px] text-slate-500 px-0.5"><span>准备</span><span>实施</span><span>报告</span><span>整改</span></div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">草稿</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end space-x-3">
                          <Button className="bg-blue-600 hover:bg-blue-700 text-white" disabled={!plans[0]} onClick={(e) => { e.stopPropagation(); if (plans[0]) handleLaunchDraft(plans[0].id); }}>
                            发起立项审批
                          </Button>
                          <Button variant="ghost" className="text-blue-600 hover:bg-blue-50" disabled={!plans[0]} onClick={(e) => { e.stopPropagation(); if (plans[0]) openPlanDetail(plans[0]); }}>
                             <ExternalLink className="w-4 h-4 mr-1" /> 查看详情
                          </Button>
                        </div>
                      </td>
                    </tr>
                      </>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination Footer */}
              <div className="p-4 border-t border-gray-100 flex items-center justify-between bg-white text-sm">
                <div className="text-slate-500" data-testid="inspection-plan-pagination-summary">
                  共计 <span className="font-medium text-slate-900" data-testid="inspection-plan-pagination-total">{totalPlans}</span> 条记录，
                  当前页 <span className="font-medium text-slate-900" data-testid="inspection-plan-pagination-current-count">{plans.length}</span> 条
                </div>
                
                <div className="flex items-center space-x-6">
                  <Pagination className="mx-0 w-auto">
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          href="#"
                          className={`h-8 px-2 pl-2 ${isPreviousPageDisabled ? 'pointer-events-none opacity-50' : ''}`}
                          aria-disabled={isPreviousPageDisabled}
                          onClick={(event) => {
                            event.preventDefault();
                            handlePageChange(currentPage - 1);
                          }}
                          text="上一页"
                        />
                      </PaginationItem>
                      {Array.from({ length: totalPages }).map((_, index) => (
                        <PaginationItem key={index + 1}>
                          <PaginationLink
                            href="#"
                            isActive={currentPage === index + 1}
                            className="h-8 w-8"
                            data-testid={`inspection-plan-pagination-page-${index + 1}`}
                            onClick={(event) => {
                              event.preventDefault();
                              handlePageChange(index + 1);
                            }}
                          >
                            {index + 1}
                          </PaginationLink>
                        </PaginationItem>
                      ))}
                      <PaginationItem>
                        <PaginationNext
                          href="#"
                          className={`h-8 px-2 pr-2 ${isNextPageDisabled ? 'pointer-events-none opacity-50' : ''}`}
                          aria-disabled={isNextPageDisabled}
                          onClick={(event) => {
                            event.preventDefault();
                            handlePageChange(currentPage + 1);
                          }}
                          text="下一页"
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>

                  <div className="flex items-center space-x-2">
                    <span className="text-slate-500">每页</span>
                    <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
                      <SelectTrigger className="h-8 w-[80px]" data-testid="inspection-plan-pagination-page-size">
                        <SelectValue placeholder="10条" />
                      </SelectTrigger>
                      <SelectContent>
                        {INSPECTION_PLAN_PAGE_SIZE_OPTIONS.map(option => (
                          <SelectItem key={option} value={String(option)}>{option}条</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : view === 'calendar' ? (
            <motion.div
              key="calendar"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-full min-h-[500px]"
            >
              <div className="p-6 pb-4 flex items-center justify-between border-b border-gray-100">
                <h3 className="text-lg font-bold text-gray-900">计划日历 (Gantt Matrix)</h3>
                <div className="flex items-center space-x-6 text-sm" data-testid="inspection-plan-calendar-legend">
                  {planTypeOptions.length > 0 ? planTypeOptions.map(item => (
                    <div key={item.dictId} className="flex items-center" data-testid={`inspection-plan-calendar-legend-${item.dictId}`}>
                      <span
                        className="w-3 h-3 rounded-sm mr-2"
                        style={{ backgroundColor: calendarColorFor(planTypeOptions, item.dictCode) }}
                      />
                      {item.dictLabel}
                    </div>
                  )) : (
                    <>
                      <div className="flex items-center"><span className="w-3 h-3 rounded-sm mr-2" style={{ backgroundColor: routineCalendarColor }} />例行检查</div>
                      <div className="flex items-center"><span className="w-3 h-3 rounded-sm mr-2" style={{ backgroundColor: specialCalendarColor }} />专项检查</div>
                      <div className="flex items-center"><span className="w-3 h-3 rounded-sm mr-2" style={{ backgroundColor: departureAuditCalendarColor }} />离任审计</div>
                    </>
                  )}
                </div>
              </div>

              <div className="px-6 py-3 border-b border-gray-100 bg-slate-50/50 text-xs text-slate-500 flex items-center justify-between gap-4">
                <span>
                  共计 <span className="font-semibold text-slate-800">{summaryPlans.length}</span> 条计划，
                  日历展示 <span className="font-semibold text-slate-800">{ganttData.plans.length}</span> 条
                </span>
                {dictionaryLoadError && (
                  <span className="font-medium text-amber-700" data-testid="inspection-plan-calendar-dictionary-fallback">
                    字典加载失败，日历颜色使用默认色
                  </span>
                )}
              </div>

              {isLoadingPlans ? (
                <div className="flex flex-1 items-center justify-center text-sm font-medium text-slate-500" data-testid="inspection-plan-calendar-loading">
                  正在加载检查计划日历...
                </div>
              ) : planLoadError ? (
                <div className="flex flex-1 items-center justify-center px-6 text-sm font-medium text-rose-700" data-testid="inspection-plan-calendar-error">
                  {planLoadError}
                </div>
              ) : summaryPlans.length === 0 ? (
                <div className="flex flex-1 items-center justify-center text-sm font-medium text-slate-500" data-testid="inspection-plan-calendar-empty">
                  {hasActiveFilters ? '没有符合当前筛选条件的检查计划' : '暂无检查计划'}
                </div>
              ) : ganttData.plans.length === 0 ? (
                <div className="flex flex-1 items-center justify-center px-6 text-sm font-medium text-amber-700" data-testid="inspection-plan-calendar-no-dated-plans">
                  当前 {summaryPlans.length} 条检查计划缺少有效开始/结束日期，未生成日历排期。
                </div>
              ) : (
                <div className="flex flex-1 overflow-hidden" data-testid="inspection-plan-calendar-same-source">
                  <div className="w-[220px] flex-shrink-0 border-r border-gray-200 bg-white z-10 flex flex-col">
                    <div className="h-12 border-b border-gray-200 flex items-center px-4 bg-gray-50/80 font-semibold text-gray-600 text-sm">
                      负责人 / 计划
                    </div>
                    <div className="flex flex-col flex-1 overflow-y-auto">
                      {ganttData.plans.map((plan, index) => (
                        <button
                          key={plan.id}
                          type="button"
                          className={`h-[76px] border-b border-gray-100 flex items-center px-4 text-left transition-colors hover:bg-blue-50/40 ${index % 2 === 0 ? 'bg-slate-50/30' : 'bg-white'}`}
                          data-testid={`inspection-plan-calendar-row-${plan.id}`}
                          onClick={() => openPlanDetail(plan)}
                        >
                          <div className="w-8 h-8 mr-3 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-sm flex-shrink-0">
                            {(plan.leader || '未')[0]}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-slate-800 truncate">{plan.leader || '未指定'}</div>
                            <div className="text-xs text-slate-500 truncate">{plan.title}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex-1 overflow-x-auto overflow-y-auto relative bg-gray-50/30">
                    <div style={{ width: `${calendarTimelineWidth}px` }}>
                      <div className="h-12 border-b border-gray-200 flex bg-gray-50/80">
                        {ganttData.months.map(month => (
                          <div
                            key={month.toISOString()}
                            className="flex-shrink-0 flex items-center justify-center text-xs font-medium text-gray-500 border-r border-gray-200/50"
                            style={{ width: `${CALENDAR_MONTH_WIDTH}px` }}
                          >
                            {formatMonth(month)}
                          </div>
                        ))}
                      </div>

                      <div className="relative">
                        <div className="absolute top-0 bottom-0 left-0 right-0 flex pointer-events-none">
                          {ganttData.months.map(month => (
                            <div
                              key={month.toISOString()}
                              className="h-full border-r border-gray-200/50"
                              style={{ width: `${CALENDAR_MONTH_WIDTH}px` }}
                            />
                          ))}
                        </div>

                        {ganttData.currentDateLeft !== null && (
                          <div
                            className="absolute top-0 bottom-0 w-px bg-red-400 border-l border-dashed border-red-500 pointer-events-none z-20"
                            style={{ left: `${ganttData.currentDateLeft}%` }}
                          >
                            <div className="absolute -top-3 -translate-x-1/2 bg-red-50 text-red-600 text-[10px] font-bold px-1.5 py-0.5 rounded border border-red-200">
                              当前
                            </div>
                          </div>
                        )}

                        {ganttData.plans.map((plan, index) => {
                          const progressIndex = getInspectionProgressIndex(plan.currentPhase);
                          const rangeLabel = `${formatShortDate(plan.startDate)} 至 ${formatShortDate(plan.endDate)}`;
                          return (
                            <div
                              key={plan.id}
                              className={`relative h-[76px] border-b border-gray-100 ${index % 2 === 0 ? 'bg-slate-50/30' : 'bg-white'}`}
                            >
                              <button
                                type="button"
                                className="absolute top-[14px] h-[32px] rounded-md shadow-sm group cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                                data-testid={`inspection-plan-calendar-event-${plan.id}`}
                                title={`${plan.title} / ${plan.leader || '未指定'} / ${rangeLabel} / ${plan.typeLabel} / ${plan.frequencyLabel} / ${plan.statusLabel}`}
                                style={{
                                  left: `${plan.left}%`,
                                  width: `${plan.width}%`,
                                  minWidth: '120px',
                                }}
                                onClick={() => openPlanDetail(plan)}
                              >
                                <div className="flex w-full h-full rounded-md overflow-hidden ring-1 ring-slate-900/10">
                                  {PHASES.map((phase, phaseIndex) => (
                                    <div
                                      key={phase}
                                      className="h-full flex-1 transition-all hover:brightness-110"
                                      style={segmentStyle(plan.color, phaseIndex <= progressIndex ? 1 - phaseIndex * 0.08 : 0.32)}
                                      title={getInspectionPhaseShortLabel(phase)}
                                    />
                                  ))}
                                </div>
                                <span className="absolute inset-0 flex items-center px-3 text-xs font-medium text-white truncate drop-shadow pointer-events-none">
                                  {plan.title}
                                </span>
                              </button>
                              <div
                                className="absolute top-[50px] text-[11px] text-slate-500 truncate"
                                style={{
                                  left: `${plan.left}%`,
                                  width: `${Math.max(plan.width, 18)}%`,
                                  minWidth: '180px',
                                }}
                              >
                                {rangeLabel} · {plan.typeLabel} · {plan.frequencyLabel} · {plan.statusLabel}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          ) : view === 'detail' ? (
             <motion.div
              key="detail"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-full"
            >
              {isLoadingPlanDetail && !selectedPlan && (
                <div className="flex h-full min-h-[360px] flex-col items-center justify-center gap-3 text-sm font-medium text-slate-500">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-100 border-t-blue-600" />
                  正在加载检查计划详情...
                </div>
              )}
              {planDetailError && !selectedPlan && (
                <div className="flex h-full min-h-[360px] flex-col items-center justify-center gap-4 px-6 text-center">
                  <AlertCircle className="h-10 w-10 text-rose-500" />
                  <div>
                    <h3 className="text-base font-bold text-slate-900">检查计划详情加载失败</h3>
                    <p className="mt-1 text-sm text-slate-500">{planDetailError}</p>
                  </div>
                  <Button variant="outline" onClick={returnToPlanList}>
                    返回检查计划列表
                  </Button>
                </div>
              )}
              {selectedPlan && (
                <>
                  {isLoadingPlanDetail && (
                    <div
                      data-testid="inspection-plan-detail-loading-read-model"
                      className="border-b border-blue-100 bg-blue-50 px-6 py-2 text-xs font-medium text-blue-700"
                    >
                      正在刷新详情读模型...
                    </div>
                  )}
                  <div data-testid="inspection-plan-detail-read-model">
                    <InspectionPlanHeader
                      plan={selectedPlan}
                      onBack={returnToPlanList}
                      onEnterReportPreparation={() => handleEnterReportPreparation(selectedPlan)}
                      onPlanAction={(action, payload) => handlePlanTransitionAction(selectedPlan, action, payload)}
                      isEnteringReportPreparation={
                        transitioningPlanId === selectedPlan.id
                        && transitioningPlanAction === 'enter_report_preparation'
                      }
                      activeAction={
                        transitioningPlanId === selectedPlan.id
                          ? transitioningPlanAction
                          : null
                      }
                      reportPreparationDisabledReason={reportPreparationBlocker(selectedPlan)}
                    />
                  </div>
                </>
              )}
              {selectedPlan && (
                <InteractiveStageStepper
                  activeTab={activeTab}
                  onChange={setActiveTab}
                  currentPhase={selectedPlan.currentPhase}
                  status={selectedPlan.status}
                  phaseProgress={selectedPlan.phaseProgress}
                />
              )}
              
              {selectedPlan && (
                <StageWorkspaceArea
                  activeTab={activeTab}
                  inspectionPlanId={selectedPlan.id}
                  plan={selectedPlan}
                  onEnterWorkspace={() => setView('workspace')}
                  onNextStage={() => setActiveTab(stageTabForPhase(selectedPlan.currentPhase))}
                  onPlanUpdate={handlePlanUpdate}
                />
              )}

            </motion.div>
          ) : view === 'workspace' ? (
             <motion.div
              key="workspace"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <WorkingPaperWorkspace inspectionPlanId={selectedPlan?.id} plan={selectedPlan} onBack={() => setView('detail')} />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {/* Wizard Modal */}
      <AnimatePresence>
        {isWizardOpen && (
          <InspectionPlanWizard 
            isOpen={isWizardOpen} 
            onClose={() => setIsWizardOpen(false)} 
            onSubmit={handleWizardSubmit}
          />
        )}
      </AnimatePresence>

      {/* EKP Launch Overlay */}
      <EKPLaunchOverlay 
        isOpen={isLaunching} 
        onComplete={handleLaunchComplete} 
      />

      {/* EKP Status Card */}
      <AnimatePresence>
        {viewingEKPPlan && (
          <EKPStatusCard 
            isOpen={!!viewingEKPPlan} 
            onClose={() => setViewingEKPPlan(null)} 
            plan={viewingEKPPlan} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}
