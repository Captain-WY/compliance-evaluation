import React, { useState } from 'react';
import Button from '../../components/ui/Button';
import { createClue } from '../../services/case';
import { FileText, CheckCircle2 } from 'lucide-react';

interface ClueReportFormProps {
  onSuccess: () => void;
  currentUser?: string;
}

const ClueReportForm: React.FC<ClueReportFormProps> = ({ onSuccess }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    clueTitle: '',
    description: '',
    opponentName: '',
    estimatedAmount: '',
    businessLine: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.clueTitle.trim()) return;
    setIsSubmitting(true);
    try {
      await createClue({
        clueTitle: formData.clueTitle.trim(),
        description: formData.description.trim() || null,
        sourceType: 'MANUAL',
        opponentName: formData.opponentName.trim() || null,
        estimatedAmount: formData.estimatedAmount ? parseFloat(formData.estimatedAmount) : null,
        businessLine: formData.businessLine.trim() || null,
      });
      onSuccess();
    } catch {
      // silent — user can retry
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 max-w-2xl mx-auto">
      <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
        <span className="w-1.5 h-6 bg-brand-500 rounded-sm"></span>
        风险线索上报
      </h2>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            线索标题 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none"
            placeholder="例：华南区经销商拖欠货款纠纷"
            value={formData.clueTitle}
            onChange={e => setFormData({ ...formData, clueTitle: e.target.value })}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">情况描述</label>
          <textarea
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none h-28"
            placeholder="请简要描述风险情况、背景、诉求等..."
            value={formData.description}
            onChange={e => setFormData({ ...formData, description: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              <span className="flex items-center gap-1"><FileText className="w-3.5 h-3.5" /> 对方当事人</span>
            </label>
            <input
              type="text"
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
              placeholder="公司名称或个人姓名"
              value={formData.opponentName}
              onChange={e => setFormData({ ...formData, opponentName: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">预估金额 (元)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
              placeholder="0.00"
              value={formData.estimatedAmount}
              onChange={e => setFormData({ ...formData, estimatedAmount: e.target.value })}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">所属业务线</label>
          <input
            type="text"
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
            placeholder="例：华南销售大区"
            value={formData.businessLine}
            onChange={e => setFormData({ ...formData, businessLine: e.target.value })}
          />
        </div>

        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 flex items-start gap-2 text-xs text-blue-700">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-blue-500" />
          <span>来源类型将自动标记为"手工录入"。提交后线索进入线索池待处理。</span>
        </div>

        <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onSuccess}>取消</Button>
          <Button type="submit" isLoading={isSubmitting} disabled={!formData.clueTitle.trim()}>
            提交上报
          </Button>
        </div>
      </form>
    </div>
  );
};

export default ClueReportForm;
