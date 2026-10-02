
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BaseIssue, IssueType, Case, CaseStage, BusinessLine, CaseType, Clue, EvidenceTask } from '../../types';
import { caseService } from '../../services/case';
import type { CaseStats } from '../../services/case';
import { CaseListReqDTO } from '../../types/case';
import Pagination from '../../components/ui/Pagination';
import { useAuth } from '../../src/contexts/AuthContext';
import { 
    LayoutList, LayoutGrid, Calendar as CalendarIcon,
    Briefcase, TrendingUp, AlertTriangle, Clock,
    Download, Plus, FileText, Filter, ArrowUp, ArrowDown, ChevronDown, Check
} from 'lucide-react';
import Button from '../../components/ui/Button';
import CalendarView, { CalendarEvent } from '../../components/ui/CalendarView';
import CaseFilterBar from './components/CaseFilterBar';
import CaseKanban from './components/CaseKanban';
import IssueListRow from './components/IssueListRow';
import PreviewPane from './components/PreviewPane';
import CaseLedgerTable from './components/CaseLedgerTable';
import LedgerDrawer from './components/LedgerDrawer';
import { Loading, TableSkeleton } from '../../components/Loading';
import { toast } from 'sonner';

import { exportCaseLedgerToExcel } from '../../services/exportService';

interface CaseListProps {
  onNavigate: (path: string) => void;
}

type SortField = 'CREATED_AT' | 'AMOUNT' | 'DEADLINE';
type SortDirection = 'ASC' | 'DESC';

