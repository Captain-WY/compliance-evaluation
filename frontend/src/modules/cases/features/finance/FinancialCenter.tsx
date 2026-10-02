
import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import {
  getCases,
  getFinanceBoardKPI,
  getFinanceBoardDistribution,
  listFinanceBoardSpend,
  getFinanceBoardBudgetExecution,
  type FinanceBoardKPI,
  type FinanceBoardDistributionItem,
  type FinanceBoardSpendItem,
  type FinanceBoardBudgetItem,
} from '../../services/case';
import { Case, CaseStage } from '../../types';
import { DollarSign, Briefcase, TrendingDown, Gavel, ShieldAlert, ArrowRight, AlertTriangle } from 'lucide-react';
import NetCapitalCalculator from './tools/NetCapitalCalculator';

const FinancialCenter: React.FC = () => {
  const [kpi, setKpi] = useState<FinanceBoardKPI>({ totalExposure: 0, totalProvision: 0, totalLegalSpend: 0, totalRecovered: 0 });
  const [distribution, setDistribution] = useState<FinanceBoardDistributionItem[]>([]);
  const [spendItems, setSpendItems] = useState<FinanceBoardSpendItem[]>([]);
  const [budgetItems, setBudgetItems] = useState<FinanceBoardBudgetItem[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getFinanceBoardKPI(),
      getFinanceBoardDistribution(),
      listFinanceBoardSpend(5),
      getFinanceBoardBudgetExecution(),
      getCases().catch(() => [] as typeof cases),
    ]).then(([kpiData, distData, spendData, budgetData, caseData]) => {
      setKpi(kpiData);
      setDistribution(distData);
      setSpendItems(spendData);
      setBudgetItems(budgetData);
      setCases(caseData);
    }).finally(() => {
      setLoading(false);
    });
  }, []);

  const totalRiskDeduction = cases.reduce((sum, c) => {
    if (c.stage === CaseStage.CLOSED) return sum;
    return sum + (c.regulatoryAttrs?.estimatedRiskCapitalDeduction || 0);
  }, 0);

  const fmtMoney = (val: number) => `¥${(val / 10000).toFixed(0)}万`;

  // 预算提醒：取执行率最高（最危险）的业务线
  const topBudgetItem = budgetItems.length > 0
    ? [...budgetItems].sort((a, b) => b.executionRate - a.executionRate)[0]
    : null;

  if (loading) return <div>Loading Financial Center...</div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">财务与成本控制中心</h2>
          <p className="text-sm text-slate-500 mt-1">全景监控法律成本、预计负债及净资本影响。</p>
        </div>
        <span className="text-xs bg-slate-100 px-3 py-1 rounded-full text-slate-500">数据截止: {new Date().toLocaleDateString()}</span>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-slate-900 text-white p-6 rounded-xl shadow-lg">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/10 rounded-lg"><Gavel className="w-6 h-6" /></div>
            <div>
              <p className="text-slate-400 text-xs uppercase font-bold">总风险敞口 (Exposure)</p>
              <p className="text-2xl font-bold mt-1">¥ {(kpi.totalExposure / 100000000).toFixed(2)} 亿</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-red-50 rounded-lg text-red-600"><TrendingDown className="w-6 h-6" /></div>
            <div>
              <p className="text-slate-500 text-xs uppercase font-bold">预计负债总额 (Provisions)</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">¥ {(kpi.totalProvision / 100000000).toFixed(2)} 亿</p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-red-50 to-white p-6 rounded-xl border border-red-200 shadow-sm relative overflow-hidden group cursor-pointer hover:shadow-md transition-all">
          <div className="flex items-center gap-4 relative z-10">
            <div className="p-3 bg-red-100 rounded-lg text-red-700"><ShieldAlert className="w-6 h-6" /></div>
            <div>
              <p className="text-red-800/70 text-xs uppercase font-bold flex items-center gap-1">
                净资本风险扣减 <ArrowRight className="w-3 h-3 opacity-50" />
              </p>
              <p className="text-2xl font-bold text-red-900 mt-1">¥ {(totalRiskDeduction / 100000000).toFixed(2)} 亿</p>
            </div>
          </div>
          <div className="absolute right-0 top-0 p-2 opacity-10">
            <ShieldAlert className="w-24 h-24 text-red-600" />
          </div>
        </div>

        {/* U1: ROI 指标暂无 BFF 端点，留空展示 */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-50 rounded-lg text-emerald-600"><Briefcase className="w-6 h-6" /></div>
            <div>
              <p className="text-slate-500 text-xs uppercase font-bold">平均费效比 (ROI)</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">--</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left Column: Charts (2/3) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col h-96">
            <h3 className="font-bold text-slate-800 mb-4">各业务条线成本与风险分布</h3>
            {distribution.length > 0 ? (
              <div className="flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={distribution} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} xAxisId="0" />
                    <YAxis axisLine={false} tickLine={false} tickFormatter={fmtMoney} yAxisId="0" />
                    <Tooltip formatter={(value: number) => fmtMoney(value)} cursor={{ fill: '#f8fafc' }} />
                    <Legend />
                    <Bar dataKey="provision" name="预计负债" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={40} />
                    <Bar dataKey="fees" name="律师费用" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">暂无业务条线分布数据</div>
            )}
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
            <h3 className="font-bold text-slate-800 mb-4">最近大额支出</h3>
            {spendItems.length > 0 ? (
              <div className="overflow-auto flex-1">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-slate-100">
                    {spendItems.map(item => (
                      <tr key={item.id}>
                        <td className="py-3">
                          <p className="font-medium text-slate-800 truncate max-w-[120px]">{item.description}</p>
                          <p className="text-xs text-slate-400">{item.date}</p>
                        </td>
                        <td className="py-3 text-right font-mono font-medium text-slate-700">
                          ¥{(item.amount / 10000).toFixed(2)}万
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-slate-400 py-4 text-center">暂无支出记录</p>
            )}
          </div>
        </div>

        {/* Right Column: Tools (1/3) */}
        <div className="lg:col-span-1 space-y-6">
          <NetCapitalCalculator />

          {/* U2: 预算提醒 — 接入 BFF budget/execution 实际数据 */}
          <div className="bg-blue-50 border border-blue-100 p-5 rounded-xl text-sm text-blue-800">
            <h4 className="font-bold mb-2 flex items-center gap-2">
              <DollarSign className="w-4 h-4" /> 预算执行提醒
            </h4>
            {topBudgetItem ? (
              <div className="space-y-2 text-xs leading-relaxed opacity-90">
                <p>
                  最高执行率业务线：<span className="font-bold">{topBudgetItem.dimensionName}</span>
                </p>
                <div className="flex justify-between text-[11px] text-blue-700">
                  <span>已用 {fmtMoney(topBudgetItem.consumedAmount)}</span>
                  <span>预算 {fmtMoney(topBudgetItem.totalBudget)}</span>
                </div>
                <div className="w-full bg-blue-200 rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${topBudgetItem.isWarning ? 'bg-red-500' : 'bg-blue-500'}`}
                    style={{ width: `${Math.min(topBudgetItem.executionRate * 100, 100)}%` }}
                  />
                </div>
                <p className={`font-bold ${topBudgetItem.isWarning ? 'text-red-700 flex items-center gap-1' : ''}`}>
                  {topBudgetItem.isWarning && <AlertTriangle className="w-3 h-3" />}
                  执行率 {(topBudgetItem.executionRate * 100).toFixed(1)}%
                  {topBudgetItem.isWarning ? '（超警戒线 90%）' : ''}
                </p>
              </div>
            ) : (
              <p className="text-xs opacity-90 leading-relaxed">暂无预算执行数据。</p>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default FinancialCenter;
