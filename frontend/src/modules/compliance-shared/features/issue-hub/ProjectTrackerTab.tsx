import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, 
  ChevronDown, 
  ChevronUp, 
  Bell, 
  CheckCircle2, 
  AlertCircle,
  Calendar,
  Building2,
  ChevronLeft,
  ChevronRight,
  FilterX,
  Filter
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { issueApi, type IssueProjectBranchProgress, type IssueProjectRollup, type IssueProjectRollupPage } from '../../services/api';

type DrilldownFilters = Record<string, string>;
type BranchLoadState = {
  items: IssueProjectBranchProgress[];
  page: number;
  pageSize: number;
  total: number;
  loading: boolean;
  error: string | null;
};
type PaginationProps = {
  total: number;
  page: number;
  pageSize: number;
  label: string;
  testIdPrefix: string;
  onPageChange: (page: number) => void;
};

const PROJECT_PAGE_SIZE = 1;
const BRANCH_PAGE_SIZE = 1;

const emptyProjectPage: IssueProjectRollupPage = {
  items: [],
  page: 1,
  pageSize: PROJECT_PAGE_SIZE,
  total: 0,
  summary: { totalProjects: 0, atRiskProjects: 0 },
};

const Pagination = ({ total, page, pageSize, label, testIdPrefix, onPageChange }: PaginationProps) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) {
    return (
      <div className="px-4 py-3 bg-white border-t border-slate-200 text-xs text-slate-500">
        共 <span className="font-medium text-slate-700">{total}</span> {label}
      </div>
    );
  }
  const pages = Array.from({ length: totalPages }, (_, index) => index + 1);
  return (
    <div className="flex items-center justify-between px-4 py-3 bg-white border-t border-slate-200 sm:px-6">
      <p className="text-xs text-slate-500">
        第 <span className="font-medium text-slate-700">{page}</span> / {totalPages} 页，共 <span className="font-medium text-slate-700">{total}</span> {label}
      </p>
      <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
        <button
          data-testid={`${testIdPrefix}-prev`}
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="relative inline-flex items-center px-2 py-1.5 border border-slate-300 bg-white text-sm font-medium text-slate-500 hover:bg-slate-50 rounded-l-md disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="sr-only">上一页</span>
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        {pages.map(pageNumber => (
          <button
            key={pageNumber}
            data-testid={`${testIdPrefix}-page-${pageNumber}`}
            onClick={() => onPageChange(pageNumber)}
            className={`relative inline-flex items-center px-3 py-1.5 border text-sm font-medium ${pageNumber === page ? 'border-indigo-500 bg-indigo-50 text-indigo-600' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
          >
            {pageNumber}
          </button>
        ))}
        <button
          data-testid={`${testIdPrefix}-next`}
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="relative inline-flex items-center px-2 py-1.5 border border-slate-300 bg-white text-sm font-medium text-slate-500 hover:bg-slate-50 rounded-r-md disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="sr-only">下一页</span>
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </nav>
    </div>
  );
};

export default function ProjectTrackerTab({ onDrillDown }: { onDrillDown?: (filters?: DrilldownFilters) => void }) {
  const [projectPage, setProjectPage] = useState<IssueProjectRollupPage>(emptyProjectPage);
  const [projectLoading, setProjectLoading] = useState(true);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [branchesByProject, setBranchesByProject] = useState<Record<string, BranchLoadState>>({});
  const [reminderPending, setReminderPending] = useState<Record<string, boolean>>({});
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [yearFilter, setYearFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [projectPageNumber, setProjectPageNumber] = useState(1);

  const projectQuery = useMemo(() => ({
    keyword: searchTerm.trim() || undefined,
    year: yearFilter === 'ALL' ? undefined : yearFilter,
    status: statusFilter === 'ALL' ? undefined : statusFilter,
    page: projectPageNumber,
    pageSize: PROJECT_PAGE_SIZE,
  }), [projectPageNumber, searchTerm, statusFilter, yearFilter]);

  useEffect(() => {
    setProjectPageNumber(1);
  }, [searchTerm, statusFilter, yearFilter]);

  const loadBranches = useCallback((projectId: string, page = 1) => {
    setBranchesByProject(prev => ({
      ...prev,
      [projectId]: {
        items: prev[projectId]?.items ?? [],
        page,
        pageSize: BRANCH_PAGE_SIZE,
        total: prev[projectId]?.total ?? 0,
        loading: true,
        error: null,
      },
    }));
    issueApi.getIssueProjectBranches(projectId, { page, pageSize: BRANCH_PAGE_SIZE })
      .then(page => {
        setBranchesByProject(prev => ({
          ...prev,
          [projectId]: {
            items: page.items,
            page: page.page,
            pageSize: page.pageSize,
            total: page.total,
            loading: false,
            error: null,
          },
        }));
      })
      .catch(error => {
        const message = error instanceof Error ? error.message : '项目机构进度加载失败';
        setBranchesByProject(prev => ({
          ...prev,
          [projectId]: {
            items: prev[projectId]?.items ?? [],
            page,
            pageSize: BRANCH_PAGE_SIZE,
            total: prev[projectId]?.total ?? 0,
            loading: false,
            error: message,
          },
        }));
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setProjectLoading(true);
    setProjectError(null);
    issueApi.getIssueProjectTracker(projectQuery)
      .then(page => {
        if (cancelled) return;
        setProjectPage(page);
        setBranchesByProject({});
        const firstProject = page.items[0];
        setExpandedProjects(firstProject ? { [firstProject.projectId]: true } : {});
      })
      .catch(error => {
        if (cancelled) return;
        setProjectError(error instanceof Error ? error.message : '项目跟踪大盘加载失败');
        setProjectPage(emptyProjectPage);
        setExpandedProjects({});
        setBranchesByProject({});
      })
      .finally(() => {
        if (!cancelled) setProjectLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectQuery]);

  useEffect(() => {
    projectPage.items.forEach(project => {
      if (expandedProjects[project.projectId] && !branchesByProject[project.projectId]) {
        loadBranches(project.projectId);
      }
    });
  }, [branchesByProject, expandedProjects, loadBranches, projectPage.items]);

  const handleDrillDownView = (projectTitle: string, branch: IssueProjectBranchProgress) => {
    toast.success(`已切换至缺陷总库，并筛选：${projectTitle} / ${branch.name}`);
    if (onDrillDown) onDrillDown(branch.drilldownFilters);
  };

  const toggleProject = (id: string, e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button.batch-remind-btn')) {
      return;
    }
    const nextExpanded = !expandedProjects[id];
    setExpandedProjects(prev => ({ ...prev, [id]: nextExpanded }));
    if (nextExpanded && !branchesByProject[id]) {
      loadBranches(id, 1);
    }
  };

  const handleBranchPageChange = (projectId: string, page: number) => {
    loadBranches(projectId, page);
  };

  const handleReminder = async (project: IssueProjectRollup, e: React.MouseEvent) => {
    e.stopPropagation();
    const targetOrgIds = project.overdueTargetOrgIds ?? [];
    if (targetOrgIds.length === 0) {
      toast.info('当前项目没有可催办的逾期机构。');
      return;
    }
    setReminderPending(prev => ({ ...prev, [project.projectId]: true }));
    try {
      const result = await issueApi.sendProjectOverdueReminder(project.projectId, {
        targetOrgIds,
        reason: '项目逾期整改提醒',
        deliveryMode: 'IN_APP_NOTIFICATION',
      });
      toast.success(result.duplicate
        ? '今日相同催办已存在，系统已复用幂等结果。'
        : `已向 ${result.resultSummary.notificationCount} 个机构用户发送站内催办通知。`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '逾期催办下发失败');
    } finally {
      setReminderPending(prev => ({ ...prev, [project.projectId]: false }));
    }
  };

  const resetFilters = () => {
    setSearchTerm('');
    setYearFilter('ALL');
    setStatusFilter('ALL');
  };

  return (
    <div data-testid="p2-issue-project-tracker-tab" className="flex flex-col h-full space-y-4">
      {/* Top Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-wrap gap-4 items-end shadow-sm z-10 relative">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">搜索项目</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-400" />
            </div>
            <input
              data-testid="p2-issue-project-filter-keyword"
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all shadow-sm"
              placeholder="搜索项目名称..."
            />
          </div>
        </div>

        <div className="w-40">
          <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">检查年份</label>
          <select
            data-testid="p2-issue-project-filter-year"
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className="block w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white shadow-sm font-medium text-slate-700"
          >
            <option value="ALL">全部年份</option>
            <option value="2026">2026年</option>
            <option value="2025">2025年</option>
          </select>
        </div>

        <div className="w-40">
          <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">项目状态</label>
          <select
            data-testid="p2-issue-project-filter-status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="block w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white shadow-sm font-medium text-slate-700"
          >
            <option value="ALL">全部状态</option>
            <option value="IN_PROGRESS">整改中</option>
            <option value="AT_RISK">存在逾期风险</option>
            <option value="CLOSED">已销号</option>
          </select>
        </div>

        <button
          data-testid="p2-issue-project-filter-reset"
          onClick={resetFilters}
          className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm font-bold hover:bg-slate-50 transition-colors flex items-center shadow-sm"
        >
          <FilterX className="w-4 h-4 mr-2" /> 重置
        </button>
      </div>

      {/* Expandable Project Cards Area */}
      <div className="flex-1 overflow-y-auto space-y-4">
        {projectLoading && (
          <div data-testid="p2-issue-project-loading" className="bg-white border border-slate-200 rounded-xl p-6 text-sm font-medium text-slate-500 shadow-sm">
            正在加载项目跟踪大盘...
          </div>
        )}
        {projectError && (
          <div data-testid="p2-issue-project-error" className="bg-rose-50 border border-rose-200 rounded-xl p-6 text-sm font-bold text-rose-700 shadow-sm">
            {projectError}
          </div>
        )}
        {!projectLoading && !projectError && projectPage.items.length === 0 && (
          <div data-testid="p2-issue-project-empty" className="bg-white border border-slate-200 rounded-xl p-6 text-sm font-medium text-slate-500 shadow-sm">
            当前筛选条件下没有项目。
          </div>
        )}
        {!projectLoading && !projectError && projectPage.items.map(project => {
          const isExpanded = expandedProjects[project.projectId];
          const isDone = project.status === 'CLOSED' || project.metrics.completionRate === 100;
          const branchState = branchesByProject[project.projectId];
          const hasOverdueTargets = (project.overdueTargetOrgIds ?? []).length > 0;
          const isReminderPending = reminderPending[project.projectId];

          return (
            <div
              key={project.projectId}
              data-testid={`p2-issue-project-card-${project.projectId}`}
              className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden transition-shadow hover:shadow-md"
            >
              {/* Card Header (Always Visible) */}
              <div
                data-testid={`p2-issue-project-card-header-${project.projectId}`}
                className="p-5 cursor-pointer hover:bg-slate-50/50 transition-colors group select-none flex flex-col xl:flex-row xl:items-center gap-6 relative"
                onClick={(e) => toggleProject(project.projectId, e)}
              >
                {/* Left: Info */}
                <div className="flex-1 xl:max-w-md">
                  <div className="flex items-center space-x-2 mb-2">
                    <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded">{project.projectId}</span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                      {project.leadDept}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-slate-800 line-clamp-1 mb-1 group-hover:text-indigo-700 transition-colors">
                    {project.title || project.projectTitle}
                  </h3>
                  <div className="flex items-center text-xs text-slate-500 font-medium">
                    <Calendar className="w-3.5 h-3.5 mr-1" />
                    {project.dateRangeLabel}
                  </div>
                </div>

                {/* Middle: Metrics Bar */}
                <div className="flex-1 min-w-[280px]">
                  <div className="flex justify-between items-end mb-2">
                    <span className="text-sm font-bold text-slate-700 ml-1">
                      进度: {project.metrics.completionRate}%
                    </span>
                    <span className="text-xs font-medium text-slate-500 mr-1">
                      (已销号 <span className={isDone ? 'text-emerald-600 font-bold' : 'text-slate-700'}>{project.metrics.completed}</span> / 总计 {project.metrics.totalIssues})
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden border border-slate-200 shadow-inner">
                    <div 
                      className={`h-full rounded-full transition-all duration-1000 ${isDone ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                      style={{ width: `${project.metrics.completionRate}%` }}
                    >
                      {isDone && <div className="w-full h-full bg-emerald-400/30 animate-[shimmer_2s_infinite]"></div>}
                    </div>
                  </div>
                </div>

                {/* Right: Triggers & Actions */}
                <div className="flex items-center justify-between xl:justify-end space-x-4 xl:w-64 pt-2 xl:pt-0">
                  <div className="flex items-center space-x-3">
                    {!isDone && project.metrics.overdue > 0 && (
                      <span className="inline-flex items-center px-2 py-1 rounded text-xs font-bold bg-rose-100 text-rose-700 border border-rose-200 shadow-sm animate-[pulse_2s_ease-in-out_infinite]">
                        <AlertCircle className="w-3 h-3 mr-1" />
                        逾期: {project.metrics.overdue} 项
                      </span>
                    )}
                    
                    {!isDone && hasOverdueTargets && (
                      <button 
                        data-testid={`p2-issue-project-reminder-${project.projectId}`}
                        onClick={(e) => handleReminder(project, e)}
                        disabled={isReminderPending}
                        className="batch-remind-btn inline-flex items-center justify-center bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        <Bell className="w-3.5 h-3.5 mr-1" />
                        {isReminderPending ? '催办中' : '一键催办逾期'}
                      </button>
                    )}
                    
                    {isDone && (
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
                        <CheckCircle2 className="w-4 h-4 mr-1.5" />
                        全案已销号
                      </span>
                    )}
                  </div>

                  <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors shrink-0">
                    {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  </div>
                </div>
              </div>

              {/* Inner Details Workspace */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: "easeInOut" }}
                    className="border-t border-slate-200 bg-slate-50/50"
                  >
                    <div className="p-4 sm:p-6">
                      <div className="flex items-center mb-4">
                        <Building2 className="w-4 h-4 text-slate-500 mr-2" />
                        <h4 className="text-sm font-bold text-slate-800">各被检机构整改进度榜</h4>
                      </div>
                      
                      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-sm whitespace-nowrap">
                            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-xs uppercase">
                              <tr>
                                <th className="px-5 py-3 w-48">机构名称</th>
                                <th className="px-5 py-3 w-32 text-center border-l border-slate-100">涉及问题总数</th>
                                <th className="px-5 py-3 w-32 text-center border-l border-slate-100">已销号 (Closed)</th>
                                <th className="px-5 py-3 w-32 text-center border-l border-slate-100">逾期未改</th>
                                <th className="px-5 py-3 w-32 text-center border-l border-slate-100">当前状态</th>
                                <th className="px-5 py-3 w-32 text-center border-l border-slate-100">操作</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {branchState?.loading && (
                                <tr>
                                  <td data-testid={`p2-issue-project-branch-loading-${project.projectId}`} colSpan={6} className="px-5 py-5 text-center text-sm font-medium text-slate-500">
                                    正在加载机构进度...
                                  </td>
                                </tr>
                              )}
                              {branchState?.error && (
                                <tr>
                                  <td data-testid={`p2-issue-project-branch-error-${project.projectId}`} colSpan={6} className="px-5 py-5 text-center text-sm font-bold text-rose-600">
                                    {branchState.error}
                                  </td>
                                </tr>
                              )}
                              {!branchState?.loading && !branchState?.error && (branchState?.items ?? []).map(branch => (
                                <tr
                                  key={branch.id || branch.orgId}
                                  data-testid={`p2-issue-project-branch-row-${project.projectId}-${branch.orgId}`}
                                  className="hover:bg-slate-50/50 transition-colors"
                                >
                                  <td className="px-5 py-3.5 font-bold text-slate-700">{branch.name}</td>
                                  <td className="px-5 py-3.5 text-center font-medium border-l border-slate-50">{branch.total}</td>
                                  <td className="px-5 py-3.5 text-center font-bold text-emerald-600 border-l border-slate-50">{branch.completed}</td>
                                  <td className="px-5 py-3.5 text-center border-l border-slate-50">
                                    {branch.overdue > 0 ? (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-rose-50 text-rose-600 border border-rose-200 shadow-sm">
                                        <AlertCircle className="w-3 h-3 mr-1" />
                                        {branch.overdue} 项逾期
                                      </span>
                                    ) : (
                                      <span className="text-slate-400 font-medium">0</span>
                                    )}
                                  </td>
                                  <td className="px-5 py-3.5 text-center border-l border-slate-50">
                                    {branch.status === 'DONE' ? (
                                      <span className="text-emerald-600 text-xs font-bold flex items-center justify-center">
                                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> 整改完毕
                                      </span>
                                    ) : branch.status === 'IN_PROGRESS' ? (
                                      <span className="text-indigo-600 text-xs font-bold flex items-center justify-center">
                                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> 整改中
                                      </span>
                                    ) : (
                                      <span className="text-amber-600 text-xs font-bold flex items-center justify-center">
                                        <AlertCircle className="w-3.5 h-3.5 mr-1" /> 风险督办中
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-5 py-3.5 text-center border-l border-slate-50">
                                    <Button
                                      data-testid={`p2-issue-project-drilldown-${project.projectId}-${branch.orgId}`}
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleDrillDownView(project.title || project.projectTitle, branch)}
                                      className="text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 font-medium"
                                    >
                                      <Filter className="w-3.5 h-3.5 mr-1.5"/> 穿透查看
                                    </Button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <Pagination
                          total={branchState?.total ?? 0}
                          page={branchState?.page ?? 1}
                          pageSize={branchState?.pageSize ?? BRANCH_PAGE_SIZE}
                          label="个机构"
                          testIdPrefix={`p2-issue-project-branch-pagination-${project.projectId}`}
                          onPageChange={(page) => handleBranchPageChange(project.projectId, page)}
                        />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {/* Outer Pagination */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden text-sm shadow-sm">
        <div className="text-slate-500 font-medium">
          <Pagination
            total={projectPage.total}
            page={projectPage.page}
            pageSize={projectPage.pageSize}
            label="个项目"
            testIdPrefix="p2-issue-project-pagination"
            onPageChange={setProjectPageNumber}
          />
        </div>
      </div>

    </div>
  );
}
