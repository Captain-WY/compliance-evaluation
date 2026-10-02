import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Database,
  EyeOff,
  FileText,
  Loader2,
  RefreshCw,
  Server,
  ShieldCheck,
  XOctagon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import {
  API_MODE,
  assessmentApi,
  type DataSourceHealthItem,
  type DataSourceHealthSummary,
  type DataSyncExportResponse,
  type DataSyncJob,
  type DataSyncJobPage,
  type DataSyncJobStatus,
  type DataSyncSnapshot,
} from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

const timeRangeMap: Record<string, string> = {
  '7days': '最近 7 天',
  '30days': '最近 30 天',
  all: '全部时间',
};

const sourceMap: Record<string, string> = {
  all: '全部数据源',
  HR_SYS: 'HR_SYS (sandbox)',
  TRADE_CORE: 'TRADE_CORE (sandbox)',
  CRM_SYS: 'CRM_SYS (sandbox)',
  OA_SYS: 'OA_SYS (sandbox)',
  AML_SYS: 'AML_SYS (sandbox)',
};

const fetchStatusMap: Record<string, string> = {
  all: '全部状态',
  SUCCESS: '获取成功',
  FAILED: '获取失败',
  RETRY_REQUESTED: '重试申请中',
  OVERWRITE_REQUESTED: '覆盖申请中',
};

const healthTone: Record<string, string> = {
  ONLINE: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100',
  DEGRADED: 'bg-amber-100 text-amber-700 hover:bg-amber-100',
  OFFLINE: 'bg-rose-100 text-rose-700 hover:bg-rose-100',
  UNKNOWN: 'bg-slate-100 text-slate-700 hover:bg-slate-100',
};

const statusTone: Record<string, string> = {
  SUCCESS: 'bg-emerald-100 text-emerald-700',
  FAILED: 'bg-rose-100 text-rose-700',
  RETRY_REQUESTED: 'bg-blue-100 text-blue-700',
  OVERWRITE_REQUESTED: 'bg-amber-100 text-amber-700',
  PENDING: 'bg-slate-100 text-slate-700',
  RUNNING: 'bg-indigo-100 text-indigo-700',
  CANCELLED: 'bg-slate-100 text-slate-500',
};

const toMessage = (error: unknown) =>
  error instanceof Error ? error.message : '数据驾驶舱请求失败';

const requestId = (prefix: string, subject: string) =>
  `${prefix}-${subject}-${Date.now()}`.replace(/[^A-Za-z0-9_-]/g, '-');

const formatTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

function SourceHealthRow({ source }: { source: DataSourceHealthItem }) {
  const isHealthy = source.healthStatus === 'ONLINE';
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 p-3 transition-colors hover:bg-slate-50">
      <div className="min-w-0">
        <div className="flex items-center">
          <span
            className={`mr-3 h-2 w-2 shrink-0 rounded-full ${
              isHealthy ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.45)]'
            }`}
          />
          <div className="truncate text-sm font-bold text-slate-700">{source.sourceName}</div>
        </div>
        <div className="ml-5 mt-1 text-sm text-slate-500">
          {source.sourceCode} | {source.connectorType} | {formatTime(source.lastHeartbeatAt)}
        </div>
      </div>
      <Badge className={healthTone[source.healthStatus] ?? healthTone.UNKNOWN}>
        {source.healthStatus}
      </Badge>
    </div>
  );
}

