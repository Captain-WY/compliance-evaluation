
import React, { useState } from 'react';
import { LegalContract } from '../../../types';
import Button from '../../../components/ui/Button';
import { Calculator, ArrowRight } from 'lucide-react';

interface RiskFeeCalculatorProps {
  contract: LegalContract;
  onApply?: (amount: number, description: string) => void;
}

const RiskFeeCalculator: React.FC<RiskFeeCalculatorProps> = ({ contract, onApply }) => {
  const [recoveryAmount, setRecoveryAmount] = useState<number>(0);
  const [calculatedFee, setCalculatedFee] = useState<number | null>(null);
  const [breakdown, setBreakdown] = useState<string[]>([]);

  const calculate = () => {
    if (!contract.riskTiers) return;

    let remaining = recoveryAmount;
    let totalFee = 0;
    const logs: string[] = [];

    // 1. Calculate base fee based on tiers
    for (const tier of contract.riskTiers) {
      const tierRange = (tier.maxAmount === null ? Infinity : tier.maxAmount) - tier.minAmount;
      const amountInTier = Math.min(Math.max(0, recoveryAmount - tier.minAmount), tierRange);

      if (amountInTier > 0) {
        const feeInTier = amountInTier * tier.rate;
        totalFee += feeInTier;
        logs.push(`[${tier.minAmount/10000}万-${tier.maxAmount ? tier.maxAmount/10000 + '万' : '∞'}] ¥${(amountInTier/10000).toFixed(2)}万 * ${(tier.rate*100).toFixed(1)}% = ¥${(feeInTier/10000).toFixed(2)}万`);
      }
    }

    // 2. Deduct fixed fee
    if (contract.deductFixedFromRisk) {
       totalFee = Math.max(0, totalFee - contract.fixedFee);
       logs.push(`抵扣固定费: -¥${(contract.fixedFee/10000).toFixed(2)}万`);
    }

    // 3. Apply Cap
    if (contract.totalCap && totalFee > contract.totalCap) {
        totalFee = contract.totalCap;
        logs.push(`封顶: ¥${(contract.totalCap/10000).toFixed(2)}万`);
    }

    setCalculatedFee(totalFee);
    setBreakdown(logs);
  };

  const handleApply = () => {
      if (calculatedFee !== null && onApply) {
          const desc = `风险代理费 (基于回款 ¥${(recoveryAmount/10000).toFixed(2)}万 计算)`;
          onApply(calculatedFee, desc);
          setCalculatedFee(null); // Reset
      }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
      <h4 className="font-bold text-slate-800 mb-1 flex items-center gap-2 text-sm">
          <Calculator className="w-4 h-4 text-emerald-600" /> 风险代理费试算
      </h4>
      <p className="text-[10px] text-slate-400 mb-4">关联合同: {contract.contractNo}</p>
      
      <div className="space-y-3 mb-4">
          <div>
             <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">回款基数 (元)</label>
             <input 
                type="number" 
                className="w-full text-sm border border-slate-200 bg-slate-50 rounded-lg px-2 py-1.5 outline-none focus:bg-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all"
                value={recoveryAmount}
                onChange={e => setRecoveryAmount(Number(e.target.value))}
             />
          </div>
      </div>

      <Button size="sm" onClick={calculate} className="w-full bg-slate-800 hover:bg-slate-700" disabled={!recoveryAmount}>
         计算应付额
      </Button>

      {calculatedFee !== null && (
          <div className="mt-4 pt-4 border-t border-slate-100 animate-in fade-in slide-in-from-top-2">
             <div className="flex justify-between items-end mb-2">
                <span className="text-xs text-slate-500">计算结果:</span>
                <span className="text-lg font-bold text-emerald-600 font-mono">
                   ¥ {new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(calculatedFee)}
                </span>
             </div>
             
             {/* Mini Breakdown */}
             <div className="bg-slate-50 rounded p-2 text-[10px] text-slate-500 font-mono mb-3 space-y-1 border border-slate-100">
                {breakdown.map((log, i) => <div key={i}>{log}</div>)}
             </div>

             {onApply && (
                <button 
                    onClick={handleApply}
                    className="w-full flex items-center justify-center gap-1 text-xs bg-emerald-50 text-emerald-700 py-1.5 rounded hover:bg-emerald-100 transition-colors font-medium"
                >
                    一键记入台账 <ArrowRight className="w-3 h-3" />
                </button>
             )}
          </div>
      )}
    </div>
  );
};

export default RiskFeeCalculator;
