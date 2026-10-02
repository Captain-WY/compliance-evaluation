
import React, { useEffect, useState } from 'react';
import { RiskRule, RiskLevel } from '../../types';
import { complianceBffApi } from '../../src/services/api/complianceBffApi';
import { ruleItemToRiskRule, riskRuleToSavePayload } from './riskRuleAdapter';
import { Settings, Save, AlertTriangle, RefreshCw, Edit2, Zap, Plus, X, Clock, Zap as ZapIcon, LayoutList, BarChart3 } from 'lucide-react';
import Button from '../../components/ui/Button';

const RiskRulesPanel: React.FC = () => {
  const [rules, setRules] = useState<RiskRule[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState<Partial<RiskRule>>({});

  useEffect(() => {
    loadRules();
  }, []);

  const loadRules = async () => {
    setLoading(true);
    try {
      const data = await complianceBffApi.listRulesBff({ pageSize: 100 });
      setRules((data?.items ?? []).map(ruleItemToRiskRule));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAdd = () => {
      setIsCreating(true);
      setFormData({
          name: '',
          category: 'SINGLE_CASE', // Default
          conditionType: 'AMOUNT_GREATER',
          params: { value: 0, keywords: [] },
          triggerType: '临时公告',
          targetRiskLevel: RiskLevel.HIGH,
          scanFrequency: 'REALTIME',
          isActive: true,
          actionType: 'GENERATE_ALERT'
      });
      setIsModalOpen(true);
  };

  const handleOpenEdit = (rule: RiskRule) => {
      setIsCreating(false);
      setFormData(JSON.parse(JSON.stringify(rule)));
      setIsModalOpen(true);
  };

  const handleToggle = async (rule: RiskRule) => {
      await complianceBffApi.toggleRuleBff(rule.id);
      loadRules();
  };

  const handleSubmit = async () => {
      if (!formData.name || !formData.conditionType) return;

      const payload = riskRuleToSavePayload(formData as RiskRule);
      await complianceBffApi.saveRuleBff(payload);
      setIsModalOpen(false);
      loadRules();
  };

  // Helper to sync category and frequency defaults
  const handleCategoryChange = (cat: string) => {
      const isPeriodic = cat === 'CUMULATIVE' || cat === 'INDICATOR';
      setFormData(prev => ({
          ...prev,
          category: cat as any,
          // Auto-switch frequency based on type
          scanFrequency: isPeriodic ? 'MONTHLY' : 'REALTIME',
          // Reset params for cleanliness
          params: { value: 0, keywords: [], periodMonths: 12 }
      }));
  };

  if (loading) return <div className="p-4 text-center text-slate-400">加载规则引擎...</div>;

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm h-full flex flex-col relative">
        <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 rounded-t-xl">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Settings className="w-5 h-5 text-brand-600" /> 智能监控规则配置
            </h3>
            <Button size="sm" onClick={handleOpenAdd}>
                <Plus className="w-3 h-3 mr-1" /> 新增规则
            </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
            {rules.map(rule => (
                <div key={rule.id} className={`border rounded-lg p-4 transition-all ${rule.isActive ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-50 border-slate-200 opacity-60'}`}>
                    <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold border flex items-center gap-1 ${
                                rule.scanFrequency === 'REALTIME' 
                                ? 'bg-blue-50 text-blue-700 border-blue-200' 
                                : 'bg-purple-50 text-purple-700 border-purple-200'
                            }`}>
                                {rule.scanFrequency === 'REALTIME' ? <ZapIcon className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                                {rule.scanFrequency === 'REALTIME' ? '事件驱动' : `周期: ${rule.scanFrequency}`}
                            </span>
                            <h4 className="font-bold text-sm text-slate-800">{rule.name}</h4>
                        </div>
                        <div className="flex items-center gap-2">
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" className="sr-only peer" checked={rule.isActive} onChange={() => handleToggle(rule)} />
                                <div className="w-8 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[0px] after:left-[0px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-600"></div>
                            </label>
                            <button onClick={() => handleOpenEdit(rule)} className="p-1 text-slate-400 hover:text-brand-600">
                                <Edit2 className="w-3 h-3" />
                            </button>
                        </div>
                    </div>

                    <div className="text-xs text-slate-600 space-y-1 mt-3">
                        {rule.category === 'CUMULATIVE' ? (
                            <div className="bg-purple-50 p-2 rounded border border-purple-100 font-medium text-purple-800">
                                规则: 过去 {rule.params.periodMonths} 个月累计金额 &gt; ¥{(rule.params.value || 0).toLocaleString()}
                            </div>
                        ) : (
                            <div className="bg-slate-50 p-2 rounded border border-slate-100 font-mono text-[10px] text-slate-500 mt-2 truncate">
                                {rule.conditionType === 'AMOUNT_GREATER' && `Threshold > ¥${(rule.params.value || 0).toLocaleString()}`}
                                {rule.conditionType === 'KEYWORD_MATCH' && `Keywords: [${rule.params.keywords?.join(', ')}]`}
                            </div>
                        )}

                        <div className="flex items-center gap-2 pt-2 border-t border-slate-100 mt-2">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                                rule.actionType === 'GENERATE_TASK'
                                    ? 'bg-brand-50 text-brand-700 border border-brand-200'
                                    : rule.actionType === 'SEND_NOTIFICATION'
                                    ? 'bg-green-50 text-green-700 border border-green-200'
                                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                            }`}>
                                {rule.actionType === 'GENERATE_TASK' ? '报送任务' : rule.actionType === 'SEND_NOTIFICATION' ? '通知' : '告警'}
                            </span>
                            <span className="text-slate-300">|</span>
                            <span className="font-medium text-slate-700">{rule.triggerType}</span>
                            <span className="text-slate-300">|</span>
                            <span className={`font-bold ${rule.targetRiskLevel === RiskLevel.CRITICAL ? 'text-red-600' : 'text-amber-600'}`}>
                                {rule.targetRiskLevel}
                            </span>
                        </div>
                    </div>
                </div>
            ))}
        </div>
        
        <div className="bg-slate-50 p-3 text-center border-t border-slate-200 text-xs text-slate-400 rounded-b-xl">
            规则引擎运行正常 | 上次扫描: {new Date().toLocaleTimeString()}
        </div>

        {/* --- Create/Edit Modal --- */}
        {isModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
                <div className="bg-white rounded-xl shadow-xl w-[500px] flex flex-col max-h-[90vh] overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                        <h3 className="font-bold text-slate-800">
                            {isCreating ? '新建监控规则' : '编辑规则配置'}
                        </h3>
                        <button onClick={() => setIsModalOpen(false)}><X className="w-5 h-5 text-slate-400 hover:text-slate-600"/></button>
                    </div>
                    
                    <div className="p-6 overflow-y-auto space-y-5">
                        {/* 1. Basic Info */}
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">规则名称</label>
                            <input 
                                type="text" 
                                className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                                placeholder="例如：重大诉讼金额预警"
                                value={formData.name}
                                onChange={e => setFormData({...formData, name: e.target.value})}
                            />
                        </div>

                        {/* 2. Type, Frequency & Action */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">监控模式</label>
                                <div className="relative">
                                    <select
                                        className="w-full border border-slate-300 rounded px-3 py-2 text-sm appearance-none"
                                        value={formData.category}
                                        onChange={e => handleCategoryChange(e.target.value)}
                                    >
                                        <option value="SINGLE_CASE">单案监控 (事件驱动)</option>
                                        <option value="CUMULATIVE">累计监控 (周期扫描)</option>
                                        <option value="INDICATOR">财务指标 (净资产比例)</option>
                                    </select>
                                    <div className="absolute right-3 top-2.5 pointer-events-none text-slate-400">
                                        {formData.category === 'SINGLE_CASE' ? <ZapIcon className="w-4 h-4"/> : <BarChart3 className="w-4 h-4"/>}
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">扫描频率</label>
                                <select
                                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm bg-slate-50"
                                    value={formData.scanFrequency}
                                    onChange={e => setFormData({...formData, scanFrequency: e.target.value as any})}
                                    disabled={formData.category === 'SINGLE_CASE'} // Force Realtime for Single Case
                                >
                                    <option value="REALTIME">实时 (Event Driven)</option>
                                    <option value="DAILY">每日 (Daily Scan)</option>
                                    <option value="WEEKLY">每周 (Weekly Scan)</option>
                                    <option value="MONTHLY">每月 (Monthly Scan)</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">规则动作</label>
                            <select
                                className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                                value={formData.actionType}
                                onChange={e => setFormData({...formData, actionType: e.target.value as RiskRule['actionType']})}
                            >
                                <option value="GENERATE_ALERT">生成告警 (仅合规预警)</option>
                                <option value="GENERATE_TASK">生成报送任务 (可被向导调用)</option>
                                <option value="SEND_NOTIFICATION">发送通知 (仅消息推送)</option>
                            </select>
                            {formData.actionType === 'GENERATE_TASK' && (
                                <p className="text-[10px] text-brand-600 mt-1">
                                    * 该规则将出现在报送任务生成向导中，支持手动发起填报流程。
                                </p>
                            )}
                        </div>

                        {/* 3. DYNAMIC Conditions based on Category */}
                        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                            <h4 className="text-xs font-bold text-brand-600 uppercase mb-3 flex items-center gap-2">
                                <LayoutList className="w-4 h-4"/> 
                                {formData.category === 'SINGLE_CASE' ? '单案触发条件' : '累计统计口径'}
                            </h4>
                            
                            <div className="space-y-4">
                                {formData.category === 'SINGLE_CASE' ? (
                                    /* Single Case Fields */
                                    <>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 mb-1">条件类型</label>
                                            <select 
                                                className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                                                value={formData.conditionType}
                                                onChange={e => setFormData({...formData, conditionType: e.target.value as any})}
                                            >
                                                <option value="AMOUNT_GREATER">金额 &gt; 阈值</option>
                                                <option value="KEYWORD_MATCH">包含敏感关键词</option>
                                                <option value="STAGE_CHANGED">案件阶段变更</option>
                                            </select>
                                        </div>

                                        {formData.conditionType === 'AMOUNT_GREATER' && (
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1">金额阈值 (人民币/元)</label>
                                                <input 
                                                    type="number" 
                                                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                                                    value={formData.params?.value}
                                                    onChange={e => setFormData({...formData, params: { ...formData.params, value: Number(e.target.value) }})}
                                                />
                                            </div>
                                        )}

                                        {formData.conditionType === 'KEYWORD_MATCH' && (
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1">关键词 (逗号分隔)</label>
                                                <textarea 
                                                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm h-20"
                                                    placeholder="刑事, 证券欺诈, 退市风险..."
                                                    value={formData.params?.keywords?.join(', ')}
                                                    onChange={e => setFormData({...formData, params: { ...formData.params, keywords: e.target.value.split(/[,，]/).map(s => s.trim()).filter(Boolean) }})}
                                                />
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    /* Cumulative/Periodic Fields */
                                    <>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1">回溯周期 (月)</label>
                                                <div className="relative">
                                                    <input 
                                                        type="number" 
                                                        className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                                                        placeholder="12"
                                                        value={formData.params?.periodMonths}
                                                        onChange={e => setFormData({...formData, params: { ...formData.params, periodMonths: Number(e.target.value) }})}
                                                    />
                                                    <span className="absolute right-3 top-2 text-xs text-slate-400">个月</span>
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1">统计指标</label>
                                                <select 
                                                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                                                    disabled
                                                    value="AMOUNT_GREATER"
                                                >
                                                    <option value="AMOUNT_GREATER">涉案总金额 (累计)</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 mb-1">累计金额阈值 (人民币/元)</label>
                                            <input 
                                                type="number" 
                                                className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                                                placeholder="50000000"
                                                value={formData.params?.value}
                                                onChange={e => setFormData({...formData, params: { ...formData.params, value: Number(e.target.value) }})}
                                            />
                                            <p className="text-[10px] text-slate-400 mt-1">
                                                * 若过去 {formData.params?.periodMonths || 12} 个月累计新增涉案金额超过此数值，将触发预警。
                                            </p>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* 4. Actions */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">触发披露类型</label>
                                <select 
                                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                                    value={formData.triggerType}
                                    onChange={e => setFormData({...formData, triggerType: e.target.value as any})}
                                >
                                    {formData.category === 'SINGLE_CASE' ? (
                                        <>
                                            <option>临时公告</option>
                                            <option>重大事项专报</option>
                                        </>
                                    ) : (
                                        <>
                                            <option>累计披露预警</option>
                                            <option>定期报告风险提示</option>
                                        </>
                                    )}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">定级风险</label>
                                <select 
                                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                                    value={formData.targetRiskLevel}
                                    onChange={e => setFormData({...formData, targetRiskLevel: e.target.value as RiskLevel})}
                                >
                                    {Object.values(RiskLevel).map(r => <option key={r} value={r}>{r}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
                        <Button variant="ghost" onClick={() => setIsModalOpen(false)}>取消</Button>
                        <Button onClick={handleSubmit} disabled={!formData.name}>保存配置</Button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export default RiskRulesPanel;
