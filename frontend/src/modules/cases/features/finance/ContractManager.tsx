import React, { useEffect, useState } from 'react';
import { LegalContract, FeeModel } from '../../types';
import { getContractByCaseId } from '../../services/mock/contracts';
import { FileText, Shield, AlertTriangle, CheckCircle, Gavel } from 'lucide-react';
import RiskFeeCalculator from './tools/RiskFeeCalculator';

interface ContractManagerProps {
  caseId: string;
}

const ContractManager: React.FC<ContractManagerProps> = ({ caseId }) => {
  const [contract, setContract] = useState<LegalContract | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getContractByCaseId(caseId).then(data => {
      setContract(data);
      setLoading(false);
    });
  }, [caseId]);

  if (loading) return <div className="p-8 text-center text-slate-400">加载合同数据...</div>;

  if (!contract) {
      return (
          <div className="p-12 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
             <Gavel className="w-12 h-12 text-slate-300 mx-auto mb-3" />
             <h3 className="text-lg font-medium text-slate-600">暂无外聘律师合同</h3>
             <p className="text-slate-400 text-sm mt-1 mb-6">该案件尚未关联法律服务合同，无法进行费用管控。</p>
             <button className="px-4 py-2 bg-brand-600 text-white rounded hover:bg-brand-700 transition-colors font-medium">
                + 发起选聘/录入合同
             </button>
          </div>
      )
  }

  return (
    <div className="space-y-6">
       {/* Contract Header */}
       <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex justify-between items-start">
          <div className="flex gap-4">
             <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center text-slate-500">
                <FileText className="w-6 h-6" />
             </div>
             <div>
                <div className="flex items-center gap-2 mb-1">
                   <span className="text-xs font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded">{contract.contractNo}</span>
                   <span className={`text-xs font-bold px-2 py-0.5 rounded border ${contract.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-slate-100 text-slate-400'}`}>
                      {contract.status === 'ACTIVE' ? '执行中' : '已结束'}
                   </span>
                </div>
                <h2 className="text-xl font-bold text-slate-800">{contract.title}</h2>
                <div className="flex items-center gap-4 text-sm text-slate-500 mt-2">
                   <span>签约日期: {contract.signDate}</span>
                   <span>费用模式: {contract.feeModel}</span>
                </div>
             </div>
          </div>
          <div className="text-right">
             <p className="text-xs text-slate-400 font-bold uppercase">基础固定费用</p>
             <p className="text-2xl font-mono font-bold text-slate-800">¥ {new Intl.NumberFormat('zh-CN').format(contract.fixedFee)}</p>
          </div>
       </div>

       <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Fee Structure Display */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
             <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                <Shield className="w-5 h-5 text-brand-500" /> 费用条款结构化
             </h3>
             
             <div className="space-y-4">
                <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                   <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                   <div>
                      <p className="text-sm font-bold text-slate-700">基础代理费</p>
                      <p className="text-xs text-slate-500">固定支付 ¥{new Intl.NumberFormat('zh-CN').format(contract.fixedFee)}，作为前期启动资金。</p>
                   </div>
                </div>

                {contract.feeModel !== FeeModel.FIXED && contract.riskTiers && (
                    <div className="flex items-start gap-3 p-3 bg-indigo-50 rounded-lg border border-indigo-100">
                        <Gavel className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                        <div className="w-full">
                            <p className="text-sm font-bold text-indigo-900">风险代理 (阶梯费率)</p>
                            <div className="mt-2 space-y-1">
                                {contract.riskTiers.map((tier, idx) => (
                                    <div key={idx} className="flex justify-between text-xs text-indigo-700 border-b border-indigo-100 pb-1 last:border-0">
                                        <span>
                                            {tier.minAmount/10000}万 - {tier.maxAmount ? tier.maxAmount/10000 + '万' : '∞'}
                                        </span>
                                        <span className="font-bold">{(tier.rate * 100).toFixed(1)}%</span>
                                    </div>
                                ))}
                            </div>
                            {contract.deductFixedFromRisk && (
                                <p className="text-[10px] text-indigo-500 mt-2 italic">* 风险费需抵扣前期已付固定费</p>
                            )}
                            {contract.totalCap && (
                                <p className="text-[10px] text-indigo-500 italic">* 总费用封顶: ¥{(contract.totalCap/10000).toFixed(0)}万</p>
                            )}
                        </div>
                    </div>
                )}
             </div>
          </div>

          {/* Calculator Tool */}
          {contract.feeModel !== FeeModel.FIXED && (
              <RiskFeeCalculator contract={contract} />
          )}

          {contract.feeModel === FeeModel.FIXED && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 flex flex-col items-center justify-center text-center text-slate-500">
                  <CheckCircle className="w-12 h-12 text-emerald-300 mb-3" />
                  <h4 className="font-medium">固定费率合同</h4>
                  <p className="text-sm mt-1">无需进行风险代理费计算。</p>
              </div>
          )}
       </div>
    </div>
  );
};

export default ContractManager;