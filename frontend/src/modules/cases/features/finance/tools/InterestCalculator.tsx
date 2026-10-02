
import React, { useState } from 'react';
import Button from '../../../components/ui/Button';
import { Calculator, ArrowRight } from 'lucide-react';

interface InterestCalculatorProps {
    onApply?: (amount: number, description: string) => void;
}

const InterestCalculator: React.FC<InterestCalculatorProps> = ({ onApply }) => {
  const [principal, setPrincipal] = useState<number>(0);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [rateType, setRateType] = useState<'LPR' | 'FIXED'>('LPR');
  const [fixedRate, setFixedRate] = useState<number>(3.45); // %
  const [multiple, setMultiple] = useState<number>(1); // e.g. 4倍LPR

  const [result, setResult] = useState<number | null>(null);

  const handleCalculate = () => {
    // Simplified logic
    const rate = rateType === 'FIXED' ? fixedRate / 100 : (0.0345 * multiple);
    const start = new Date(startDate);
    const end = new Date(endDate);
    const timeDiff = end.getTime() - start.getTime();
    const days = Math.ceil(timeDiff / (1000 * 3600 * 24));
    
    if (days < 0) {
        setResult(0);
        return;
    }

    const interest = principal * rate * (days / 360);
    setResult(interest);
  };

  const handleApply = () => {
      if (result !== null && onApply) {
          const desc = `利息回款 (本金${principal}, ${rateType === 'LPR' ? multiple + '倍LPR' : fixedRate + '%'}, ${startDate}至${endDate})`;
          onApply(result, desc);
          setResult(null); // Reset after apply
      }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
      <h4 className="font-bold text-slate-800 flex items-center gap-2 mb-4 text-sm">
        <Calculator className="w-4 h-4 text-brand-600" /> 智能利息计算器
      </h4>
      
      <div className="space-y-3 mb-4">
        <div>
           <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">本金 (元)</label>
           <input 
             type="number" 
             className="w-full text-sm border border-slate-200 bg-slate-50 rounded-lg px-2 py-1.5 outline-none focus:bg-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all"
             value={principal}
             onChange={e => setPrincipal(Number(e.target.value))}
           />
        </div>
        
        <div className="grid grid-cols-2 gap-2">
            <div>
               <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">利率标准</label>
               <select 
                 className="w-full text-xs border border-slate-200 bg-slate-50 rounded-lg px-2 py-1.5 outline-none"
                 value={rateType}
                 onChange={e => setRateType(e.target.value as any)}
               >
                 <option value="LPR">LPR</option>
                 <option value="FIXED">固定</option>
               </select>
            </div>
            
            {rateType === 'LPR' ? (
                 <div>
                    <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">倍数</label>
                    <input 
                        type="number" 
                        className="w-full text-xs border border-slate-200 bg-slate-50 rounded-lg px-2 py-1.5 outline-none"
                        value={multiple}
                        onChange={e => setMultiple(Number(e.target.value))}
                    />
                </div>
            ) : (
                <div>
                    <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">年化 %</label>
                    <input 
                        type="number" 
                        className="w-full text-xs border border-slate-200 bg-slate-50 rounded-lg px-2 py-1.5 outline-none"
                        value={fixedRate}
                        onChange={e => setFixedRate(Number(e.target.value))}
                    />
                </div>
            )}
        </div>

        <div className="grid grid-cols-2 gap-2">
            <div>
               <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">起息日</label>
               <input 
                 type="date" 
                 className="w-full text-xs border border-slate-200 bg-slate-50 rounded-lg px-2 py-1.5 outline-none"
                 value={startDate}
                 onChange={e => setStartDate(e.target.value)}
               />
            </div>
            <div>
               <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">止息日</label>
               <input 
                 type="date" 
                 className="w-full text-xs border border-slate-200 bg-slate-50 rounded-lg px-2 py-1.5 outline-none"
                 value={endDate}
                 onChange={e => setEndDate(e.target.value)}
               />
            </div>
        </div>
      </div>

      <Button size="sm" onClick={handleCalculate} className="w-full bg-slate-800 hover:bg-slate-700" disabled={!principal || !startDate}>
         计算
      </Button>

      {result !== null && (
         <div className="mt-4 pt-4 border-t border-slate-100 animate-in fade-in slide-in-from-top-2">
            <div className="flex justify-between items-end mb-2">
                <span className="text-xs text-slate-500">计算结果:</span>
                <span className="text-lg font-bold text-brand-600 font-mono">
                   ¥ {new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(result)}
                </span>
            </div>
            {onApply && (
                <button 
                    onClick={handleApply}
                    className="w-full flex items-center justify-center gap-1 text-xs bg-brand-50 text-brand-700 py-1.5 rounded hover:bg-brand-100 transition-colors font-medium"
                >
                    一键记入台账 <ArrowRight className="w-3 h-3" />
                </button>
            )}
         </div>
      )}
    </div>
  );
};

export default InterestCalculator;
