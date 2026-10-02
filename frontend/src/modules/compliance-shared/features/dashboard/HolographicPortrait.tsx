import React, { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Clock, Stethoscope, Target, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { API_MODE, dashboardApi } from '../../services/api';
import type { LocalBranchProfile } from '../../types';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { StableChartContainer } from '@/components/charts/StableChartContainer';

type LoadState = 'loading' | 'ready' | 'empty' | 'error' | 'hybrid-disabled';

function EmptyPanel({ title, message }: { title: string; message: string }) {
  return (
    <div className="min-h-[220px] flex flex-col items-center justify-center text-center border border-dashed border-slate-200 rounded-lg bg-slate-50 px-6">
      <CheckCircle2 className="w-8 h-8 text-slate-300 mb-3" />
      <h3 className="text-sm font-bold text-slate-700">{title}</h3>
      <p className="text-sm text-slate-500 mt-1 max-w-md">{message}</p>
    </div>
  );
}

function MetricTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  tone: 'emerald' | 'amber' | 'rose' | 'slate';
}) {
  const toneClass = {
    emerald: 'bg-emerald-50 border-emerald-100 text-emerald-700',
    amber: 'bg-amber-50 border-amber-100 text-amber-700',
    rose: 'bg-rose-50 border-rose-100 text-rose-700',
    slate: 'bg-slate-50 border-slate-200 text-slate-700',
  }[tone];

  return (
    <div className={`border rounded-lg p-5 ${toneClass}`}>
      <div className="text-xs font-bold mb-1 opacity-80">{label}</div>
      <div className="text-3xl font-bold text-slate-900">{value}</div>
    </div>
  );
}

const formatNumber = (value: number | null | undefined, digits = 1) =>
  value == null ? '--' : value.toFixed(digits);

const formatInteger = (value: number | null | undefined) =>
  value == null ? '--' : String(value);

