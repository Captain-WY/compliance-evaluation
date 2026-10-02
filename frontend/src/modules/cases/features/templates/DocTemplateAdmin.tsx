import React, { useEffect, useState } from 'react';
import { Plus, Loader2, ToggleLeft, ToggleRight, ExternalLink, RefreshCw, Pencil, X, Save } from 'lucide-react';
import Button from '../../components/ui/Button';
import {
  listDocTemplates,
  createDocTemplate,
  updateDocTemplate,
  replaceDocTemplateFile,
  toggleDocTemplate,
  type DocTemplateRecord,
} from '../../services/case';

type DocFormMode = 'CREATE' | 'EDIT' | 'REPLACE_FILE' | null;

interface DocFormState {
  templateName: string;
  category: string;
  fileUrl: string;
  fileType: string;
  description: string;
  versionNote: string;
}

const EMPTY_FORM: DocFormState = {
  templateName: '',
  category: 'LAWSUIT',
  fileUrl: '',
  fileType: 'DOCX',
  description: '',
  versionNote: '',
};

const CATEGORY_OPTIONS = [
  { value: 'LAWSUIT', label: '起诉书' },
  { value: 'EVIDENCE', label: '证据清单' },
  { value: 'CONTRACT', label: '委托合同' },
  { value: 'REPORT', label: '报告' },
  { value: 'OTHER', label: '其他' },
];

const FILE_TYPE_OPTIONS = [
  { value: 'DOCX', label: 'Word (.docx)' },
  { value: 'PDF', label: 'PDF (.pdf)' },
  { value: 'XLSX', label: 'Excel (.xlsx)' },
  { value: 'TXT', label: '纯文本 (.txt)' },
];

