
import React, { useEffect, useState } from 'react';
import { FinancialRecord } from '../../types';
import {
  getFinanceSnapshot,
  getSpendList,
  getProvisionsHistory,
  recordSpend,
  addProvision,
  SpendItem,
  ProvisionHistoryItem,
} from '../../services/case';
import {
  AlertOctagon, FileText, Plus,
  Wallet, History, Check, X,
} from 'lucide-react';
import Button from '../../components/ui/Button';
import InterestCalculator from './tools/InterestCalculator';

// ─── Constants ────────────────────────────────────────────────────────────────

const TX_TYPES = [
  { code: 'LAWYER_FEE',         label: '律师费' },
  { code: 'COURT_FEE',          label: '诉讼费/仲裁费' },
  { code: 'TRAVEL_EXPENSE',     label: '差旅费' },
  { code: 'COMPENSATION_PAID',  label: '赔偿支出' },
  { code: 'RECOVERY_RECEIVED',  label: '执行回款' },
] as const;
type TxTypeCode = typeof TX_TYPES[number]['code'];

const RISK_OPTS = [
  { code: 'PROBABLE' as const, label: '很可能（>50%）' },
  { code: 'POSSIBLE' as const, label: '可能（20-50%）' },
  { code: 'REMOTE'   as const, label: '较小（<20%）' },
];

const STATUS_LABEL: Record<string, string> = {
  PENDING: '拟制中', APPROVED: '已审批', EXECUTED: '已执行',
  REJECTED: '已驳回', CANCELLED: '已取消',
};
const STATUS_COLOR: Record<string, string> = {
  PENDING:   'text-amber-600 bg-amber-50 border-amber-100',
  APPROVED:  'text-blue-600 bg-blue-50 border-blue-100',
  EXECUTED:  'text-emerald-600 bg-emerald-50 border-emerald-100',
  REJECTED:  'text-red-600 bg-red-50 border-red-100',
  CANCELLED: 'text-slate-500 bg-slate-100 border-slate-200',
};
const TX_TYPE_COLOR: Record<string, string> = {
  LAWYER_FEE:        'bg-blue-50 text-blue-700 border-blue-100',
  COURT_FEE:         'bg-amber-50 text-amber-700 border-amber-100',
  RECOVERY_RECEIVED: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  COMPENSATION_PAID: 'bg-red-50 text-red-700 border-red-100',
};

// ─── Component ────────────────────────────────────────────────────────────────

interface CaseFinanceViewProps {
  caseId: string;
}

