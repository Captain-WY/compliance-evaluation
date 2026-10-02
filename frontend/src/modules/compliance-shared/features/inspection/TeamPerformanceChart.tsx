import React, { useState } from 'react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip as RechartsTooltip, 
  Legend, 
  CartesianGrid 
} from 'recharts';

const teamPerformanceData = [
  { inspector: '张建国', totalReviewed: 18, issuesFound: 4, noIssues: 14, efficiency: '95%' },
  { inspector: '李四', totalReviewed: 15, issuesFound: 6, noIssues: 9, efficiency: '88%' },
  { inspector: '王芳', totalReviewed: 12, issuesFound: 2, noIssues: 10, efficiency: '92%' },
  { inspector: '孙合规', totalReviewed: 8, issuesFound: 1, noIssues: 7, efficiency: '100%' }
];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-lg min-w-[200px]">
        <h4 className="font-bold text-slate-800 text-base mb-3 pb-2 border-b border-slate-100">
          {label} 的审阅质效
        </h4>
        <div className="space-y-2 text-sm">
          <p className="font-semibold text-slate-700">
            总审阅量: <span className="font-bold">{data.totalReviewed}</span> 份
          </p>
          <p className="font-bold text-amber-600">
            👉 发现缺陷: {data.issuesFound} 个
          </p>
          <p className="font-medium text-emerald-600">
            ✅ 未见异常: {data.noIssues} 份
          </p>
          <p className="text-slate-500 text-xs mt-2 pt-2 border-t border-slate-100">
            ⏱️ 审阅准时率: {data.efficiency}
          </p>
        </div>
      </div>
    );
  }
  return null;
};

export default function TeamPerformanceChart() {
  const [sortParam, setSortParam] = useState('TOTAL');

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 flex flex-col">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
        <h3 className="text-lg font-bold text-slate-800">
          项目组员底稿审阅进度与发现排查
        </h3>
        
        <select
          value={sortParam}
          onChange={(e) => setSortParam(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white shadow-sm font-medium text-slate-700 hover:border-slate-300 transition-colors cursor-pointer w-full sm:w-auto"
        >
          <option value="TOTAL">按审阅总量排序</option>
          <option value="ISSUES">按发现缺陷数排序</option>
        </select>
      </div>

      <div className="w-full h-[350px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={teamPerformanceData}
            layout="vertical"
            margin={{ top: 0, right: 30, left: 0, bottom: 0 }}
            barSize={30}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e2e8f0" />
            <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
            <YAxis 
              dataKey="inspector" 
              type="category" 
              axisLine={false} 
              tickLine={false} 
              tick={{ fontSize: 13, fill: '#334155', fontWeight: 600 }} 
              width={70} 
            />
            <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />
            <Legend 
              iconType="circle" 
              wrapperStyle={{ fontSize: '13px', fontWeight: 500, paddingTop: '20px' }} 
            />
            <Bar dataKey="noIssues" stackId="a" fill="#10b981" name="未见异常" />
            <Bar dataKey="issuesFound" stackId="a" fill="#f59e0b" name="发现缺陷" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
