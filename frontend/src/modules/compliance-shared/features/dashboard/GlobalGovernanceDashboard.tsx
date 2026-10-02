import React, { useEffect, useMemo, useState } from 'react';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ZAxis,
  LineChart,
  Line,
  Cell,
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from 'recharts';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  Target,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { API_MODE, dashboardApi } from '../../services/api';
import type { BranchPortrait, GlobalMetrics } from '../../types';

type LoadState = 'loading' | 'ready' | 'empty' | 'error' | 'hybrid-disabled';

const emptyMetrics: GlobalMetrics = {
  avgComplianceScore: null,
  totalActiveIssues: null,
  overallRectificationRate: null,
  monthlyTrend: [],
};

function MetricCard({
  label,
  value,
  icon,
  tone = 'slate',
  note,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  tone?: 'slate' | 'blue' | 'red' | 'emerald' | 'amber';
  note?: string;
}) {
  const toneClass = {
    slate: 'bg-slate-50 text-slate-700 border-slate-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    red: 'bg-red-50 text-red-700 border-red-100',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
  }[tone];

  return (
    <div className={`border rounded-lg p-5 flex items-center justify-between ${toneClass}`}>
      <div className="min-w-0">
        <p className="text-sm font-medium opacity-80 mb-1">{label}</p>
        <div className="text-3xl font-bold text-slate-900">{value}</div>
        {note ? <p className="text-xs mt-2 text-slate-500">{note}</p> : null}
      </div>
      <div className="w-11 h-11 rounded-lg bg-white/80 border border-white flex items-center justify-center shrink-0">
        {icon}
      </div>
    </div>
  );
}

function EmptyPanel({ title, message }: { title: string; message: string }) {
  return (
    <div className="h-full min-h-[220px] flex flex-col items-center justify-center text-center border border-dashed border-slate-200 rounded-lg bg-slate-50 px-6">
      <CheckCircle2 className="w-8 h-8 text-slate-300 mb-3" />
      <h3 className="text-sm font-bold text-slate-700">{title}</h3>
      <p className="text-sm text-slate-500 mt-1 max-w-md">{message}</p>
    </div>
  );
}

const formatNumber = (value: number | null | undefined, digits = 1) =>
  value == null ? '--' : value.toFixed(digits);

const formatInteger = (value: number | null | undefined) =>
  value == null ? '--' : String(value);

const formatPercent = (value: number | null | undefined) =>
  value == null ? '--' : `${value}%`;

const scoreForSort = (value: number | null | undefined) =>
  value == null ? Number.NEGATIVE_INFINITY : value;

const CustomScatterTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;

  return (
    <div className="bg-white border border-slate-200 shadow-lg rounded-lg p-3 text-sm z-50">
      <div className="font-bold text-slate-800 border-b border-slate-100 pb-1 mb-2">{data.name}</div>
      <div className="text-slate-600">合规得分: <span className="font-bold text-slate-800">{data.y}</span></div>
      <div className="text-slate-600">未闭环问题: <span className="font-bold text-slate-800">{data.x} 项</span></div>
      <div className="text-slate-600">整改完成率: <span className="font-bold text-slate-800">{data.rectificationRate}%</span></div>
    </div>
  );
};

