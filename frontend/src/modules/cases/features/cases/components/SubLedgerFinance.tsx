import React, { useEffect, useState } from 'react';
import { FeeTransaction, TransactionType, TransactionStatus } from '../../../types';
import { getFinancialRecords } from '../../../services/case';
import { CreditCard, ArrowUpRight, ArrowDownLeft, Wallet, PieChart as PieIcon, Plus, X } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface SubLedgerFinanceProps {
  caseId: string;
}

const formatCurrency = (amount: number, currency: string = 'CNY') => {
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency }).format(amount);
};

const SubLedgerFinance: React.FC<SubLedgerFinanceProps> = ({ caseId }) => {
  const [records, setRecords] = useState<FeeTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [newRecord, setNewRecord] = useState<Partial<FeeTransaction>>({
    type: TransactionType.LAWYER_FEE,
    amount: 0,
    currency: 'CNY',
    date: new Date().toISOString().split('T')[0],
    status: TransactionStatus.PENDING,
    description: ''
  });

  const loadData = () => {
    setLoading(true);
    getFinancialRecords(caseId).then(data => {
      setRecords(data);
      setLoading(false);
    });
  };

  useEffect(() => {
    loadData();
  }, [caseId]);

  const handleAdd = () => {
    const mockId = `ft-${Date.now()}`;
    const record: FeeTransaction = {
      id: mockId,
      caseId,
      type: newRecord.type as TransactionType,
      amount: Number(newRecord.amount),
      currency: newRecord.currency || 'CNY',
      date: newRecord.date || '',
      applicant: '当前用户',
      description: newRecord.description || '',
      status: newRecord.status as TransactionStatus
    };
    
    setRecords(prev => [...prev, record]);
    setIsAdding(false);
    setNewRecord({
      type: TransactionType.LAWYER_FEE,
      amount: 0,
      currency: 'CNY',
      date: new Date().toISOString().split('T')[0],
      status: TransactionStatus.PENDING,
      description: ''
    });
  };

  if (loading) return <div className="p-4 text-center text-slate-400 text-xs">加载财务流水...</div>;

  // --- Calculations ---
  const totalExpense = records.filter(r => r.type !== TransactionType.RECOVERY_RECEIVED).reduce((sum, r) => sum + r.amount, 0);
  const totalIncome = records.filter(r => r.type === TransactionType.RECOVERY_RECEIVED).reduce((sum, r) => sum + r.amount, 0);
  
  // Mock Budget (In real app, this comes from Case entity)
  const budget = 1000000; 
  const budgetUsedPercent = Math.min((totalExpense / budget) * 100, 100);

  // Chart Data
  const expenseByType = records
    .filter(r => r.type !== TransactionType.RECOVERY_RECEIVED)
    .reduce((acc, r) => {
      acc[r.type] = (acc[r.type] || 0) + r.amount;
      return acc;
    }, {} as Record<string, number>);
  
  const chartData = Object.entries(expenseByType).map(([name, value]) => ({ name, value }));
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

  return (
    <div className="space-y-6 relative">
      {/* Header Controls */}
      <div className="flex justify-end mb-4 sticky top-0 bg-white z-10 py-2 border-b border-slate-100">
        <button 
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-1 text-xs bg-brand-600 text-white px-3 py-1.5 rounded hover:bg-brand-700 transition-colors shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" /> 记一笔
        </button>
      </div>

      {/* Quick Add Modal */}
      {isAdding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-xl w-80 p-4 animate-in zoom-in-95">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-bold text-slate-800">新增收支记录</h3>
              <button onClick={() => setIsAdding(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4"/></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">类型</label>
                <select 
                  className="w-full text-xs border border-slate-300 rounded p-1.5"
                  value={newRecord.type}
                  onChange={e => setNewRecord({...newRecord, type: e.target.value as TransactionType})}
                >
                  {Object.values(TransactionType).map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">金额 (CNY)</label>
                <input 
                  type="number" 
                  className="w-full text-xs border border-slate-300 rounded p-1.5"
                  value={newRecord.amount}
                  onChange={e => setNewRecord({...newRecord, amount: Number(e.target.value)})}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">日期</label>
                <input 
                  type="date" 
                  className="w-full text-xs border border-slate-300 rounded p-1.5"
                  value={newRecord.date}
                  onChange={e => setNewRecord({...newRecord, date: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">说明</label>
                <input 
                  type="text"
                  className="w-full text-xs border border-slate-300 rounded p-1.5"
                  value={newRecord.description}
                  onChange={e => setNewRecord({...newRecord, description: e.target.value})}
                  placeholder="费用说明..."
                />
              </div>
              <button 
                onClick={handleAdd}
                className="w-full bg-brand-600 text-white text-xs py-2 rounded hover:bg-brand-700 font-medium"
              >
                确认保存
              </button>
            </div>
          </div>
        </div>
      )}

      {records.length === 0 ? (
        <div className="p-8 text-center border-2 border-dashed border-slate-100 rounded-lg bg-slate-50">
          <Wallet className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">暂无费用收支记录</p>
        </div>
      ) : (
        <>
          {/* Dashboard Section */}
          <div className="grid grid-cols-2 gap-4">
            {/* Left: Budget & Summary */}
            <div className="space-y-3">
              {/* Budget Progress */}
              <div className="bg-white border border-slate-200 p-4 rounded-lg shadow-sm">
                <div className="flex justify-between items-end mb-2">
                  <span className="text-xs font-bold text-slate-600">律师费预算使用率</span>
                  <span className="text-xs font-mono text-slate-500">
                    {formatCurrency(totalExpense)} / {formatCurrency(budget)}
                  </span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                  <div 
                    className={`h-2.5 rounded-full ${budgetUsedPercent > 80 ? 'bg-red-500' : 'bg-brand-500'}`} 
                    style={{ width: `${budgetUsedPercent}%` }}
                  ></div>
                </div>
                {budgetUsedPercent > 80 && (
                  <div className="mt-1 text-[10px] text-red-500 flex items-center gap-1">
                    <PieIcon className="w-3 h-3" /> 预算即将耗尽，请注意控制
                  </div>
                )}
              </div>

              {/* Key Metrics */}
              <div className="grid grid-cols-2 gap-3">
                 <div className="bg-rose-50 border border-rose-100 p-3 rounded-lg">
                    <div className="text-[10px] text-rose-600 font-bold uppercase mb-1">累计支出</div>
                    <div className="text-lg font-bold text-rose-800 font-mono">{formatCurrency(totalExpense)}</div>
                 </div>
                 <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-lg">
                    <div className="text-[10px] text-emerald-600 font-bold uppercase mb-1">累计回款</div>
                    <div className="text-lg font-bold text-emerald-800 font-mono">{formatCurrency(totalIncome)}</div>
                 </div>
              </div>
            </div>

            {/* Right: Expense Composition Chart */}
            <div className="bg-white border border-slate-200 p-2 rounded-lg shadow-sm flex flex-col items-center justify-center relative h-[160px]">
               <h4 className="absolute top-2 left-3 text-xs font-bold text-slate-500">费用构成</h4>
               <div className="w-full h-full">
                 <ResponsiveContainer width="100%" height="100%">
                   <PieChart>
                     <Pie
                       data={chartData}
                       cx="50%"
                       cy="50%"
                       innerRadius={30}
                       outerRadius={50}
                       paddingAngle={5}
                       dataKey="value"
                     >
                       {chartData.map((entry, index) => (
                         <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                       ))}
                     </Pie>
                     <Tooltip 
                        formatter={(value: number) => formatCurrency(value)}
                        contentStyle={{ fontSize: '10px', borderRadius: '4px', padding: '4px' }}
                     />
                     <Legend 
                        layout="vertical" 
                        verticalAlign="middle" 
                        align="right"
                        wrapperStyle={{ fontSize: '10px' }}
                     />
                   </PieChart>
                 </ResponsiveContainer>
               </div>
            </div>
          </div>

          {/* Ledger Table */}
          <div className="overflow-hidden border border-slate-200 rounded-lg shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2 font-medium text-slate-600">资金方向</th>
                  <th className="px-3 py-2 font-medium text-slate-600">费用科目</th>
                  <th className="px-3 py-2 font-medium text-slate-600 text-right">金额</th>
                  <th className="px-3 py-2 font-medium text-slate-600">日期</th>
                  <th className="px-3 py-2 font-medium text-slate-600">申请人/经办人</th>
                  <th className="px-3 py-2 font-medium text-slate-600">状态</th>
                  <th className="px-3 py-2 font-medium text-slate-600 w-1/3">备注说明</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {records.map(record => (
                  <tr key={record.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2">
                      {record.type === TransactionType.RECOVERY_RECEIVED ? (
                        <span className="text-emerald-600 font-medium flex items-center gap-1"><ArrowDownLeft className="w-3 h-3"/> 流入(+)</span>
                      ) : (
                        <span className="text-rose-600 font-medium flex items-center gap-1"><ArrowUpRight className="w-3 h-3"/> 流出(-)</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-800 font-medium">{record.type}</td>
                    <td className="px-3 py-2 text-slate-900 font-mono font-bold text-right">
                      {formatCurrency(record.amount, record.currency)}
                    </td>
                    <td className="px-3 py-2 text-slate-600 font-mono">{record.date}</td>
                    <td className="px-3 py-2 text-slate-600">{record.applicant}</td>
                    <td className="px-3 py-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] border ${
                        record.status === TransactionStatus.PAID ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                        record.status === TransactionStatus.PENDING ? 'bg-amber-50 text-amber-700 border-amber-100' :
                        'bg-slate-50 text-slate-600 border-slate-100'
                      }`}>
                        {record.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-500 truncate max-w-xs" title={record.description}>
                      {record.description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default SubLedgerFinance;
