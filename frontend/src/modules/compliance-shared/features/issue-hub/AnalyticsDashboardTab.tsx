import React, { useEffect, useMemo, useState } from 'react';
import { 
  DownloadCloud, 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle,
  CheckCircle2,
  FileBarChart,
  Calendar,
  Building2,
  Briefcase,
  Image as ImageIcon
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { 
  ResponsiveContainer, 
  ComposedChart, 
  Line, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  Legend, 
  PieChart, 
  Pie, 
  Cell,
  BarChart,
  Area
} from 'recharts';
import { issueApi, type IssueAnalyticsReadModel } from '../../services/api';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6'];

export default function AnalyticsDashboardTab() {
  const [periodFilter, setPeriodFilter] = useState('2026-ALL');
  const [lineFilter, setLineFilter] = useState('ALL');
  const [branchFilter, setBranchFilter] = useState('ALL');
  const [analyticsData, setAnalyticsData] = useState<IssueAnalyticsReadModel | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const analyticsQuery = useMemo(() => ({
    period: periodFilter,
    businessLine: lineFilter === 'ALL' ? undefined : lineFilter,
    orgId: branchFilter === 'ALL' ? undefined : branchFilter,
  }), [branchFilter, lineFilter, periodFilter]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);
    issueApi.getIssueAnalytics(analyticsQuery)
      .then(data => {
        if (!cancelled) setAnalyticsData(data);
      })
      .catch(error => {
        if (!cancelled) {
          setAnalyticsData(null);
          setLoadError(error instanceof Error ? error.message : '问题数据驾驶舱加载失败');
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [analyticsQuery]);

  const viewData = useMemo(() => analyticsData ? {
    kpis: {
      totalIssues: analyticsData.kpis.totalIssues,
      overdue: analyticsData.kpis.overdue,
      closureRate: {
        ...analyticsData.kpis.closureRate,
        value: analyticsData.kpis.closureRate.displayValue,
      },
      avgFixDays: analyticsData.kpis.avgFixDays,
    },
    charts: {
      issueTrend: analyticsData.trendSeries,
      riskDistribution: analyticsData.riskDistribution,
      branchRanking: analyticsData.branchRanking,
    },
    totalRiskItems: analyticsData.riskDistribution.reduce((sum, item) => sum + item.value, 0),
    exportAllowed: analyticsData.exportAllowed,
  } : null, [analyticsData]);

  const CustomPieTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const total = viewData?.totalRiskItems || 1;
      return (
        <div className="bg-white border border-slate-200 p-3 rounded-lg shadow-lg">
          <p className="font-bold text-slate-800 text-sm mb-1">{payload[0].name}</p>
          <p className="text-indigo-600 font-semibold text-sm">
            {payload[0].value} 项 ({((payload[0].value / total) * 100).toFixed(1)}%)
          </p>
        </div>
      );
    }
    return null;
  };

  const CustomBarTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white border border-slate-200 p-3 rounded-lg shadow-lg">
          <p className="font-bold text-slate-800 text-sm mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm font-medium" style={{ color: entry.color }}>
              {entry.name}: {entry.value} 项
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const exportDashboardAsImage = async () => {
    if (!viewData?.exportAllowed) {
      toast.error('当前账号没有问题数据驾驶舱导出权限。');
      return;
    }
    toast.info("正在截取驾驶舱图表，请稍候...");
    try {
      const htmlToImage = await import('html-to-image');
      const element = document.getElementById('dashboard-export-area');
      if (!element) return;
      
      const dataUrl = await htmlToImage.toPng(element, { backgroundColor: '#f8fafc', pixelRatio: 2 });
      
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `合规数据驾驶舱_${new Date().toISOString().split('T')[0]}.png`;
      link.click();
      
      toast.success("驾驶舱截图已成功导出并下载。");
    } catch (error) {
      toast.error("❌ 导出失败，请重试。");
    }
  };

  return (
    <div data-testid="p2-issue-analytics-dashboard-tab" className="flex flex-col h-full space-y-4">
      {/* Global Control Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-wrap gap-4 items-end shadow-sm z-10 relative justify-between">
        <div className="flex flex-wrap gap-4">
          <div className="w-48">
            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider flex items-center">
              <Calendar className="w-3.5 h-3.5 mr-1" /> 分析周期
            </label>
            <select
              data-testid="p2-issue-analytics-filter-period"
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value)}
              className="block w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white shadow-sm font-medium text-slate-700 hover:border-slate-300 transition-colors"
            >
              <option value="2026-ALL">2026年 (全年)</option>
              <option value="2026-Q1">2026年 Q1</option>
              <option value="2026-Q2">2026年 Q2</option>
              <option value="2025-ALL">2025年 (全年)</option>
            </select>
          </div>

          <div className="w-48">
            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider flex items-center">
              <Briefcase className="w-3.5 h-3.5 mr-1" /> 涉及条线
            </label>
            <select
              data-testid="p2-issue-analytics-filter-business-line"
              value={lineFilter}
              onChange={(e) => setLineFilter(e.target.value)}
              className="block w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white shadow-sm font-medium text-slate-700 hover:border-slate-300 transition-colors"
            >
              <option value="ALL">全部条线</option>
              <option value="财富管理">财富管理条线</option>
              <option value="自营业务">自营业务条线</option>
            </select>
          </div>

          <div className="w-48">
            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider flex items-center">
              <Building2 className="w-3.5 h-3.5 mr-1" /> 被检机构
            </label>
            <select
              data-testid="p2-issue-analytics-filter-org"
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="block w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white shadow-sm font-medium text-slate-700 hover:border-slate-300 transition-colors"
            >
              <option value="ALL">全部分支机构与部门</option>
              <option value="WLZQ-RBC-GZ-LIWAN">广州荔湾分公司</option>
              <option value="WLZQ-RBC-SHENZHEN">深圳分公司</option>
            </select>
          </div>
        </div>

        {viewData?.exportAllowed && (
          <Button
            data-testid="p2-issue-analytics-export-png"
            variant="outline"
            onClick={exportDashboardAsImage}
            disabled={isLoading}
            className="border-slate-300 text-slate-700 hover:bg-slate-50 shadow-sm active:scale-95 transition-transform disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <ImageIcon className="w-4 h-4 mr-2"/> 导出驾驶舱截图 (PNG)
          </Button>
        )}
      </div>

      {isLoading && (
        <div data-testid="p2-issue-analytics-loading" className="bg-white border border-slate-200 rounded-xl p-6 text-sm font-medium text-slate-500 shadow-sm">
          正在加载问题数据驾驶舱...
        </div>
      )}
      {loadError && (
        <div data-testid="p2-issue-analytics-error" className="bg-rose-50 border border-rose-200 rounded-xl p-6 text-sm font-bold text-rose-700 shadow-sm">
          {loadError}
        </div>
      )}
      {!isLoading && !loadError && !viewData && (
        <div data-testid="p2-issue-analytics-empty" className="bg-white border border-slate-200 rounded-xl p-6 text-sm font-medium text-slate-500 shadow-sm">
          当前筛选条件下没有可分析数据。
        </div>
      )}

      {viewData && !isLoading && !loadError && (
      <div id="dashboard-export-area" data-testid="p2-issue-analytics-export-area" className="flex flex-col space-y-4 bg-slate-50 p-2 rounded-xl">
        {/* KPI Scorecard Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* KPI 1 */}
          <div data-testid="p2-issue-analytics-kpi-total" className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between relative overflow-hidden group">
          <div className="flex justify-between items-start mb-4">
            <span className="text-sm font-bold text-slate-500">发现问题总数</span>
            <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600 group-hover:bg-indigo-100 transition-colors">
              <FileBarChart className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-end justify-between">
            <div className="text-3xl font-bold text-slate-800">{viewData.kpis.totalIssues.value}</div>
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${viewData.kpis.totalIssues.isPositive ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
               {viewData.kpis.totalIssues.isPositive ? <TrendingDown className="w-3 h-3 mr-1" /> : <TrendingUp className="w-3 h-3 mr-1" />}
               {viewData.kpis.totalIssues.trend} 同比
            </span>
          </div>
        </div>

        {/* KPI 2 - CRITICAL */}
        <div data-testid="p2-issue-analytics-kpi-overdue" className="bg-rose-50 border border-rose-100 rounded-lg p-5 shadow-sm flex flex-col justify-between relative overflow-hidden group">
          <div className="flex justify-between items-start mb-4">
            <span className="text-sm font-bold text-rose-700">逾期未整改数</span>
            <AlertTriangle className="w-5 h-5 text-rose-500 mb-2"/>
          </div>
          <div className="flex items-end justify-between">
            <div className="text-3xl font-bold text-rose-600">{viewData.kpis.overdue.value}</div>
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${viewData.kpis.overdue.isPositive ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
               {viewData.kpis.overdue.isPositive ? <TrendingDown className="w-3 h-3 mr-1" /> : <TrendingUp className="w-3 h-3 mr-1" />}
               {viewData.kpis.overdue.trend} 同比
            </span>
          </div>
        </div>

        {/* KPI 3 */}
        <div data-testid="p2-issue-analytics-kpi-closure-rate" className="bg-emerald-50 border border-emerald-100 rounded-lg p-5 shadow-sm flex flex-col justify-between relative overflow-hidden group">
          <div className="flex justify-between items-start mb-4">
            <span className="text-sm font-bold text-emerald-700">整体整改销号率</span>
            <CheckCircle2 className="w-5 h-5 text-emerald-500 mb-2"/>
          </div>
          <div className="flex items-end justify-between">
            <div className="text-3xl font-bold text-emerald-600">{viewData.kpis.closureRate.value}</div>
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${viewData.kpis.closureRate.isPositive ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
               {viewData.kpis.closureRate.isPositive ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
               {viewData.kpis.closureRate.trend} 同比
            </span>
          </div>
        </div>

        {/* KPI 4 */}
        <div data-testid="p2-issue-analytics-kpi-avg-fix-days" className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between relative overflow-hidden group">
          <div className="flex justify-between items-start mb-4">
            <span className="text-sm font-bold text-slate-500">平均整改耗时(天)</span>
            <div className="p-2 bg-blue-50 rounded-lg text-blue-600 group-hover:bg-blue-100 transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="flex items-end justify-between">
            <div className="text-3xl font-bold text-slate-800">{viewData.kpis.avgFixDays.value}</div>
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${viewData.kpis.avgFixDays.isPositive ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
               {viewData.kpis.avgFixDays.isPositive ? <TrendingDown className="w-3 h-3 mr-1" /> : <TrendingUp className="w-3 h-3 mr-1" />}
               {viewData.kpis.avgFixDays.trend} 同比
            </span>
          </div>
        </div>
      </div>

      {/* Main Chart Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Chart 1: Trend */}
        <div data-testid="p2-issue-analytics-chart-trend" className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-base font-bold text-slate-800">合规缺陷发现与销号趋势</h3>
            <span className="text-xs font-medium text-slate-500">2026年 H1统计</span>
          </div>
          <div className="flex-1 min-h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={viewData.charts.issueTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b', fontWeight: 500 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b', fontWeight: 500 }} />
                <RechartsTooltip content={<CustomBarTooltip />} cursor={{ fill: '#f1f5f9' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', fontWeight: 500, paddingTop: '16px' }} />
                <Bar dataKey="found" name="发现问题数" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={40} />
                <Line type="monotone" dataKey="closed" name="销号问题数" stroke="#10b981" strokeWidth={3} dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} activeDot={{ r: 6 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Distribution */}
        <div data-testid="p2-issue-analytics-chart-distribution" className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-base font-bold text-slate-800">高频问题领域分布</h3>
            <span className="text-xs font-medium text-slate-500">累计排查</span>
          </div>
          <div className="flex-1 min-h-[300px] flex items-center justify-center relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={viewData.charts.riskDistribution}
                  cx="50%"
                  cy="45%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={2}
                  dataKey="value"
                  stroke="none"
                >
                  {viewData.charts.riskDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip content={<CustomPieTooltip />} />
                <Legend 
                  iconType="circle" 
                  layout="horizontal" 
                  verticalAlign="bottom" 
                  align="center"
                  wrapperStyle={{ fontSize: '12px', fontWeight: 500 }} 
                />
              </PieChart>
            </ResponsiveContainer>
             {/* Center Label */}
             <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-8">
               <span className="text-xs font-bold text-slate-400">总计问题</span>
               <span className="text-2xl font-black text-slate-700">{viewData.totalRiskItems}</span>
             </div>
          </div>
        </div>
      </div>

      {/* Row 2: Top 5 Red List */}
      <div data-testid="p2-issue-analytics-chart-ranking" className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col mb-6">
         <div className="flex items-center justify-between mb-6">
            <h3 className="text-base font-bold text-slate-800 flex items-center">
              整改逾期红黑榜 Top 5 
              <span className="ml-2 bg-rose-100 text-rose-700 text-xs px-2 py-0.5 rounded font-bold border border-rose-200">重点督办关注</span>
            </h3>
          </div>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={viewData.charts.branchRanking}
                layout="vertical"
                margin={{ top: 0, right: 30, left: 0, bottom: 0 }}
                barSize={20}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e2e8f0" />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis dataKey="branch" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#334155', fontWeight: 600 }} width={100} />
                <RechartsTooltip content={<CustomBarTooltip />} cursor={{ fill: '#f1f5f9' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', fontWeight: 500, paddingTop: '10px' }} />
                <Bar dataKey="overdue" name="逾期未完成" stackId="a" fill="#e11d48" radius={[0, 0, 0, 0]} />
                <Bar dataKey="completed" name="已按期销号" stackId="a" fill="#10b981" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
      </div>
      </div>
      )}

    </div>
  );
}
