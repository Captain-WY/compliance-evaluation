import React from 'react';
import { FileText, CheckCircle, Clock, AlertTriangle } from 'lucide-react';

const kpiData = {
  totalPlanned: 80,
  collected: {
    total: 60,
    offsite: 45,
    onsite: 15
  },
  pending: {
    total: 20,
    overdue: 5 // Critical production metric
  },
  issuesFound: 12
};

export default function ExecutionKPICards() {
  const handleClick = (name: string) => {
    console.log(`Navigating to drill-down view for: ${name}`);
    // Simulate navigation/filtering
    // toast(`Navigating to ${name}`);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {/* Card 1: 计划底稿总数 */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 rounded-xl p-5 shadow-sm">
        <div className="flex justify-between items-start mb-4">
          <span className="text-sm font-bold text-slate-500">计划底稿总数</span>
          <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
            <FileText className="w-5 h-5" />
          </div>
        </div>
        <div className="flex flex-col">
          <span className="text-3xl font-black text-slate-800">{kpiData.totalPlanned}</span>
          <span className="text-xs font-medium text-slate-400 mt-1">本次检查基准任务量</span>
        </div>
      </div>

      {/* Card 2: 已回收底稿 */}
      <div 
        className="bg-white dark:bg-slate-900 border border-slate-200 rounded-xl p-5 shadow-sm hover:-translate-y-1 hover:shadow-md transition-all cursor-pointer group"
        onClick={() => handleClick('已回收底稿')}
      >
        <div className="flex justify-between items-start mb-4">
          <span className="text-sm font-bold text-slate-500 group-hover:text-emerald-700 transition-colors">已回收底稿</span>
          <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600 group-hover:bg-emerald-100 transition-colors">
            <CheckCircle className="w-5 h-5" />
          </div>
        </div>
        <div className="flex justify-between items-end">
          <div className="flex flex-col">
            <span className="text-3xl font-black text-slate-800">{kpiData.collected.total}</span>
            <div className="flex items-center text-xs font-medium text-slate-400 mt-1">
              非现场: {kpiData.collected.offsite} <span className="mx-1">|</span> 现场: {kpiData.collected.onsite}
            </div>
          </div>
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-emerald-50 text-emerald-600 border border-emerald-100">
            进度 {Math.round((kpiData.collected.total / kpiData.totalPlanned) * 100)}%
          </span>
        </div>
      </div>

      {/* Card 3: 待处理底稿 */}
      <div 
        className="relative bg-white dark:bg-slate-900 border border-slate-200 rounded-xl p-5 shadow-sm hover:-translate-y-1 hover:shadow-md transition-all cursor-pointer group"
        onClick={() => handleClick('待处理底稿')}
      >
        {kpiData.pending.overdue > 0 && (
          <div className="absolute -top-1.5 -right-1.5 w-3 h-3 group/tooltip">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
            
            {/* Tooltip simulation */}
            <div className="pointer-events-none absolute right-0 bottom-full mb-2 w-max px-3 py-1.5 bg-slate-800 text-white text-xs rounded opacity-0 group-hover/tooltip:opacity-100 transition-opacity z-10 shadow-lg">
               含 {kpiData.pending.overdue} 份逾期未交
               <svg className="absolute text-slate-800 h-2 w-full right-0 top-full flex justify-end pr-1" x="0px" y="0px" viewBox="0 0 255 255"><polygon className="fill-current" points="0,0 127.5,127.5 255,0"/></svg>
            </div>
          </div>
        )}

        <div className="flex justify-between items-start mb-4">
          <span className="text-sm font-bold text-slate-500 mb-1 group-hover:text-blue-700 transition-colors">待抽取底稿</span>
          <div className="p-2 bg-slate-50 rounded-lg text-slate-500 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
            <Clock className="w-5 h-5" />
          </div>
        </div>
        <div className="flex items-end justify-between">
           <span className="text-3xl font-black text-slate-800">{kpiData.pending.total}</span>
           {kpiData.pending.overdue > 0 ? (
             <span className="text-rose-500 font-bold text-xs bg-rose-50 px-2 py-0.5 rounded border border-rose-100">
               含 {kpiData.pending.overdue} 份逾期未交
             </span>
           ) : (
             <span className="text-slate-400 font-medium text-xs">全部在期内</span>
           )}
        </div>
      </div>

      {/* Card 4: 发现问题数 */}
      <div 
        className="bg-rose-50/30 border border-rose-200/60 rounded-xl p-5 shadow-sm hover:-translate-y-1 hover:shadow-md transition-all cursor-pointer group"
        onClick={() => handleClick('发现问题数')}
      >
        <div className="flex justify-between items-start mb-4">
          <span className="text-sm font-bold text-rose-800">发现问题数</span>
          <div className="p-2 bg-rose-100/50 rounded-lg text-rose-600 group-hover:bg-rose-200/50 transition-colors">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>
        <div className="flex flex-col">
          <span className="text-3xl font-black text-rose-700">{kpiData.issuesFound}</span>
          <span className="text-xs font-medium text-rose-600/70 mt-1 flex items-center group-hover:text-rose-600 transition-colors">
             <span className="mr-1">👉</span> 点击进入缺陷总库排查
          </span>
        </div>
      </div>
    </div>
  );
}
