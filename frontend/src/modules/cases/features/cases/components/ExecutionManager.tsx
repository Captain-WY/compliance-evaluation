import React, { useState } from 'react';
import { ExecutionModule, ExecutionMeasure, ExecutionMeasureType, ExecutionBasisType } from '../../../types';
import { Plus, Trash2, AlertTriangle, CheckCircle, DollarSign, FileText, Scale, RefreshCw } from 'lucide-react';
import Button from '../../../components/ui/Button';

interface ExecutionManagerProps {
  data?: ExecutionModule;
  onUpdate: (data: ExecutionModule) => void;
}

const ExecutionManager: React.FC<ExecutionManagerProps> = ({ data, onUpdate }) => {
  const [activeTab, setActiveTab] = useState<'MEASURES' | 'DERIVATIVE'>('MEASURES');

  const [showCalculator, setShowCalculator] = useState(false);
  const [calcData, setCalcData] = useState({
      principal: 0,
      startDate: '',
      endDate: new Date().toISOString().split('T')[0],
      rate: 3.65, // Annual rate %
      isDelayed: false // Double interest for delayed performance
  });
  const [calcResult, setCalcResult] = useState<number | null>(null);

  const calculateInterest = () => {
      if (!calcData.principal || !calcData.startDate || !calcData.endDate) return;
      
      const start = new Date(calcData.startDate);
      const end = new Date(calcData.endDate);
      const diffTime = Math.abs(end.getTime() - start.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
      
      // Formula: Principal * Rate * Days / 365
      // If delayed, rate is usually doubled or specific penalty applies. 
      // For demo, we just double the rate if isDelayed is true.
      const effectiveRate = calcData.isDelayed ? calcData.rate * 2 : calcData.rate;
      const interest = (calcData.principal * (effectiveRate / 100) * diffDays) / 365;
      
      setCalcResult(interest);
  };

  const defaultData: ExecutionModule = {
    basisType: ExecutionBasisType.JUDGMENT,
    basisDocumentNo: '',
    execCaseNo: '',
    court: '',
    applicationDate: new Date().toISOString().split('T')[0],
    targetAmount: 0,
    recoveredAmount: 0,
    measures: [],
    derivativeProceedings: []
  };

  const executionData = data || defaultData;

  const handleAddMeasure = () => {
    const newMeasure: ExecutionMeasure = {
        id: Math.random().toString(36).substr(2, 9),
        type: ExecutionMeasureType.INQUIRY,
        target: '',
        status: '申请中',
        startDate: new Date().toISOString().split('T')[0],
        operator: 'CurrentUser'
    };
    onUpdate({
        ...executionData,
        measures: [...executionData.measures, newMeasure]
    });
  };

  const handleDeleteMeasure = (id: string) => {
    onUpdate({
        ...executionData,
        measures: executionData.measures.filter(m => m.id !== id)
    });
  };

  const handleAddDerivative = () => {
    const newDerivative: any = { // Using any to bypass strict type checking for mock data
        id: Math.random().toString(36).substr(2, 9),
        type: '执行异议',
        applicant: '申请人',
        requestDate: new Date().toISOString().split('T')[0],
        status: '审理中'
    };
    onUpdate({
        ...executionData,
        derivativeProceedings: [...(executionData.derivativeProceedings || []), newDerivative]
    });
  };

  const handleDeleteDerivative = (id: string) => {
    onUpdate({
        ...executionData,
        derivativeProceedings: executionData.derivativeProceedings.filter(d => d.id !== id)
    });
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden mt-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex justify-between items-center">
        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Scale className="w-5 h-5 text-brand-600" /> 执行案件管理面板
        </h3>
        <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded border border-slate-200 shadow-sm">
                <span className="text-slate-500">执行案号:</span>
                <span className="font-mono font-bold text-slate-800">{executionData.execCaseNo || '未立案'}</span>
            </div>
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded border border-slate-200 shadow-sm">
                <span className="text-slate-500">执行回款:</span>
                <span className="font-mono font-bold text-emerald-600">¥{(executionData.recoveredAmount / 10000).toFixed(2)}万</span>
                <span className="text-xs text-slate-400">/ {(executionData.targetAmount / 10000).toFixed(2)}万</span>
            </div>
            <Button size="sm" variant="outline" onClick={() => setShowCalculator(true)}>
                <DollarSign className="w-4 h-4 mr-1" /> 利息计算器
            </Button>
        </div>
      </div>

      <div className="grid grid-cols-12 divide-x divide-slate-200 min-h-[400px]">
        {/* Left Sidebar: Basic Info */}
        <div className="col-span-3 p-6 bg-slate-50/50">
            <h4 className="text-xs font-bold text-slate-400 uppercase mb-4">执行依据 (Basis)</h4>
            <div className="space-y-4">
                <div>
                    <label className="block text-xs text-slate-500 mb-1">依据类型</label>
                    <select 
                        className="w-full text-sm border-slate-300 rounded-md shadow-sm focus:border-brand-500 focus:ring-brand-500"
                        value={executionData.basisType}
                        onChange={(e) => onUpdate({...executionData, basisType: e.target.value as any})}
                    >
                        {Object.values(ExecutionBasisType).map(t => (
                            <option key={t} value={t}>{t}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="block text-xs text-slate-500 mb-1">文书案号</label>
                    <input 
                        type="text" 
                        className="w-full text-sm border-slate-300 rounded-md shadow-sm"
                        value={executionData.basisDocumentNo}
                        onChange={(e) => onUpdate({...executionData, basisDocumentNo: e.target.value})}
                        placeholder="例如: (2024)京01民初123号"
                    />
                </div>
                <div>
                    <label className="block text-xs text-slate-500 mb-1">执行法院</label>
                    <input 
                        type="text" 
                        className="w-full text-sm border-slate-300 rounded-md shadow-sm"
                        value={executionData.court}
                        onChange={(e) => onUpdate({...executionData, court: e.target.value})}
                        placeholder="例如: 北京市第一中级人民法院"
                    />
                </div>
                <div className="pt-4 border-t border-slate-200">
                    <label className="block text-xs text-slate-500 mb-1">申请执行日</label>
                    <input 
                        type="date" 
                        className="w-full text-sm border-slate-300 rounded-md shadow-sm"
                        value={executionData.applicationDate}
                        onChange={(e) => onUpdate({...executionData, applicationDate: e.target.value})}
                    />
                </div>
            </div>
        </div>

        {/* Middle: Measures & Actions */}
        <div className="col-span-9 flex flex-col">
            {/* Tabs */}
            <div className="flex border-b border-slate-200 px-6 pt-4">
                <button 
                    className={`pb-3 px-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'MEASURES' ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                    onClick={() => setActiveTab('MEASURES')}
                >
                    执行措施追踪 ({executionData.measures.length})
                </button>
                <button 
                    className={`pb-3 px-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'DERIVATIVE' ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                    onClick={() => setActiveTab('DERIVATIVE')}
                >
                    衍生程序 ({executionData.derivativeProceedings.length})
                </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 p-6 bg-white overflow-y-auto">
                {activeTab === 'MEASURES' && (
                    <div className="space-y-4">
                        <div className="flex justify-between items-center mb-2">
                            <div className="text-xs text-slate-500">
                                <AlertTriangle className="w-3 h-3 inline mr-1 text-amber-500" />
                                系统将自动计算查封/冻结到期日并提前30天预警
                            </div>
                            <Button size="sm" variant="outline" onClick={handleAddMeasure}>
                                <Plus className="w-4 h-4 mr-1" /> 添加措施
                            </Button>
                        </div>

                        {executionData.measures.length === 0 ? (
                            <div className="text-center py-12 border-2 border-dashed border-slate-100 rounded-xl">
                                <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3 text-slate-300">
                                    <FileText className="w-6 h-6" />
                                </div>
                                <p className="text-slate-400 text-sm">暂无执行措施记录</p>
                                <p className="text-xs text-slate-300 mt-1">点击上方按钮添加查封、冻结等措施</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {executionData.measures.map((measure, idx) => (
                                    <div key={measure.id} className="flex items-center gap-4 p-4 bg-white border border-slate-200 rounded-lg shadow-sm hover:border-brand-200 transition-colors group">
                                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                                            measure.type === ExecutionMeasureType.SEIZURE ? 'bg-amber-50 text-amber-600' :
                                            measure.type === ExecutionMeasureType.FREEZE ? 'bg-blue-50 text-blue-600' :
                                            'bg-slate-100 text-slate-500'
                                        }`}>
                                            {measure.type === ExecutionMeasureType.SEIZURE ? <FileText className="w-5 h-5" /> : 
                                             measure.type === ExecutionMeasureType.FREEZE ? <DollarSign className="w-5 h-5" /> :
                                             <CheckCircle className="w-5 h-5" />}
                                        </div>
                                        
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="font-bold text-slate-800 text-sm">{measure.type}</span>
                                                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                                                    measure.status === '成功' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
                                                    measure.status === '申请中' ? 'bg-blue-50 text-blue-600 border-blue-200' :
                                                    'bg-slate-50 text-slate-400 border-slate-200'
                                                }`}>
                                                    {measure.status}
                                                </span>
                                            </div>
                                            <div className="text-xs text-slate-500 truncate" title={measure.target}>
                                                {measure.target || '未填写标的物详情'}
                                            </div>
                                        </div>

                                        <div className="text-right text-xs text-slate-500">
                                            <div className="mb-1">开始: {measure.startDate}</div>
                                            {measure.endDate && (
                                                <div className="text-amber-600 font-medium flex items-center gap-1 justify-end">
                                                    <ClockIcon className="w-3 h-3" /> 到期: {measure.endDate}
                                                </div>
                                            )}
                                        </div>

                                        <button 
                                            onClick={() => handleDeleteMeasure(measure.id)}
                                            className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-all"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'DERIVATIVE' && (
                    <div className="space-y-4">
                        <div className="flex justify-between items-center mb-2">
                            <div className="text-xs text-slate-500">
                                记录执行异议、复议、异议之诉等衍生程序
                            </div>
                            <Button size="sm" variant="outline" onClick={handleAddDerivative}>
                                <Plus className="w-4 h-4 mr-1" /> 添加程序
                            </Button>
                        </div>

                        {(executionData.derivativeProceedings || []).length === 0 ? (
                            <div className="text-center py-12 border-2 border-dashed border-slate-100 rounded-xl">
                                <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3 text-slate-300">
                                    <RefreshCw className="w-6 h-6" />
                                </div>
                                <p className="text-slate-400 text-sm">暂无衍生程序记录</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {executionData.derivativeProceedings.map((proc, idx) => (
                                    <div key={proc.id} className="flex items-center gap-4 p-4 bg-white border border-slate-200 rounded-lg shadow-sm hover:border-brand-200 transition-colors group">
                                        <div className="w-10 h-10 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                                            <RefreshCw className="w-5 h-5" />
                                        </div>
                                        
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="font-bold text-slate-800 text-sm">{proc.type}</span>
                                                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                                                    proc.status === '已结案' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
                                                    'bg-blue-50 text-blue-600 border-blue-200'
                                                }`}>
                                                    {proc.status}
                                                </span>
                                            </div>
                                            <div className="text-xs text-slate-500">
                                                申请人: {proc.applicant} | 申请日: {proc.requestDate}
                                            </div>
                                        </div>

                                        <button 
                                            onClick={() => handleDeleteDerivative(proc.id)}
                                            className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-all"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
      </div>
      {/* Interest Calculator Modal */}
      {showCalculator && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white rounded-xl shadow-xl w-[400px] overflow-hidden border border-slate-200">
                <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                        <DollarSign className="w-5 h-5 text-brand-600" /> 利息/迟延履行金计算器
                    </h3>
                    <button onClick={() => setShowCalculator(false)} className="text-slate-400 hover:text-slate-600">
                        <Plus className="w-5 h-5 rotate-45" />
                    </button>
                </div>
                
                <div className="p-6 space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">计算基数 (本金)</label>
                        <input 
                            type="number" 
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                            value={calcData.principal}
                            onChange={(e) => setCalcData({...calcData, principal: Number(e.target.value)})}
                            placeholder="请输入金额"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">起算日</label>
                            <input 
                                type="date" 
                                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                                value={calcData.startDate}
                                onChange={(e) => setCalcData({...calcData, startDate: e.target.value})}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">截止日</label>
                            <input 
                                type="date" 
                                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                                value={calcData.endDate}
                                onChange={(e) => setCalcData({...calcData, endDate: e.target.value})}
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">年利率 (%)</label>
                            <input 
                                type="number" 
                                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                                value={calcData.rate}
                                onChange={(e) => setCalcData({...calcData, rate: Number(e.target.value)})}
                            />
                        </div>
                        <div className="flex items-end pb-2">
                            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    checked={calcData.isDelayed}
                                    onChange={(e) => setCalcData({...calcData, isDelayed: e.target.checked})}
                                    className="rounded text-brand-600 focus:ring-brand-500"
                                />
                                迟延履行 (双倍)
                            </label>
                        </div>
                    </div>

                    <div className="pt-4 border-t border-slate-100">
                        <Button className="w-full" onClick={calculateInterest}>开始计算</Button>
                    </div>

                    {calcResult !== null && (
                        <div className="mt-4 p-4 bg-emerald-50 border border-emerald-100 rounded-lg text-center animate-in zoom-in-95">
                            <div className="text-xs text-emerald-600 mb-1">计算结果 (仅供参考)</div>
                            <div className="text-2xl font-bold text-emerald-700">
                                ¥ {calcResult.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

function ClockIcon({ className }: { className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
    )
}

export default ExecutionManager;
