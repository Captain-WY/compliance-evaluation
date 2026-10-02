
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { User, Case } from '../../types';
import { getCases, type DashboardRiskItem } from '../../services/case';
import { DASHBOARD_ALERTS_KEY } from '../../layouts/LegalLayout';
import {
    LayoutDashboard, CheckSquare, Clock, AlertTriangle,
    Star, History, ArrowRight, TrendingUp, ShieldAlert,
    Calendar as CalendarIcon, Filter, MoreHorizontal, Plus
} from 'lucide-react';
import Button from '../../components/ui/Button';
import CalendarView from '../../components/ui/CalendarView';

interface LegalDashboardProps {
  user: User;
  onNavigate: (path: string) => void;
}

const LegalDashboard: React.FC<LegalDashboardProps> = ({ user, onNavigate }) => {
  const [activeTab, setActiveTab] = useState<'ASSIGNED' | 'RECENT' | 'STARRED'>('ASSIGNED');

  // 案件列表：独立查询，与风险预警解耦
  const { data: cases = [], isLoading } = useQuery<Case[]>({
    queryKey: ['dashboard-cases'],
    queryFn: getCases,
    staleTime: 2 * 60 * 1000,
  });

  // 风险预警：复用 LegalLayout 已有缓存，不发额外请求
  // approval-processed 事件已由 LegalLayout 统一 invalidate，此处无需重复监听
  const { data: riskTasks = [] } = useQuery<DashboardRiskItem[]>({
    queryKey: DASHBOARD_ALERTS_KEY,
    enabled: false,  // 不发起新请求，仅读取 LegalLayout 维护的缓存
  });

  // --- Derived Data ---
  const myCases = cases.filter(c => c.stage !== '已结案'); // Mock "Assigned to me"
  const highRiskCases = cases.filter(c => c.riskLevel === '特大' || c.riskLevel === '重大');
  const upcomingDeadlines = cases
    .filter(c => c.nextDeadline)
    .sort((a, b) => new Date(a.nextDeadline!).getTime() - new Date(b.nextDeadline!).getTime())
    .slice(0, 5);

  const getGreeting = () => {
      const hour = new Date().getHours();
      if (hour < 12) return '早安';
      if (hour < 18) return '下午好';
      return '晚上好';
  };

  if (isLoading) return <div className="p-12 text-center text-slate-400">加载工作台...</div>;

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      
      {/* 1. Header & Quick Actions */}
      <div className="flex justify-between items-end">
          <div>
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
                  {getGreeting()}, {user.name}
              </h1>
              <p className="text-slate-500 mt-2 flex items-center gap-2">
                  <CheckSquare className="w-4 h-4" /> 您有 <span className="font-bold text-slate-800 underline decoration-brand-300 decoration-2 underline-offset-2">12</span> 项待办事项，
                  <span className="font-bold text-red-600 underline decoration-red-200 decoration-2 underline-offset-2">{riskTasks.length}</span> 项合规风险需关注。
              </p>
          </div>
          <div className="flex gap-3">
              <Button variant="outline" onClick={() => onNavigate('/reports')}>
                  <ShieldAlert className="w-4 h-4 mr-2" /> 风险视图
              </Button>
              <Button onClick={() => onNavigate('/cases/new')} className="shadow-lg shadow-brand-500/20">
                  <Plus className="w-4 h-4 mr-2" /> 发起立案
              </Button>
          </div>
      </div>

      {/* 2. KPI Cards (Jira Style) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div 
            className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:border-brand-300 transition-all cursor-pointer group"
            onClick={() => onNavigate('/cases?filter=active')}
          >
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">在办案件 (Active)</p>
              <div className="flex justify-between items-end">
                  <span className="text-3xl font-bold text-slate-800">{myCases.length}</span>
                  <div className="p-2 bg-brand-50 text-brand-600 rounded-lg group-hover:bg-brand-600 group-hover:text-white transition-colors">
                      <LayoutDashboard className="w-5 h-5" />
                  </div>
              </div>
          </div>

          <div 
            className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:border-red-300 transition-all cursor-pointer group"
            onClick={() => onNavigate('/reports')}
          >
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">高危预警 (Critical)</p>
              <div className="flex justify-between items-end">
                  <span className="text-3xl font-bold text-red-600">{riskTasks.filter(t => t.riskLevel === '特大').length}</span>
                  <div className="p-2 bg-red-50 text-red-600 rounded-lg group-hover:bg-red-600 group-hover:text-white transition-colors">
                      <AlertTriangle className="w-5 h-5" />
                  </div>
              </div>
          </div>

          <div 
            className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:border-amber-300 transition-all cursor-pointer group"
            onClick={() => onNavigate('/cases?filter=due_soon')}
          >
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">本周截止 (Due)</p>
              <div className="flex justify-between items-end">
                  <span className="text-3xl font-bold text-amber-600">3</span>
                  <div className="p-2 bg-amber-50 text-amber-600 rounded-lg group-hover:bg-amber-600 group-hover:text-white transition-colors">
                      <Clock className="w-5 h-5" />
                  </div>
              </div>
          </div>

          <div 
            className="bg-gradient-to-br from-slate-800 to-slate-900 p-4 rounded-xl border border-slate-700 shadow-sm text-white cursor-pointer"
            onClick={() => onNavigate('/finance')}
          >
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">本季挽回损失</p>
              <div className="flex justify-between items-end">
                  <span className="text-2xl font-bold">¥ 4,500万</span>
                  <TrendingUp className="w-6 h-6 text-emerald-400" />
              </div>
          </div>
      </div>

      {/* 3. Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Column: My Work (2/3) */}
          <div className="lg:col-span-2 space-y-6">
              {/* Tab Header */}
              <div className="flex items-center gap-6 border-b border-slate-200">
                  <button 
                    onClick={() => setActiveTab('ASSIGNED')}
                    className={`pb-3 text-sm font-medium transition-all relative ${activeTab === 'ASSIGNED' ? 'text-brand-600' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                      指派给我 (My Tasks)
                      {activeTab === 'ASSIGNED' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-brand-600 rounded-t-full"></div>}
                  </button>
                  <button 
                    onClick={() => setActiveTab('RECENT')}
                    className={`pb-3 text-sm font-medium transition-all relative ${activeTab === 'RECENT' ? 'text-brand-600' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                      最近访问 (Recent)
                      {activeTab === 'RECENT' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-brand-600 rounded-t-full"></div>}
                  </button>
                  <button 
                    onClick={() => setActiveTab('STARRED')}
                    className={`pb-3 text-sm font-medium transition-all relative ${activeTab === 'STARRED' ? 'text-brand-600' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                      重点关注 (Starred)
                      {activeTab === 'STARRED' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-brand-600 rounded-t-full"></div>}
                  </button>
                  <div className="ml-auto pb-2">
                      <Button variant="ghost" size="sm" className="text-slate-400">
                          <Filter className="w-4 h-4 mr-1" /> 筛选
                      </Button>
                  </div>
              </div>

              {/* Task List */}
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden min-h-[400px]">
                  {activeTab === 'ASSIGNED' && (
                      <div className="divide-y divide-slate-100">
                          {upcomingDeadlines.map(c => (
                              <div key={c.id} className="p-4 hover:bg-slate-50 transition-colors flex items-center justify-between group cursor-pointer" onClick={() => onNavigate(`/cases/${c.id}`)}>
                                  <div className="flex items-start gap-4">
                                      <div className="pt-1">
                                          <div className={`w-2 h-2 rounded-full ${c.riskLevel === '特大' ? 'bg-red-500' : 'bg-brand-500'}`}></div>
                                      </div>
                                      <div>
                                          <h4 className="font-bold text-slate-800 text-sm group-hover:text-brand-600 transition-colors">{c.title}</h4>
                                          <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                                              <span className="font-mono bg-slate-100 px-1.5 rounded">{c.code}</span>
                                              <span>• {c.stage}</span>
                                              <span>• {c.businessLine}</span>
                                          </div>
                                      </div>
                                  </div>
                                  <div className="flex items-center gap-4">
                                      {c.nextDeadline && (
                                          <div className="text-right">
                                              <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">截止日期</span>
                                              <span className={`text-xs font-mono font-bold ${new Date(c.nextDeadline) < new Date() ? 'text-red-600' : 'text-slate-700'}`}>
                                                  {c.nextDeadline}
                                              </span>
                                          </div>
                                      )}
                                      <button className="p-2 hover:bg-slate-200 rounded-full text-slate-400 opacity-0 group-hover:opacity-100 transition-all">
                                          <ArrowRight className="w-4 h-4" />
                                      </button>
                                  </div>
                              </div>
                          ))}
                          <div className="p-4 text-center">
                              <button className="text-xs font-medium text-slate-500 hover:text-brand-600 flex items-center justify-center gap-1 mx-auto">
                                  查看所有任务 <ArrowRight className="w-3 h-3" />
                              </button>
                          </div>
                      </div>
                  )}
                  {activeTab === 'RECENT' && (
                      <div className="p-8 text-center text-slate-400 flex flex-col items-center">
                          <History className="w-10 h-10 mb-2 opacity-20" />
                          <p>暂无最近访问记录</p>
                      </div>
                  )}
                  {activeTab === 'STARRED' && (
                      <div className="divide-y divide-slate-100">
                          {highRiskCases.map(c => (
                              <div key={c.id} className="p-4 hover:bg-slate-50 transition-colors flex items-center justify-between group cursor-pointer" onClick={() => onNavigate(`/cases/${c.id}`)}>
                                  <div className="flex items-center gap-4">
                                      <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                                      <div>
                                          <h4 className="font-bold text-slate-800 text-sm">{c.title}</h4>
                                          <p className="text-xs text-red-500 mt-0.5 font-medium">{c.riskLevel}风险</p>
                                      </div>
                                  </div>
                                  <div className="text-right">
                                      <span className="text-xs font-mono text-slate-600">¥{(c.regulatoryAttrs?.amountNoInterest || 0).toLocaleString()}</span>
                                  </div>
                              </div>
                          ))}
                      </div>
                  )}
              </div>
          </div>

          {/* Right Column: Sidebar (1/3) */}
          <div className="space-y-6">
              
              {/* Risk Pulse */}
              <div className="bg-red-50 border border-red-100 rounded-xl p-5 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-3 opacity-10">
                      <ShieldAlert className="w-16 h-16 text-red-600" />
                  </div>
                  <h3 className="font-bold text-red-900 flex items-center gap-2 mb-4">
                      <AlertTriangle className="w-5 h-5" /> 风险雷达
                  </h3>
                  <div className="space-y-3 relative z-10">
                      {riskTasks.slice(0, 3).map(task => (
                          <div key={task.riskItemId} className="bg-white/80 p-3 rounded-lg border border-red-100 shadow-sm text-sm">
                              <p className="font-bold text-slate-800 line-clamp-1" title={task.caseTitle}>{task.caseTitle}</p>
                              <div className="flex justify-between items-center mt-2">
                                  <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded">{task.triggerType}</span>
                                  <button 
                                    onClick={() => onNavigate('/reports')}
                                    className="text-xs text-red-600 hover:underline"
                                  >
                                      去处理 &gt;
                                  </button>
                              </div>
                          </div>
                      ))}
                      {riskTasks.length === 0 && <p className="text-sm text-red-700/60 italic">当前无高危风险事项。</p>}
                  </div>
              </div>

              {/* Mini Calendar */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                      <h4 className="font-bold text-slate-700 text-sm flex items-center gap-2">
                          <CalendarIcon className="w-4 h-4 text-brand-500" /> 
                          日程概览
                      </h4>
                      <button className="text-xs text-brand-600 hover:underline">全屏</button>
                  </div>
                  {/* Using existing CalendarView in mini mode */}
                  <CalendarView 
                    events={upcomingDeadlines.map(c => ({
                        id: c.id, 
                        date: c.nextDeadline || '', 
                        title: c.title, 
                        type: c.riskLevel === '特大' ? 'danger' : 'info' 
                    }))}
                    className="border-none shadow-none text-xs"
                  />
                  <div className="mt-3 pt-3 border-t border-slate-100">
                      <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                          {upcomingDeadlines.slice(0, 3).map(c => (
                              <div key={c.id} className="min-w-[120px] bg-slate-50 p-2 rounded border border-slate-100 text-center">
                                  <span className="block text-[10px] text-slate-400">{c.nextDeadline}</span>
                                  <span className="block text-xs font-bold text-slate-700 truncate">{c.court.split(' ')[0]}</span>
                              </div>
                          ))}
                      </div>
                  </div>
              </div>

          </div>
      </div>
    </div>
  );
};

export default LegalDashboard;