export default function GlobalGovernanceDashboard() {
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [branchPortraits, setBranchPortraits] = useState<BranchPortrait[]>([]);
  const [metrics, setMetrics] = useState<GlobalMetrics>(emptyMetrics);
  const [selectedBranch, setSelectedBranch] = useState<BranchPortrait | null>(null);

  const isDemoMode = API_MODE === 'mock';

  useEffect(() => {
    if (API_MODE === 'hybrid') {
      setBranchPortraits([]);
      setMetrics(emptyMetrics);
      setLoadState('hybrid-disabled');
      return;
    }

    let cancelled = false;
    setLoadState('loading');
    Promise.all([dashboardApi.getBranchPortraits(), dashboardApi.getGlobalMetrics()])
      .then(([portraits, globalMetrics]) => {
        if (cancelled) return;
        setBranchPortraits(portraits);
        setMetrics(globalMetrics);
        setLoadState(portraits.length > 0 ? 'ready' : 'empty');
      })
      .catch(() => {
        if (!cancelled) {
          setBranchPortraits([]);
          setMetrics(emptyMetrics);
          setLoadState('error');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sortedBranches = useMemo(
    () => [...branchPortraits].sort((a, b) => scoreForSort(b.totalScore) - scoreForSort(a.totalScore)),
    [branchPortraits],
  );

  const scatterData = useMemo(
    () => branchPortraits
      .filter(branch => branch.openIssues != null && branch.totalScore != null && branch.rectificationRate != null)
      .map(branch => ({
        branchId: branch.branchId,
        x: branch.openIssues,
        y: branch.totalScore,
        z: 100,
        name: branch.branchName,
        riskLevel: branch.riskLevel,
        rectificationRate: branch.rectificationRate,
        fill: branch.riskLevel === 'CRITICAL' ? '#ef4444' : branch.riskLevel === 'WARNING' ? '#f59e0b' : '#10b981',
      })),
    [branchPortraits],
  );

  const volatility = useMemo(() => {
    const comparableTrend = metrics.monthlyTrend.filter(point => point.score != null);
    const len = comparableTrend.length;
    if (len < 2) return null;
    return Number((comparableTrend[len - 1].score! - comparableTrend[len - 2].score!).toFixed(1));
  }, [metrics.monthlyTrend]);

  const comparableDimensions = selectedBranch?.dimensions.filter(
    dimension => dimension.score != null && dimension.weight != null,
  ) ?? [];
  const lowScoreDimensions = comparableDimensions.filter(dimension => dimension.score! < dimension.weight!);
  const highRiskBranchCount = branchPortraits.filter(item => item.riskLevel === 'CRITICAL').length;

  const statusMessage = {
    loading: '正在加载后端治理驾驶舱读模型...',
    ready: '',
    empty: '当前后端读模型没有返回可展示的机构画像记录。',
    error: '治理驾驶舱读模型加载失败，未展示任何样例兜底。',
    'hybrid-disabled': 'Hybrid 模式未展示 P1 dashboard 样例数据；请切换 real 模式查看后端读模型。',
  }[loadState];

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-white p-6 font-sans" data-testid="p1-governance-page">
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center">
            <Target className="w-6 h-6 mr-3 text-blue-500" />
            全局合规大屏 (Global Compliance Dashboard)
          </h1>
          <p className="text-slate-500 text-sm mt-1">基于后端治理与考核读模型展示机构风险态势。</p>
        </div>
        <div className="text-left lg:text-right">
          <p className="text-slate-500 text-sm">数据来源</p>
          <p className="text-slate-700 font-mono font-medium">
            {isDemoMode ? 'mock mode demo-only' : metrics.generatedAtRef || 'GovernanceDashboardReadModel'}
          </p>
        </div>
      </div>

      {isDemoMode ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          当前为显式 mock 模式，页面仅用于演示；real/hybrid 模式不会使用这些样例作为生产数据。
        </div>
      ) : null}

      {statusMessage ? (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          {statusMessage}
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4 mb-6">
        <MetricCard
          label="全系统综合得分"
          value={formatNumber(metrics.avgComplianceScore)}
          icon={<Activity className="w-6 h-6 text-blue-500" />}
          tone="blue"
        />
        <MetricCard
          label="高危机构数"
          value={highRiskBranchCount}
          icon={<AlertOctagon className="w-6 h-6 text-red-500" />}
          tone="red"
        />
        <MetricCard
          label="未闭环问题"
          value={formatInteger(metrics.totalActiveIssues)}
          icon={<ShieldAlert className="w-6 h-6 text-amber-500" />}
          tone="amber"
        />
        <MetricCard
          label="整改完成率"
          value={formatPercent(metrics.overallRectificationRate)}
          icon={<CheckCircle2 className="w-6 h-6 text-emerald-500" />}
          tone="emerald"
        />
        <MetricCard
          label="风险趋势差值"
          value={volatility === null ? '--' : `${volatility > 0 ? '+' : ''}${volatility}`}
          icon={volatility === null || volatility >= 0 ? <TrendingUp className="w-6 h-6 text-slate-500" /> : <TrendingDown className="w-6 h-6 text-red-500" />}
          note={volatility === null ? '后端未返回可比较趋势点' : '由真实趋势点差值计算'}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        <div className="bg-white border border-slate-200 shadow-sm rounded-lg p-5 flex flex-col min-h-[520px]">
          <h3 className="text-base font-bold text-slate-800 mb-4 flex items-center">
            <TrendingUp className="w-4 h-4 mr-2 text-blue-500" />
            合规考核排行榜
          </h3>
          {sortedBranches.length === 0 ? (
            <EmptyPanel title="暂无排行数据" message="后端没有返回机构评分记录，未填充静态排行样例。" />
          ) : (
            <div className="flex-1 overflow-y-auto pr-2 space-y-3">
              {sortedBranches.map((branch, idx) => {
                const trendData = branch.scoreTrend
                  .map((score, index) => ({ index, score }))
                  .filter(point => point.score != null);
                return (
                  <button
                    key={branch.branchId}
                    type="button"
                    className="w-full p-3 rounded-lg border border-slate-100 bg-white hover:bg-slate-50 text-left flex items-center justify-between transition-colors"
                    onClick={() => setSelectedBranch(branch)}
                  >
                    <div className="flex items-center min-w-0">
                      <span className="w-6 h-6 rounded bg-blue-50 text-blue-700 flex items-center justify-center text-xs font-bold mr-3 shrink-0">
                        {idx + 1}
                      </span>
                      <div className="truncate pr-2">
                        <p className="text-sm font-medium text-slate-700 truncate">{branch.branchName}</p>
                        <p className="text-xs text-slate-500">{formatNumber(branch.totalScore)} 分</p>
                      </div>
                    </div>
                    <div className="w-16 h-8 shrink-0">
                      {trendData.length > 1 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={trendData}>
                            <Line type="monotone" dataKey="score" stroke="#2563eb" strokeWidth={2} dot={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      ) : (
                        <span className="block text-xs text-slate-300 text-right">无趋势</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="xl:col-span-2 bg-white border border-slate-200 shadow-sm rounded-lg p-5 flex flex-col min-h-[520px]">
          <div className="flex items-center justify-between gap-3 mb-2">
            <h3 className="text-base font-bold text-slate-800 flex items-center">
              <Target className="w-4 h-4 mr-2 text-indigo-600" />
              全机构合规风险分布矩阵
            </h3>
            <span className="text-xs text-slate-500">X: 未闭环问题数 / Y: 考核得分</span>
          </div>
          {scatterData.length === 0 ? (
            <EmptyPanel title="暂无风险矩阵数据" message="后端没有返回分支画像记录，未展示静态散点样例。" />
          ) : (
            <div className="flex-1 min-h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis type="number" dataKey="x" name="未闭环问题" stroke="#94a3b8" tick={{ fill: '#64748b', fontSize: 12 }} domain={[0, 'dataMax + 2']} />
                  <YAxis type="number" dataKey="y" name="考核得分" stroke="#94a3b8" tick={{ fill: '#64748b', fontSize: 12 }} domain={[0, 100]} />
                  <ZAxis type="number" dataKey="z" range={[100, 320]} />
                  <RechartsTooltip cursor={{ strokeDasharray: '3 3', stroke: '#cbd5e1' }} content={<CustomScatterTooltip />} />
                  <Scatter
                    data={scatterData}
                    shape="circle"
                    onClick={(entry: any) => {
                      const branchId = entry?.payload?.branchId || entry?.branchId;
                      const branch = branchPortraits.find(item => item.branchId === branchId);
                      if (branch) setSelectedBranch(branch);
                    }}
                  >
                    {scatterData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 shadow-sm rounded-lg p-5 flex flex-col min-h-[520px]">
          <h3 className="text-base font-bold text-slate-800 mb-4 flex items-center">
            <ShieldAlert className="w-4 h-4 mr-2 text-amber-500" />
            实时督办动态
          </h3>
          <EmptyPanel
            title="事件流未接入"
            message="当前治理 read-model 未返回实时督办事件流；生产模式不展示静态滚动样例。"
          />
        </div>
      </div>

      {selectedBranch ? (
        <div className="mt-6 bg-white border border-slate-200 rounded-lg shadow-sm p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between mb-4">
            <div>
              <h3 className="text-lg font-bold text-slate-800">{selectedBranch.branchName} - 机构失分诊断卡</h3>
              <div className="flex flex-wrap gap-4 mt-2 text-sm text-slate-500">
                <span>考核总分: <strong className="text-slate-800">{formatNumber(selectedBranch.totalScore)}</strong></span>
                <span>未闭环问题: <strong className="text-red-600">{formatInteger(selectedBranch.openIssues)}</strong></span>
                <span>整改完成率: <strong className="text-emerald-600">{formatPercent(selectedBranch.rectificationRate)}</strong></span>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => setSelectedBranch(null)}>收起诊断卡</Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-slate-50 rounded-lg border border-slate-200 p-3 flex flex-col min-h-[300px]">
              <h4 className="text-sm font-bold text-slate-700 mb-2">多维合规雷达图</h4>
              {comparableDimensions.length === 0 ? (
                <EmptyPanel title="暂无维度数据" message="BranchPortraitReadModel 未返回维度得分。" />
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <RadarChart cx="50%" cy="50%" outerRadius="70%" data={comparableDimensions}>
                    <PolarGrid stroke="#e2e8f0" />
                    <PolarAngleAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10 }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                    <Radar name="实际得分" dataKey="score" stroke="#0ea5e9" fill="#0ea5e9" fillOpacity={0.45} />
                    <Radar name="标准满分" dataKey="weight" stroke="#94a3b8" fill="transparent" strokeDasharray="4 4" />
                    <RechartsTooltip />
                  </RadarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="bg-slate-50 rounded-lg border border-slate-200 p-3 flex flex-col min-h-[300px]">
              <h4 className="text-sm font-bold text-slate-700 mb-3 flex items-center">
                <AlertTriangle className="w-4 h-4 mr-2 text-amber-500" />
                扣分溯源清单
              </h4>
              {lowScoreDimensions.length === 0 ? (
                <EmptyPanel title="暂无扣分项" message="该机构当前维度没有低于标准分的真实记录。" />
              ) : (
                <div className="flex-1 overflow-y-auto pr-1 space-y-2">
                  {lowScoreDimensions.map(dimension => (
                    <div key={dimension.name} className="bg-white border border-rose-100 p-3 rounded-lg">
                      <div className="flex justify-between items-start mb-1.5">
                        <span className="text-sm font-bold text-slate-700">{dimension.name}</span>
                        <span className="text-sm font-bold text-red-600">-{(dimension.weight! - dimension.score!).toFixed(1)} 分</span>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        后端维度得分 {formatNumber(dimension.score)} / {formatNumber(dimension.weight)}；关联未闭环问题数 {formatInteger(dimension.issueCount)}。
                      </p>
                    </div>
                  ))}
                </div>
              )}
              <Button className="w-full mt-4" variant="outline" disabled title="督办命令未在本工作包冻结为后端写接口">
                <Zap className="w-4 h-4 mr-2" />
                督办命令未启用
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