function StatusBadge({ status }: { status: DataSyncJobStatus | string }) {
  const isSuccess = status === 'SUCCESS';
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-black ${statusTone[status] ?? 'bg-slate-100 text-slate-700'}`}>
      {isSuccess ? <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> : <XOctagon className="mr-1 h-3.5 w-3.5" />}
      {status}
    </span>
  );
}

type DataCollectionCockpitProps = {
  variant?: 'full' | 'summary';
};

export default function DataCollectionCockpit({ variant = 'full' }: DataCollectionCockpitProps) {
  const { user } = useAuth();
  const permissions = useMemo(() => new Set(user?.permissionIds ?? []), [user?.permissionIds]);
  const summaryOnly = variant === 'summary';
  const isMockMode = API_MODE === 'mock';
  const canRead = isMockMode || permissions.has('PERM-P2-DATA-COCKPIT-READ');
  const canOperate = !summaryOnly && (isMockMode || permissions.has('PERM-P2-DATA-COCKPIT-OPERATE'));
  const canExport = !summaryOnly && (isMockMode || permissions.has('PERM-P2-DATA-COCKPIT-EXPORT'));

  const [timeRange, setTimeRange] = useState('7days');
  const [source, setSource] = useState('all');
  const [fetchStatus, setFetchStatus] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [health, setHealth] = useState<DataSourceHealthSummary | null>(null);
  const [jobsPage, setJobsPage] = useState<DataSyncJobPage | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commandKey, setCommandKey] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<DataSyncJob | null>(null);
  const [snapshot, setSnapshot] = useState<DataSyncSnapshot | null>(null);
  const [isSnapshotOpen, setIsSnapshotOpen] = useState(false);
  const [isOverwriteOpen, setIsOverwriteOpen] = useState(false);
  const [lastExport, setLastExport] = useState<DataSyncExportResponse | null>(null);

  const loadData = useCallback(async () => {
    if (!canRead) return;
    setIsLoading(true);
    setError(null);
    try {
      if (summaryOnly) {
        const nextHealth = await assessmentApi.getDataSourceHealth();
        setHealth(nextHealth);
        setJobsPage(null);
        return;
      }
      const [nextHealth, nextJobs] = await Promise.all([
        assessmentApi.getDataSourceHealth(),
        assessmentApi.listDataSyncJobs({
          timeRange,
          source,
          status: fetchStatus,
          keyword: keyword || undefined,
          page,
          pageSize: 20,
        }),
      ]);
      setHealth(nextHealth);
      setJobsPage(nextJobs);
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [canRead, fetchStatus, keyword, page, source, summaryOnly, timeRange]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const jobs = jobsPage?.items ?? [];
  const failedJobsCount = health?.failedJobCount ?? jobs.filter(job => job.status === 'FAILED').length;
  const unresolvedFailureCount = health?.unresolvedFailureCount ?? jobs.filter(job => job.openAlertCount > 0).length;
  const alertJobs = jobs.filter(job => job.openAlertCount > 0 || job.status === 'FAILED');
  const selectedSourceIds = useMemo(() => {
    if (!health || source === 'all') return [];
    return health.sources.filter(item => item.sourceCode === source).map(item => item.sourceId);
  }, [health, source]);

  const refreshAfterCommand = async (successMessage: string) => {
    toast.success(successMessage);
    await loadData();
  };

  const runCommand = async (key: string, action: () => Promise<void>) => {
    setCommandKey(key);
    setError(null);
    try {
      await action();
    } catch (err) {
      const message = toMessage(err);
      setError(message);
      toast.error(message);
    } finally {
      setCommandKey(null);
    }
  };

  const handleSnapshot = (job: DataSyncJob) => {
    setSelectedJob(job);
    setSnapshot(null);
    setIsSnapshotOpen(true);
    void runCommand(`snapshot:${job.jobId}`, async () => {
      const nextSnapshot = await assessmentApi.getDataSyncSnapshot(job.jobId);
      setSnapshot(nextSnapshot);
    });
  };

  const handleRetry = (job: DataSyncJob) => {
    void runCommand(`retry:${job.jobId}`, async () => {
      const result = await assessmentApi.retryDataSyncJob(job.jobId, {
        reason: 'sandbox data cockpit retry after failed readiness check',
        requestId: requestId('data-retry', job.jobId),
      });
      await refreshAfterCommand(`补采申请已记录：${result.auditEventId}`);
    });
  };

  const handleIgnoreAlert = (job: DataSyncJob) => {
    const alertId = job.alertIds[0];
    if (!alertId) {
      toast.error('当前任务没有可忽略的告警');
      return;
    }
    void runCommand(`ignore:${alertId}`, async () => {
      const result = await assessmentApi.ignoreDataSyncAlert(alertId, {
        reason: 'sandbox alert reviewed from data cockpit',
        requestId: requestId('data-alert-ignore', alertId),
      });
      await refreshAfterCommand(`告警已忽略，审计事件：${result.auditEventId}`);
    });
  };

  const handleOverwriteConfirm = () => {
    if (!selectedJob) return;
    void runCommand(`overwrite:${selectedJob.jobId}`, async () => {
      const result = await assessmentApi.requestDataSyncOverwriteRerun(selectedJob.jobId, {
        reason: 'sandbox overwrite rerun requested from data cockpit',
        riskAcknowledgement: true,
        approvalMarker: 'HQ-SANDBOX-UI',
        requestId: requestId('data-overwrite', selectedJob.jobId),
      });
      setIsOverwriteOpen(false);
      await refreshAfterCommand(`覆盖重跑申请已登记：${result.rerunRequestId}`);
    });
  };

  const handleExport = () => {
    void runCommand('export:data-sync', async () => {
      const result = await assessmentApi.exportDataSyncEvidence({
        sourceIds: selectedSourceIds,
        status: fetchStatus === 'all' ? [] : [fetchStatus],
        timeRange,
        format: 'JSON',
        redactionPolicy: 'STRICT',
        requestId: requestId('data-export', source),
      });
      setLastExport(result);
      toast.success(`沙箱证据元数据已生成：${result.exportId}`);
    });
  };

  const copyLog = (job: DataSyncJob) => {
    const text = `${job.jobId} ${job.sourceCode} ${job.status} ${job.errorCode ?? ''} ${job.errorMessage ?? ''}`.trim();
    void navigator.clipboard?.writeText(text);
    toast.success('报错摘要已复制');
  };

  if (!canRead) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-slate-100/50 p-8 text-center">
        <ShieldCheck className="mb-4 h-10 w-10 text-slate-400" />
        <h1 className="text-xl font-bold text-slate-800">无权限访问数据驾驶舱</h1>
        <p className="mt-2 max-w-xl text-sm text-slate-500">
          当前账号缺少 PERM-P2-DATA-COCKPIT-READ；real/hybrid 模式不会回退到前端样例数据。
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-slate-100/50 p-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            {summaryOnly ? '自动化数据准备度摘要 (Readiness Summary)' : '自动化数据准备度 (Automated Data Readiness)'}
          </h1>
          <div className="mt-1.5 flex items-center text-sm font-medium text-emerald-600">
            <span className="relative mr-2 flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
            {health ? `生成于 ${formatTime(health.generatedAt)} | ${API_MODE}` : `连接中 | ${API_MODE}`}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => void loadData()} disabled={isLoading}>
          {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          刷新
        </Button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {error}
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-5 md:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-500">沙箱数据源准备度 (Sandbox Source Readiness)</h3>
            <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600">
              <Server className="h-5 w-5" />
            </div>
          </div>
          <p className="text-3xl font-black text-slate-800">
            {health?.connectedSourceCount ?? 0}
            <span className="ml-2 text-sm font-medium text-slate-400">/ {health?.totalSourceCount ?? 0}</span>
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-500">今日调度总数 (Today's Runs)</h3>
            <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600">
              <Database className="h-5 w-5" />
            </div>
          </div>
          <p className="text-3xl font-black text-slate-800">
            {health?.todayRunCount ?? 0}
            <span className="ml-2 text-sm font-medium text-slate-400">笔</span>
          </p>
        </div>

        <motion.div
          animate={unresolvedFailureCount > 0 ? { backgroundColor: ['#ffffff', '#fff1f2', '#ffffff'] } : {}}
          transition={{ duration: 3, repeat: Infinity }}
          className={`flex flex-col justify-between rounded-lg border p-5 shadow-sm ${
            unresolvedFailureCount > 0 ? 'border-rose-200' : 'border-slate-200 bg-white'
          }`}
        >
          <div className="mb-4 flex items-center justify-between">
            <h3 className={`text-sm font-bold ${unresolvedFailureCount > 0 ? 'text-rose-600' : 'text-slate-500'}`}>
              累计未决异常 (Unresolved Fails)
            </h3>
            <div className={`rounded-lg p-2 ${unresolvedFailureCount > 0 ? 'bg-rose-100 text-rose-600' : 'bg-emerald-50 text-emerald-500'}`}>
              {unresolvedFailureCount > 0 ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
            </div>
          </div>
          <p className={`text-3xl font-black ${unresolvedFailureCount > 0 ? 'text-rose-600' : 'text-slate-800'}`}>
            {unresolvedFailureCount}
            <span className="ml-2 text-lg font-medium text-slate-800">笔</span>
          </p>
        </motion.div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="col-span-1 flex flex-col lg:col-span-5">
          <h2 className="mb-3 flex items-center text-sm font-bold text-slate-800">
            <Database className="mr-2 h-4 w-4 text-slate-500" />
            系统数据提报进度 (System Data Progress)
          </h2>
          <div className="flex flex-1 flex-col gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
            {(health?.sources ?? []).map(sourceItem => (
              <React.Fragment key={sourceItem.sourceId}>
                <SourceHealthRow source={sourceItem} />
              </React.Fragment>
            ))}
            {isLoading && !health && (
              <div className="flex items-center justify-center p-8 text-sm text-slate-500">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                正在读取数据源健康状态
              </div>
            )}
          </div>
        </div>

        {!summaryOnly && (
        <div className="col-span-1 flex flex-col lg:col-span-7">
          <h2 className="mb-3 flex items-center text-sm font-bold text-rose-600">
            <AlertTriangle className="mr-2 h-4 w-4" />
            待处理异常预警 (Actionable Alerts)
          </h2>
          <div className="flex-1 space-y-3">
            {alertJobs.length === 0 && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-700">
                当前筛选范围内没有未决沙箱异常。
              </div>
            )}
            {alertJobs.map(job => (
              <div key={job.jobId} className="relative overflow-hidden rounded-lg border border-rose-200 bg-rose-50 p-4 shadow-sm">
                <div className="absolute left-0 top-0 h-full w-1 bg-rose-500" />
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-sm font-bold text-rose-900">数据同步异常</span>
                      <Badge variant="outline" className="border-rose-200 text-rose-700">{job.sourceCode}</Badge>
                    </div>
                    <p className="mt-1 text-sm font-medium text-rose-700">
                      {job.indicatorName} | {job.errorMessage ?? job.status}
                    </p>
                  </div>
                  <div className="font-mono text-xs font-bold text-rose-500">{formatTime(job.finishedAt ?? job.startedAt)}</div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-rose-200/60 pt-3">
                  <Button
                    size="sm"
                    onClick={() => handleRetry(job)}
                    disabled={!canOperate || commandKey === `retry:${job.jobId}` || job.status !== 'FAILED'}
                    className="bg-indigo-600 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-70"
                  >
                    {commandKey === `retry:${job.jobId}` ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
                    一键重试
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyLog(job)}
                    className="text-xs font-bold"
                  >
                    <FileText className="mr-1.5 h-3.5 w-3.5" />
                    复制报错摘要
                  </Button>

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleIgnoreAlert(job)}
                    disabled={!canOperate || !job.alertIds.length || commandKey === `ignore:${job.alertIds[0]}`}
                    className="text-xs font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <EyeOff className="mr-1.5 h-3.5 w-3.5" />
                    忽略此异常
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
        )}
      </div>

      {summaryOnly && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm font-medium text-amber-700 shadow-sm">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-bold">沙箱数据源准备度摘要（非生产外部系统接入）</p>
              <p className="mt-1">当前展示的数据源均为 sandbox/deferred 配置候选，不代表 HR/CRM/OA/交易/AML 等外部系统已真实接入生产环境。补采、忽略、覆盖重跑和导出命令请从数据准备驾驶舱正式菜单进入。</p>
            </div>
          </div>
        </div>
      )}

      {!summaryOnly && (
      <div className="flex flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-4">
          <h2 className="flex items-center text-sm font-bold text-slate-800">
            <Activity className="mr-2 h-4 w-4 text-indigo-600" />
            自动化数据拉取台账 (Data Fetch Ledger & Audit Trail)
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleExport}
            disabled={!canExport || commandKey === 'export:data-sync'}
            className="text-xs font-bold text-indigo-600 hover:text-indigo-700"
          >
            {commandKey === 'export:data-sync' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="mr-1.5 h-3.5 w-3.5" />}
            导出沙箱证据元数据
          </Button>
        </div>

        {lastExport && (
          <div className="border-b border-indigo-100 bg-indigo-50 px-5 py-3 text-xs font-medium text-indigo-700">
            {lastExport.evidenceLabel} | {lastExport.exportId} | formalArtifact=false | signedArtifact=false
          </div>
        )}

        <div className="flex flex-1 flex-col bg-white p-4">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Select value={timeRange} onValueChange={value => { setTimeRange(value); setPage(1); }}>
              <SelectTrigger className="h-9 w-[150px] bg-white">
                <span className="truncate">{timeRangeMap[timeRange]}</span>
              </SelectTrigger>
              <SelectContent position="popper" sideOffset={4}>
                <SelectItem value="7days">最近 7 天</SelectItem>
                <SelectItem value="30days">最近 30 天</SelectItem>
                <SelectItem value="all">全部时间</SelectItem>
              </SelectContent>
            </Select>

            <Select value={source} onValueChange={value => { setSource(value); setPage(1); }}>
              <SelectTrigger className="h-9 w-[140px] bg-white">
                <span className="truncate">{sourceMap[source]}</span>
              </SelectTrigger>
              <SelectContent position="popper" sideOffset={4}>
                <SelectItem value="all">全部数据源</SelectItem>
                <SelectItem value="HR_SYS">HR_SYS</SelectItem>
                <SelectItem value="TRADE_CORE">TRADE_CORE</SelectItem>
                <SelectItem value="CRM_SYS">CRM_SYS</SelectItem>
              </SelectContent>
            </Select>

            <Select value={fetchStatus} onValueChange={value => { setFetchStatus(value); setPage(1); }}>
              <SelectTrigger className="h-9 w-[150px] bg-white">
                <span className="truncate">{fetchStatusMap[fetchStatus]}</span>
              </SelectTrigger>
              <SelectContent position="popper" sideOffset={4}>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="SUCCESS">获取成功</SelectItem>
                <SelectItem value="FAILED">获取失败</SelectItem>
                <SelectItem value="RETRY_REQUESTED">重试申请中</SelectItem>
                <SelectItem value="OVERWRITE_REQUESTED">覆盖申请中</SelectItem>
              </SelectContent>
            </Select>

            <Input
              value={keyword}
              onChange={event => { setKeyword(event.target.value); setPage(1); }}
              placeholder="搜索指标编号或名称..."
              className="ml-auto h-9 max-w-xs bg-white"
            />
          </div>

          <div className="flex-1 overflow-x-auto rounded-md border border-slate-200">
            <table className="w-full whitespace-nowrap text-left text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-xs font-bold uppercase text-slate-500 shadow-[0_1px_rgba(226,232,240,1)]">
                <tr>
                  <th className="px-5 py-3">任务流水号 / 时间</th>
                  <th className="px-5 py-3">目标考核指标</th>
                  <th className="px-5 py-3">数据源</th>
                  <th className="px-5 py-3">状态</th>
                  <th className="px-5 py-3 text-right">同步记录数</th>
                  <th className="px-5 py-3 text-center">脱敏证据与操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {jobs.map(job => (
                  <tr key={job.jobId} className={`transition-colors hover:bg-slate-50 ${job.status === 'FAILED' ? 'bg-rose-50/40 hover:bg-rose-50/60' : ''}`}>
                    <td className="px-5 py-3">
                      <div className="font-mono text-xs font-bold text-slate-700">{job.jobId}</div>
                      <div className="mt-0.5 flex items-center text-[10px] font-medium text-slate-500">
                        <Clock className="mr-1 h-3 w-3" /> {formatTime(job.startedAt)}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className="inline-flex max-w-[260px] items-center truncate rounded-md border border-slate-200 bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">
                        {job.indicatorName}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center text-xs font-medium text-slate-600">
                        <Database className="mr-1.5 h-3.5 w-3.5 text-slate-400" />
                        {job.sourceCode}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={job.status} />
                    </td>
                    <td className="px-5 py-3 text-right font-mono font-bold text-slate-700">
                      {job.records.toLocaleString()}
                    </td>
                    <td className="px-5 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSnapshot(job)}
                          disabled={!job.hasSnapshot || commandKey === `snapshot:${job.jobId}`}
                          className="text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                        >
                          {commandKey === `snapshot:${job.jobId}` ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileText className="mr-1.5 h-4 w-4" />}
                          查看快照
                        </Button>
                        {job.status === 'FAILED' ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRetry(job)}
                            disabled={!canOperate || commandKey === `retry:${job.jobId}`}
                            className="border-rose-200 text-rose-600 hover:bg-rose-50"
                          >
                            {commandKey === `retry:${job.jobId}` ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
                            立即重试
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setSelectedJob(job); setIsOverwriteOpen(true); }}
                            disabled={!canOperate || !['SUCCESS', 'FAILED'].includes(job.status)}
                            className="text-slate-500 hover:text-slate-700"
                          >
                            <RefreshCw className="mr-1.5 h-4 w-4" />
                            覆盖重跑
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!isLoading && jobs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-sm font-medium text-slate-500">
                      当前筛选条件下没有同步任务。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
            <div>
              显示第 {jobs.length ? (page - 1) * 20 + 1 : 0} 至 {(page - 1) * 20 + jobs.length} 项，共 {jobsPage?.total ?? 0} 项
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage(value => Math.max(1, value - 1))} disabled={page <= 1 || isLoading}>
                上一页
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(value => value + 1)}
                disabled={isLoading || (jobsPage ? page * jobsPage.pageSize >= jobsPage.total : true)}
              >
                下一页
              </Button>
            </div>
          </div>
        </div>
      </div>
      )}

      <Dialog open={isSnapshotOpen} onOpenChange={setIsSnapshotOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>脱敏沙箱数据快照 (Data Snapshot)</DialogTitle>
          </DialogHeader>
          <div className="mb-4 flex flex-wrap gap-4 text-sm text-slate-500">
            <span>任务: {selectedJob?.jobId ?? '-'}</span>
            <span>来源: {selectedJob?.sourceCode ?? '-'}</span>
            <span>记录数: {snapshot?.recordCount ?? selectedJob?.records ?? 0}</span>
          </div>
          <Badge variant="secondary" className="mb-2 w-fit bg-slate-100 text-slate-500">
            {snapshot?.evidenceLabel ?? 'SANDBOX_REDACTED_SAMPLE_SNAPSHOT'}
          </Badge>
          <pre className="max-h-72 overflow-auto rounded-md bg-slate-900 p-4 text-xs text-emerald-400">
            {snapshot
              ? JSON.stringify(
                  {
                    snapshotId: snapshot.snapshotId,
                    payloadHash: snapshot.payloadHash,
                    redactionPolicy: snapshot.redactionPolicy,
                    sampleRows: snapshot.sampleRows,
                    omittedFields: snapshot.omittedFields,
                    sandboxOnly: snapshot.sandboxOnly,
                    formalArtifact: false,
                  },
                  null,
                  2,
                )
              : 'Loading redacted sandbox snapshot...'}
          </pre>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isOverwriteOpen} onOpenChange={setIsOverwriteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <div className="flex items-center gap-2 text-rose-600">
                <AlertTriangle className="h-5 w-5" /> 高风险沙箱覆盖重跑
              </div>
            </AlertDialogTitle>
            <AlertDialogDescription className="mt-2 text-slate-600">
              此动作只登记 P2 沙箱覆盖重跑申请和审计事件，不接入生产外部系统，也不生成正式签署合规凭证。取消已按路线图延后，不在本包提供取消命令。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="outline" size="default" className="text-slate-600">返回</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleOverwriteConfirm}
              disabled={Boolean(commandKey?.startsWith('overwrite:'))}
              className="bg-rose-600 hover:bg-rose-700"
            >
              {commandKey?.startsWith('overwrite:') ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              登记覆盖重跑
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