export default function HolographicPortrait() {
  const [profile, setProfile] = useState<LocalBranchProfile | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');

  const isDemoMode = API_MODE === 'mock';

  useEffect(() => {
    if (API_MODE === 'hybrid') {
      setProfile(null);
      setLoadState('hybrid-disabled');
      return;
    }

    let cancelled = false;
    setLoadState('loading');
    dashboardApi.getCurrentBranchProfile()
      .then(branchProfile => {
        if (cancelled) return;
        setProfile(branchProfile);
        setLoadState(branchProfile ? 'ready' : 'empty');
      })
      .catch(() => {
        if (!cancelled) {
          setProfile(null);
          setLoadState('error');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const comparableTrend = useMemo(
    () => profile?.scoreTrend.filter(point => point.score != null) ?? [],
    [profile?.scoreTrend],
  );

  const comparableRadarData = useMemo(
    () => profile?.radarData.filter(dimension => dimension.actualScore != null && dimension.fullScore != null) ?? [],
    [profile?.radarData],
  );

  const weakestDimension = useMemo(() => {
    const scoredDimensions = comparableRadarData.filter(dimension => dimension.fullScore != null && dimension.fullScore > 0);
    if (!scoredDimensions.length) return null;
    return [...scoredDimensions].sort((a, b) => (a.actualScore! / a.fullScore!) - (b.actualScore! / b.fullScore!))[0];
  }, [comparableRadarData]);

  const currentScoreTone = useMemo<'emerald' | 'amber' | 'rose' | 'slate'>(() => {
    if (profile?.currentScore == null) return 'slate';
    return profile.currentScore >= 80 ? 'emerald' : 'amber';
  }, [profile?.currentScore]);

  const statusMessage = {
    loading: '正在加载后端机构画像读模型...',
    ready: '',
    empty: '当前后端没有返回机构画像数据。',
    error: '机构画像加载失败，未展示任何静态画像样例。',
    'hybrid-disabled': 'Hybrid 模式不展示 P1 branch portrait 样例数据；请切换 real 模式查看后端读模型。',
  }[loadState];

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8" data-testid="p1-branch-portrait-page">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">全息机构画像 (合规体检表)</h1>
          <p className="text-sm text-slate-500 mt-1">基于 BranchPortraitReadModel 的机构得分、趋势、维度和风险摘要。</p>
        </div>
        <div className="text-sm text-slate-500 flex items-center">
          <Clock className="w-4 h-4 mr-1" />
          {isDemoMode ? 'mock mode demo-only' : profile?.generatedAtRef || '后端未返回 generatedAtRef'}
        </div>
      </div>

      {isDemoMode ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          当前为显式 mock 模式，页面仅用于演示；real/hybrid 模式不会使用这些样例作为生产画像。
        </div>
      ) : null}

      {statusMessage ? (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          {statusMessage}
        </div>
      ) : null}

      {!profile ? (
        <EmptyPanel title="暂无机构画像" message="没有真实 read-model 数据时，页面保持空态，不展示静态散点、雷达、趋势或样例机构。" />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <MetricTile label="机构名称" value={<span className="text-xl">{profile.branchName}</span>} tone="slate" />
            <MetricTile label="合规健康综合得分" value={formatNumber(profile.currentScore)} tone={currentScoreTone} />
            <MetricTile label="全系统排名" value={profile.totalBranches == null ? '--' : `${formatInteger(profile.rank)} / ${profile.totalBranches}`} tone="slate" />
            <MetricTile label="逾期未整改缺陷" value={formatInteger(profile.urgency.overdueIssuesCount)} tone={profile.urgency.overdueIssuesCount != null && profile.urgency.overdueIssuesCount > 0 ? 'rose' : 'emerald'} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-lg p-5 h-[360px] flex flex-col">
              <h3 className="text-sm font-bold text-slate-800 mb-1 flex items-center">
                <TrendingUp className="w-4 h-4 mr-2 text-indigo-600" />
                历史考核得分趋势
              </h3>
              <p className="text-xs text-slate-500 mb-4">仅展示后端返回的 scoreTrend；公司均线未作为真实字段返回时不绘制。</p>
              {comparableTrend.length === 0 ? (
                <EmptyPanel title="暂无趋势数据" message="BranchPortraitReadModel 未返回历史趋势。" />
              ) : (
                <div className="flex-1 min-h-0">
                  <StableChartContainer>
                    <AreaChart data={comparableTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="branchScoreTrend" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.28} />
                          <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="period" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
                      <Tooltip />
                      <Area type="monotone" dataKey="score" name="机构得分" stroke="#4f46e5" strokeWidth={3} fill="url(#branchScoreTrend)" />
                    </AreaChart>
                  </StableChartContainer>
                </div>
              )}
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-5 h-[360px] flex flex-col">
              <h3 className="text-sm font-bold text-slate-800 mb-1 flex items-center">
                <Target className="w-4 h-4 mr-2 text-amber-500" />
                本期合规维度得分
              </h3>
              <p className="text-xs text-slate-500 mb-4">雷达图使用后端 dimensions/radarData 字段，不补静态标准样例。</p>
              {comparableRadarData.length === 0 ? (
                <EmptyPanel title="暂无维度数据" message="BranchPortraitReadModel 未返回维度得分。" />
              ) : (
                <div className="flex-1 min-h-0">
                  <StableChartContainer>
                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={comparableRadarData}>
                      <PolarGrid stroke="#e2e8f0" />
                      <PolarAngleAxis dataKey="dimensionName" tick={{ fill: '#475569', fontSize: 11 }} />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                      <Radar name="实际得分" dataKey="actualScore" stroke="#f59e0b" strokeWidth={2} fill="#fcd34d" fillOpacity={0.55} />
                      <Radar name="标准满分" dataKey="fullScore" stroke="#cbd5e1" strokeWidth={1} strokeDasharray="4 4" fill="transparent" />
                      <Tooltip />
                    </RadarChart>
                  </StableChartContainer>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <h3 className="text-base font-bold text-slate-800 mb-4 flex items-center">
                <Stethoscope className="w-5 h-5 mr-2 text-slate-500" />
                风险摘要
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <span className="text-slate-500">高风险问题</span>
                  <strong className={profile.urgency.highRiskIssuesCount != null && profile.urgency.highRiskIssuesCount > 0 ? 'text-rose-600' : 'text-emerald-600'}>
                    {formatInteger(profile.urgency.highRiskIssuesCount)}
                  </strong>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <span className="text-slate-500">7天内到期任务</span>
                  <strong className="text-slate-800">{formatInteger(profile.urgency.expiringTasksCount)}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">下一次填报倒计时</span>
                  <strong className="text-slate-800">{formatInteger(profile.urgency.daysToNextSubmission)}</strong>
                </div>
              </div>
            </div>

            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-lg p-5">
              <h3 className="text-base font-bold text-slate-800 mb-4 flex items-center">
                <Activity className="w-5 h-5 mr-2 text-indigo-500" />
                真实 read-model 洞察
              </h3>
              {weakestDimension ? (
                <div className="rounded-lg border border-amber-100 bg-amber-50 p-4">
                  <Badge variant="outline" className="text-amber-700 border-amber-200 bg-white">最低维度</Badge>
                  <p className="mt-3 text-sm text-slate-700">
                    {weakestDimension.dimensionName} 当前得分 {formatNumber(weakestDimension.actualScore)} / {formatNumber(weakestDimension.fullScore)}。
                  </p>
                </div>
              ) : (
                <EmptyPanel title="暂无可计算洞察" message="没有真实维度数据时，不生成 AI 风格样例结论。" />
              )}
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 flex items-center justify-between gap-4">
                <div>
                  <h4 className="text-sm font-bold text-slate-700">智能建议未启用</h4>
                  <p className="text-sm text-slate-500 mt-1">当前 read-model 未返回可执行 smartActions；生产模式不展示本地培训或整改建议样例。</p>
                </div>
                <Button variant="outline" disabled>
                  <AlertTriangle className="w-4 h-4 mr-2" />
                  暂无真实动作
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