const CaseList: React.FC<CaseListProps> = ({ onNavigate }) => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [isExporting, setIsExporting] = useState(false);
  
  // View State - Default to KANBAN per requirements
  const [viewMode, setViewMode] = useState<'KANBAN' | 'LIST' | 'CALENDAR' | 'LEDGER'>(() => new URLSearchParams(window.location.search).get('view') === 'KANBAN' ? 'KANBAN' : 'LIST');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  
  // Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState<{
      type: string;
      risk: string;
      stage: string;
      owner: string;
      businessLine?: string;
      procedure?: string; // Procedure Type
      dateStart?: string;
      dateEnd?: string;
      showMasterOnly?: boolean;
  }>({
      type: 'ALL',
      risk: 'ALL',
      stage: 'ALL',
      owner: 'ALL',
      businessLine: 'ALL',
      procedure: 'ALL',
      dateStart: '',
      dateEnd: '',
      showMasterOnly: false
  });

  // Sort State
  const [sortConfig, setSortConfig] = useState<{ field: SortField, direction: SortDirection }>({
      field: 'CREATED_AT',
      direction: 'DESC'
  });
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);

  // === Pagination State (per-view independent) ===
  const [listPage, setListPage] = useState(1);
  const [listSize, setListSize] = useState(20);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerSize, setLedgerSize] = useState(20);
  const [kanbanClosedPage, setKanbanClosedPage] = useState(1);
  const [kanbanClosedItems, setKanbanClosedItems] = useState<Case[]>([]);

  // Calendar State
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);

  // Keyboard Nav Ref
  const listContainerRef = useRef<HTMLDivElement>(null);

  // --- React Query: Fetch Data (Per-View Split) ---
  const baseFilterParams = useMemo(() => ({
    keyword: searchQuery || undefined,
    sort_by: sortConfig.field === 'CREATED_AT' ? 'created_at' : sortConfig.field === 'AMOUNT' ? 'target_amount' : 'created_at',
    sort_order: sortConfig.direction === 'ASC' ? 'asc' : 'desc',
    case_status: activeFilters.stage !== 'ALL' ? activeFilters.stage : undefined,
    risk_level: activeFilters.risk !== 'ALL' ? activeFilters.risk : undefined,
    business_line: activeFilters.businessLine !== 'ALL' ? activeFilters.businessLine : undefined,
    procedure_type: activeFilters.procedure !== 'ALL' ? activeFilters.procedure : undefined,
    date_start: activeFilters.dateStart || undefined,
    date_end: activeFilters.dateEnd || undefined,
  }), [searchQuery, sortConfig, activeFilters]);

  // === Stats Query (always runs, lightweight) ===
  const { data: serverStats } = useQuery({
    queryKey: ['caseStats', baseFilterParams],
    queryFn: () => caseService.getCaseStats(baseFilterParams),
    placeholderData: (prev: any) => prev,
  });

  // === LIST View Query (BFF POST endpoint, same filter pipeline as kanban/ledger) ===
  const { data: listData, isLoading: isListLoading, isError: isListError } = useQuery({
    queryKey: ['listCases', baseFilterParams, listPage, listSize],
    queryFn: () => caseService.getListViewPaginated({ ...baseFilterParams, page: listPage, size: listSize }),
    enabled: viewMode === 'LIST',
    placeholderData: (prev: any) => prev,
  });

  // === KANBAN View Query (active cases, large page) ===
  const { data: kanbanActiveData, isLoading: isKanbanLoading, isError: isKanbanError } = useQuery({
    queryKey: ['kanbanActive', baseFilterParams],
    queryFn: () => caseService.getKanbanViewPaginated({ ...baseFilterParams, size: 500, page: 1 }),
    enabled: viewMode === 'KANBAN',
    placeholderData: (prev: any) => prev,
  });

  // === LEDGER View Query ===
  const { data: ledgerData, isLoading: isLedgerLoading, isError: isLedgerError } = useQuery({
    queryKey: ['ledgerCases', baseFilterParams, ledgerPage, ledgerSize],
    queryFn: () => caseService.getLedgerViewPaginated({ ...baseFilterParams, page: ledgerPage, size: ledgerSize }),
    enabled: viewMode === 'LEDGER',
    placeholderData: (prev: any) => prev,
  });

  // === CALENDAR View Query (date-range filtered) ===
  const { data: calendarCases = [], isLoading: isCalendarLoading, isError: isCalendarError } = useQuery({
    queryKey: ['calendarCases', baseFilterParams, selectedDate],
    queryFn: async () => {
      const d = new Date(selectedDate);
      const start = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0];
      return caseService.getCalendarView({ ...baseFilterParams, date_start: start, date_end: end });
    },
    enabled: viewMode === 'CALENDAR',
    placeholderData: (prev: any) => prev,
  });

  // === Derived: Current view's issues for shared logic ===
  const issues: BaseIssue[] = useMemo(() => {
    switch (viewMode) {
      case 'LIST': return listData?.items || [];
      case 'KANBAN': return kanbanActiveData?.items || [];
      case 'LEDGER': return ledgerData?.items || [];
      case 'CALENDAR': return calendarCases;
      default: return [];
    }
  }, [viewMode, listData, kanbanActiveData, ledgerData, calendarCases]);

  const isLoading = viewMode === 'LIST' ? isListLoading : viewMode === 'KANBAN' ? isKanbanLoading : viewMode === 'LEDGER' ? isLedgerLoading : isCalendarLoading;
  const isError = viewMode === 'LIST' ? isListError : viewMode === 'KANBAN' ? isKanbanError : viewMode === 'LEDGER' ? isLedgerError : isCalendarError;

  // --- React Query: Mutations ---
  const stageMutation = useMutation({
    mutationFn: ({ caseId, newStage }: { caseId: string, newStage: CaseStage }) => 
      caseService.changeStage(caseId, newStage),
    onMutate: async ({ caseId, newStage }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['cases'] });

      // Snapshot the previous value
      const previousIssues = queryClient.getQueryData<BaseIssue[]>(['cases']);

      // Optimistically update to the new value
      if (previousIssues) {
        queryClient.setQueryData<BaseIssue[]>(['cases'], old => {
          if (!old) return old;
          return old.map(issue => {
            if (issue.id === caseId) {
              return { ...issue, stage: newStage, status: newStage } as any;
            }
            return issue;
          });
        });
      }

      return { previousIssues };
    },
    onError: (err, newTodo, context) => {
      // Rollback on error
      if (context?.previousIssues) {
        queryClient.setQueryData(['cases'], context.previousIssues);
      }
      toast.error('阶段变更失败，已回滚');
    },
    onSettled: () => {
      // Always refetch after error or success to ensure sync
      queryClient.invalidateQueries({ queryKey: ['cases'] });
    },
  });

  // Auto-select first item if list mode and no selection
  useEffect(() => {
    if (viewMode === 'LIST' && issues.length > 0 && !selectedId && !isLoading) {
        setSelectedId(issues[0].id);
    }
  }, [viewMode, issues, selectedId, isLoading]);

  // Helpers for Sort (Robustness Fix)
  const getAmount = (i: BaseIssue): number => {
      let val = 0;
      if (i.issueType === IssueType.CASE || i.issueType === IssueType.EPIC) {
          val = (i as Case).regulatoryAttrs?.amountNoInterest || 0;
      } else if (i.issueType === IssueType.CLUE) {
          val = (i as Clue).cleanedAmount || 0;
      }
      return isNaN(val) ? 0 : val;
  };

  const getDeadline = (i: BaseIssue): number => {
      let d = '';
      if (i.issueType === IssueType.CASE || i.issueType === IssueType.EPIC) d = (i as Case).nextDeadline || '';
      else if (i.issueType === IssueType.TASK) d = (i as any).deadline || '';
      
      if (!d) return 0;
      const ms = new Date(d).getTime();
      return isNaN(ms) ? 0 : ms;
  };

  // --- Display Data: Direct from backend (all filtering/sorting done server-side) ---
  const filteredIssues = useMemo(() => {
      // Backend API handles all filtering via baseFilterParams
      // Only client-side operation: "showMasterOnly" (if needed) or search keyword enhancement
      let result = [...issues];

      // Master Only Filter Logic (not supported by backend yet)
      if (activeFilters.showMasterOnly) {
          result = result.filter(issue => {
              if (issue.issueType === IssueType.CASE) {
                  return (issue as Case).caseType !== CaseType.SERIES_CHILD;
              }
              return true;
          });
      }

      // Owner filter (not supported by backend API yet, keep client-side)
      if (activeFilters.owner === 'ME') {
          result = result.filter(issue => {
              const assignee = issue.assignee || '';
              return assignee === user?.name;
          });
      }

      // Sorting (Safe)
      result.sort((a, b) => {
          let valA: number = 0;
          let valB: number = 0;

          switch (sortConfig.field) {
              case 'CREATED_AT':
                  valA = new Date(a.createdAt).getTime() || 0;
                  valB = new Date(b.createdAt).getTime() || 0;
                  break;
              case 'AMOUNT':
                  valA = getAmount(a as any);
                  valB = getAmount(b as any);
                  break;
              case 'DEADLINE':
                  valA = getDeadline(a as any);
                  valB = getDeadline(b as any);
                  
                  // Special Handling for "No Deadline" (0)
                  const MAX_VAL = Number.MAX_SAFE_INTEGER;
                  const MIN_VAL = -1; 

                  if (valA === 0) valA = sortConfig.direction === 'ASC' ? MAX_VAL : MIN_VAL;
                  if (valB === 0) valB = sortConfig.direction === 'ASC' ? MAX_VAL : MIN_VAL;
                  break;
          }

          // Standard numeric comparison
          return sortConfig.direction === 'ASC' ? valA - valB : valB - valA;
      });

      return result;
  }, [issues, searchQuery, activeFilters, sortConfig]);

  const selectedIssue = useMemo(() => 
      filteredIssues.find(i => i.id === selectedId) || null
  , [filteredIssues, selectedId]);

  // --- Keyboard Navigation ---
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (viewMode !== 'LIST') return;
          if (filteredIssues.length === 0) return;

          const currentIndex = filteredIssues.findIndex(i => i.id === selectedId);
          
          if (e.key === 'ArrowDown') {
              e.preventDefault();
              const nextIndex = Math.min(currentIndex + 1, filteredIssues.length - 1);
              setSelectedId(filteredIssues[nextIndex].id);
              const el = document.getElementById(`issue-row-${filteredIssues[nextIndex].id}`);
              el?.scrollIntoView({ block: 'nearest' });
          } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              const prevIndex = Math.max(currentIndex - 1, 0);
              setSelectedId(filteredIssues[prevIndex].id);
              const el = document.getElementById(`issue-row-${filteredIssues[prevIndex].id}`);
              el?.scrollIntoView({ block: 'nearest' });
          }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewMode, filteredIssues, selectedId]);


  // --- Stats (from BFF summary-stats, full dataset aggregation, view-independent) ---
  // NOTE: axios 响应拦截器已将 snake_case 转为 camelCase，所以读 camelCase 字段
  const stats = useMemo(() => {
      if (serverStats) {
          return {
              total: (serverStats as any).total || 0,
              amount: Number((serverStats as any).totalAmount || 0),
              highRisk: (serverStats as any).majorRisk || 0,
              active: (serverStats as any).inProgress || 0,
          };
      }
      // Fallback: BFF 不可用时从已加载数据估算（仅供降级，数据不完整）
      const cases = issues.filter(i => i.issueType === IssueType.CASE || i.issueType === IssueType.EPIC) as Case[];
      const amount = cases.reduce((sum, c) => sum + (c.regulatoryAttrs?.amountNoInterest || 0), 0);
      return {
          total: filteredIssues.length,
          amount,
          highRisk: filteredIssues.filter(i => i.priority === '特大' || i.priority === '重大').length,
          active: filteredIssues.filter(i => i.status !== '已结案' && i.status !== '已关闭').length
      };
  }, [serverStats, issues, filteredIssues]);

  // --- Calendar Events ---
  const calendarEvents: CalendarEvent[] = useMemo(() => {
      return filteredIssues.map(i => {
            let date = '';
            if (i.issueType === IssueType.CASE) date = (i as Case).nextDeadline || '';
            if (i.issueType === IssueType.TASK) date = (i as any).deadline || '';
            if (!date) return null;
            // 根据日历事件类型区分颜色: 任务截止(红) > 立案日(蓝) > 结案日(灰)
            const eventType = (i as Case).calendarEventType;
            let eventColor: CalendarEvent['type'] = 'info';
            if (eventType === 'TASK_DEADLINE') eventColor = 'danger';
            else if (eventType === 'CASE_FILING') eventColor = 'info';
            else if (eventType === 'CASE_CLOSE') eventColor = 'neutral';
            else eventColor = i.priority === '特大' ? 'danger' : i.priority === '重大' ? 'warning' : 'info';
            return {
                id: i.id,
                date: date,
                title: i.title,
                type: eventColor,
                data: i
            };
        }).filter(Boolean) as CalendarEvent[];
  }, [filteredIssues]);

  // --- Handlers ---
  const handleFilterChange = (type: string, value: any) => {
      setActiveFilters(prev => ({ ...prev, [type]: value }));
      // Reset pagination when filters change
      setListPage(1);
      setLedgerPage(1);
      if (type === 'type' && value !== IssueType.CASE && value !== 'ALL') {
          setViewMode('LIST');
      }
  };

  const handleResetFilters = () => {
      setSearchQuery('');
      setActiveFilters({ type: 'ALL', risk: 'ALL', stage: 'ALL', owner: 'ALL', businessLine: 'ALL', procedure: 'ALL', dateStart: '', dateEnd: '', showMasterOnly: false });
      setListPage(1);
      setLedgerPage(1);
  };

  const handleSortChange = (field: SortField) => {
      setSortConfig(prev => ({
          field,
          direction: prev.field === field && prev.direction === 'DESC' ? 'ASC' : 'DESC'
      }));
      setIsSortMenuOpen(false);
  };

  const handleStageChange = (caseId: string, newStage: CaseStage) => {
      stageMutation.mutate({ caseId, newStage });
  };

  const handleExport = async () => {
      setIsExporting(true);
      try {
          // Filter only Cases (not Tasks/Clues) for the ledger export
          const casesToExport = filteredIssues.filter(i => i.issueType === IssueType.CASE || i.issueType === IssueType.EPIC) as Case[];
          if (casesToExport.length === 0) {
              toast.warning("当前筛选条件下无案件可导出");
              return;
          }
          await exportCaseLedgerToExcel({
              keyword: searchQuery || undefined,
              caseStatus: activeFilters.stage !== 'ALL' ? activeFilters.stage : undefined,
              riskLevel: activeFilters.risk !== 'ALL' ? activeFilters.risk : undefined,
              businessLine: activeFilters.businessLine !== 'ALL' ? activeFilters.businessLine : undefined,
              procedureType: activeFilters.procedure !== 'ALL' ? activeFilters.procedure : undefined,
              dateStart: activeFilters.dateStart || undefined,
              dateEnd: activeFilters.dateEnd || undefined,
          });
          toast.success("台账导出成功");
      } catch (error) {
          console.error("Export failed:", error);
          toast.error("导出失败，请重试");
      } finally {
          setIsExporting(false);
      }
  };

  const getSortLabel = () => {
      if (sortConfig.field === 'CREATED_AT') return '创建时间';
      if (sortConfig.field === 'AMOUNT') return '涉案金额';
      if (sortConfig.field === 'DEADLINE') return '截止日期';
      return '排序';
  };

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-red-500 bg-red-50/50 rounded-xl border border-red-100 p-8">
        <AlertTriangle className="w-10 h-10 mb-4" />
        <h3 className="text-lg font-bold mb-2">数据加载失败</h3>
        <p className="text-sm text-red-400 mb-4">无法连接到服务器或接口异常，请稍后重试。</p>
        <Button onClick={() => queryClient.invalidateQueries({ queryKey: ['cases'] })}>重新加载</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] animate-in fade-in duration-500">
        
        {/* 1. Header (Compressed) */}
        <div className="flex justify-between items-center shrink-0 mb-3 pt-1">
            <div className="flex items-center gap-4">
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">案件管理</h2>
                <div className="flex items-center gap-3 text-xs text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                    <span className="flex items-center gap-1"><Briefcase className="w-3 h-3"/> <b>{stats.active}</b> 在办</span>
                    <span className="w-px h-3 bg-slate-300"></span>
                    <span className="flex items-center gap-1 text-emerald-600"><TrendingUp className="w-3 h-3"/> <b>¥{(stats.amount/100000000).toFixed(2)}亿</b></span>
                    <span className="w-px h-3 bg-slate-300"></span>
                    <span className="flex items-center gap-1 text-red-600"><AlertTriangle className="w-3 h-3"/> <b>{stats.highRisk}</b> 高风险</span>
                </div>
            </div>
            <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleExport} disabled={isExporting}>
                    {isExporting ? (
                        <><div className="animate-spin w-3 h-3 border-2 border-slate-500 border-t-transparent rounded-full mr-2"></div> 导出中...</>
                    ) : (
                        <><Download className="w-3.5 h-3.5 mr-1" /> 导出台账</>
                    )}
                </Button>
                <Button size="sm" onClick={() => onNavigate('/cases/new')} className="shadow-sm shadow-brand-500/30">
                    <Plus className="w-3.5 h-3.5 mr-1" /> 新建
                </Button>
            </div>
        </div>

        {/* 2. Controls Row */}
        <div className="flex items-start justify-between bg-white z-20 pb-3 border-b border-slate-200 shrink-0">
            <div className="flex-1">
                <CaseFilterBar 
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    activeFilters={activeFilters}
                    onFilterChange={handleFilterChange}
                    onReset={handleResetFilters}
                />
            </div>

            <div className="flex items-center gap-1 ml-4 shrink-0 h-9 bg-white border border-slate-200 rounded-lg p-0.5 shadow-sm">
                <button
                    onClick={() => {
                        setViewMode('LIST');
                        setSelectedId(null);
                    }}
                    className={`h-8 w-9 flex items-center justify-center rounded-md transition-all ${viewMode === 'LIST' ? 'bg-brand-50 text-brand-600 font-bold' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
                    title="列表/预览视图"
                >
                    <LayoutList className="w-4 h-4" />
                </button>
                <div className="w-px h-4 bg-slate-200"></div>
                {(activeFilters.type === 'ALL' || activeFilters.type === IssueType.CASE) && (
                    <>
                        <button 
                            onClick={() => {
                                setViewMode('KANBAN');
                                setSelectedId(null); // Clear selection on switch to Kanban
                            }}
                            className={`h-8 w-9 flex items-center justify-center rounded-md transition-all ${viewMode === 'KANBAN' ? 'bg-brand-50 text-brand-600 font-bold' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
                            title="看板视图 (仅案件)"
                        >
                            <LayoutGrid className="w-4 h-4" />
                        </button>
                        <div className="w-px h-4 bg-slate-200"></div>
                    </>
                )}
                <button
                    onClick={() => {
                        setViewMode('CALENDAR');
                        setSelectedId(null);
                    }}
                    className={`h-8 w-9 flex items-center justify-center rounded-md transition-all ${viewMode === 'CALENDAR' ? 'bg-brand-50 text-brand-600 font-bold' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
                    title="日历视图"
                >
                    <CalendarIcon className="w-4 h-4" />
                </button>
                <div className="w-px h-4 bg-slate-200"></div>
                <button
                    onClick={() => {
                        setViewMode('LEDGER');
                        setSelectedId(null);
                    }}
                    className={`h-8 w-9 flex items-center justify-center rounded-md transition-all ${viewMode === 'LEDGER' ? 'bg-brand-50 text-brand-600 font-bold' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
                    title="台账视图 (高密度)"
                >
                    <LayoutList className="w-4 h-4 rotate-90" />
                </button>
            </div>
        </div>

        {/* 3. Main Content Area */}
        <div className="flex-1 min-h-0 pt-2 relative">
            {isLoading && !issues.length ? (
                <div className="h-full p-4">
                    <TableSkeleton rows={10} columns={5} />
                </div>
            ) : filteredIssues.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-400 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                    <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mb-3 shadow-sm">
                        <FileText className="w-6 h-6 opacity-30" />
                    </div>
                    <p className="font-medium">未找到匹配的事项</p>
                    <button onClick={handleResetFilters} className="text-sm text-brand-600 hover:underline mt-1">清除筛选条件</button>
                </div>
            ) : (
                <>
                    {/* View: LEDGER (High Density Table) */}
                    {viewMode === 'LEDGER' && (
                        <div className="h-full">
                            <CaseLedgerTable 
                                cases={filteredIssues.filter(i => i.issueType === IssueType.CASE || i.issueType === IssueType.EPIC) as Case[]}
                                onSelectCase={(id) => setSelectedId(id)}
                            />
                            {/* Detail: Ledger Drawer (Wide, Slides in) */}
                            {selectedId && selectedIssue && (selectedIssue.issueType === IssueType.CASE || selectedIssue.issueType === IssueType.EPIC) && (
                                <div className="fixed inset-y-0 right-0 z-50 flex">
                                    {/* Backdrop */}
                                    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setSelectedId(null)}></div>
                                    
                                    {/* Drawer */}
                                    <div className="relative z-10 h-full">
                                        <LedgerDrawer 
                                            selectedCase={selectedIssue as Case} 
                                            onNavigateFull={onNavigate}
                                            onClose={() => setSelectedId(null)}
                                        />
                                    </div>
                                </div>
                            )}
                            {/* Ledger Pagination */}
                            <Pagination
                                page={ledgerPage}
                                size={ledgerSize}
                                total={ledgerData?.total || 0}
                                onPageChange={setLedgerPage}
                                onSizeChange={(s) => { setLedgerSize(s); setLedgerPage(1); }}
                            />
                        </div>
                    )}

                    {/* View: SPLIT LIST (Master-Detail) */}
                    {viewMode === 'LIST' && (
                        <div className="flex flex-col h-full border border-slate-200 rounded-xl overflow-hidden shadow-sm bg-white">
                          <div className="flex flex-1 min-h-0">
                            {/* Left: Master List (Fixed Width) */}
                            <div className="w-96 flex flex-col border-r border-slate-200 bg-slate-50/50">
                                <div className="p-3 border-b border-slate-200 flex justify-between items-center bg-white">
                                    <span className="text-xs font-bold text-slate-500">{listData?.total || filteredIssues.length} 个事项</span>
                                    
                                    {/* Sort Dropdown */}
                                    <div className="relative">
                                        <button 
                                            className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-brand-600 font-medium px-2 py-1 rounded hover:bg-slate-50"
                                            onClick={() => setIsSortMenuOpen(!isSortMenuOpen)}
                                        >
                                            {getSortLabel()} {sortConfig.direction === 'DESC' ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />}
                                        </button>
                                        
                                        {isSortMenuOpen && (
                                            <>
                                                <div className="fixed inset-0 z-10" onClick={() => setIsSortMenuOpen(false)}></div>
                                                <div className="absolute right-0 top-full mt-1 w-32 bg-white border border-slate-200 rounded-lg shadow-xl z-20 overflow-hidden animate-in fade-in zoom-in-95">
                                                    {[
                                                        { label: '创建时间 (Date)', field: 'CREATED_AT' },
                                                        { label: '涉案金额 (Amount)', field: 'AMOUNT' },
                                                        { label: '截止日期 (Due)', field: 'DEADLINE' }
                                                    ].map((opt) => (
                                                        <button
                                                            key={opt.field}
                                                            onClick={() => handleSortChange(opt.field as SortField)}
                                                            className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-slate-50 ${
                                                                sortConfig.field === opt.field ? 'text-brand-600 font-bold bg-brand-50' : 'text-slate-600'
                                                            }`}
                                                        >
                                                            {opt.label}
                                                            {sortConfig.field === opt.field && <Check className="w-3 h-3" />}
                                                        </button>
                                                    ))}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto custom-scrollbar" ref={listContainerRef}>
                                    {filteredIssues.map(issue => (
                                        <div id={`issue-row-${issue.id}`} key={issue.id}>
                                            <IssueListRow 
                                                issue={issue} 
                                                isSelected={selectedId === issue.id}
                                                onClick={() => setSelectedId(issue.id)}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Right: Preview Pane (Flexible) */}
                            <div className="flex-1 overflow-hidden relative">
                                <PreviewPane 
                                    selectedId={selectedId} 
                                    itemType={selectedIssue?.issueType === IssueType.CLUE ? 'CLUE' : selectedIssue?.issueType === IssueType.TASK ? 'EXECUTABLE_TASK' : 'CASE'}
                                    onNavigateFull={onNavigate} 
                                    onClose={() => setSelectedId(null)}
                                />
                            </div>
                          </div>
                          {/* List Pagination */}
                          <Pagination
                              page={listPage}
                              size={listSize}
                              total={listData?.total || 0}
                              onPageChange={setListPage}
                              onSizeChange={(s) => { setListSize(s); setListPage(1); }}
                          />
                        </div>
                    )}

                    {/* View: KANBAN (Split View Board) */}
                    {viewMode === 'KANBAN' && (
                        <div className="flex h-full overflow-hidden">
                            {/* Master: Kanban Board (Takes remaining space) */}
                            <div className="flex-1 min-w-0 transition-all duration-300">
                                <CaseKanban 
                                    cases={filteredIssues.filter(i => i.issueType === IssueType.CASE || i.issueType === IssueType.EPIC || i.issueType === IssueType.CLUE) as Case[]} 
                                    selectedId={selectedId}
                                    onSelectCase={(id) => setSelectedId(id === selectedId ? null : id)} 
                                    onStageChange={handleStageChange} // Pass the handler
                                />
                            </div>
                            
                            {/* Detail: Preview Pane (Fixed Width, Slides in) */}
                            {selectedId && (
                                <div className="w-[500px] border-l border-slate-300 bg-white shrink-0 shadow-2xl z-20 animate-in slide-in-from-right duration-300 relative flex flex-col">
                                    <PreviewPane 
                                        selectedId={selectedId} 
                                        itemType={selectedIssue?.issueType === IssueType.CLUE ? 'CLUE' : selectedIssue?.issueType === IssueType.TASK ? 'EXECUTABLE_TASK' : 'CASE'}
                                        onNavigateFull={onNavigate}
                                        onClose={() => setSelectedId(null)}
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {/* View: CALENDAR */}
                    {viewMode === 'CALENDAR' && (
                        <div className="flex gap-6 h-full">
                            <div className="flex-1 h-full overflow-hidden">
                                <CalendarView 
                                    events={calendarEvents} 
                                    selectedDate={selectedDate}
                                    onDateSelect={setSelectedDate}
                                    className="h-full flex flex-col"
                                />
                            </div>
                            <div className="w-80 bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col shrink-0">
                                <h4 className="font-bold text-slate-800 border-b border-slate-100 pb-3 mb-3 flex items-center gap-2">
                                    <Clock className="w-4 h-4 text-brand-600"/> {selectedDate} 事项
                                </h4>
                                <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar">
                                    {calendarEvents.filter(e => e.date === selectedDate).length === 0 ? (
                                        <div className="text-center text-slate-400 py-10 text-sm">
                                            本日无截止事项
                                        </div>
                                    ) : (
                                        calendarEvents.filter(e => e.date === selectedDate).map(evt => {
                                            const eventType = evt.data.calendarEventType;
                                            const typeLabel = eventType === 'TASK_DEADLINE' ? '任务截止' : eventType === 'CASE_FILING' ? '立案日' : eventType === 'CASE_CLOSE' ? '结案日' : evt.data.status;
                                            const dotColor = evt.type === 'danger' ? 'bg-red-500' : evt.type === 'warning' ? 'bg-amber-500' : evt.type === 'neutral' ? 'bg-slate-400' : 'bg-brand-500';
                                            return (
                                                <div key={evt.id} className="p-3 bg-slate-50 rounded-lg border border-slate-100 hover:border-brand-200 cursor-pointer" onClick={() => onNavigate(`/cases/${evt.data.caseId || evt.data.id}`)}>
                                                    <div className="text-xs text-slate-500 mb-1">{evt.data.key}</div>
                                                    <div className="text-sm font-bold text-slate-800 line-clamp-2">{evt.title}</div>
                                                    <div className="mt-2 flex items-center gap-2">
                                                        <span className={`w-2 h-2 rounded-full ${dotColor}`}></span>
                                                        <span className="text-xs text-slate-500">{typeLabel}</span>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    </div>
  );
};

export default CaseList;
