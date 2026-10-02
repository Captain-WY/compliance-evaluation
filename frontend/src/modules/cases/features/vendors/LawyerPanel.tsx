import React, { useEffect, useState } from 'react';
import { Plus, Loader2, Pencil, X, Save } from 'lucide-react';
import Button from '../../components/ui/Button';
import { listLawyers, createLawyer, updateLawyer, type LawyerRecord } from '../../services/case';

interface LawyerPanelProps {
  firmId: string;
}

interface LawyerFormState {
  lawyerName: string;
  licenseNumber: string;
  title: string;
  expertise: string;
  contactPhone: string;
  contactEmail: string;
  status: string;
}

const EMPTY_FORM: LawyerFormState = {
  lawyerName: '',
  licenseNumber: '',
  title: '',
  expertise: '',
  contactPhone: '',
  contactEmail: '',
  status: 'ACTIVE',
};

const LawyerPanel: React.FC<LawyerPanelProps> = ({ firmId }) => {
  const [lawyers, setLawyers] = useState<LawyerRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | 'NEW' | null>(null);
  const [form, setForm] = useState<LawyerFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, [firmId]);

  const load = async () => {
    setLoading(true);
    const result = await listLawyers({ firmId, pageSize: 100 });
    setLawyers(result.items);
    setTotal(result.total);
    setLoading(false);
  };

  const openNew = () => {
    setForm(EMPTY_FORM);
    setEditingId('NEW');
    setError(null);
  };

  const openEdit = (lawyer: LawyerRecord) => {
    setForm({
      lawyerName: lawyer.lawyerName,
      licenseNumber: lawyer.licenseNumber ?? '',
      title: lawyer.title ?? '',
      expertise: lawyer.expertise ?? '',
      contactPhone: lawyer.contactPhone ?? '',
      contactEmail: lawyer.contactEmail ?? '',
      status: lawyer.status,
    });
    setEditingId(lawyer.lawyerId);
    setError(null);
  };

  const handleCancel = () => {
    setEditingId(null);
    setError(null);
  };

  const set = (field: keyof LawyerFormState, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    if (!form.lawyerName.trim()) {
      setError('律师姓名为必填项');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      if (editingId === 'NEW') {
        const result = await createLawyer({
          firmId,
          lawyerName: form.lawyerName.trim(),
          licenseNumber: form.licenseNumber.trim() || null,
          title: form.title.trim() || null,
          expertise: form.expertise.trim() || null,
          contactPhone: form.contactPhone.trim() || null,
          contactEmail: form.contactEmail.trim() || null,
          status: form.status,
        });
        if (!result) throw new Error('创建失败');
      } else if (editingId) {
        const ok = await updateLawyer({
          lawyerId: editingId,
          lawyerName: form.lawyerName.trim() || null,
          licenseNumber: form.licenseNumber.trim() || null,
          title: form.title.trim() || null,
          expertise: form.expertise.trim() || null,
          contactPhone: form.contactPhone.trim() || null,
          contactEmail: form.contactEmail.trim() || null,
          status: form.status || null,
        });
        if (!ok) throw new Error('更新失败');
      }
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> 加载中...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">共 {total} 位律师</p>
        <Button size="sm" onClick={openNew}>
          <Plus className="w-3.5 h-3.5 mr-1" /> 新增律师
        </Button>
      </div>

      {editingId && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between mb-1">
            <h4 className="text-sm font-semibold text-slate-700">
              {editingId === 'NEW' ? '新增律师' : '编辑律师信息'}
            </h4>
            <button onClick={handleCancel} className="p-1 hover:bg-slate-200 rounded text-slate-400">
              <X className="w-4 h-4" />
            </button>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded px-3 py-2">{error}</div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">姓名 <span className="text-red-500">*</span></label>
              <input
                type="text"
                className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                value={form.lawyerName}
                onChange={e => set('lawyerName', e.target.value)}
                placeholder="律师姓名"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">执照号</label>
              <input
                type="text"
                className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                value={form.licenseNumber}
                onChange={e => set('licenseNumber', e.target.value)}
                placeholder="执业证号"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">职称</label>
              <input
                type="text"
                className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                value={form.title}
                onChange={e => set('title', e.target.value)}
                placeholder="例如：合伙人、资深律师"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">专业领域</label>
              <input
                type="text"
                className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                value={form.expertise}
                onChange={e => set('expertise', e.target.value)}
                placeholder="例如：证券合规、金融纠纷"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">联系电话</label>
              <input
                type="text"
                className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                value={form.contactPhone}
                onChange={e => set('contactPhone', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">邮箱</label>
              <input
                type="email"
                className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                value={form.contactEmail}
                onChange={e => set('contactEmail', e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" size="sm" onClick={handleCancel} disabled={saving}>取消</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Save className="w-3.5 h-3.5 mr-1" />}
              保存
            </Button>
          </div>
        </div>
      )}

      {lawyers.length === 0 && !editingId ? (
        <div className="text-center py-10 text-slate-400 text-sm">
          暂无律师信息，点击"新增律师"添加
        </div>
      ) : (
        <div className="space-y-2">
          {lawyers.map(lawyer => (
            <div
              key={lawyer.lawyerId}
              className="bg-white border border-slate-200 rounded-lg px-4 py-3 flex items-center justify-between group"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-800 text-sm">{lawyer.lawyerName}</span>
                  {lawyer.title && (
                    <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded">{lawyer.title}</span>
                  )}
                  <span className={`text-xs px-1.5 py-0.5 rounded ${lawyer.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                    {lawyer.statusName}
                  </span>
                </div>
                <div className="flex gap-3 text-xs text-slate-400 mt-1">
                  {lawyer.expertise && <span>{lawyer.expertise}</span>}
                  {lawyer.contactPhone && <span>{lawyer.contactPhone}</span>}
                  {lawyer.licenseNumber && <span>证号: {lawyer.licenseNumber}</span>}
                </div>
              </div>
              <button
                onClick={() => openEdit(lawyer)}
                className="p-1.5 rounded hover:bg-slate-100 text-slate-300 hover:text-brand-600 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default LawyerPanel;
