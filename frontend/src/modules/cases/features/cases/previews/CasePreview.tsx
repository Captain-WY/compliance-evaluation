
import React from 'react';
import { CaseType } from '../../../types';
import { CaseDrawerVO } from '../../../types/case';
import { PropertyField, PropertyGroup } from '../components/IssueProperties';
import { Building2, Gavel, Calendar, Clock, Coins, User, Briefcase, Edit, LayoutDashboard, X } from 'lucide-react';
import Button from '../../../components/ui/Button';
import CaseSummaryCard from '../components/CaseSummaryCard';

interface CasePreviewProps {
  caseData: CaseDrawerVO;
  onNavigateFull: () => void;
  onEdit?: () => void;
  onRefresh?: () => void;
  onClose?: () => void;
}

const CasePreview: React.FC<CasePreviewProps> = ({ caseData, onNavigateFull, onEdit, onRefresh, onClose }) => {
  return (
    <div className="flex flex-col h-full bg-white relative">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-200 shrink-0 pr-12">
            <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-mono text-slate-500 bg-slate-100 px-1.5 rounded">{caseData.code}</span>
                {caseData.caseType === CaseType.SERIES_MASTER && (
                    <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 rounded font-bold">系列总案</span>
                )}
            </div>
            <h2 className="text-xl font-bold text-slate-900 leading-tight mb-4">{caseData.title}</h2>
            
            <div className="flex gap-2">
                <Button size="sm" onClick={onNavigateFull} className="bg-brand-600 hover:bg-brand-700 text-white">
                    <LayoutDashboard className="w-3.5 h-3.5 mr-1.5" /> 进入详情看板
                </Button>
                <Button size="sm" variant="outline" onClick={onEdit ?? onNavigateFull}>
                    <Edit className="w-3.5 h-3.5 mr-1.5" /> 编辑
                </Button>
            </div>

            {/* Close Button (Absolute top-right) */}
            {onClose && (
                <button 
                    onClick={onClose}
                    className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>
            )}
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto p-6">
            <div className="grid grid-cols-1 gap-6">
                {/* Single Column Layout for Narrow Preview */}
                <div className="space-y-6">
                    <section>
                        <CaseSummaryCard caseData={caseData} caseId={caseData.id} onSaved={onRefresh} />
                    </section>

                    <PropertyGroup title="核心属性" defaultOpen>
                        <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm mb-3">
                            <PropertyField label="当前阶段" value={caseData.stage} highlight />
                            <div className="mt-2 pt-2 border-t border-slate-100 flex justify-between items-center">
                                <span className="text-xs text-slate-400">风险等级</span>
                                <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                                    caseData.riskLevelCode === 'CRITICAL' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700'
                                }`}>{caseData.riskLevel}</span>
                            </div>
                        </div>
                        <PropertyField label="涉案金额" value={`¥ ${(caseData.regulatoryAttrs?.amountNoInterest || 0).toLocaleString()}`} icon={Coins} highlight />
                        <PropertyField label="管辖法院" value={caseData.court} icon={Gavel} />
                        <PropertyField label="案由" value={caseData.cause} icon={Briefcase} />
                        <PropertyField label="业务条线" value={caseData.businessLine} icon={Building2} />
                    </PropertyGroup>

                    <PropertyGroup title="人员与时间">
                        <PropertyField label="经办人" value={caseData.assignee ?? '待分配'} icon={User} />
                        <PropertyField label="立案日期" value={caseData.filingDate} icon={Calendar} />
                        <PropertyField label="下一截止日" value={caseData.nextDeadline} icon={Clock} className="text-amber-600" />
                    </PropertyGroup>

                    <section>
                        <h4 className="text-xs font-bold text-slate-900 uppercase mb-2">最新动态</h4>
                        <div className="border-l-2 border-slate-200 pl-4 py-1 space-y-4">
                            {caseData.recentActivities.length > 0 ? (
                                caseData.recentActivities.map(item => (
                                    <div key={item.id} className="relative">
                                        <div className="absolute -left-[21px] top-1 w-3 h-3 bg-slate-200 rounded-full border-2 border-white" />
                                        <p className="text-xs text-slate-500 mb-0.5">
                                            {new Date(item.timestamp).toLocaleDateString('zh-CN')} • {item.operator}
                                        </p>
                                        <p className="text-sm text-slate-700">{item.action}</p>
                                    </div>
                                ))
                            ) : (
                                <p className="text-xs text-slate-400 py-1">暂无动态记录</p>
                            )}
                        </div>
                    </section>
                </div>
            </div>
        </div>
    </div>
  );
};

export default CasePreview;
