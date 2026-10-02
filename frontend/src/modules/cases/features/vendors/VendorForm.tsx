import React, { useState, useEffect } from 'react';
import { X, Building2, Phone } from 'lucide-react';
import Button from '../../components/ui/Button';
import { createVendorRecord, updateVendorRecord, type VendorRecord } from '../../services/case';

interface VendorFormProps {
  initialData?: VendorRecord;
  onSave: () => void;
  onCancel: () => void;
  mode: 'CREATE' | 'EDIT';
}

interface FormState {
  firmName: string;
  unifiedSocialCreditCode: string;
  cooperationStatus: string;
  ratingLevel: string;
  profile: string;
  rateCardSummary: string;
}

const COOPERATION_OPTIONS = [
  { value: 'BACKUP', label: '候选库' },
  { value: 'ACTIVE', label: '合作中' },
  { value: 'BLACKLISTED', label: '黑名单' },
];

const RATING_OPTIONS = [
  { value: '', label: '暂不评级' },
  { value: 'A_PLUS', label: 'A+' },
  { value: 'A', label: 'A' },
  { value: 'B_PLUS', label: 'B+' },
  { value: 'B', label: 'B' },
  { value: 'C', label: 'C' },
];

const VendorForm: React.FC<VendorFormProps> = ({ initialData, onSave, onCancel, mode }) => {
  const [form, setForm] = useState<FormState>({
    firmName: '',
    unifiedSocialCreditCode: '',
    cooperationStatus: 'BACKUP',
    ratingLevel: '',
    profile: '',
    rateCardSummary: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData && mode === 'EDIT') {
      setForm({
        firmName: initialData.firmName,
        unifiedSocialCreditCode: initialData.unifiedSocialCreditCode ?? '',
        cooperationStatus: initialData.cooperationStatus,
        ratingLevel: initialData.ratingLevel ?? '',
        profile: initialData.profile ?? '',
        rateCardSummary: initialData.rateCardSummary ?? '',
      });
    }
  }, [initialData, mode]);

  const set = (field: keyof FormState, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firmName.trim()) {
      setError('律所全称为必填项');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      if (mode === 'CREATE') {
        const result = await createVendorRecord({
          firmName: form.firmName.trim(),
          unifiedSocialCreditCode: form.unifiedSocialCreditCode.trim() || null,
          cooperationStatus: form.cooperationStatus,
          ratingLevel: form.ratingLevel || null,
          profile: form.profile.trim() || null,
          rateCardSummary: form.rateCardSummary.trim() || null,
        });
        if (!result) throw new Error('创建失败');
      } else {
        if (!initialData?.firmId) return;
        const ok = await updateVendorRecord({
          firmId: initialData.firmId,
          firmName: form.firmName.trim(),
          unifiedSocialCreditCode: form.unifiedSocialCreditCode.trim() || null,
          ratingLevel: form.ratingLevel || null,
          profile: form.profile.trim() || null,
          rateCardSummary: form.rateCardSummary.trim() || null,
        });
        if (!ok) throw new Error('更新失败');
      }
      onSave();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 pb-20">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>
      )}

      <div className="space-y-4">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
          <Building2 className="w-3.5 h-3.5" /> 基础信息
        </h3>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            律所全称 <span className="text-red-500">*</span>
          </label>
          <input
            required
            type="text"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
            value={form.firmName}
            onChange={e => set('firmName', e.target.value)}
            placeholder="例如：北京市金杜律师事务所"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">统一社会信用代码</label>
            <input
              type="text"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
              value={form.unifiedSocialCreditCode}
              onChange={e => set('unifiedSocialCreditCode', e.target.value)}
              placeholder="18 位代码"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">合作状态</label>
            <select
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none bg-white"
              value={form.cooperationStatus}
              onChange={e => set('cooperationStatus', e.target.value)}
              disabled={mode === 'EDIT'}
            >
              {COOPERATION_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            {mode === 'EDIT' && (
              <p className="text-xs text-slate-400 mt-1">合作状态通过"状态切换"操作修改</p>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">评级</label>
          <select
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none bg-white"
            value={form.ratingLevel}
            onChange={e => set('ratingLevel', e.target.value)}
          >
            {RATING_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
          <Phone className="w-3.5 h-3.5" /> 专业档案
        </h3>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">律所简介</label>
          <textarea
            rows={3}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none resize-none"
            value={form.profile}
            onChange={e => set('profile', e.target.value)}
            placeholder="律所背景、专业领域、历史业绩等..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">费率说明</label>
          <textarea
            rows={2}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none resize-none"
            value={form.rateCardSummary}
            onChange={e => set('rateCardSummary', e.target.value)}
            placeholder="合伙人 3500 元/小时，资深律师 2500 元/小时..."
          />
        </div>
      </div>

      <div className="fixed bottom-0 right-0 w-[600px] bg-white border-t border-slate-200 p-4 flex justify-end gap-3 shadow-lg z-10">
        <Button variant="secondary" type="button" onClick={onCancel} disabled={loading}>
          取消
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? '保存中...' : mode === 'CREATE' ? '创建档案' : '保存更改'}
        </Button>
      </div>
    </form>
  );
};

export default VendorForm;
