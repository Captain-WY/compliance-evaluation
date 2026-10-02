import React, { useState } from 'react';
import { CaseSummaryDetail, Case } from '../../../types';
import { CaseDrawerVO } from '../../../types/case';
import { caseService } from '../../../services/case';
import { Edit3, Save, X, FileText, Target, DollarSign, AlertTriangle, Loader2 } from 'lucide-react';

interface CaseSummaryCardProps {
  caseData: CaseDrawerVO | Case;
  caseId: string;
  onSaved?: () => void;
}

const CaseSummaryCard: React.FC<CaseSummaryCardProps> = ({ caseData, caseId, onSaved }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<CaseSummaryDetail>({
    background: caseData.summaryDetail?.background || '',
    disputeFocus: caseData.summaryDetail?.disputeFocus || '',
    amountText: caseData.summaryDetail?.amountText || '',
    riskAssessment: caseData.summaryDetail?.riskAssessment || ''
  });

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await caseService.updateCaseBaseInfo(caseId, {
        extendedData: {
          summaryDetail: {
            background: formData.background,
            disputeFocus: formData.disputeFocus,
            amountText: formData.amountText,
            riskAssessment: formData.riskAssessment,
          },
        },
      });
      setIsEditing(false);
      onSaved?.();
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setFormData({
      background: caseData.summaryDetail?.background || '',
      disputeFocus: caseData.summaryDetail?.disputeFocus || '',
      amountText: caseData.summaryDetail?.amountText || '',
      riskAssessment: caseData.summaryDetail?.riskAssessment || ''
    });
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="bg-white border border-brand-100 rounded-xl p-4 shadow-sm space-y-4 animate-in fade-in zoom-in-95">
        <div className="flex justify-between items-center border-b border-slate-100 pb-2">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <Edit3 className="w-4 h-4 text-brand-600" /> 编辑案件简介
          </h3>
          <div className="flex gap-2">
            <button onClick={handleCancel} className="p-1 hover:bg-slate-100 rounded text-slate-500">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1 flex items-center gap-1">
               案件背景 (业务触发场景/合作沿革)
            </label>
            <textarea
              className="w-full text-sm border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              rows={4}
              value={formData.background}
              onChange={e => setFormData({...formData, background: e.target.value})}
              placeholder="描述案件的起因、业务背景及双方合作历史..."
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1 flex items-center gap-1">
               争议焦点
            </label>
            <textarea
              className="w-full text-sm border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              rows={3}
              value={formData.disputeFocus}
              onChange={e => setFormData({...formData, disputeFocus: e.target.value})}
              placeholder="列出核心法律争议点..."
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1 flex items-center gap-1">
               涉案金额描述
            </label>
            <input
              type="text"
              className="w-full text-sm border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              value={formData.amountText}
              onChange={e => setFormData({...formData, amountText: e.target.value})}
              placeholder="例如：本金5000万，利息暂计200万"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1 flex items-center gap-1">
               初步风险评估 (对公司影响)
            </label>
            <textarea
              className="w-full text-sm border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              rows={3}
              value={formData.riskAssessment}
              onChange={e => setFormData({...formData, riskAssessment: e.target.value})}
              placeholder="评估败诉风险、财务影响及声誉风险..."
            />
          </div>
        </div>

        <div className="flex justify-end pt-2 border-t border-slate-100">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-1 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isSaving
              ? <><Loader2 className="w-4 h-4 animate-spin" /> 保存中...</>
              : <><Save className="w-4 h-4" /> 保存简介</>
            }
          </button>
        </div>
      </div>
    );
  }

  // View Mode
  const hasStructuredData = !!caseData.summaryDetail;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm relative group hover:shadow-md transition-shadow">
      <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
        <button 
          onClick={() => setIsEditing(true)}
          className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
          title="编辑简介"
        >
          <Edit3 className="w-4 h-4" />
        </button>
      </div>

      <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
        <FileText className="w-4 h-4 text-brand-600" /> 案件情况简介
      </h3>

      {hasStructuredData ? (
        <div className="space-y-5">
          {/* 1. Background */}
          <div>
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              案件背景
            </h4>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
              {caseData.summaryDetail?.background}
            </p>
          </div>

          {/* 2. Dispute Focus */}
          {caseData.summaryDetail?.disputeFocus && (
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5" /> 争议焦点
              </h4>
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                {caseData.summaryDetail?.disputeFocus}
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 3. Amount Text */}
            {caseData.summaryDetail?.amountText && (
              <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5" /> 涉案金额
                </h4>
                <p className="text-sm font-medium text-slate-900">
                  {caseData.summaryDetail?.amountText}
                </p>
              </div>
            )}

            {/* 4. Risk Assessment */}
            {caseData.summaryDetail?.riskAssessment && (
              <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> 风险评估
                </h4>
                <p className="text-sm text-slate-700 leading-relaxed">
                  {caseData.summaryDetail?.riskAssessment}
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        // Fallback for legacy description
        <div className="text-sm text-slate-600 leading-relaxed">
          {caseData.description || "暂无简介信息"}
          <div className="mt-4 pt-3 border-t border-dashed border-slate-200 text-center">
            <button 
              onClick={() => setIsEditing(true)}
              className="text-xs text-brand-600 hover:underline flex items-center justify-center gap-1 w-full"
            >
              <Plus className="w-3 h-3" /> 补充结构化简介
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// Helper icon for empty state
const Plus = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M5 12h14"/><path d="M12 5v14"/></svg>
);

export default CaseSummaryCard;
