import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { ArrowLeft, BellRing, Search, CheckCircle2, Circle, Archive, ShieldAlert, Hourglass, Loader2, FileText } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { assessmentApi } from '../../services/api';
import { buildWorkflowDetailMetrics, formatDateOnly } from '../../services/assessmentWorkflowReadModel';
import type { WorkflowInstance } from '../../services/mock/workflow';

export default function WorkflowDispatchDetail({ onBack }: { onBack?: () => void }) {
  const [activeTab, setActiveTab] = useState('all');
  const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const id = searchParams.get('id') || '';
  const [workflowInstances, setWorkflowInstances] = useState<Record<string, WorkflowInstance>>({});
  const [isLoadingInstance, setIsLoadingInstance] = useState(true);
  const [instanceLoadError, setInstanceLoadError] = useState<string | null>(null);
  const instance = workflowInstances[id] ?? Object.values(workflowInstances)[0];
  const isFullyCompleted = instance?.isArchivingStage || false;

  const [loadingRows, setLoadingRows] = useState<Record<string, boolean>>({});
  const [remindedRows, setRemindedRows] = useState<Record<string, boolean>>({});
  const [isGlobalLoading, setIsGlobalLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingInstance(true);
    setInstanceLoadError(null);
    assessmentApi.getWorkflowInstances()
      .then(instances => {
        if (!cancelled) setWorkflowInstances(instances);
      })
      .catch(error => {
        if (!cancelled) {
          setWorkflowInstances({});
          setInstanceLoadError(error instanceof Error ? error.message : '考核运行详情加载失败');
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingInstance(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate('/');
    }
  };

  const handleNavigateToReview = (orgId: string) => {
    navigate(`/review?instanceId=${id}&orgId=${orgId}&mode=readonly`);
  };

  const handleGlobalRemind = async () => {
    if (!instance) return;
    const targetOrgIds = instance.tableData
      .filter(row => row.targetOrgId && row.status !== '已完结' && row.status !== '已确认')
      .map(row => row.targetOrgId as string);
    if (targetOrgIds.length === 0) {
      toast.info('暂无可催办的目标机构');
      return;
    }
    setIsGlobalLoading(true);
    try {
      await assessmentApi.sendCycleReminder(instance.id, { targetOrgIds, message: '调度台全局催办' });
      setIsGlobalLoading(false);
      
      const newRemindedRows = { ...remindedRows };
      instance?.tableData.forEach(row => {
        if (row.status !== '已完结' && row.status !== '已确认') {
          newRemindedRows[row.id] = true;
        }
      });
      setRemindedRows(newRemindedRows);
      
      toast.success("全局催办已发出", { 
        description: `已向 ${targetOrgIds.length} 家待处理机构发送真实催办请求。`
      });
    } catch (error) {
      setIsGlobalLoading(false);
      toast.error('全局催办失败', {
        description: error instanceof Error ? error.message : '请稍后重试',
      });
    }
  };

  const handleRemind = async (rowId: string, processorName: string) => {
    if (!instance) return;
    const row = instance.tableData.find(item => item.id === rowId);
    if (!row?.targetOrgId) {
      toast.error('无法催办：缺少目标机构标识');
      return;
    }
    setLoadingRows(prev => ({ ...prev, [rowId]: true }));
    try {
      await assessmentApi.sendCycleReminder(instance.id, { targetOrgIds: [row.targetOrgId], message: '调度台单机构催办' });
      setLoadingRows(prev => ({ ...prev, [rowId]: false }));
      setRemindedRows(prev => ({ ...prev, [rowId]: true }));
      toast.success(`催办发送成功`, {
        description: `已向 [${processorName}] 发起真实催办请求。`
      });
    } catch (error) {
      setLoadingRows(prev => ({ ...prev, [rowId]: false }));
      toast.error('催办发送失败', {
        description: error instanceof Error ? error.message : '请稍后重试',
      });
    }
  };

  if (isLoadingInstance) {
    return (
      <div className="p-8 bg-slate-50 min-h-full flex items-center justify-center text-slate-500">
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        正在加载真实考核运行详情...
      </div>
    );
  }

  if (!instance) {
    return (
      <div className="p-8 bg-slate-50 min-h-full">
        <div className="max-w-3xl mx-auto bg-white border border-slate-200 rounded-xl p-6">
          <Button variant="ghost" className="mb-4" onClick={handleBack}>
            <ArrowLeft className="w-4 h-4 mr-2" /> 返回
          </Button>
          <div className="text-sm font-medium text-rose-600">{instanceLoadError ?? '暂无可展示的考核运行详情'}</div>
        </div>
      </div>
    );
  }

  const detailMetrics = buildWorkflowDetailMetrics(instance);
  const bottleneckCount = detailMetrics.totals.returned + detailMetrics.totals.appealing;
  const pendingReviewCount = detailMetrics.totals.reviewing;
  const filteredRows = activeTab === 'bottleneck'
    ? instance.tableData.filter(row => row.status === '被退回' || row.status === '申辩中')
    : activeTab === 'pending-review'
      ? instance.tableData.filter(row => row.status === '审批流转中')
      : instance.tableData;
  const openTargetCount = instance.tableData.filter(row => row.status !== '已完结' && row.status !== '已确认').length;

  return (
    <div className="p-6 md:p-8 bg-slate-50 min-h-full">
      <div className="max-w-7xl mx-auto">
        {/* Page Header & Context Actions */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="text-slate-500 hover:bg-slate-200" onClick={handleBack}>
              <ArrowLeft className="w-5 h-5"/>
            </Button> 
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-slate-900 flex items-center gap-2">
                {instance.title}
                <Badge className={instance.statusBadgeColor}>{instance.status}</Badge>
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                {instance.subtitle} | 下发时间: {detailMetrics.dispatchTimeLabel}
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            {isFullyCompleted ? (
              <Button onClick={() => setIsArchiveDialogOpen(true)} className="bg-slate-800 hover:bg-slate-900 text-white shadow-md">
                <Archive className="w-4 h-4 mr-2"/> 确认分数并正式归档
              </Button>
            ) : (
              <Button 
                variant="outline" 
                className="text-amber-600 border-amber-300 bg-amber-50 hover:bg-amber-100"
                onClick={handleGlobalRemind}
                disabled={isGlobalLoading || openTargetCount === 0}
              >
                {isGlobalLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <BellRing className="w-4 h-4 mr-2"/> 
                )}
                {isGlobalLoading ? "发送中..." : `全局一键催办 (${openTargetCount})`}
              </Button>
            )}
          </div>
        </div>

        {/* Top Dashboard (Lifecycle & Progress) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Card 1: Lifecycle Stepper */}
          <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm lg:col-span-2">
            <h3 className="font-semibold text-slate-800 mb-6">📌 生命周期与流转状态</h3>
            <div className="relative mt-2">
              <div className="absolute top-3 left-[12.5%] right-[12.5%] h-0.5 bg-slate-100 -z-10" />
              <div className={`absolute top-3 left-[12.5%] h-0.5 bg-blue-500 -z-10 transition-all duration-500 ${detailMetrics.activeStep === 1 ? 'w-0' : detailMetrics.activeStep === 2 ? 'w-[25%]' : detailMetrics.activeStep === 3 ? 'w-[50%]' : 'w-[75%]'}`} />
              
              <div className="flex justify-between items-start w-full">
                <div className="flex flex-col items-center text-center gap-2 w-1/4">
                  <div className="bg-white px-2">
                    <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="text-sm font-medium text-slate-500">任务已下发</div>
                    <span className="text-xs text-slate-400">{detailMetrics.dispatchTimeLabel}</span>
                  </div>
                </div>
                
                <div className="flex flex-col items-center text-center gap-2 w-1/4">
                  <div className="bg-white px-2">
                    {detailMetrics.isStep2Done ? (
                      <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                    ) : (
                      <div className="w-6 h-6 rounded-full border-4 border-blue-100 bg-blue-500 shadow-sm ring-4 ring-white animate-pulse"></div>
                    )}
                  </div>
                  <div className="flex flex-col items-center">
                    <div className={`text-sm ${detailMetrics.activeStep === 2 ? 'font-bold text-blue-600' : 'font-medium text-slate-500'}`}>考核数据填报</div>
                    <span className="text-xs text-slate-400">{detailMetrics.reportingTimeLabel}</span>
                  </div>
                </div>

                <div className="flex flex-col items-center text-center gap-2 w-1/4">
                  <div className="bg-white px-2">
                    {detailMetrics.isStep3Done ? (
                      <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                    ) : detailMetrics.activeStep === 3 ? (
                      <div className="w-6 h-6 rounded-full border-4 border-blue-100 bg-blue-500 shadow-sm ring-4 ring-white animate-pulse"></div>
                    ) : (
                      <Circle className="w-6 h-6 text-slate-300" />
                    )}
                  </div>
                  <div className="flex flex-col items-center">
                    <div className={`text-sm ${detailMetrics.activeStep === 3 ? 'font-bold text-blue-600' : detailMetrics.isStep3Done ? 'font-medium text-slate-500' : 'font-medium text-slate-400'}`}>多级复核审批</div>
                    <span className="text-xs text-slate-400">{detailMetrics.reviewTimeLabel}</span>
                  </div>
                </div>

                <div className="flex flex-col items-center text-center gap-2 w-1/4">
                  <div className="bg-white px-2">
                    {detailMetrics.activeStep === 4 ? (
                      <div className="w-6 h-6 rounded-full border-4 border-blue-100 bg-blue-500 shadow-sm ring-4 ring-white animate-pulse"></div>
                    ) : (
                      <Circle className="w-6 h-6 text-slate-300" />
                    )}
                  </div>
                  <div className="flex flex-col items-center">
                    <div className={`text-sm ${detailMetrics.activeStep === 4 ? 'font-bold text-blue-600' : 'font-medium text-slate-400'}`}>结果确认与归档</div>
                    <span className="text-xs text-slate-400">{detailMetrics.resultTimeLabel}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Submission Progress */}
          <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm relative overflow-hidden">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-slate-800">📊 进度总览</h3> 
              <div className="flex items-center gap-1.5 px-3 py-1 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium rounded-full shadow-sm"><Hourglass className="w-3 h-3 animate-pulse"/> 截止日: {detailMetrics.dueDateLabel}</div>
            </div>
            
            <div className="flex items-center gap-6 mt-2">
              <div className="relative w-24 h-24 flex items-center justify-center shrink-0">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                  {/* Background Circle */}
                  <path
                    className="text-slate-100"
                    strokeWidth="4"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  {/* Dynamic Segments */}
                  {detailMetrics.segments.map((seg, i) => seg.w > 0 && (
                    <path
                      key={i}
                      className={seg.color}
                      strokeWidth="4"
                      strokeDasharray={`${seg.w}, 100`}
                      strokeDashoffset={seg.offset}
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                  ))}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-black text-slate-800 tracking-tight">{detailMetrics.pct}</span>
                </div>
              </div>

              <div className="space-y-1.5 flex-1 w-full truncate">
                <div className="text-sm font-medium text-slate-700 mb-1">总对象数 ({detailMetrics.totals.total})</div>
                <div className="text-xs">
                  <span className="text-emerald-500 flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> 已关闭 ({detailMetrics.totals.completed})</span>
                </div>
                {detailMetrics.totals.confirmed > 0 && (
                  <div className="text-xs">
                    <span className="text-teal-500 flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-teal-500"></div> 已确认 ({detailMetrics.totals.confirmed})</span>
                  </div>
                )}
                {detailMetrics.totals.resultPending > 0 && (
                  <div className="text-xs">
                    <span className="text-violet-500 flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-violet-500"></div> 待确认 ({detailMetrics.totals.resultPending})</span>
                  </div>
                )}
                {detailMetrics.totals.reviewing > 0 && (
                  <div className="text-xs">
                    <span className="text-blue-500 flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-blue-500"></div> 审阅中 ({detailMetrics.totals.reviewing})</span>
                  </div>
                )}
                {detailMetrics.totals.filling > 0 && (
                  <div className="text-xs">
                    <span className="text-amber-500 flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-amber-500"></div> 填报中 ({detailMetrics.totals.filling})</span>
                  </div>
                )}
                {detailMetrics.totals.waiting > 0 && (
                  <div className="text-xs">
                    <span className="text-slate-400 flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-slate-400"></div> 待启动 ({detailMetrics.totals.waiting})</span>
                  </div>
                )}
                {detailMetrics.totals.returned > 0 && (
                  <div className="text-xs">
                    <span className="text-rose-500 flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-rose-500"></div> 被退回 ({detailMetrics.totals.returned})</span>
                  </div>
                )}
                {detailMetrics.totals.appealing > 0 && (
                  <div className="text-xs">
                    <span className="text-rose-500 flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-rose-500"></div> 申辩中 ({detailMetrics.totals.appealing})</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Section: The Triage Desk */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            {/* Header & Triage Filters */}
            <div className="px-4 pt-4 pb-0 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-end bg-slate-50/50 rounded-t-xl gap-4">
              <TabsList className="bg-transparent border-b-0 h-auto p-0 space-x-6">
                <TabsTrigger 
                  value="all" 
                  className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-slate-800 rounded-none pb-3 px-0 font-medium text-slate-500 data-[state=active]:text-slate-900"
                >
                  全部对象 ({detailMetrics.totals.total})
                </TabsTrigger>
                <TabsTrigger 
                  value="bottleneck" 
                  className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-rose-600 rounded-none pb-3 px-0 font-bold text-slate-500 data-[state=active]:text-rose-600"
                >
                  异常与卡点 ({bottleneckCount})
                </TabsTrigger>
                <TabsTrigger 
                  value="pending-review" 
                  className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-blue-600 rounded-none pb-3 px-0 font-bold text-slate-500 data-[state=active]:text-blue-600"
                >
                  待处理审批 ({pendingReviewCount})
                </TabsTrigger>
              </TabsList>
              <div className="relative w-full sm:w-64 pb-3">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-[calc(50%+6px)] text-slate-400" />
                <Input placeholder="搜索机构名称或人员..." className="pl-9 w-full bg-white ring-offset-slate-50 focus-visible:ring-slate-300 h-9" />
              </div>
            </div>

            {/* Data Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-500 bg-slate-50/80 border-b border-slate-100 uppercase tracking-wide">
                  <tr>
                    <th className="px-6 py-3 font-semibold">考核对象</th>
                    <th className="px-6 py-3 font-semibold">当前阶段</th>
                    <th className="px-6 py-3 font-semibold">进度明细</th>
                    <th className="px-6 py-3 font-semibold">当前处理人</th>
                    <th className="px-6 py-3 font-semibold text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-10 text-center text-slate-500">
                        {instance.tableData.length === 0 ? '暂无目标机构/等待下发' : '当前筛选下暂无目标机构'}
                      </td>
                    </tr>
                  ) : filteredRows.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 font-medium text-slate-800">{row.org}</td>
                      <td className="px-6 py-4">
                        <Badge variant="outline" className={`${row.statusColor} shadow-sm`}>{row.status}</Badge>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <Progress 
                            value={row.progress} 
                            className={`w-24 h-1.5 bg-slate-100 ${
                              row.progress === 100 ? "[&_[data-slot=progress-indicator]]:bg-emerald-500" : 
                              row.progress >= 50 ? "[&_[data-slot=progress-indicator]]:bg-blue-500" : 
                              row.progress > 0 && row.status !== '被退回' ? "[&_[data-slot=progress-indicator]]:bg-amber-500" : 
                              row.progress === 20 && row.status === '被退回' ? "[&_[data-slot=progress-indicator]]:bg-rose-500" : 
                              "[&_[data-slot=progress-indicator]]:bg-slate-400"
                            }`} 
                          />
                          <span className="text-xs font-medium text-slate-600 w-8">{row.progress}%</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-600 flex items-center gap-2">
                        {row.processor === '-' ? '-' : (
                          <>
                            {row.processor} <span className="text-xs text-slate-500 border border-slate-200 px-1.5 py-0.5 rounded bg-white font-medium">{row.role}</span>
                          </>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {row.status === '已完结' || row.status === '已确认' ? (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-blue-600 hover:bg-blue-50" 
                            onClick={() => handleNavigateToReview(row.id)}
                          >
                            <FileText className="w-4 h-4 mr-1"/> 查看明细
                          </Button>
                        ) : remindedRows[row.id] ? (
                          <Button variant="secondary" size="sm" disabled className="bg-slate-100 text-slate-400 border-transparent">
                            <CheckCircle2 className="w-4 h-4 mr-1 text-emerald-500"/> 已催办
                          </Button>
                        ) : (
                          <Button 
                            size="sm" 
                            variant={row.status === '审批流转中' ? 'default' : 'outline'}
                            className={row.status === '审批流转中' ? "bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-all focus:ring-2 focus:ring-blue-500 focus:ring-offset-2" : "text-amber-600 border-amber-200 hover:bg-amber-50 hover:text-amber-700 bg-white transition-colors" }
                            onClick={() => handleRemind(row.id, row.processor)}
                            disabled={loadingRows[row.id]}
                          >
                            {loadingRows[row.id] ? <Loader2 className="w-4 h-4 mr-2 animate-spin"/> : null}
                            {loadingRows[row.id] ? "发送中..." : row.status === '审批流转中' ? "催办审批" : "单独催办"}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="p-4 border-t border-slate-100 flex justify-between items-center bg-slate-50/30 rounded-b-xl text-sm text-slate-500">
              <span className="font-medium">共找到 {filteredRows.length} 条结果</span>
              {/* Pagination */}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled className="h-8 w-8 p-0 border-slate-200 bg-white">1</Button>
              </div>
            </div>
          </Tabs>
        </div>
      </div>

      <AlertDialog open={isArchiveDialogOpen} onOpenChange={setIsArchiveDialogOpen}>
        <AlertDialogContent className="bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-slate-900">
              <ShieldAlert className="w-5 h-5 text-amber-500" />
              正式归档确认 (Archive Confirmation)
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-600 mt-2">
              当前真实 read model 显示 <strong className="text-slate-800">{detailMetrics.totals.completed}/{detailMetrics.totals.total}</strong> 家机构已关闭，总进度为 {detailMetrics.pct}。
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="bg-amber-50 border border-amber-200 p-3 rounded-md text-amber-800 text-sm mt-2 mb-2">
            ⚠️ <strong className="text-amber-900">不可逆操作警告：</strong> 执行归档后，本期考核方案将正式锁定并转入历史记录。系统将自动向所有参评机构下发最终成绩与排名单。
          </div>

          <AlertDialogFooter className="mt-4">
            <AlertDialogCancel variant="outline" size="default" className="border-slate-300 text-slate-700">返回检查</AlertDialogCancel>
            <AlertDialogAction 
              className="bg-slate-800 hover:bg-slate-900 text-white"
              onClick={() => {
                toast.success("归档成功！", { description: "本期考核方案已转入历史记录。" });
                setTimeout(() => navigate('/dispatch?tab=archived'), 1500);
              }}
            >
              锁定分数并归档
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
