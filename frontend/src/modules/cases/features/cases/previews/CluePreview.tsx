
import React from 'react';
import { RiskLevel } from '../../../types';
import { ClueDrawerVO } from '../../../types/case';
import { PropertyField, PropertyGroup } from '../components/IssueProperties';
import { Bug, ArrowRight, X, AlertTriangle, ShieldCheck, FileText } from 'lucide-react';
import Button from '../../../components/ui/Button';

interface CluePreviewProps {
  clue: ClueDrawerVO;
  onNavigateFull: () => void;
  onClose?: () => void;
}

const CluePreview: React.FC<CluePreviewProps> = ({ clue, onNavigateFull, onClose }) => {
  return (
    <div className="flex flex-col h-full bg-white relative">
        <div className="px-6 py-5 border-b border-slate-200 bg-red-50/30 shrink-0 pr-12">
            <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-mono text-red-600 bg-red-50 border border-red-100 px-1.5 rounded">{clue.key}</span>
                <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 rounded border border-slate-200">风险线索</span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 leading-tight mb-4">{clue.title}</h2>
            
            <div className="flex gap-2">
                <Button size="sm" onClick={onNavigateFull} className="bg-brand-600 hover:bg-brand-700 text-white">
                    <ShieldCheck className="w-3.5 h-3.5 mr-1.5" /> 处置 / 转立案
                </Button>
                <Button size="sm" variant="ghost" className="text-slate-500 hover:text-red-600">
                    <X className="w-3.5 h-3.5 mr-1.5" /> 无效关闭
                </Button>
            </div>

            {/* Close Button */}
            {onClose && (
                <button 
                    onClick={onClose}
                    className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>
            )}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
            <div className="grid grid-cols-1 gap-6">
                <div className="space-y-6">
                    <section>
                        <h4 className="text-xs font-bold text-slate-900 uppercase mb-2 flex items-center gap-2">
                            <FileText className="w-4 h-4 text-slate-400" /> 线索内容 (Content)
                        </h4>
                        <div className="bg-white p-4 rounded-lg border border-slate-200 text-sm text-slate-700 leading-relaxed shadow-sm">
                            {clue.content}
                        </div>
                        {clue.attachments && clue.attachments.length > 0 && (
                            <div className="mt-3 flex gap-2">
                                {clue.attachments.map((f, i) => (
                                    <span key={i} className="text-xs bg-slate-50 px-2 py-1 rounded border border-slate-200 text-slate-600">
                                        📎 {f}
                                    </span>
                                ))}
                            </div>
                        )}
                    </section>

                    <PropertyGroup title="来源信息" defaultOpen>
                        <PropertyField label="上报来源" value={clue.source} />
                        <PropertyField label="上报人" value={clue.reporter} />
                        <PropertyField label="上报时间" value={clue.reportDate} />
                        <PropertyField label="状态" value={clue.status} highlight />
                    </PropertyGroup>

                    <PropertyGroup title="清洗后数据 (AI)">
                        <PropertyField label="涉案金额" value={clue.cleanedAmount ? `¥ ${clue.cleanedAmount.toLocaleString()}` : '-'} highlight />
                        <PropertyField label="对方当事人" value={clue.cleanedPlaintiff} />
                        <PropertyField label="系统评级" value={clue.riskLevel} />
                    </PropertyGroup>
                </div>
            </div>
        </div>
    </div>
  );
};

export default CluePreview;
