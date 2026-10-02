import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Inbox, Search, Filter, Clock, AlertCircle, Calendar,
  ClipboardList, ShieldAlert, FileSearch, ArrowRight,
  CheckCircle2,
  FileSignature, Timer, CheckCircle,
  LayoutTemplate, PenTool, UploadCloud, ShieldCheck, ClipboardCheck,
  User, Phone, Briefcase, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { taskApi, inspectionApi, fileApi } from '../../services/api';
import { UnifiedTask, TaskCategory, InspectionPlanAcknowledgement, InspectionPlan, Attachment } from '../../types';

// Current simulated date for relative calculations
const CURRENT_DATE = new Date('2026-04-12T20:58:09-07:00');

interface UnifiedTaskCenterProps {
  onNavigate?: (view: string) => void;
  taskView?: 'hq' | 'branch';
  actorLabel?: string;
}

type TaskCategoryFilter = 'ALL' | TaskCategory;

export default function UnifiedTaskCenter({ onNavigate, taskView = 'branch', actorLabel }: UnifiedTaskCenterProps) {
  const role = taskView;
  const [activeTab, setActiveTab] = useState<TaskCategoryFilter>('ALL');
  const [statusFilter, setStatusFilter] = useState<'PENDING' | 'DONE'>('PENDING');
  const [searchQuery, setSearchQuery] = useState('');

  const [hqTasks, setHqTasks] = useState<UnifiedTask[]>([]);
  const [branchTasks, setBranchTasks] = useState<UnifiedTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Acknowledgement dialog state
  const [ackDialogOpen, setAckDialogOpen] = useState(false);
  const [ackTask, setAckTask] = useState<UnifiedTask | null>(null);
  const [liaisonName, setLiaisonName] = useState('');
  const [liaisonPhone, setLiaisonPhone] = useState('');
  const [liaisonTitle, setLiaisonTitle] = useState('');
  const [ackLoading, setAckLoading] = useState(false);
  const [ackError, setAckError] = useState<string | null>(null);
  const [ackResult, setAckResult] = useState<InspectionPlanAcknowledgement | null>(null);

  // Plan detail for attachment readback
  const [planDetail, setPlanDetail] = useState<InspectionPlan | null>(null);
  const [planDetailLoading, setPlanDetailLoading] = useState(false);
  const [planDetailError, setPlanDetailError] = useState<string | null>(null);

  const loadTasks = () => {
    setIsLoading(true);
    setLoadError(null);
    const request = role === 'hq' ? taskApi.getHQTasks() : taskApi.getBranchTasks();
    request
      .then(tasks => {
        if (role === 'hq') {
          setHqTasks(tasks);
          setBranchTasks([]);
        } else {
          setBranchTasks(tasks);
          setHqTasks([]);
        }
      })
      .catch(error => {
        setLoadError(error instanceof Error ? error.message : '待办加载失败');
        setHqTasks([]);
        setBranchTasks([]);
      })
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    loadTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const openAckDialog = async (task: UnifiedTask) => {
    setAckTask(task);
    setLiaisonName('');
    setLiaisonPhone('');
    setLiaisonTitle('');
    setAckError(null);
    setAckResult(null);
    setPlanDetail(null);
    setPlanDetailError(null);
    setAckDialogOpen(true);

    // Load plan detail for attachment readback
    const planId = task.actionTarget?.params?.inspectionPlanId;
    if (planId) {
      setPlanDetailLoading(true);
      try {
        const plan = await inspectionApi.getPlan(planId);
        setPlanDetail(plan);
      } catch (error) {
        setPlanDetailError(error instanceof Error ? error.message : '无法加载计划附件信息');
      } finally {
        setPlanDetailLoading(false);
      }
    }
  };

  const closeAckDialog = () => {
    setAckDialogOpen(false);
    setAckTask(null);
    setAckError(null);
    setPlanDetail(null);
    setPlanDetailError(null);
  };

  const handleDownloadFile = async (fileId: string, fileName: string) => {
    try {
      const result = await fileApi.getDownloadUrl(fileId);
      if (result?.downloadUrl) {
        const a = document.createElement('a');
        a.href = result.downloadUrl;
        a.download = fileName || 'download';
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        setAckError('文件下载链接暂不可用');
      }
    } catch (error) {
      setAckError(error instanceof Error ? error.message : '文件下载失败');
    }
  };

  const attachmentTypeLabel = (type?: string): string => {
    switch (type) {
      case 'INSPECTION_NOTICE': return '检查通知书';
      case 'ONSITE_INSPECTION_SCHEME': return '现场检查方案';
      case 'WORKING_PAPER_TEMPLATE': return '底稿模板';
      case 'OTHER': return '其他';
      default: return type || '附件';
    }
  };

  const scanStatusLabel = (status?: string): string => {
    switch (status) {
      case 'CLEAN': return '已通过安全扫描';
      case 'SCAN_DEFERRED': return '扫描待执行';
      case 'SCANNING': return '扫描中';
      case 'INFECTED': return '安全扫描异常';
      default: return status || '扫描待执行';
    }
  };

  const scanStatusColor = (status?: string): string => {
    switch (status) {
      case 'CLEAN': return 'text-emerald-600';
      case 'SCAN_DEFERRED': return 'text-amber-600';
      case 'SCANNING': return 'text-blue-600';
      case 'INFECTED': return 'text-rose-600';
      default: return 'text-slate-500';
    }
  };

  const submitAcknowledgement = async () => {
    if (!ackTask) return;
    const planId = ackTask.actionTarget.params?.inspectionPlanId;
    if (!planId) {
      setAckError('无法获取检查计划ID');
      return;
    }
    setAckLoading(true);
    setAckError(null);
    try {
      const result = await inspectionApi.acknowledgePlan(planId, {
        liaisonName: liaisonName.trim() || undefined,
        liaisonPhone: liaisonPhone.trim() || undefined,
        liaisonTitle: liaisonTitle.trim() || undefined,
      });
      setAckResult(result);
      // Refresh task list after successful acknowledgement
      loadTasks();
      // Close dialog after a short delay so user can see success
      setTimeout(() => {
        closeAckDialog();
      }, 1500);
    } catch (error) {
      setAckError(error instanceof Error ? error.message : '确认接收失败');
    } finally {
      setAckLoading(false);
    }
  };

  // Get current dataset based on role
  const currentTasks = role === 'hq' ? hqTasks : branchTasks;

  // Derived Stats
  const stats = useMemo(() => {
    let dueToday = 0;
    let overdue = 0;
    let thisWeek = 0;

    currentTasks.forEach(task => {
      if (task.status === 'DONE') return;
      
      const dueDate = new Date(task.dueDate);
      const isOverdue = dueDate < CURRENT_DATE && dueDate.toDateString() !== CURRENT_DATE.toDateString();
      const isDueToday = dueDate.toDateString() === CURRENT_DATE.toDateString();
      
      // Simple "this week" logic: within next 7 days
      const diffTime = dueDate.getTime() - CURRENT_DATE.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const isThisWeek = diffDays >= 0 && diffDays <= 7;

      if (isOverdue) overdue++;
      if (isDueToday) dueToday++;
      if (isThisWeek) thisWeek++;
    });

    return { dueToday, overdue, thisWeek };
  }, [currentTasks]);

  // Filtered Tasks
  const filteredTasks = useMemo(() => {
    return currentTasks.filter(task => {
      const matchesTab = activeTab === 'ALL' || task.category === activeTab;
      const matchesStatus = task.status === statusFilter;
      const matchesSearch = task.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            task.description.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesTab && matchesStatus && matchesSearch;
    }).sort((a, b) => {
      // Sort by priority (HIGH > MEDIUM > LOW) then by due date
      const priorityWeight = { HIGH: 3, MEDIUM: 2, LOW: 1 };
      if (priorityWeight[a.priority] !== priorityWeight[b.priority]) {
        return priorityWeight[b.priority] - priorityWeight[a.priority];
      }
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });
  }, [currentTasks, activeTab, statusFilter, searchQuery]);

  // UI Helpers
  const getCategoryDisplay = (category: TaskCategory) => {
    switch (category) {
      case 'ASSESSMENT': return { label: '考核待办', icon: ClipboardList, color: 'text-indigo-600 bg-indigo-50' };
      case 'ISSUE': return { label: '问题督办', icon: ShieldAlert, color: 'text-rose-600 bg-rose-50' };
      case 'INSPECTION': return { label: '检查待办', icon: FileSearch, color: 'text-emerald-600 bg-emerald-50' };
    }
  };

  const getPriorityBorder = (priority: string) => {
    switch (priority) {
      case 'HIGH': return 'border-l-rose-500';
      case 'MEDIUM': return 'border-l-amber-400';
      case 'LOW': return 'border-l-slate-300';
      default: return 'border-l-slate-300';
    }
  };

  const isTaskOverdue = (dueDateStr: string) => {
    const dueDate = new Date(dueDateStr);
    return dueDate < CURRENT_DATE && dueDate.toDateString() !== CURRENT_DATE.toDateString();
  };

  const isTaskDueToday = (dueDateStr: string) => {
    const dueDate = new Date(dueDateStr);
    return dueDate.toDateString() === CURRENT_DATE.toDateString();
  };

  const navigateToTaskTarget = (task: UnifiedTask) => {
    onNavigate?.(task.actionTarget.menuId);
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 font-sans relative overflow-hidden" data-testid={`${role === 'branch' ? 'p1-branch-dashboard' : 'p1-hq-task-center'}-page`}>
      
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 shrink-0 z-10 flex items-center justify-between shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center">
            <Inbox className="w-6 h-6 mr-2 text-indigo-600" />
            统一待办中心 (Unified Task Center)
          </h1>
          <p className="text-sm text-slate-500 mt-1">聚合检查、考核、问题库的全部待办事项</p>
        </div>
        
        <div className="hidden sm:flex items-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-600">
          <span className="mr-2 h-2 w-2 rounded-full bg-emerald-500" />
          {actorLabel || (role === 'hq' ? '总部管理待办' : '机构办理待办')}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-300">
        <div className="max-w-5xl mx-auto space-y-6">
          
          {/* Top Priority Zone: Mandates & Sign-offs */}
          {statusFilter === 'PENDING' && role === 'branch' && (
            <div className="space-y-4 mb-6">
              {(() => {
                const noticeTask = currentTasks.find(
                  t => t.status === 'PENDING' && t.actionTarget?.action === 'INSPECTION_NOTICE_ACKNOWLEDGEMENT'
                );
                return noticeTask ? (
                  <div className="bg-indigo-50 border border-indigo-200 p-4 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center shadow-sm gap-4">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-indigo-100 text-indigo-700">待签收 (Pending Ack)</span>
                        <span className="text-xs text-slate-500">检查通知下发</span>
                      </div>
                      <h3 className="text-base font-bold text-slate-800">{noticeTask.title}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">{noticeTask.description}</p>
                    </div>
                    <button
                      data-testid="p1-branch-dashboard-acknowledge-notice"
                      onClick={() => openAckDialog(noticeTask)}
                      className="w-full sm:w-auto px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-bold shadow-sm hover:bg-indigo-700 flex items-center justify-center shrink-0 transition-colors"
                    >
                      <FileSignature className="w-4 h-4 mr-2"/> 立即查阅并签收
                    </button>
                  </div>
                ) : null;
              })()}

              {(() => {
                // 红头督办令卡片仅在存在对应真实任务时展示；当前未实现对应任务类型，因此默认不渲染
                const urgentTask = currentTasks.find(
                  t => t.status === 'PENDING' && t.actionTarget?.action === 'URGENT_ENFORCEMENT_ACK'
                );
                return urgentTask ? (
                  <div className="bg-rose-50 border border-rose-200 p-4 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center shadow-sm gap-4">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-rose-600 text-white">红头督办令</span>
                        <span className="text-xs text-rose-500 font-bold flex items-center">
                          <Timer className="w-3 h-3 mr-1"/>限期 48 小时内落实
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-slate-800">{urgentTask.title}</h3>
                    </div>
                    <button
                      data-testid="p1-branch-dashboard-confirm-notice"
                      onClick={() => navigateToTaskTarget(urgentTask)}
                      className="w-full sm:w-auto px-4 py-2 bg-rose-600 text-white rounded-md text-sm font-bold shadow-sm hover:bg-rose-700 flex items-center justify-center shrink-0 transition-colors"
                    >
                      <CheckCircle className="w-4 h-4 mr-2"/> 已阅并确认执行
                    </button>
                  </div>
                ) : null;
              })()}
            </div>
          )}

          {/* 核心指标区 (Core Metrics) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="bg-white rounded-xl border border-amber-200 p-4 shadow-sm flex items-center relative overflow-hidden">
              <div className="absolute inset-0 bg-amber-50/50 pointer-events-none"></div>
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center mr-4 shrink-0 relative z-10">
                <Clock className="w-5 h-5 text-amber-600" />
              </div>
              <div className="relative z-10">
                <p className="text-sm font-medium text-amber-700">今日到期 (Due Today)</p>
                <p className="text-2xl font-bold text-amber-600">{stats.dueToday}</p>
              </div>
            </div>
            
            <div className="bg-white rounded-xl border border-rose-200 p-4 shadow-sm flex items-center relative overflow-hidden">
              <div className="absolute inset-0 bg-rose-50/50 pointer-events-none"></div>
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center mr-4 shrink-0 relative z-10">
                <AlertCircle className="w-5 h-5 text-rose-600" />
              </div>
              <div className="relative z-10">
                <p className="text-sm font-medium text-rose-700">逾期未办 (Overdue)</p>
                <p className="text-2xl font-bold text-rose-600">{stats.overdue}</p>
              </div>
            </div>
            
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-center">
              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mr-4 shrink-0">
                <Inbox className="w-5 h-5 text-slate-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">待处理总计 (Total Pending)</p>
                <p className="text-2xl font-bold text-slate-900">{currentTasks.filter(t => t.status === 'PENDING').length}</p>
              </div>
            </div>
          </div>
          
          {/* Production-Grade View Toggles & Filters */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 border-b border-slate-200 pb-2 space-y-4 sm:space-y-0">
            <div className="flex space-x-6">
              <button 
                data-testid="p1-branch-dashboard-tab-pending"
                onClick={() => setStatusFilter('PENDING')}
                className={`pb-2 text-sm transition-colors tabular-nums ${statusFilter === 'PENDING' ? 'border-b-2 border-indigo-600 text-indigo-600 font-bold' : 'text-slate-500 hover:text-slate-800 font-medium'}`}
              >
                🔥 待办任务 (Active)
              </button>
              <button 
                data-testid="p1-branch-dashboard-tab-archived"
                onClick={() => setStatusFilter('DONE')}
                className={`pb-2 text-sm transition-colors tabular-nums ${statusFilter === 'DONE' ? 'border-b-2 border-indigo-600 text-indigo-600 font-bold' : 'text-slate-500 hover:text-slate-800 font-medium'}`}
              >
                🗄️ 历史与已归档 (Archived)
              </button>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
              <select 
                data-testid="p1-branch-dashboard-business-line-filter"
                value={activeTab}
                onChange={(e) => setActiveTab(e.target.value as TaskCategoryFilter)}
                className="bg-white border border-slate-300 text-slate-700 text-sm rounded-md focus:ring-indigo-500 focus:border-indigo-500 block p-2"
              >
                <option value="ALL">全部业务线条</option>
                <option value="INSPECTION">合规检查</option>
                <option value="ASSESSMENT">合规考核</option>
                <option value="ISSUE">问题督办</option>
              </select>
              
              <div className="relative w-full sm:w-auto">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  data-testid="p1-branch-dashboard-search"
                  type="text" 
                  placeholder="搜索任务编号或标题..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full sm:w-64 pl-9 pr-4 py-2 h-9 text-sm border border-slate-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                />
              </div>
            </div>
          </div>

          {loadError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
              {loadError}
            </div>
          )}

          {/* Task List Container */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col mb-6">
            <ul className="divide-y divide-slate-100">
              <AnimatePresence mode="popLayout">
                {isLoading ? (
                  <motion.li
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="py-20 flex flex-col items-center justify-center text-slate-400 bg-white"
                  >
                    <Inbox className="w-12 h-12 mb-4 text-slate-300" />
                    <p className="text-lg font-medium text-slate-500">正在加载待办任务...</p>
                  </motion.li>
                ) : filteredTasks.map((task, index) => {
                  const overdue = isTaskOverdue(task.dueDate);
                  const dueToday = isTaskDueToday(task.dueDate);

                  if (task.category === 'INSPECTION') {
                    return (
                      <motion.li
                        key={task.id}
                        layout
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.2, delay: index * 0.05 }}
                        className="p-5 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 group"
                        data-testid={`p1-branch-dashboard-task-${task.id}`}
                      >
                        <div className="flex items-start gap-4 flex-1">
                          <div className="mt-1 bg-indigo-100 text-indigo-700 p-2 rounded-lg shrink-0">
                            <ShieldAlert className="w-5 h-5"/>
                          </div>
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className="text-indigo-600 border-indigo-200">合规检查</Badge>
                              {task.status === 'PENDING' && task.priority === 'HIGH' && (
                                <span className="text-rose-600 font-bold text-xs flex items-center">
                                  <Timer className="w-3 h-3 mr-1"/> 不足 24 小时
                                </span>
                              )}
                            </div>
                            <h4 className="text-base font-bold text-slate-800 mb-1">{task.title}</h4>
                            <p className="text-sm text-slate-500">{task.description}</p>
                          </div>
                        </div>
                        {task.status === 'PENDING' ? (
                          role === 'branch' && task.actionTarget?.action === 'INSPECTION_NOTICE_ACKNOWLEDGEMENT' ? (
                            <div className="flex flex-col sm:flex-row gap-2 shrink-0">
                              <Button
                                variant="outline"
                                className="w-full sm:w-auto shrink-0"
                                data-testid={`p1-branch-dashboard-enter-workbench-${task.id}`}
                                onClick={() => navigateToTaskTarget(task)}
                              >
                                <LayoutTemplate className="w-4 h-4 mr-2"/> 查看详情
                              </Button>
                              <Button
                                className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm shrink-0"
                                data-testid={`p1-branch-dashboard-acknowledge-${task.id}`}
                                onClick={() => openAckDialog(task)}
                              >
                                <FileSignature className="w-4 h-4 mr-2"/> 确认接收
                              </Button>
                            </div>
                          ) : role === 'branch' ? (
                            <Button className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm shrink-0" data-testid={`p1-branch-dashboard-enter-workbench-${task.id}`} onClick={() => navigateToTaskTarget(task)}>
                              <LayoutTemplate className="w-4 h-4 mr-2"/> 进入工作台核对
                            </Button>
                          ) : (
                            <Button className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm shrink-0" data-testid={`p1-hq-task-center-approve-${task.id}`} onClick={() => navigateToTaskTarget(task)}>
                              <FileSearch className="w-4 h-4 mr-2"/> 进入大盘审批
                            </Button>
                          )
                        ) : (
                          <Button variant="outline" className="w-full sm:w-auto shrink-0" data-testid={`p1-branch-dashboard-archived-inspection-${task.id}`} onClick={() => navigateToTaskTarget(task)}>
                            <LayoutTemplate className="w-4 h-4 mr-2"/> 查看已归档台账
                          </Button>
                        )}
                      </motion.li>
                    );
                  } else if (task.category === 'ISSUE') {
                    return (
                      <motion.li
                        key={task.id}
                        layout
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.2, delay: index * 0.05 }}
                        className="p-5 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 group"
                        data-testid={`p1-branch-dashboard-task-${task.id}`}
                      >
                        <div className="flex items-start gap-4 flex-1">
                          <div className="mt-1 bg-rose-100 text-rose-700 p-2 rounded-lg shrink-0">
                            <AlertCircle className="w-5 h-5"/>
                          </div>
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className="text-rose-600 border-rose-200 bg-rose-50">整改督办</Badge>
                              {task.status === 'PENDING' && overdue && (
                                <span className="text-rose-600 font-bold text-xs">⚠️ 已逾期</span>
                              )}
                            </div>
                            <h4 className="text-base font-bold text-slate-800 mb-1">{task.title}</h4>
                            <p className="text-sm text-slate-500">{task.description}</p>
                          </div>
                        </div>
                        {task.status === 'PENDING' ? (
                          role === 'branch' ? (
                            <Button className="w-full sm:w-auto bg-rose-600 hover:bg-rose-700 text-white shadow-sm shrink-0" data-testid={`p1-branch-dashboard-rectification-${task.id}`} onClick={() => navigateToTaskTarget(task)}>
                              <PenTool className="w-4 h-4 mr-2"/> 填报整改反馈
                            </Button>
                          ) : (
                            <Button className="w-full sm:w-auto bg-rose-600 hover:bg-rose-700 text-white shadow-sm shrink-0" data-testid={`p1-hq-task-center-supervise-${task.id}`} onClick={() => navigateToTaskTarget(task)}>
                              <ShieldCheck className="w-4 h-4 mr-2"/> 进入督办台审核
                            </Button>
                          )
                        ) : (
                          <Button variant="outline" className="w-full sm:w-auto shrink-0" data-testid={`p1-branch-dashboard-archived-issue-${task.id}`} onClick={() => navigateToTaskTarget(task)}>
                            <PenTool className="w-4 h-4 mr-2"/> 查看已归档单据
                          </Button>
                        )}
                      </motion.li>
                    );
                  } else {
                    return (
                      <motion.li
                        key={task.id}
                        layout
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.2, delay: index * 0.05 }}
                        className="p-5 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 group"
                        data-testid={`p1-branch-dashboard-task-${task.id}`}
                      >
                       <div className="flex items-start gap-4 flex-1">
                         <div className="mt-1 bg-blue-100 text-blue-700 p-2 rounded-lg shrink-0">
                           <ClipboardList className="w-5 h-5"/>
                         </div>
                         <div className="flex flex-col">
                           <div className="flex items-center gap-2 mb-1">
                             <Badge variant="outline" className="text-blue-600 border-blue-200">合规考核</Badge>
                             {task.status === 'PENDING' && dueToday && (
                               <span className="text-slate-500 text-xs flex items-center ml-2"><Clock className="w-3 h-3 mr-1"/> 今日到期</span>
                             )}
                           </div>
                           <h4 className="text-base font-bold text-slate-800 mb-1">{task.title}</h4>
                           <p className="text-sm text-slate-500">{task.description}</p>
                         </div>
                       </div>
                       {task.status === 'PENDING' ? (
                         role === 'branch' ? (
                           <Button variant="outline" className="w-full sm:w-auto border-indigo-200 text-indigo-700 hover:bg-indigo-50 shrink-0" data-testid={`p1-branch-dashboard-reporting-${task.id}`} onClick={() => navigateToTaskTarget(task)}>
                             <UploadCloud className="w-4 h-4 mr-2"/> 去填报考核数据
                           </Button>
                         ) : (
                           <Button className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white shadow-sm shrink-0" data-testid={`p1-hq-task-center-review-${task.id}`} onClick={() => navigateToTaskTarget(task)}>
                             <ClipboardCheck className="w-4 h-4 mr-2"/> 去调度台复核
                           </Button>
                         )
                       ) : (
                         <Button variant="outline" className="w-full sm:w-auto shrink-0" data-testid={`p1-branch-dashboard-archived-assessment-${task.id}`} onClick={() => navigateToTaskTarget(task)}>
                           <UploadCloud className="w-4 h-4 mr-2"/> 查看已归档数据
                         </Button>
                       )}
                     </motion.li>
                    );
                  }
                })}
              </AnimatePresence>

              {!isLoading && filteredTasks.length === 0 && (
                <motion.li 
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="py-20 flex flex-col items-center justify-center text-slate-400 bg-white"
                >
                  <CheckCircle2 className="w-12 h-12 mb-4 text-slate-300" />
                  <p className="text-lg font-medium text-slate-500">太棒了！当前没有待处理的任务。</p>
                  <p className="text-sm mt-1">您可以喝杯咖啡休息一下。</p>
                </motion.li>
              )}
            </ul>
            
            <div className="px-5 py-4 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-sm text-slate-500">共 <span className="font-bold text-slate-800">{filteredTasks.length}</span> 条待办事项 (第 1 / 1 页)</div>
              <div className="flex gap-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-hide w-full sm:w-auto justify-center">
                <Button variant="outline" size="sm" disabled>上一页</Button>
                <Button variant="outline" size="sm" className="bg-white">1</Button>
                <Button variant="outline" size="sm" className="bg-white" disabled={(filteredTasks.length <= 10)}>下一页</Button>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Acknowledgement Dialog */}
      <AnimatePresence>
        {ackDialogOpen && ackTask && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 pb-20">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={closeAckDialog}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
                <h2 className="text-lg font-bold text-slate-800">
                  {ackResult ? '确认接收成功' : '确认接收检查通知'}
                </h2>
                <button onClick={closeAckDialog} className="p-2 -mr-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-full transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 overflow-y-auto space-y-6">
                {ackResult ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                      <CheckCircle2 className="w-6 h-6 shrink-0" />
                      <div>
                        <p className="font-bold">已成功确认接收</p>
                        <p className="text-sm">确认人: {ackResult.acknowledgedBy} · 确认时间: {new Date(ackResult.acknowledgedAt).toLocaleString()}</p>
                      </div>
                    </div>
                    {(ackResult.liaisonName || ackResult.liaisonPhone || ackResult.liaisonTitle) && (
                      <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-2">
                        <p className="text-sm font-bold text-slate-700">联络人信息</p>
                        {ackResult.liaisonName && <p className="text-sm text-slate-600">姓名: {ackResult.liaisonName}</p>}
                        {ackResult.liaisonPhone && <p className="text-sm text-slate-600">电话: {ackResult.liaisonPhone}</p>}
                        {ackResult.liaisonTitle && <p className="text-sm text-slate-600">职务: {ackResult.liaisonTitle}</p>}
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
                      <p className="text-sm font-bold text-indigo-800 mb-1">{ackTask.title}</p>
                      <p className="text-sm text-indigo-600">{ackTask.description}</p>
                    </div>

                    {/* Attachment List */}
                    <div className="space-y-3">
                      <p className="text-sm font-bold text-slate-700">检查准备文件清单</p>
                      {planDetailLoading ? (
                        <div className="flex items-center gap-2 text-sm text-slate-500 py-2">
                          <Clock className="w-4 h-4 animate-spin" />
                          正在加载附件信息...
                        </div>
                      ) : planDetailError ? (
                        <div className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                          {planDetailError}
                        </div>
                      ) : planDetail?.files ? (
                        (() => {
                          type FileEntry = [string, Attachment | undefined];
                          const entries = (Object.entries(planDetail.files) as FileEntry[]).filter(([, v]) => v && v.fileId);
                          if (entries.length === 0) {
                            return (
                              <p className="text-sm text-slate-400 py-2">暂无附件</p>
                            );
                          }
                          return (
                            <ul className="space-y-2">
                              {entries.map(([key, file]) => (
                                <li
                                  key={key}
                                  className="flex items-center justify-between gap-3 bg-white border border-slate-200 rounded-lg px-3 py-2.5"
                                >
                                  <div className="flex items-start gap-2 min-w-0 flex-1">
                                    <div className="mt-0.5 shrink-0">
                                      <FileSearch className="w-4 h-4 text-indigo-500" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <p className="text-sm font-medium text-slate-800 truncate">{file!.name}</p>
                                      <p className="text-xs text-slate-500">
                                        {attachmentTypeLabel(file!.attachmentType)}
                                        {file!.uploadTime && (
                                          <> · {new Date(file!.uploadTime).toLocaleString()}</>
                                        )}
                                      </p>
                                      <p className={`text-xs ${scanStatusColor(file!.scanStatus)}`}>
                                        {scanStatusLabel(file!.scanStatus)}
                                      </p>
                                    </div>
                                  </div>
                                  {file!.fileId && (
                                    <button
                                      onClick={() => handleDownloadFile(file!.fileId!, file!.name)}
                                      className="shrink-0 px-2.5 py-1 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-md hover:bg-indigo-100 transition-colors"
                                      data-testid={`p1-branch-dashboard-ack-download-${file!.fileId}`}
                                    >
                                      下载
                                    </button>
                                  )}
                                </li>
                              ))}
                            </ul>
                          );
                        })()
                      ) : (
                        <p className="text-sm text-slate-400 py-2">暂无附件</p>
                      )}
                    </div>

                    <div className="space-y-1">
                      <p className="text-sm font-bold text-slate-700">联络人信息（选填）</p>
                      <p className="text-xs text-slate-500">请指定本机构对接联络人，负责后续沟通协调。不填写也可直接确认。</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-700">联络人姓名</label>
                        <div className="relative">
                          <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            placeholder="输入姓名"
                            value={liaisonName}
                            onChange={(e) => setLiaisonName(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-700">联系电话</label>
                        <div className="relative">
                          <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            placeholder="手机或固话"
                            value={liaisonPhone}
                            onChange={(e) => setLiaisonPhone(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5 sm:col-span-2">
                        <label className="text-xs font-bold text-slate-700">职务</label>
                        <div className="relative">
                          <Briefcase className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            placeholder="例如：合规专员"
                            value={liaisonTitle}
                            onChange={(e) => setLiaisonTitle(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all"
                          />
                        </div>
                      </div>
                    </div>

                    {ackError && (
                      <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                        {ackError}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3 shrink-0">
                {ackResult ? (
                  <button
                    onClick={closeAckDialog}
                    className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 transition-colors"
                  >
                    确定
                  </button>
                ) : (
                  <>
                    <button
                      onClick={closeAckDialog}
                      disabled={ackLoading}
                      className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg text-sm font-bold hover:bg-slate-50 transition-colors disabled:opacity-50"
                    >
                      取消
                    </button>
                    <button
                      onClick={submitAcknowledgement}
                      disabled={ackLoading}
                      className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-bold transition-all shadow-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                    >
                      {ackLoading ? (
                        <>
                          <Clock className="w-4 h-4 mr-2 animate-spin" />
                          提交中...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4 mr-2" />
                          确认接收
                        </>
                      )}
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
