import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { 
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { 
  Activity, 
  CheckCircle2, 
  AlertTriangle, 
  ShieldAlert,
  TrendingUp,
  Globe,
  BellRing,
  Building2,
  AlertOctagon,
  Eye
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import InspectionDashboard from './InspectionDashboard';
import { dashboardApi } from '../../services/api';

// --- Animated Counter Component ---
const AnimatedCounter = ({ value, duration = 1.5 }: { value: number, duration?: number }) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let startTime: number;
    let animationFrame: number;

    const updateCount = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / (duration * 1000), 1);
      
      // Ease out cubic
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(easeProgress * value));

      if (progress < 1) {
        animationFrame = requestAnimationFrame(updateCount);
      } else {
        setCount(value);
      }
    };

    animationFrame = requestAnimationFrame(updateCount);
    return () => cancelAnimationFrame(animationFrame);
  }, [value, duration]);

  return <span>{count}</span>;
};

export default function InspectionExecutionMonitor() {
  const [currentView, setCurrentView] = useState('dashboard');
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [monitorData, setMonitorData] = useState<any>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    dashboardApi.getGlobalMonitorData()
      .then(data => {
        if (!cancelled) setMonitorData(data);
      })
      .catch(error => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : '实施监控数据加载失败');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (currentView === 'inspection-plan-detail') {
    return <InspectionDashboard />;
  }

  if (!monitorData) {
    return (
      <div className="flex flex-col h-full min-h-[calc(100vh-4rem)] bg-slate-50 p-6 overflow-y-auto">
        {loadError ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {loadError}
          </div>
        ) : (
          <div className="space-y-6" data-testid="execution-monitor-skeleton">
            <div className="h-8 w-72 rounded bg-slate-200 animate-pulse" />
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-32 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="h-8 w-20 rounded bg-slate-200 animate-pulse" />
                  <div className="mt-6 h-4 w-32 rounded bg-slate-100 animate-pulse" />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-80 rounded-xl border border-slate-200 bg-white shadow-sm">
                  <div className="m-5 h-5 w-40 rounded bg-slate-200 animate-pulse" />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  const { stats: globalStatsData, domainRisks: domainRisksData, branchRisk: branchRiskData, liveStream: liveRiskStreamData, projects: flightBoardProjects } = monitorData;

  return (
    <div className="flex flex-col h-full min-h-[calc(100vh-4rem)] bg-slate-50 p-6 overflow-y-auto">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div>
          <div className="flex items-center space-x-2 mb-1">
            <Globe className="w-6 h-6 text-indigo-600" />
            <h2 className="text-2xl font-bold text-slate-900">全局实施进度与风险监控</h2>
          </div>
          <p className="text-sm text-slate-500 mt-1">统一监控全公司当前在检项目的推进规模与风险暴露水位</p>
        </div>
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
             <div className="text-3xl font-bold text-slate-800"><AnimatedCounter value={globalStatsData.activeProjects} /></div>
             <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center border border-indigo-100">
               <Activity className="w-5 h-5 text-indigo-600" />
             </div>
          </div>
          <div className="text-sm font-medium text-slate-500">当前并行实施项目</div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
             <div className="text-3xl font-bold text-slate-800"><AnimatedCounter value={globalStatsData.coveredBranches} /></div>
             <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center border border-slate-200">
               <Building2 className="w-5 h-5 text-slate-600" />
             </div>
          </div>
          <div className="text-sm font-medium text-slate-500">全盘涉及分支机构</div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-white p-5 rounded-xl border border-rose-100 shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-center justify-between mb-2 z-10 relative">
             <div className="text-3xl font-bold text-rose-600"><AnimatedCounter value={globalStatsData.totalDefects} /></div>
             <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center border border-rose-100/50">
               <AlertOctagon className="w-5 h-5 text-rose-500" />
             </div>
          </div>
          <div className="text-xs font-semibold text-rose-400 mt-1 z-10 relative">
             高危: {globalStatsData.highRisk} | 中危: {globalStatsData.mediumRisk} | 低危: {globalStatsData.lowRisk}
          </div>
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
            <AlertTriangle className="w-24 h-24 text-rose-600" />
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="bg-amber-50 p-5 rounded-xl border border-amber-200 shadow-sm flex flex-col justify-between overflow-hidden relative">
          <div className="flex items-center justify-between mb-2 z-10 relative">
             <div className="text-3xl font-bold text-amber-500 flex items-center">
               <BellRing className="w-6 h-6 mr-3 text-amber-500 animate-pulse" /> 
               <AnimatedCounter value={globalStatsData.todayAlerts} />
             </div>
          </div>
          <div className="text-sm font-medium text-amber-700/80 z-10 relative">今日全网新增高/中危缺陷</div>
          <div className="absolute right-0 bottom-0 pointer-events-none opacity-20">
             <BellRing className="w-20 h-20 text-amber-400 translate-x-4 translate-y-4" />
          </div>
        </motion.div>
      </div>

      {/* Visualizations Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6 h-[320px]">
        
        {/* Result Distribution (Donut Chart) */}
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col h-full">
          <h3 className="text-base font-bold text-slate-800 mb-4 flex items-center shrink-0">
            <PieChart className="w-4 h-4 mr-2 text-indigo-500" />
            缺陷业务领域分布 (Domain Risks)
          </h3>
          <div className="flex-1 min-h-0 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={domainRisksData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {domainRisksData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip 
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  itemStyle={{ fontSize: '14px', fontWeight: 500 }}
                  formatter={(value: number) => [`${value}%`, '占比']}
                />
                <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* High Risk Branches (Horizontal Bar Chart) */}
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col lg:col-span-1 h-full">
          <h3 className="text-base font-bold text-slate-800 mb-4 flex items-center shrink-0">
            <TrendingUp className="w-4 h-4 mr-2 text-rose-500" />
            高频风险机构预警 Top 5
          </h3>
          <div className="flex-1 min-h-0 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={branchRiskData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#475569', fontWeight: 500 }} width={80} />
                <RechartsTooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="defects" name="缺陷数量" fill="#f43f5e" radius={[0, 4, 4, 0]} barSize={24}>
                  {branchRiskData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index < 2 ? '#e11d48' : '#fb923c'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Live Deficiency Stream */}
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4 }} className="bg-slate-900 p-5 rounded-xl border border-slate-800 shadow-lg flex flex-col relative h-full overflow-hidden">
          {/* Tech background elements */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/10 blur-3xl rounded-full pointer-events-none"></div>
          
          <h3 className="text-base font-bold text-white mb-4 flex items-center relative z-10 shrink-0">
            <ShieldAlert className="w-4 h-4 mr-2 text-amber-400" />
            实时缺陷滚动播报 (Live Risk Stream)
            <span className="ml-auto flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
            </span>
          </h3>
          
          <div className="flex-1 overflow-y-auto relative z-10 min-h-0 pr-1 overflow-x-hidden">
            <div className="space-y-4 animate-[scroll_20s_linear_infinite] hover:[animation-play-state:paused]">
              {[...liveRiskStreamData, ...liveRiskStreamData].map((item, idx) => (
                <div key={`${item.id}-${idx}`} className={`border-l-4 ${item.borderColor} pl-4 bg-slate-800/40 p-3 rounded-r-lg`}>
                  <div className="text-xs text-slate-400 mb-1">[{item.project}] {item.branch}</div>
                  <div className="text-sm text-slate-100 font-bold tracking-wide">{item.issue}</div>
                  <div className={`text-[11px] font-bold mt-1.5 ${item.riskColor} flex items-center`}>
                    {item.risk} RISK <span className="mx-1.5 opacity-50">•</span> <span className="font-medium opacity-80">{item.time}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Flight Board Detail Section */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
        <div className="mt-8 mb-4 border-b border-slate-200 pb-3">
          <h3 className="text-lg font-bold text-slate-800">进行中计划</h3>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-slate-700 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 font-semibold">计划名称 (Project Name)</th>
                  <th className="px-6 py-4 font-semibold w-56">计划周期 (Timeline)</th>
                  <th className="px-6 py-4 font-semibold w-56">覆盖机构进度 (Branch Coverage)</th>
                  <th className="px-6 py-4 font-semibold text-center w-36">当前检出问题<br/>(Defects Found)</th>
                  <th className="px-6 py-4 font-semibold text-center w-36">健康度<br/>(Health Status)</th>
                  <th className="px-6 py-4 font-semibold text-center w-36">操作 (Action)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {flightBoardProjects.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <span className="font-bold text-slate-700">{row.name}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-slate-500">{row.period}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className="w-24 h-2 bg-slate-100 rounded-full mr-2 overflow-hidden">
                          <motion.div 
                            className="h-full bg-indigo-500 rounded-full"
                            initial={{ width: 0 }}
                            animate={{ width: `${row.progress}%` }}
                            transition={{ duration: 1, delay: 0.5 + idx * 0.1 }}
                          />
                        </div>
                        <span className="text-sm text-slate-600">{row.current} / {row.total}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="font-bold text-rose-600">{row.defects}</span> <span className="text-xs text-slate-400">项</span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {row.health === 'normal' ? (
                        <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border bg-emerald-50 text-emerald-600 border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 mr-1"/> 正常推进
                        </div>
                      ) : (
                        <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border bg-amber-50 text-amber-600 border-amber-200">
                          <AlertTriangle className="w-3 h-3 mr-1"/> 进度滞后
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50"
                        onClick={() => {
                          setActiveProjectId(row.id);
                          setIsReadOnly(true);
                          setCurrentView('inspection-plan-detail');
                        }}
                      >
                        <Eye className="w-4 h-4 mr-1.5"/> 穿透查看
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </motion.div>

      {/* Global Styles for Scrolling Animation */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes scroll {
          0% { transform: translateY(0); }
          100% { transform: translateY(-50%); }
        }
      `}} />
    </div>
  );
}