const CaseFinanceView: React.FC<CaseFinanceViewProps> = ({ caseId }) => {
  const [snapshot, setSnapshot] = useState<FinancialRecord | null>(null);
  const [spendItems, setSpendItems] = useState<SpendItem[]>([]);
  const [provisions, setProvisions] = useState<ProvisionHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [showRecordModal, setShowRecordModal] = useState(false);
  const [showProvisionModal, setShowProvisionModal] = useState(false);

  // Quick-record form
  const [txForm, setTxForm] = useState<{
    type: TxTypeCode; amount: string; date: string; description: string; isExecuted: boolean;
  }>({ type: 'LAWYER_FEE', amount: '', date: new Date().toISOString().split('T')[0], description: '', isExecuted: true });
  const [txSubmitting, setTxSubmitting] = useState(false);

  // Provision form
  const [provForm, setProvForm] = useState<{
    actionType: 'PROVISION' | 'ADJUSTMENT' | 'REVERSAL';
    amount: string; date: string;
    riskProbability: 'PROBABLE' | 'POSSIBLE' | 'REMOTE';
    basis: string;
  }>({ actionType: 'PROVISION', amount: '', date: new Date().toISOString().split('T')[0], riskProbability: 'PROBABLE', basis: '' });
  const [provSubmitting, setProvSubmitting] = useState(false);

  useEffect(() => { loadAllData(); }, [caseId]);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [snap, spend, provs] = await Promise.all([
        getFinanceSnapshot(caseId),
        getSpendList(caseId),
        getProvisionsHistory(caseId),
      ]);
      setSnapshot(snap);
      setSpendItems(spend);
      setProvisions(provs);
    } catch {
      // apiClient 拦截器已 toast.error
    } finally {
      setLoading(false);
    }
  };

  const handleRecordSpend = async () => {
    if (!txForm.amount || Number(txForm.amount) <= 0) return;
    setTxSubmitting(true);
    try {
      await recordSpend({
        caseId,
        transactionType: txForm.type,
        amount: Number(txForm.amount),
        applyDate: txForm.date || undefined,
        description: txForm.description || undefined,
      });
      setShowRecordModal(false);
      setTxForm({ type: 'LAWYER_FEE', amount: '', date: new Date().toISOString().split('T')[0], description: '', isExecuted: true });
      await loadAllData();
    } catch {
      // apiClient 拦截器已 toast.error
    } finally {
      setTxSubmitting(false);
    }
  };

  const handleAddProvision = async () => {
    if (provForm.actionType !== 'REVERSAL' && (!provForm.amount || Number(provForm.amount) <= 0)) return;
    if (!provForm.basis.trim()) return;
    setProvSubmitting(true);
    try {
      await addProvision({
        caseId,
        actionType: provForm.actionType,
        adjustmentAmount: provForm.actionType === 'REVERSAL' ? 0 : Number(provForm.amount),
        assessmentDate: provForm.date,
        riskProbability: provForm.riskProbability,
        basisOfEstimate: provForm.basis,
      });
      setShowProvisionModal(false);
      setProvForm({ actionType: 'PROVISION', amount: '', date: new Date().toISOString().split('T')[0], riskProbability: 'PROBABLE', basis: '' });
      await loadAllData();
    } catch {
      // apiClient 拦截器已 toast.error
    } finally {
      setProvSubmitting(false);
    }
  };

  const handleInjectFromCalculator = async (amount: number, description: string) => {
    try {
      await recordSpend({ caseId, transactionType: 'RECOVERY_RECEIVED', amount, description });
      await loadAllData();
    } catch {
      // apiClient 拦截器已 toast.error
    }
  };

  const fmt = (n: number) =>
    new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', maximumFractionDigits: 0 }).format(n);

  const totalCost = snapshot?.legalFeePaid ?? 0;
  const totalRecovered = snapshot?.executedAmount ?? 0;
  const netImpact = totalRecovered - totalCost;
  const provisionAmt = provisions.length > 0 ? provisions[0].currentAmount : (snapshot?.provisionAmount ?? 0);
  const latestProvisionDate = provisions.length > 0 ? provisions[0].assessmentDate?.split('T')[0] : '未计提';
  const budget = snapshot?.legalFeeBudget ?? 0;
  const budgetUsedPct = budget > 0 ? ((totalCost / budget) * 100).toFixed(0) : '—';

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">

      {/* ── 顶部看板 ── */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">

        {/* 净损益 */}
        <div className={`p-5 rounded-xl border shadow-sm relative overflow-hidden ${netImpact >= 0 ? 'bg-emerald-900 border-emerald-800 text-white' : 'bg-slate-900 border-slate-800 text-white'}`}>
          <div className="relative z-10">
            <p className="text-white/60 text-xs font-bold uppercase mb-1">案件净损益</p>
            <p className="text-2xl font-bold tracking-tight">{fmt(netImpact)}</p>
            <div className="mt-3 flex gap-2 text-[10px] text-white/80">
              <span className="bg-white/10 px-1.5 py-0.5 rounded">收: {fmt(totalRecovered)}</span>
              <span className="bg-white/10 px-1.5 py-0.5 rounded">支: {fmt(totalCost)}</span>
            </div>
          </div>
          <div className="absolute right-3 bottom-3 opacity-10"><Wallet className="w-12 h-12" /></div>
        </div>

        {/* 办案费用 */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <p className="text-slate-500 text-xs font-bold uppercase">办案费用 (Cost)</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{fmt(totalCost)}</p>
          </div>
          <p className="text-[10px] text-slate-400 mt-3">已登记流水合计</p>
        </div>

        {/* 预计负债 */}
        <div
          className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative group cursor-pointer hover:border-red-300 transition-colors"
          onClick={() => setShowProvisionModal(true)}
        >
          <div className="flex justify-between items-start">
            <div>
              <p className="text-slate-500 text-xs font-bold uppercase">预计负债 (Provision)</p>
              <p className="text-2xl font-bold text-red-600 mt-1">{fmt(provisionAmt)}</p>
            </div>
            <AlertOctagon className="w-5 h-5 text-red-100 group-hover:text-red-500 transition-colors" />
          </div>
          <p className="text-xs text-slate-400 mt-3 flex items-center gap-1">
            <History className="w-3 h-3" /> 最近评估: {latestProvisionDate}
          </p>
        </div>

        {/* 预算执行 */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-slate-500 text-xs font-bold uppercase">预算执行 (Budget)</p>
              <p className="text-xl font-bold text-slate-800 mt-1">{budgetUsedPct}%</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-slate-400">总预算</p>
              <p className="text-xs font-mono text-slate-600">{fmt(budget)}</p>
            </div>
          </div>
          <div className="mt-3 bg-slate-100 rounded text-xs p-1.5 text-center text-slate-500">
            {budget > 0
              ? budget - totalCost >= 0
                ? `剩余 ${fmt(budget - totalCost)}`
                : <span className="text-red-500 font-bold">超支 {fmt(totalCost - budget)}</span>
              : '未设置预算'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── 费用台账 ── */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col min-h-[500px]">
          <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
            <div>
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <FileText className="w-5 h-5 text-brand-600" /> 费用台账
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">登记本案件产生的各项费用及回款</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={loadAllData} isLoading={loading}>刷新</Button>
              <Button size="sm" onClick={() => setShowRecordModal(true)}>
                <Plus className="w-4 h-4 mr-1" /> 记一笔
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-500 font-medium sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="px-6 py-3">日期</th>
                  <th className="px-6 py-3">类型</th>
                  <th className="px-6 py-3">摘要</th>
                  <th className="px-6 py-3 text-right">金额 (元)</th>
                  <th className="px-6 py-3 text-center">状态</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {spendItems.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400">
                      <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3">
                        <Wallet className="w-6 h-6 opacity-20" />
                      </div>
                      <p>暂无流水记录</p>
                      <p className="text-xs mt-1">点击右上角"记一笔"开始建立台账</p>
                    </td>
                  </tr>
                ) : (
                  spendItems.map(item => (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-3 font-mono text-xs text-slate-500">{item.applyDate ?? item.createdAt?.split('T')[0]}</td>
                      <td className="px-6 py-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${TX_TYPE_COLOR[item.transactionType] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                          {item.transactionTypeName || item.transactionType}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-slate-700 truncate max-w-[200px]" title={item.description}>
                        {item.description || item.counterpartyName || '—'}
                      </td>
                      <td className="px-6 py-3 text-right font-mono font-medium">
                        <span className={item.transactionType === 'RECOVERY_RECEIVED' ? 'text-emerald-600' : 'text-slate-700'}>
                          {item.transactionType === 'RECOVERY_RECEIVED' ? '+' : '-'} {fmt(item.amount)}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-center">
                        <span className={`text-[10px] px-2 py-0.5 rounded border flex items-center justify-center gap-1 mx-auto w-fit ${STATUS_COLOR[item.status] ?? ''}`}>
                          {item.status === 'EXECUTED' && <Check className="w-3 h-3" />}
                          {STATUS_LABEL[item.status] ?? item.statusName}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── 右侧工具栏 ── */}
        <div className="lg:col-span-1 space-y-6">

          <InterestCalculator
            onApply={(amount, desc) => handleInjectFromCalculator(amount, desc)}
          />

          {/* 计提历史 */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="flex justify-between items-center mb-3">
              <h4 className="font-bold text-slate-700 text-sm flex items-center gap-2">
                <History className="w-4 h-4 text-slate-400" /> 计提历史
              </h4>
              <button
                onClick={() => setShowProvisionModal(true)}
                className="text-xs text-brand-600 hover:underline"
              >
                + 新增计提
              </button>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {provisions.map(p => (
                <div key={p.id} className="text-xs border-l-2 border-slate-200 pl-3 py-1">
                  <div className="flex justify-between">
                    <span className="text-slate-500">{p.assessmentDate?.split('T')[0] ?? '—'}</span>
                    <span className="font-bold text-slate-700">{fmt(p.currentAmount)}</span>
                  </div>
                  <p className="text-slate-400 mt-0.5 truncate">{p.basisOfEstimate ?? p.actionTypeName}</p>
                </div>
              ))}
              {provisions.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-2">暂无计提记录</p>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* ── 记一笔 Modal ── */}
      {showRecordModal && (
        <div className="fixed inset-0 bg-slate-900/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800">记一笔流水</h3>
              <button onClick={() => setShowRecordModal(false)}>
                <X className="w-5 h-5 text-slate-400 hover:text-slate-600" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">金额（元）</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">¥</span>
                  <input
                    type="number" autoFocus placeholder="0.00"
                    className="w-full pl-8 pr-4 py-3 text-xl font-bold border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 text-brand-600"
                    value={txForm.amount}
                    onChange={e => setTxForm({ ...txForm, amount: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">收支类型</label>
                  <select
                    className="w-full text-sm border border-slate-300 rounded-lg p-2 outline-none focus:border-brand-500"
                    value={txForm.type}
                    onChange={e => setTxForm({ ...txForm, type: e.target.value as TxTypeCode })}
                  >
                    {TX_TYPES.map(t => <option key={t.code} value={t.code}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">发生日期</label>
                  <input
                    type="date"
                    className="w-full text-sm border border-slate-300 rounded-lg p-2 outline-none focus:border-brand-500"
                    value={txForm.date}
                    onChange={e => setTxForm({ ...txForm, date: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">摘要备注</label>
                <input
                  type="text" placeholder="如：支付一审律师费"
                  className="w-full text-sm border border-slate-300 rounded-lg p-2 outline-none focus:border-brand-500"
                  value={txForm.description}
                  onChange={e => setTxForm({ ...txForm, description: e.target.value })}
                />
              </div>
            </div>
            <div className="px-5 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowRecordModal(false)} disabled={txSubmitting}>取消</Button>
              <Button onClick={handleRecordSpend} disabled={!txForm.amount || txSubmitting}>
                {txSubmitting ? '提交中...' : '确认入账'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── 计提 Modal ── */}
      {showProvisionModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-[60] p-4 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-bold text-slate-800">预计负债评估</h3>
              <button onClick={() => setShowProvisionModal(false)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div className="bg-amber-50 text-amber-800 text-xs p-3 rounded mb-4">
              <span className="font-bold">提示：</span>此操作将生成审计底稿记录，不可撤销。
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">操作类型</label>
                  <select
                    className="w-full text-sm border border-slate-300 rounded px-2 py-2 outline-none"
                    value={provForm.actionType}
                    onChange={e => setProvForm({ ...provForm, actionType: e.target.value as 'PROVISION' | 'ADJUSTMENT' | 'REVERSAL' })}
                  >
                    <option value="PROVISION">新增计提</option>
                    <option value="ADJUSTMENT">调整</option>
                    <option value="REVERSAL">冲销归零</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">评估日期</label>
                  <input
                    type="date"
                    className="w-full text-sm border border-slate-300 rounded px-2 py-2 outline-none"
                    value={provForm.date}
                    onChange={e => setProvForm({ ...provForm, date: e.target.value })}
                  />
                </div>
              </div>
              {provForm.actionType !== 'REVERSAL' && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">调整金额（元）</label>
                  <input
                    type="number" placeholder="0"
                    className="w-full border border-slate-300 rounded px-3 py-2 outline-none focus:ring-2 focus:ring-red-200 focus:border-red-500"
                    value={provForm.amount}
                    onChange={e => setProvForm({ ...provForm, amount: e.target.value })}
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">败诉概率</label>
                <select
                  className="w-full text-sm border border-slate-300 rounded px-2 py-2 outline-none"
                  value={provForm.riskProbability}
                  onChange={e => setProvForm({ ...provForm, riskProbability: e.target.value as 'PROBABLE' | 'POSSIBLE' | 'REMOTE' })}
                >
                  {RISK_OPTS.map(o => <option key={o.code} value={o.code}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">评估依据（必填）</label>
                <textarea
                  className="w-full border border-slate-300 rounded px-3 py-2 h-20 text-sm outline-none"
                  placeholder="如：一审判决不利，对方胜诉可能性>60%"
                  value={provForm.basis}
                  onChange={e => setProvForm({ ...provForm, basis: e.target.value })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="ghost" onClick={() => setShowProvisionModal(false)} disabled={provSubmitting}>取消</Button>
              <Button
                onClick={handleAddProvision}
                disabled={provSubmitting || !provForm.basis.trim() || (provForm.actionType !== 'REVERSAL' && !provForm.amount)}
                className="bg-red-600 hover:bg-red-700 border-transparent text-white"
              >
                {provSubmitting ? '提交中...' : '确认计提'}
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default CaseFinanceView;