const DocTemplateAdmin: React.FC = () => {
  const [items, setItems] = useState<DocTemplateRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<DocFormMode>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<DocFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { load(); }, [filterStatus, filterCategory]);

  const load = async () => {
    setLoading(true);
    const res = await listDocTemplates({ status: filterStatus, category: filterCategory, pageSize: 100 });
    setItems(res.items);
    setTotal(res.total);
    setLoading(false);
  };

  const set = (f: keyof DocFormState, v: string) => setForm(prev => ({ ...prev, [f]: v }));

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setFormMode('CREATE');
    setError(null);
  };

  const openEdit = (t: DocTemplateRecord) => {
    setForm({ templateName: t.templateName, category: t.category, fileUrl: t.fileUrl, fileType: t.fileType, description: t.description ?? '', versionNote: '' });
    setEditingId(t.templateId);
    setFormMode('EDIT');
    setError(null);
  };

  const openReplaceFile = (t: DocTemplateRecord) => {
    setForm({ ...EMPTY_FORM, fileUrl: t.fileUrl, fileType: t.fileType });
    setEditingId(t.templateId);
    setFormMode('REPLACE_FILE');
    setError(null);
  };

  const handleClose = () => { setFormMode(null); setEditingId(null); setError(null); };

  const handleSave = async () => {
    setError(null);
    if (!form.templateName.trim() && formMode !== 'REPLACE_FILE') {
      setError('模板名称为必填项');
      return;
    }
    if (!form.fileUrl.trim()) {
      setError('文件 URL 为必填项');
      return;
    }
    setSaving(true);
    try {
      if (formMode === 'CREATE') {
        const res = await createDocTemplate({
          templateName: form.templateName.trim(),
          category: form.category,
          fileUrl: form.fileUrl.trim(),
          fileType: form.fileType,
          description: form.description.trim() || null,
        });
        if (!res) throw new Error('创建失败');
      } else if (formMode === 'EDIT' && editingId) {
        const ok = await updateDocTemplate({
          templateId: editingId,
          templateName: form.templateName.trim(),
          category: form.category,
          description: form.description.trim() || null,
        });
        if (!ok) throw new Error('更新失败');
      } else if (formMode === 'REPLACE_FILE' && editingId) {
        const res = await replaceDocTemplateFile({
          templateId: editingId,
          fileUrl: form.fileUrl.trim(),
          fileType: form.fileType,
          versionNote: form.versionNote.trim() || null,
        });
        if (!res) throw new Error('替换失败');
      }
      handleClose();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (t: DocTemplateRecord) => {
    const next = t.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    await toggleDocTemplate(t.templateId, next);
    await load();
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex gap-3 items-center">
        <select
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-brand-500"
          value={filterCategory ?? ''}
          onChange={e => setFilterCategory(e.target.value || null)}
        >
          <option value="">全部分类</option>
          {CATEGORY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-brand-500"
          value={filterStatus ?? ''}
          onChange={e => setFilterStatus(e.target.value || null)}
        >
          <option value="">全部状态</option>
          <option value="ACTIVE">启用</option>
          <option value="INACTIVE">停用</option>
        </select>
        <span className="text-sm text-slate-400 ml-auto">共 {total} 个</span>
        <Button size="sm" onClick={openCreate}>
          <Plus className="w-3.5 h-3.5 mr-1" /> 新建模板
        </Button>
      </div>

      {/* Form Panel */}
      {formMode && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
          <div className="flex justify-between items-center">
            <h4 className="text-sm font-semibold text-slate-700">
              {formMode === 'CREATE' ? '新建文档模板' : formMode === 'EDIT' ? '编辑元数据' : '替换文件 (版本升级)'}
            </h4>
            <button onClick={handleClose}><X className="w-4 h-4 text-slate-400" /></button>
          </div>
          {error && <div className="bg-red-50 text-red-700 border border-red-200 text-xs rounded px-3 py-2">{error}</div>}

          <div className="grid grid-cols-2 gap-3">
            {formMode !== 'REPLACE_FILE' && (
              <>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">模板名称 *</label>
                  <input type="text" className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-brand-500" value={form.templateName} onChange={e => set('templateName', e.target.value)} placeholder="例如：股权纠纷起诉书模板" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">分类</label>
                  <select className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-sm bg-white outline-none focus:ring-2 focus:ring-brand-500" value={form.category} onChange={e => set('category', e.target.value)}>
                    {CATEGORY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </>
            )}
            {(formMode === 'CREATE' || formMode === 'REPLACE_FILE') && (
              <>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">文件 URL *</label>
                  <input type="text" className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-brand-500 font-mono" value={form.fileUrl} onChange={e => set('fileUrl', e.target.value)} placeholder="https://storage.sld.internal/templates/xxx.docx" />
                  <p className="text-xs text-slate-400 mt-1">直接填写文件存储路径，无需上传</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">文件类型</label>
                  <select className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-sm bg-white outline-none focus:ring-2 focus:ring-brand-500" value={form.fileType} onChange={e => set('fileType', e.target.value)}>
                    {FILE_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </>
            )}
            {formMode === 'REPLACE_FILE' && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">版本说明</label>
                <input type="text" className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-brand-500" value={form.versionNote} onChange={e => set('versionNote', e.target.value)} placeholder="例如：更新赔偿计算公式" />
              </div>
            )}
            {formMode !== 'REPLACE_FILE' && (
              <div className={formMode === 'EDIT' ? 'col-span-2' : ''}>
                <label className="block text-xs font-medium text-slate-600 mb-1">备注描述</label>
                <input type="text" className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-brand-500" value={form.description} onChange={e => set('description', e.target.value)} placeholder="模板用途说明" />
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" size="sm" onClick={handleClose} disabled={saving}>取消</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Save className="w-3.5 h-3.5 mr-1" />}
              {formMode === 'REPLACE_FILE' ? '替换文件' : '保存'}
            </Button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center h-32 text-slate-400"><Loader2 className="w-5 h-5 animate-spin mr-2" /> 加载中...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-slate-400 text-sm">暂无文档模板</div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3 text-left">模板名称</th>
                <th className="px-4 py-3 text-left">分类</th>
                <th className="px-4 py-3 text-left">类型</th>
                <th className="px-4 py-3 text-center">版本</th>
                <th className="px-4 py-3 text-left">状态</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map(t => (
                <tr key={t.templateId} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{t.templateName}</div>
                    {t.description && <div className="text-xs text-slate-400 mt-0.5">{t.description}</div>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{t.categoryName}</td>
                  <td className="px-4 py-3 text-slate-500 font-mono text-xs">{t.fileType}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="bg-brand-50 text-brand-600 text-xs font-bold px-2 py-0.5 rounded">v{t.version}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${t.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                      {t.statusName}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <a href={t.fileUrl} target="_blank" rel="noreferrer" className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-brand-600" title="打开文件">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                      <button onClick={() => openEdit(t)} className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-brand-600" title="编辑元数据">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => openReplaceFile(t)} className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-amber-600" title="替换文件">
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleToggle(t)} className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-emerald-600" title={t.status === 'ACTIVE' ? '停用' : '启用'}>
                        {t.status === 'ACTIVE' ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default DocTemplateAdmin;
