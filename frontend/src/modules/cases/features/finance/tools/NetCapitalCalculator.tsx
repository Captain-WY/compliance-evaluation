
import React, { useState, useEffect, useMemo } from 'react';
import { Calculator, ArrowRight, Info, AlertTriangle, TrendingDown, RefreshCw, BarChart3 } from 'lucide-react';
import Button from '../../../components/ui/Button';
import { getCases, updateRegulatoryAttributes } from '../../../services/case';
import { Case, CaseStage, RiskLevel } from '../../../types';

interface NetCapitalCalculatorProps {
    onApply?: (amount: number, description: string) => void;
}

const NetCapitalCalculator: React.FC<NetCapitalCalculatorProps> = ({ onApply }) => {
  const [mode, setMode] = useState<'CASE' | 'STRESS'>('CASE');
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(false);
  
  // --- Single Case Mode State ---
  const [selectedCaseId, setSelectedCaseId] = useState('');
  const [baseAmount, setBaseAmount] = useState<number>(0);
  const [coefficient, setCoefficient] = useState<number>(1.0); // Default 100%
  const [result, setResult] = useState<number | null>(null);

  // --- Stress Test Mode State ---
  const [stressConfig, setStressConfig] = useState({
      highRiskCoeff: 1.0,   // 重大/特大案件系数
      mediumRiskCoeff: 0.5, // 关注类案件系数
      lowRiskCoeff: 0.1     // 一般案件系数
  });

  useEffect(() => {
      loadCases();
  }, []);

  const loadCases = async () => {
      setLoading(true);
      const data = await getCases();
      // Filter for active cases
      setCases(data.filter(c => c.stage !== CaseStage.CLOSED));
      setLoading(false);
  };

  // Single Case Logic
  const handleCaseSelect = (id: string) => {
      setSelectedCaseId(id);
      const c = cases.find(item => item.id === id);
      if (c) {
          const isDefendant = c.defendant?.includes('我司') ?? false;
          const amount = c.regulatoryAttrs?.amountWithInterest || 0;
          setBaseAmount(amount);
          // Auto-suggest coefficient logic
          if (isDefendant) setCoefficient(1.0);
          else setCoefficient(0.5); 
          setResult(null);
      }
  };

  const handleCalculateSingle = () => {
      setResult(baseAmount * coefficient);
  };

  const handleSaveToCase = async () => {
      if (mode === 'CASE' && selectedCaseId && result !== null) {
          const c = cases.find(item => item.id === selectedCaseId);
          if (c && c.regulatoryAttrs) {
              await updateRegulatoryAttributes(selectedCaseId, {
                  ...c.regulatoryAttrs,
                  riskCoefficient: coefficient,
                  estimatedRiskCapitalDeduction: result
              });
              alert(`✅ 已更新案件 [${c.code}] 的净资本扣减估值为: ¥${result.toLocaleString()}`);
          }
      }
  };

  // Stress Test Logic
  const stressResult = useMemo(() => {
      let totalDeduction = 0;
      let impactedCount = 0;

      cases.forEach(c => {
          const amt = c.regulatoryAttrs?.amountNoInterest || 0;
          let coeff = 0;
          if (c.riskLevel === RiskLevel.CRITICAL || c.riskLevel === RiskLevel.HIGH) {
              coeff = stressConfig.highRiskCoeff;
          } else if (c.riskLevel === RiskLevel.MEDIUM) {
              coeff = stressConfig.mediumRiskCoeff;
          } else {
              coeff = stressConfig.lowRiskCoeff;
          }
          if (coeff > 0) impactedCount++;
          totalDeduction += amt * coeff;
      });

      return { totalDeduction, impactedCount };
  }, [cases, stressConfig]);

  const PRESETS = [
      { label: '被告全额 (100%)', value: 1.0 },
      { label: '谨慎估算 (50%)', value: 0.5 },
      { label: '低风险 (20%)', value: 0.2 },
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm h-full flex flex-col">
      <h4 className="font-bold text-slate-800 flex items-center gap-2 mb-4 text-sm shrink-0">
        <Calculator className="w-4 h-4 text-red-600" /> 净资本风险扣减测算
      </h4>
      
      <div className="flex bg-slate-100 p-1 rounded-lg mb-4 text-xs font-bold shrink-0">
          <button 
            className={`flex-1 py-1.5 rounded transition-all ${mode === 'CASE' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
            onClick={() => setMode('CASE')}
          >
              单案测算
          </button>
          <button 
            className={`flex-1 py-1.5 rounded transition-all ${mode === 'STRESS' ? 'bg-red-50 text-red-700 shadow-sm' : 'text-slate-500'}`}
            onClick={() => setMode('STRESS')}
          >
              压力测试
          </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {mode === 'CASE' ? (
            <div className="space-y-4">
                <div>
                   <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">选择案件</label>
                   <select 
                     className="w-full text-xs border border-slate-200 bg-slate-50 rounded-lg px-2 py-2 outline-none focus:bg-white focus:border-brand-500 transition-all truncate"
                     value={selectedCaseId}
                     onChange={e => handleCaseSelect(e.target.value)}
                   >
                     <option value="">-- 请选择 --</option>
                     {cases.map(c => (
                         <option key={c.id} value={c.id}>{c.code} {c.title}</option>
                     ))}
                   </select>
                </div>

                <div>
                   <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">测算基数 (元)</label>
                   <input 
                     type="number" 
                     className="w-full text-sm border border-slate-200 bg-slate-50 rounded-lg px-2 py-1.5 outline-none font-mono"
                     value={baseAmount}
                     onChange={e => setBaseAmount(Number(e.target.value))}
                   />
                </div>
                
                <div>
                    <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">风险系数: {(coefficient * 100).toFixed(0)}%</label>
                    <div className="flex gap-2 mb-2">
                        {PRESETS.map(p => (
                            <button
                                key={p.value}
                                onClick={() => setCoefficient(p.value)}
                                className={`flex-1 text-[10px] py-1 rounded border transition-colors ${
                                    coefficient === p.value 
                                    ? 'bg-red-50 border-red-200 text-red-700 font-bold' 
                                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                }`}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                    <input 
                        type="range" min="0" max="1" step="0.1" 
                        className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                        value={coefficient}
                        onChange={e => setCoefficient(parseFloat(e.target.value))}
                    />
                </div>

                <Button size="sm" onClick={handleCalculateSingle} className="w-full mt-2" disabled={!baseAmount}>
                    计算扣减额
                </Button>

                {result !== null && (
                    <div className="mt-4 pt-4 border-t border-slate-100 animate-in fade-in">
                        <div className="flex justify-between items-end mb-3">
                            <span className="text-xs text-slate-500">建议扣减:</span>
                            <span className="text-lg font-bold text-red-600 font-mono">
                            ¥ {new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(result)}
                            </span>
                        </div>
                        {selectedCaseId && (
                            <button 
                                onClick={handleSaveToCase}
                                className="w-full flex items-center justify-center gap-1 text-xs bg-red-50 text-red-700 py-1.5 rounded hover:bg-red-100 transition-colors font-medium border border-red-200"
                            >
                                <ArrowRight className="w-3 h-3" /> 保存至案件档案
                            </button>
                        )}
                    </div>
                )}
            </div>
        ) : (
            <div className="space-y-5 animate-in fade-in">
                <div className="bg-orange-50 p-3 rounded-lg border border-orange-100 text-xs text-orange-800 leading-relaxed">
                    <div className="font-bold flex items-center gap-1 mb-1">
                        <BarChart3 className="w-3 h-3"/> 组合压力测试 (Portfolio Stress Test)
                    </div>
                    模拟在极端不利判决情境或严监管口径下，不同风险等级案件的潜在净资本扣减总额。
                </div>

                <div className="space-y-3">
                    <div>
                        <div className="flex justify-between text-xs mb-1">
                            <span className="font-bold text-red-600">重大/特大案件系数</span>
                            <span>{(stressConfig.highRiskCoeff * 100).toFixed(0)}%</span>
                        </div>
                        <input 
                            type="range" min="0" max="1" step="0.1"
                            className="w-full h-1.5 bg-red-100 rounded-lg appearance-none cursor-pointer accent-red-600"
                            value={stressConfig.highRiskCoeff}
                            onChange={e => setStressConfig({...stressConfig, highRiskCoeff: parseFloat(e.target.value)})}
                        />
                    </div>
                    <div>
                        <div className="flex justify-between text-xs mb-1">
                            <span className="font-bold text-orange-600">关注类案件系数</span>
                            <span>{(stressConfig.mediumRiskCoeff * 100).toFixed(0)}%</span>
                        </div>
                        <input 
                            type="range" min="0" max="1" step="0.1"
                            className="w-full h-1.5 bg-orange-100 rounded-lg appearance-none cursor-pointer accent-orange-500"
                            value={stressConfig.mediumRiskCoeff}
                            onChange={e => setStressConfig({...stressConfig, mediumRiskCoeff: parseFloat(e.target.value)})}
                        />
                    </div>
                    <div>
                        <div className="flex justify-between text-xs mb-1">
                            <span className="font-bold text-blue-600">一般案件系数</span>
                            <span>{(stressConfig.lowRiskCoeff * 100).toFixed(0)}%</span>
                        </div>
                        <input 
                            type="range" min="0" max="1" step="0.1"
                            className="w-full h-1.5 bg-blue-100 rounded-lg appearance-none cursor-pointer accent-blue-500"
                            value={stressConfig.lowRiskCoeff}
                            onChange={e => setStressConfig({...stressConfig, lowRiskCoeff: parseFloat(e.target.value)})}
                        />
                    </div>
                </div>

                <div className="mt-4 pt-4 border-t border-slate-100">
                    <p className="text-xs text-slate-500 text-center mb-1">预计总扣减金额 ({stressResult.impactedCount} 案)</p>
                    <div className="text-center">
                        <span className="text-2xl font-bold text-slate-800 font-mono tracking-tight">
                            ¥ {(stressResult.totalDeduction / 100000000).toFixed(2)}
                        </span>
                        <span className="text-sm font-bold text-slate-400 ml-1">亿</span>
                    </div>
                    
                    <button className="w-full mt-3 text-xs flex items-center justify-center gap-1 text-slate-400 hover:text-brand-600 transition-colors">
                        <RefreshCw className="w-3 h-3" /> 重置默认系数
                    </button>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};

export default NetCapitalCalculator;
