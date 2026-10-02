import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  Settings2, 
  Database, 
  AlertTriangle, 
  Plus, 
  Trash2,
  Save,
  CheckCircle2,
  Info
} from 'lucide-react';

const categories = ['反洗钱', '员工行为', '内控管理', '合规文化', '客户服务'];
const sourceSystems = ['HR_SYS (人力资源系统)', 'CRM_SYS (客户关系系统)', 'TRADE_CORE (核心交易系统)', 'OASIS (内部审批流)'];

interface ScoringRule {
  id: string;
  condition: string;
  value: string;
  action: string;
  score: string;
}

interface IndicatorEditorSheetProps {
  isOpen: boolean;
  onClose: () => void;
  // If editing, an ID would be passed, else null
  indicatorId?: string | null;
}

export default function IndicatorEditorSheet({ isOpen, onClose, indicatorId }: IndicatorEditorSheetProps) {
  const isEditing = !!indicatorId;
  
  const [collectionMode, setCollectionMode] = useState<'MANUAL' | 'API'>('API');
  const [allowFallback, setAllowFallback] = useState(false);
  const [mandatoryEvidence, setMandatoryEvidence] = useState(true);
  const [dataType, setDataType] = useState('Percentage');
  
  const [rules, setRules] = useState<ScoringRule[]>([
    { id: '1', condition: '=', value: '100', action: 'gain', score: '15' }
  ]);

  const handleAddRule = () => {
    setRules([...rules, { id: Math.random().toString(), condition: '>=', value: '', action: 'gain', score: '' }]);
  };

  const handleRemoveRule = (id: string) => {
    setRules(rules.filter(r => r.id !== id));
  };

  const updateRule = (id: string, field: keyof ScoringRule, value: string) => {
    setRules(rules.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 transition-opacity"
          />

          {/* Sheet */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed inset-y-0 right-0 w-full max-w-[600px] sm:max-w-2xl bg-white shadow-2xl z-50 flex flex-col h-full border-l border-slate-200"
          >
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-200 bg-white shrink-0 flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-800 flex items-center">
                  <Settings2 className="w-5 h-5 mr-2 text-indigo-600" />
                  {isEditing ? '编辑原子合规指标' : '配置原子合规指标 (Configure Indicator)'}
                </h2>
                <p className="text-sm text-slate-500 mt-1 font-medium">定义指标的数据来源与评分逻辑</p>
              </div>
              <button 
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-300 relative group">
              <div className="space-y-8 pb-10">
                
                {/* Section 1: Basic Attributes */}
                <section>
                  <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center">
                    <span className="w-1.5 h-4 bg-indigo-600 rounded-sm mr-2"></span>
                    1. 基础属性配置 (Basic Attributes)
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="space-y-2 col-span-1 sm:col-span-2">
                      <label className="text-xs font-bold text-slate-700">指标名称 <span className="text-rose-500">*</span></label>
                      <input 
                        type="text" 
                        placeholder="例如：合规培训覆盖率" 
                        defaultValue={isEditing ? "合规培训覆盖率" : ""}
                        className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-700">指标编号 <span className="text-rose-500">*</span></label>
                      <input 
                        type="text" 
                        placeholder="例如：EDU-01"
                        defaultValue={isEditing ? "EDU-01" : ""}
                        disabled={isEditing}
                        className={`w-full px-3 py-2.5 text-sm border rounded-lg focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all ${isEditing ? 'bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed font-mono' : 'border-slate-300 focus:border-indigo-500'}`}
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-700">维度分类 <span className="text-rose-500">*</span></label>
                      <select defaultValue={isEditing ? '合规文化' : ''} className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all bg-white">
                        <option value="">请选择维度</option>
                        {categories.map((cat, i) => (
                          <option key={i} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-700">数据类型 <span className="text-rose-500">*</span></label>
                      <select 
                        value={dataType}
                        onChange={(e) => setDataType(e.target.value)}
                        className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all bg-white"
                      >
                        <option value="Number">数值型 (Number)</option>
                        <option value="Percentage">百分比 (Percentage)</option>
                        <option value="Boolean">布尔型 (Boolean/Yes-No)</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-700">默认基准权重 (%) <span className="text-rose-500">*</span></label>
                      <input 
                        type="number" 
                        placeholder="例如：15" 
                        defaultValue={isEditing ? 15 : undefined}
                        className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all"
                      />
                    </div>
                  </div>
                </section>

                <hr className="border-slate-200" />

                {/* Section 2: Data Acquisition Strategy */}
                <section>
                  <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center">
                    <span className="w-1.5 h-4 bg-emerald-500 rounded-sm mr-2"></span>
                    2. 数据获取方式 (Acquisition Strategy)
                  </h3>
                  
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 mb-5 shadow-sm">
                    {/* Toggle Control */}
                    <div className="flex items-center justify-between mb-6">
                      <label className="text-sm font-bold text-slate-700">数据采集模式</label>
                      <div className="flex bg-slate-200/70 p-1 rounded-lg">
                        <button 
                          onClick={() => setCollectionMode('API')}
                          className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${collectionMode === 'API' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                          系统自动采集 (API)
                        </button>
                        <button 
                          onClick={() => setCollectionMode('MANUAL')}
                          className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${collectionMode === 'MANUAL' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                          手工填报 (MANUAL)
                        </button>
                      </div>
                    </div>

                    {/* Mode Specific Fields */}
                    <div className="relative overflow-hidden min-h-[160px]">
                      <AnimatePresence mode="wait">
                        {collectionMode === 'API' && (
                          <motion.div 
                            key="API"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            transition={{ duration: 0.2 }}
                            className="space-y-5"
                          >
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                              <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-700">对接源系统 <span className="text-rose-500">*</span></label>
                                <div className="relative flex items-center">
                                  <Database className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                  <select defaultValue={isEditing ? sourceSystems[0] : ''} className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all bg-white">
                                    <option value="">选择源系统</option>
                                    {sourceSystems.map((sys, i) => (
                                      <option key={i} value={sys}>{sys}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                              <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-700">采集频率 <span className="text-rose-500">*</span></label>
                                <select className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all bg-white">
                                  <option value="realtime">实时 (Real-time)</option>
                                  <option value="daily">每日 (T+1)</option>
                                  <option value="quarter">季末计算 (End of Quarter)</option>
                                </select>
                              </div>
                              <div className="space-y-2 sm:col-span-2">
                                <label className="text-xs font-bold text-slate-700 font-mono">对应数据字段标识/API Path <span className="text-rose-500">*</span></label>
                                <input 
                                  type="text" 
                                  placeholder="例如：/api/compliance/training_rate" 
                                  defaultValue={isEditing ? "/api/v1/hr/training/coverage" : ""}
                                  className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all font-mono"
                                />
                              </div>
                            </div>
                            
                            <div className="pt-4 border-t border-slate-200 flex flex-col space-y-3">
                              <label className="flex items-center cursor-pointer">
                                <div className="relative flex items-center">
                                  <input 
                                    type="checkbox" 
                                    className="sr-only peer" 
                                    checked={allowFallback}
                                    onChange={() => setAllowFallback(!allowFallback)}
                                  />
                                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                                </div>
                                <span className="ml-3 text-sm font-bold text-slate-700">允许 API 失败时降级为手工填报</span>
                              </label>

                              {/* Alert Warning for Fallback */}
                              <AnimatePresence>
                                {allowFallback && (
                                  <motion.div 
                                    initial={{ opacity: 0, height: 0, marginTop: 0 }}
                                    animate={{ opacity: 1, height: 'auto', marginTop: 12 }}
                                    exit={{ opacity: 0, height: 0, marginTop: 0 }}
                                    className="overflow-hidden"
                                  >
                                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start">
                                      <AlertTriangle className="w-4 h-4 text-amber-600 mr-2 mt-0.5 shrink-0" />
                                      <p className="text-xs font-medium text-amber-800 leading-relaxed">
                                        开启降级策略后，若接口调用超时或失败，系统将自动下发填报工单给对应机构。请注意这可能引入人为数据修正行为，影响原始数据可信度。
                                      </p>
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          </motion.div>
                        )}

                        {collectionMode === 'MANUAL' && (
                          <motion.div 
                            key="MANUAL"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.2 }}
                            className="space-y-5"
                          >
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                              <div className="space-y-2 sm:col-span-2">
                                <label className="text-xs font-bold text-slate-700">填报责任主体 <span className="text-rose-500">*</span></label>
                                <select className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all bg-white">
                                  <option value="">请选择责任主体</option>
                                  <option value="branch_compliance">分支机构合规岗</option>
                                  <option value="hq_business">总部业务部门</option>
                                  <option value="hq_compliance">总部合规部</option>
                                </select>
                              </div>
                            </div>
                            
                            <div className="pt-2">
                              <label className="flex items-center cursor-pointer">
                                <div className="relative flex items-center">
                                  <input 
                                    type="checkbox" 
                                    className="sr-only peer" 
                                    checked={mandatoryEvidence}
                                    onChange={() => setMandatoryEvidence(!mandatoryEvidence)}
                                  />
                                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                                </div>
                                <span className="ml-3 text-sm font-bold text-slate-700">是否强制要求上传佐证附件</span>
                              </label>
                              <p className="text-xs text-slate-500 ml-12 mt-1">开启后，填报时未上传附件将无法提交审核。</p>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </section>

                <hr className="border-slate-200" />

                {/* Section 3: Dynamic Scoring Rules Engine */}
                <section>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-slate-800 flex items-center">
                      <span className="w-1.5 h-4 bg-amber-500 rounded-sm mr-2"></span>
                      3. 动态评分规则引擎 (Scoring Logic)
                    </h3>
                    <div className="text-xs font-bold text-slate-500 bg-slate-100 flex items-center justify-center px-2 py-1 rounded inline-flex shrink-0 border border-slate-200">
                      当前类型: {dataType === 'Percentage' ? '百分比' : dataType === 'Number' ? '数值' : '布尔值'}
                    </div>
                  </div>

                  <div className="space-y-3">
                    {/* Headers */}
                    <div className="grid grid-cols-[minmax(80px,1fr)_minmax(100px,1.5fr)_auto_minmax(120px,1.5fr)_24px] gap-2 px-2 text-xs font-bold text-slate-500">
                      <div>条件</div>
                      <div>数值 {dataType === 'Percentage' && '(%)'}</div>
                      <div></div>
                      <div>动作得分</div>
                      <div></div>
                    </div>

                    <div className="space-y-2">
                       <AnimatePresence>
                        {rules.map((rule, idx) => (
                          <motion.div 
                            key={rule.id}
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                            className="flex items-center gap-2 bg-slate-50 border border-slate-200 p-2.5 rounded-lg shadow-sm"
                          >
                            {/* Condition */}
                            <select 
                              value={rule.condition}
                              onChange={(e) => updateRule(rule.id, 'condition', e.target.value)}
                              className="w-[90px] shrink-0 px-2 py-2 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500/50 outline-none bg-white font-medium"
                            >
                              <option value="=">等于 (=)</option>
                              <option value=">">大于 (&gt;)</option>
                              <option value=">=">大于等于 (&ge;)</option>
                              <option value="<">小于 (&lt;)</option>
                              <option value="<=">小于等于 (&le;)</option>
                              <option value="between">区间</option>
                            </select>

                            {/* Value */}
                            <div className="flex-1 min-w-[80px]">
                              <input 
                                type={dataType === 'Number' || dataType === 'Percentage' ? 'number' : 'text'}
                                value={rule.value}
                                onChange={(e) => updateRule(rule.id, 'value', e.target.value)}
                                placeholder={dataType === 'Percentage' ? 'e.g. 100' : '数值'}
                                className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500/50 outline-none"
                              />
                            </div>

                            {/* Arrow Indicator */}
                            <div className="flex justify-center shrink-0 w-6 text-slate-400 font-bold">
                              →
                            </div>

                            {/* Action + Score */}
                            <div className="flex-1 min-w-[120px] flex gap-2">
                              <select 
                                value={rule.action}
                                onChange={(e) => updateRule(rule.id, 'action', e.target.value)}
                                className="w-[60px] sm:w-[70px] shrink-0 px-2 py-2 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500/50 outline-none bg-white font-medium"
                              >
                                <option value="gain">得</option>
                                <option value="lose">扣</option>
                              </select>
                              <input 
                                type="number"
                                value={rule.score}
                                onChange={(e) => updateRule(rule.id, 'score', e.target.value)}
                                placeholder="分值"
                                className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500/50 outline-none"
                              />
                            </div>

                            {/* Remove button */}
                            <button 
                              onClick={() => handleRemoveRule(rule.id)}
                              className="shrink-0 w-7 h-7 flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>

                    <button 
                      onClick={handleAddRule}
                      className="w-full flex items-center justify-center py-2.5 border-2 border-dashed border-slate-300 rounded-lg text-sm font-bold text-slate-500 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors mt-4"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      添加评分阶梯
                    </button>
                  </div>
                </section>

              </div>
            </div>

            {/* Sticky Footer Actions */}
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 shrink-0 flex items-center justify-between gap-3 shadow-[0_-4px_6px_-1px_rgb(0,0,0,0.05)]">
               <button 
                onClick={onClose}
                className="px-5 py-2.5 text-sm font-bold text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                取消
              </button>
              
              <div className="flex items-center gap-3">
                <button 
                  onClick={onClose}
                  className="hidden sm:flex items-center px-5 py-2.5 text-sm font-bold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
                >
                  <Save className="w-4 h-4 mr-2 text-slate-400" />
                  保存为草稿
                </button>
                <button 
                  onClick={onClose}
                  className="flex items-center px-6 py-2.5 text-sm font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm focus:ring-2 focus:ring-indigo-500/50 focus:ring-offset-1"
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  提交并生效
                </button>
              </div>
            </div>

          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
