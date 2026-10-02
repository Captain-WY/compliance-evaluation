import React from 'react';
import { TrialPhaseDetail, PreLitigationDetail } from '../../../types';
import { CheckCircle, Circle, Clock, FileText, Gavel, Scale } from 'lucide-react';

interface StageProgressCardProps {
  stageName: string;
  type: 'PRE_LITIGATION' | 'TRIAL';
  data?: TrialPhaseDetail | PreLitigationDetail;
  onUpdate?: (node: string) => void;
  onNodeClick?: (nodeKey: string, data: any) => void;
}

const StageProgressCard: React.FC<StageProgressCardProps> = ({ stageName, type, data, onUpdate, onNodeClick }) => {
  
  if (type === 'PRE_LITIGATION') {
    const detail = data as PreLitigationDetail;
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm mt-4">
        <h4 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
            <Scale className="w-4 h-4 text-brand-600" /> {stageName} 关键节点
        </h4>
        <div className="grid grid-cols-2 gap-4">
            {/* Mediation Node */}
            <div 
                className="flex items-start gap-3 p-3 bg-slate-50 rounded border border-slate-100 cursor-pointer hover:border-brand-200 transition-colors"
                onClick={() => onNodeClick && onNodeClick('mediation', detail?.mediation)}
            >
                <div className={`mt-0.5 ${detail?.mediation?.status === '成功' ? 'text-emerald-500' : 'text-slate-400'}`}>
                    {detail?.mediation?.status === '成功' ? <CheckCircle className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                </div>
                <div>
                    <div className="font-medium text-slate-800 text-sm">诉前调解</div>
                    <div className="text-xs text-slate-500 mt-1">
                        状态: <span className="font-medium">{detail?.mediation?.status || '未开始'}</span>
                    </div>
                    {detail?.mediation?.date && (
                        <div className="text-xs text-slate-400 mt-0.5">{detail.mediation.date}</div>
                    )}
                </div>
            </div>

            {/* Preservation Node */}
            <div 
                className="flex items-start gap-3 p-3 bg-slate-50 rounded border border-slate-100 cursor-pointer hover:border-brand-200 transition-colors"
                onClick={() => onNodeClick && onNodeClick('preservation', detail?.preservation)}
            >
                <div className={`mt-0.5 ${detail?.preservation?.status === '已保全' ? 'text-emerald-500' : 'text-slate-400'}`}>
                    {detail?.preservation?.status === '已保全' ? <CheckCircle className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                </div>
                <div>
                    <div className="font-medium text-slate-800 text-sm">财产保全</div>
                    <div className="text-xs text-slate-500 mt-1">
                        状态: <span className="font-medium">{detail?.preservation?.status || '未申请'}</span>
                    </div>
                    {detail?.preservation?.amount && (
                        <div className="text-xs text-slate-400 mt-0.5">保全金额: ¥{(detail.preservation.amount / 10000).toFixed(2)}万</div>
                    )}
                </div>
            </div>
        </div>
      </div>
    );
  }

  // TRIAL Phase
  const detail = data as TrialPhaseDetail;
  const steps = [
    { key: 'filing', label: '立案', icon: FileText, status: detail?.filing?.date ? 'DONE' : 'PENDING', info: detail?.filing?.date, data: detail?.filing },
    { key: 'evidence', label: '举证质证', icon: FileText, status: detail?.evidence?.status === '质证完成' ? 'DONE' : 'PENDING', info: detail?.evidence?.deadline ? `截止: ${detail.evidence.deadline}` : '', data: detail?.evidence },
    { key: 'hearing', label: '开庭审理', icon: Gavel, status: detail?.hearing?.status === '已开庭' ? 'DONE' : 'PENDING', info: detail?.hearing?.date, data: detail?.hearing },
    { key: 'judgment', label: '裁判文书', icon: Scale, status: detail?.judgment?.documentStatus === '已接收' ? 'DONE' : 'PENDING', info: detail?.judgment?.result, data: detail?.judgment }
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm mt-4">
        <h4 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
            <Gavel className="w-4 h-4 text-brand-600" /> {stageName} 流程追踪
        </h4>
        
        <div className="relative flex items-center justify-between px-4">
            {/* Connecting Line */}
            <div className="absolute left-4 right-4 top-4 h-0.5 bg-slate-100 -z-10"></div>

            {steps.map((step, index) => (
                <div 
                    key={step.key} 
                    className="flex flex-col items-center gap-2 bg-white px-2 cursor-pointer hover:opacity-80 transition-opacity" 
                    onClick={() => onNodeClick && onNodeClick(step.key, step.data)}
                >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${
                        step.status === 'DONE' 
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-600' 
                        : 'bg-white border-slate-300 text-slate-300'
                    }`}>
                        <step.icon className="w-4 h-4" />
                    </div>
                    <div className="text-center">
                        <div className={`text-xs font-bold ${step.status === 'DONE' ? 'text-slate-800' : 'text-slate-400'}`}>
                            {step.label}
                        </div>
                        {step.info && (
                            <div className="text-[10px] text-slate-400 mt-0.5 max-w-[80px] truncate">
                                {step.info}
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    </div>
  );
};

export default StageProgressCard;
