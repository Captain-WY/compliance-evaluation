import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { AlertCircle, Filter, BellRing, ArrowRight, Timer, Rocket, BarChart2, Archive, Trophy } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { toast } from 'sonner';
import DistributionHub from './DistributionHub';
import ScoreDashboardDialog from './ScoreDashboardDialog';
import { assessmentApi } from '../../services/api';
import { buildDashboardSummary, formatDateOnly, formatDateTimeShort } from '../../services/assessmentWorkflowReadModel';
import type { WorkflowInstance } from '../../services/mock/workflow';

export default function WorkflowDispatchDashboard() {
  const navigate = useNavigate();
  const [isDistributionHubOpen, setIsDistributionHubOpen] = useState(false);
  const [selectedSchemeForDispatch, setSelectedSchemeForDispatch] = useState<string | null>(null);
  const [isScoreModalOpen, setIsScoreModalOpen] = useState(false);
  const [selectedArchivedInstance, setSelectedArchivedInstance] = useState('');
  const [workflowInstances, setWorkflowInstances] = useState<Record<string, WorkflowInstance>>({});
  const [isLoadingCycles, setIsLoadingCycles] = useState(true);
  const [cycleLoadError, setCycleLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingCycles(true);
    setCycleLoadError(null);
    assessmentApi.getWorkflowInstances()
      .then(instances => {
        if (!cancelled) setWorkflowInstances(instances);
      })
      .catch(error => {
        if (!cancelled) {
          setWorkflowInstances({});
          setCycleLoadError(error instanceof Error ? error.message : '考核运行周期加载失败');
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingCycles(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleOpenDispatchModal = () => {
    setSelectedSchemeForDispatch(null);
    setIsDistributionHubOpen(true);
  };

  const workflowInstanceList = Object.values(workflowInstances) as WorkflowInstance[];
  const activeInstances = workflowInstanceList.filter(instance => instance.bucket === 'active');
  const pendingInstances = workflowInstanceList.filter(instance => instance.bucket === 'pending');
  const archivedInstances = workflowInstanceList.filter(instance => instance.bucket === 'archived');
  const dashboardSummary = buildDashboardSummary(workflowInstanceList);
  const overallProgressLabel = dashboardSummary.overallProgress == null ? '--' : `${dashboardSummary.overallProgress}%`;

  return (
    <div className="p-6 md:p-8 bg-slate-50 min-h-full" data-testid="p1-cycle-page">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">考核运行调度总览 (Operations Dispatch Dashboard)</h1>
          <p className="text-slate-500 mt-1">全局掌控考核运行状态，追踪填报进度，处理异常卡点与待发任务。</p>
        </div>

        {/* Global KPI Radar (The 3-Card Grid) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: 运行中考核 (Active Instances) */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm" data-testid="p1-cycle-stat-active">
            <div className="text-sm font-medium text-slate-500 mb-2 flex items-center gap-2">🏃‍♂️ 运行中考核</div>
            <div className="text-4xl font-bold text-slate-800">{dashboardSummary.activeCount} <span className="text-sm font-normal text-slate-400">个方案</span></div>
            <div className="mt-4">
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>总体填报进度</span>
                <span>{overallProgressLabel}</span>
              </div>
              <Progress value={dashboardSummary.overallProgress ?? 0} className="h-1.5 bg-slate-100 [&_[data-slot=progress-indicator]]:bg-emerald-500" />
            </div>
          </div>

          {/* Card 2: 待人工下发 (Pending Dispatch) */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 shadow-sm" data-testid="p1-cycle-stat-pending">
            <div className="text-sm font-medium text-blue-600 mb-2 flex items-center gap-2">🚀 待人工下发 (单次/临时)</div>
            <div className="text-4xl font-bold text-blue-700">{dashboardSummary.pendingCount} <span className="text-sm font-normal text-blue-500">个方案</span></div>
            <div className="mt-4 text-sm text-blue-600 font-medium bg-blue-100/50 py-1.5 px-3 rounded-md inline-block">
              {dashboardSummary.pendingCount > 0 ? '真实周期待下发' : '暂无待下发周期'}
            </div>
          </div>

          {/* Card 3: 异常与预警 (Bottlenecks) */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm" data-testid="p1-cycle-stat-warning">
            <div className="text-sm font-medium text-slate-500 mb-2 flex items-center gap-2">⚠️ 异常与预警</div>
            <div className="text-4xl font-bold text-slate-800">{dashboardSummary.warningTargets} <span className="text-sm font-normal text-slate-400">家机构</span></div>
            <div className="mt-4 text-sm text-rose-500 font-medium flex items-center gap-1">
              <AlertCircle className="w-4 h-4"/> {dashboardSummary.warningTargets > 0 ? '退回或申辩中，需人工关注' : '暂无真实异常目标'}
            </div>
          </div>

          {cycleLoadError && (
            <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
              {cycleLoadError}
            </div>
          )}
        </div>

        {/* View Controls (Tabs & Filters) */}
        <Tabs defaultValue={new URLSearchParams(window.location.search).get("tab")==="archived"?"archived":"active"} className="mt-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <TabsList>
              <TabsTrigger value="active" data-testid="p1-cycle-tab-active">
                运行中 (Active)
                <Badge className="ml-2 bg-slate-100 text-slate-700">{activeInstances.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="pending" data-testid="p1-cycle-tab-pending" className="flex items-center gap-1.5">
                待执行/排队中
                <Badge className="ml-2 bg-blue-100 text-blue-700">{pendingInstances.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="archived" data-testid="p1-cycle-tab-archived">
                已归档
                <Badge className="ml-2 bg-slate-100 text-slate-700">{archivedInstances.length}</Badge>
              </TabsTrigger>
            </TabsList>
            
            <div className="flex items-center gap-3 self-start md:self-auto">
              <Input placeholder="搜索方案名称..." className="w-64 bg-white" data-testid="p1-cycle-search" />
              <Button variant="outline" data-testid="p1-cycle-filter"><Filter className="w-4 h-4 mr-2"/> 筛选</Button>
            </div>
          </div>

          <TabsContent value="active" className="space-y-4 m-0 outline-none flex flex-col gap-4">
            {isLoadingCycles ? (
              <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-500">
                正在加载真实考核运行周期...
              </div>
            ) : activeInstances.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-500">
                暂无运行中的考核周期
              </div>
            ) : activeInstances.map((instance) => (
              <div key={instance.id} data-testid={`p1-cycle-row-${instance.id}`} className={`bg-white border border-slate-200 rounded-xl p-5 transition-colors shadow-sm grid grid-cols-1 xl:grid-cols-[1fr_1.5fr_auto] gap-6 items-center ${instance.hoverBorderColor || 'hover:border-blue-300'}`}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-lg font-bold text-slate-800 truncate">{instance.title}</h3>
                  </div>
                  <p className="text-sm text-slate-500 truncate">{instance.subtitle}</p>
                </div>
                <div className="w-full">
                  <div className="flex justify-between items-center text-sm mb-2">
                    <Badge variant="outline" className={instance.statusBadgeColor}>{instance.status}</Badge>
                    <span className="text-slate-500">{instance.progressText}</span>
                  </div>
                  <Progress value={instance.progress} className="h-2 bg-slate-100 [&_[data-slot=progress-indicator]]:bg-indigo-500" />
                </div>
                <div className="flex items-center gap-3 justify-end">
                  {instance.isArchivingStage ? (
                    <div className="flex gap-3">
                      <Button variant="outline" className="text-slate-600 border-slate-300 hover:bg-slate-100" data-testid={`p1-cycle-result-preview-${instance.id}`}>
                        <Trophy className="w-4 h-4 mr-2 text-amber-500"/> 结果预览
                      </Button>
                      <Button 
                        data-testid={`p1-cycle-archive-${instance.id}`}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-md"
                        onClick={() => navigate(`/dispatch-detail?id=${instance.id}`)}
                      >
                        <Archive className="w-4 h-4 mr-2"/> 确认分数并归档
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Button variant="outline" className="text-amber-600 border-amber-200 hover:bg-amber-50" data-testid={`p1-cycle-remind-${instance.id}`}>
                        <BellRing className="w-4 h-4 mr-2"/> 一键催办
                      </Button>
                      <Button 
                        data-testid={`p1-cycle-enter-dispatch-${instance.id}`}
                        className="bg-slate-800 hover:bg-slate-900 text-white"
                        onClick={() => navigate(`/dispatch-detail?id=${instance.id}`)}
                      >
                        进入调度台 <ArrowRight className="w-4 h-4 ml-2"/>
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="pending" className="space-y-4 m-0 outline-none">
            {pendingInstances.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-500">
                暂无待执行/排队中的真实考核周期
              </div>
            ) : pendingInstances.map(instance => (
              <div key={instance.id} className="bg-white border border-slate-200 rounded-xl p-5 hover:border-blue-300 transition-colors shadow-sm flex flex-col md:flex-row gap-6 md:items-center">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-lg font-bold text-slate-800">{instance.title}</h3>
                    <Badge className="bg-blue-50 text-blue-700 hover:bg-blue-50 border-transparent shadow-none">{instance.dispatchMode === 'SCHEDULED' ? '周期性' : '手动'}</Badge>
                  </div>
                  <p className="text-sm text-slate-500">{instance.subtitle}</p>
                </div>
                <div className="flex-1 w-full">
                  <div className="flex items-center gap-2 text-slate-600 font-medium">
                    <Timer className="w-5 h-5 text-blue-500"/> {instance.selectedTargetCount ? `已选择 ${instance.selectedTargetCount} 家机构，等待下发` : '等待配置目标机构并下发'}
                  </div>
                </div>
                <div className="flex items-center gap-3 md:ml-auto">
                  <Button className="bg-blue-600 hover:bg-blue-700 text-white" data-testid={`p1-cycle-dispatch-now-${instance.id}`} onClick={() => { setSelectedSchemeForDispatch(instance.schemeId ?? null); setIsDistributionHubOpen(true); }}>
                    <Rocket className="w-4 h-4 mr-2"/> 进入下发中心
                  </Button>
                </div>
              </div>
            ))}
            {pendingInstances.length === 0 && (
              <Button variant="outline" data-testid="p1-cycle-open-distribution" onClick={handleOpenDispatchModal}>
                <Rocket className="w-4 h-4 mr-2"/> 打开下发中心
              </Button>
            )}
          </TabsContent>
          
          <TabsContent value="archived" className="m-0 outline-none">
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden mt-2">
              <Table className="text-sm">
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="font-semibold text-slate-700">方案名称</TableHead>
                    <TableHead className="font-semibold text-slate-700">考核批次</TableHead>
                    <TableHead className="font-semibold text-slate-700">参评对象数</TableHead>
                    <TableHead className="font-semibold text-slate-700">下发时间</TableHead>
                    <TableHead className="font-semibold text-slate-700">归档时间</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {archivedInstances.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-slate-500 py-8">暂无已归档考核周期</TableCell>
                    </TableRow>
                  ) : archivedInstances.map(instance => (
                    <TableRow key={instance.id} className="hover:bg-slate-50">
                      <TableCell className="font-medium text-slate-800">{instance.title}</TableCell>
                      <TableCell className="text-slate-600">{instance.periodStart && instance.periodEnd ? `${formatDateOnly(instance.periodStart)} 至 ${formatDateOnly(instance.periodEnd)}` : instance.cycleCode ?? instance.id}</TableCell>
                      <TableCell className="text-slate-600">{instance.targetCount ?? instance.tableData.length} 家</TableCell>
                      <TableCell className="text-slate-500">{formatDateTimeShort(instance.dispatchedAtRef)}</TableCell>
                      <TableCell className="text-slate-500">{formatDateTimeShort(instance.closedAtRef)}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" data-testid={`p1-cycle-archived-result-${instance.id}`} className="text-blue-600 hover:text-blue-700 hover:bg-blue-50" onClick={() => { setSelectedArchivedInstance(instance.title); setIsScoreModalOpen(true); }}>
                          <BarChart2 className="w-4 h-4 mr-2"/> 查看结果
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50/50">
                <div className="text-sm text-slate-500">共 {archivedInstances.length} 项历史归档</div>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" disabled data-testid="p1-cycle-archive-page-prev">上一页</Button>
                  <Button variant="outline" size="sm" className="bg-slate-100" data-testid="p1-cycle-archive-page-1">1</Button>
                  <Button variant="outline" size="sm" disabled data-testid="p1-cycle-archive-page-next">下一页</Button>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Distribution Hub Dialog */}
        <Dialog open={isDistributionHubOpen} onOpenChange={setIsDistributionHubOpen}>
          <DialogContent className="sm:max-w-[1200px] w-[95vw] max-h-[90vh] overflow-y-auto bg-slate-50/50 p-0 border-none shadow-2xl">
            <DistributionHub initialSchemeId={selectedSchemeForDispatch || ''} onClose={() => setIsDistributionHubOpen(false)} />
          </DialogContent>
        </Dialog>

        <ScoreDashboardDialog
          open={isScoreModalOpen}
          onOpenChange={setIsScoreModalOpen}
          instanceName={selectedArchivedInstance}
        />
      </div>
    </div>
  );
}
