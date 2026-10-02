
import React, { useEffect, useState, useMemo } from 'react';
import { Case, CaseStage, RiskLevel } from '../../types';
import {
  getCases,
  listComplianceAlerts,
  handleComplianceAlert,
  listComplianceRules,
  toggleComplianceRule,
  type ComplianceAlertRecord,
  type ComplianceRuleRecord,
} from '../../services/case';
import {
  AlertTriangle, Clock, Zap, Megaphone, CheckCircle2, Settings,
  X, RotateCcw, PieChart as PieChartIcon, BarChart3, Activity, ShieldAlert, Loader2,
} from 'lucide-react';
import Button from '../../components/ui/Button';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts';

// D89: 净资产阈值常量，待接入合规配置 API 后替换 (R22)
const NET_ASSETS_THRESHOLD = 5_000_000_000;

const ALERT_LEVEL_STYLES: Record<string, string> = {
  CRITICAL: 'bg-red-50 text-red-700 border-red-100',
  HIGH: 'bg-orange-50 text-orange-700 border-orange-100',
  MEDIUM: 'bg-amber-50 text-amber-700 border-amber-100',
  LOW: 'bg-blue-50 text-blue-700 border-blue-100',
};

const RiskMonitor: React.FC = () => {
  const [alerts, setAlerts] = useState<ComplianceAlertRecord[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [rules, setRules] = useState<ComplianceRuleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isConfiguring, setIsConfiguring] = useState(false);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);

  // Dismiss modal state
  const [dismissTarget, setDismissTarget] = useState<ComplianceAlertRecord | null>(null);
  const [dismissNotes, setDismissNotes] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [alertData, caseData] = await Promise.all([
        listComplianceAlerts({ status: 'PENDING' }),
        getCases(),
      ]);
      setAlerts(alertData);
      setCases(caseData);
    } finally {
      setLoading(false);
    }
  };

  const loadRules = async () => {
    setRulesLoading(true);
    try {
      const data = await listComplianceRules();
      setRules(data);
    } finally {
      setRulesLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleOpenConfig = () => {
    loadRules();
    setIsConfiguring(true);
  };

  const handleToggleRule = async (rule: ComplianceRuleRecord) => {
    if (rule.status === 'DRAFT') return;
    await toggleComplianceRule(rule.ruleId);
    loadRules();
  };

  const handleConvertToTask = async (alert: ComplianceAlertRecord) => {
    setProcessing(alert.alertId);
    try {
      await handleComplianceAlert({ alertId: alert.alertId, action: 'CONVERT_TO_TASK' });
      await loadData();
    } finally {
      setProcessing(null);
    }
  };

  const handleDismiss = async () => {
    if (!dismissTarget || !dismissNotes.trim()) return;
    setProcessing(dismissTarget.alertId);
    try {
      await handleComplianceAlert({ alertId: dismissTarget.alertId, action: 'DISMISS', notes: dismissNotes });
      setDismissTarget(null);
      setDismissNotes('');
      await loadData();
    } finally {
      setProcessing(null);
    }
  };

  const fmtMoney = (val: number) => `¥${(val / 100000000).toFixed(2)}亿`;

  const stats = useMemo(() => {
    const exposureByLine: Record<string, number> = {};
    const riskCounts: Record<string, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };

    cases.forEach(c => {
      if (c.stage === CaseStage.CLOSED) return;
      const amt = c.regulatoryAttrs?.amountNoInterest || 0;
      if (!exposureByLine[c.businessLine]) exposureByLine[c.businessLine] = 0;
      exposureByLine[c.businessLine] += amt;
      const rl = c.riskLevel as unknown as string;
      if (rl === RiskLevel.CRITICAL || rl === 'CRITICAL' || rl === '特大') riskCounts.CRITICAL++;
      else if (rl === RiskLevel.HIGH || rl === 'HIGH' || rl === '重大') riskCounts.HIGH++;
      else if (rl === RiskLevel.MEDIUM || rl === 'MEDIUM' || rl === '关注') riskCounts.MEDIUM++;
      else riskCounts.LOW++;
    });

    const totalExposure = Object.values(exposureByLine).reduce((a, b) => a + b, 0);
    const netAssetRatio = (totalExposure / NET_ASSETS_THRESHOLD) * 100;
    const barData = Object.entries(exposureByLine)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
    const pieData = [
      { name: '特大风险', value: riskCounts.CRITICAL, color: '#ef4444' },
      { name: '重大风险', value: riskCounts.HIGH, color: '#f97316' },
      { name: '关注', value: riskCounts.MEDIUM, color: '#eab308' },
      { name: '一般', value: riskCounts.LOW, color: '#3b82f6' },
    ].filter(d => d.value > 0);

    return { totalExposure, netAssetRatio, barData, pieData, riskCounts };
  }, [cases]);

  if (loading) return <div className="p-12 text-center text-slate-400">正在加载合规告警驾驶舱...</div>;

  return (
    <div className="space-y-6 animate-in fade-in">

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-900 text-white p-5 rounded-xl shadow-lg relative overflow-hidden">
          <div className="relative z-10">
            <p className="text-slate-400 text-xs font-bold uppercase">全口径风险敞口</p>
            <p className="text-2xl font-bold mt-2">{fmtMoney(stats.totalExposure)}</p>
            <p className="text-xs text-slate-400 mt-1">涉及 {cases.length} 起在办案件</p>
          </div>
          <Activity className="absolute right-3 bottom-3 w-12 h-12 text-white opacity-10" />
        </div>

        <div className={`p-5 rounded-xl border shadow-sm ${stats.netAssetRatio > 10 ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'}`}>
          <p className="text-slate-500 text-xs font-bold uppercase">净资产占比 (Risk/NAV)</p>
          <div className="flex items-end gap-2 mt-2">
            <p className={`text-2xl font-bold ${stats.netAssetRatio > 10 ? 'text-red-600' : 'text-slate-800'}`}>
              {stats.netAssetRatio.toFixed(2)}%
            </p>
            <span className="text-xs text-slate-400 mb-1">/ 阈值 10%</span>
          </div>
          <div className="w-full bg-slate-200 h-1.5 rounded-full mt-3 overflow-hidden">
            <div className={`h-full ${stats.netAssetRatio > 10 ? 'bg-red-500' : 'bg-brand-500'}`}
              style={{ width: `${Math.min(stats.netAssetRatio * 5, 100)}%` }} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-slate-500 text-xs font-bold uppercase">特大风险案件</p>
            <p className="text-2xl font-bold text-red-600 mt-2">{stats.riskCounts.CRITICAL}</p>
          </div>
          <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
            <ShieldAlert className="w-5 h-5 text-red-600" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-slate-500 text-xs font-bold uppercase">待处理告警</p>
            <p className="text-2xl font-bold text-amber-600 mt-2">{alerts.length}</p>
          </div>
          <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center">
            <Megaphone className="w-5 h-5 text-amber-600" />
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h4 className="font-bold text-slate-800 text-sm mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-slate-500" /> 业务线风险集中度
          </h4>
          <div className="h-64">
            {stats.barData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.barData} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                  <XAxis type="number" hide xAxisId={0} />
                  <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 12 }} yAxisId={0} />
                  <Tooltip formatter={(value: number) => `¥${(value / 10000).toFixed(0)}万`} cursor={{ fill: '#f8fafc' }} />
                  <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm">暂无业务线数据</div>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
          <h4 className="font-bold text-slate-800 text-sm mb-4 flex items-center gap-2">
            <PieChartIcon className="w-4 h-4 text-slate-500" /> 风险等级分布
          </h4>
          <div className="flex-1 flex items-center justify-center">
            {stats.pieData.length > 0 ? (
              <div className="w-full h-64">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={stats.pieData} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                      {stats.pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend verticalAlign="bottom" height={36} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="text-slate-400 text-sm">暂无在办案件风险数据</div>
            )}
          </div>
        </div>
      </div>

      {/* Alert List */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-red-100 p-2 rounded-lg text-red-600">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800">实时合规预警列表</h3>
              <p className="text-xs text-slate-500 mt-0.5">基于规则引擎自动扫描生成的合规义务提醒。</p>
            </div>
          </div>
          <Button size="sm" variant="outline" className="text-xs h-8" onClick={handleOpenConfig}>
            <Settings className="w-3 h-3 mr-1" /> 规则配置
          </Button>
        </div>

        {alerts.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-30 text-emerald-500" />
            当前无待处理的合规告警
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {alerts.map(alert => (
              <div key={alert.alertId} className="p-4 hover:bg-slate-50 transition-colors flex items-center justify-between">
                <div className="flex items-start gap-4">
                  <div className="mt-1">
                    <AlertTriangle className={`w-5 h-5 ${alert.alertLevel === 'CRITICAL' ? 'text-red-600 fill-red-50' : 'text-orange-500'}`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`text-xs px-1.5 py-0.5 rounded font-bold border ${ALERT_LEVEL_STYLES[alert.alertLevel] ?? ALERT_LEVEL_STYLES.LOW}`}>
                        {alert.alertLevelName || alert.alertLevel}
                      </span>
                      <span className="font-bold text-slate-800 text-sm">{alert.caseTitle}</span>
                      <span className="text-xs text-slate-400 font-mono">({alert.caseCode})</span>
                    </div>
                    <p className="text-xs text-slate-600">
                      触发规则: <span className="font-medium text-slate-800">{alert.ruleName}</span>
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">{alert.alertMessage}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0 ml-4">
                  <div className="text-right text-xs text-slate-400">
                    <Clock className="w-3 h-3 inline mr-1" />
                    {alert.createdAt.slice(0, 10)}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" className="text-slate-400 hover:text-slate-600 text-xs"
                      onClick={() => { setDismissTarget(alert); setDismissNotes(''); }}
                      disabled={processing === alert.alertId}>
                      豁免
                    </Button>
                    <Button size="sm" className="bg-red-600 hover:bg-red-700 border-transparent text-xs"
                      onClick={() => handleConvertToTask(alert)}
                      disabled={processing === alert.alertId}>
                      <Megaphone className="w-3 h-3 mr-1" />
                      {processing === alert.alertId ? '处理中...' : '转为任务'}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Dismiss Modal */}
      {dismissTarget && (
        <div className="fixed inset-0 bg-slate-900/60 z-[70] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-xl shadow-2xl w-[480px] overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex justify-between items-center">
              <h3 className="font-bold text-slate-800">豁免合规告警</h3>
              <button onClick={() => setDismissTarget(null)}><X className="w-5 h-5 text-slate-400 hover:text-slate-600" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                <AlertTriangle className="w-4 h-4 inline mr-1" />
                豁免操作将被记录审计日志，请填写充分理由。
              </div>
              <div className="bg-slate-50 p-3 rounded text-sm text-slate-600">
                <span className="font-bold">告警：</span>{dismissTarget.alertMessage}
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">豁免理由（必填）</label>
                <textarea
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm resize-none h-24 focus:ring-2 focus:ring-brand-500 outline-none"
                  placeholder="请说明豁免原因..."
                  value={dismissNotes}
                  onChange={e => setDismissNotes(e.target.value)}
                />
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDismissTarget(null)}>取消</Button>
              <Button onClick={handleDismiss} disabled={!dismissNotes.trim() || processing === dismissTarget.alertId}>
                {processing === dismissTarget.alertId ? '提交中...' : '确认豁免'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Rules Config Modal */}
      {isConfiguring && (
        <div className="fixed inset-0 bg-slate-900/60 z-[80] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex justify-between items-center">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Settings className="w-5 h-5 text-slate-600" /> 合规检测规则配置
              </h3>
              <button onClick={() => setIsConfiguring(false)}><X className="w-5 h-5 text-slate-400 hover:text-slate-600" /></button>
            </div>

            <div className="flex-1 p-6 overflow-auto space-y-4">
              {rulesLoading ? (
                <div className="text-center text-slate-400 py-8">
                  <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin opacity-30" />
                  加载规则...
                </div>
              ) : rules.length === 0 ? (
                <div className="text-center text-slate-400 py-8">
                  <RotateCcw className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  暂无合规规则
                </div>
              ) : (
                rules.map(rule => (
                  <div key={rule.ruleId}
                    className={`border rounded-lg p-4 transition-all ${rule.status === 'ACTIVE' ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-200 opacity-60'}`}>
                    <div className="flex justify-between items-center">
                      <div>
                        <h4 className="font-bold text-sm text-slate-800">{rule.ruleName}</h4>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {rule.ruleTypeName} · {rule.actionTypeName}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                          rule.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                          rule.status === 'DRAFT' ? 'bg-slate-100 text-slate-500 border-slate-200' :
                          'bg-red-50 text-red-600 border-red-100'
                        }`}>{rule.statusName || rule.status}</span>
                        {rule.status !== 'DRAFT' && (
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" className="sr-only peer"
                              checked={rule.status === 'ACTIVE'}
                              onChange={() => handleToggleRule(rule)} />
                            <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-600" />
                          </label>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex justify-end">
              <Button size="sm" variant="outline" onClick={() => setIsConfiguring(false)}>关闭</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RiskMonitor;
