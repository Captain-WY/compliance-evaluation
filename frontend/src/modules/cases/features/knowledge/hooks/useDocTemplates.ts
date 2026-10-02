import { useState, useEffect, useCallback, useRef } from 'react';
import {
  listDocTemplates,
  createDocTemplate,
  updateDocTemplate,
  replaceDocTemplateFile,
  toggleDocTemplate,
  type DocTemplateRecord,
} from '../../../services/case';

export type DocFormMode = 'CREATE' | 'EDIT' | 'REPLACE_FILE' | null;

export interface DocFormState {
  templateName: string;
  category: string;
  fileUrl: string;
  fileType: string;
  description: string;
  versionNote: string;
}

export const EMPTY_FORM: DocFormState = {
  templateName: '',
  category: 'LAWSUIT',
  fileUrl: '',
  fileType: 'DOCX',
  description: '',
  versionNote: '',
};

export const CATEGORY_OPTIONS = [
  { value: 'LITIGATION', label: '诉讼文书' },
  { value: 'EVIDENCE', label: '证据材料' },
  { value: 'CONTRACT', label: '合同协议' },
  { value: 'AUTHORIZATION', label: '授权委托' },
  { value: 'REPORT', label: '报告文书' },
  { value: 'LETTER', label: '函件文书' },
  { value: 'OTHER', label: '其他' },
];

export const FILE_TYPE_OPTIONS = [
  { value: 'WORD', label: 'Word (.docx)' },
  { value: 'PDF', label: 'PDF (.pdf)' },
  { value: 'EXCEL', label: 'Excel (.xlsx)' },
];

export interface UseDocTemplatesReturn {
  items: DocTemplateRecord[];
  total: number;
  loading: boolean;
  error: string | null;
  keyword: string;
  category: string | null;
  page: number;
  pageSize: number;
  setKeyword: (v: string) => void;
  setCategory: (v: string | null) => void;
  setPage: (v: number) => void;
  refresh: () => Promise<void>;

  // Form state (for admin operations)
  formMode: DocFormMode;
  editingId: string | null;
  form: DocFormState;
  saving: boolean;
  formError: string | null;
  openCreate: () => void;
  openEdit: (t: DocTemplateRecord) => void;
  openReplaceFile: (t: DocTemplateRecord) => void;
  closeForm: () => void;
  setFormField: (field: keyof DocFormState, value: string) => void;
  handleSave: () => Promise<boolean>;
  handleToggle: (t: DocTemplateRecord) => Promise<void>;
}

export function useDocTemplates(pageSize: number = 12): UseDocTemplatesReturn {
  const [items, setItems] = useState<DocTemplateRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [keyword, setKeywordState] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  // Debounced keyword
  const [debouncedKeyword, setDebouncedKeyword] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setKeyword = useCallback((v: string) => {
    setKeywordState(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedKeyword(v);
      setPage(1);
    }, 300);
  }, []);

  // Form state
  const [formMode, setFormMode] = useState<DocFormMode>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<DocFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listDocTemplates({
        page,
        pageSize,
        keyword: debouncedKeyword || null,
        category,
        status: 'ACTIVE',
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedKeyword, category]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = useCallback(() => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setFormMode('CREATE');
    setFormError(null);
  }, []);

  const openEdit = useCallback((t: DocTemplateRecord) => {
    setForm({
      templateName: t.templateName,
      category: t.category,
      fileUrl: t.fileUrl,
      fileType: t.fileType,
      description: t.description ?? '',
      versionNote: '',
    });
    setEditingId(t.templateId);
    setFormMode('EDIT');
    setFormError(null);
  }, []);

  const openReplaceFile = useCallback((t: DocTemplateRecord) => {
    setForm({ ...EMPTY_FORM, fileUrl: t.fileUrl, fileType: t.fileType });
    setEditingId(t.templateId);
    setFormMode('REPLACE_FILE');
    setFormError(null);
  }, []);

  const closeForm = useCallback(() => {
    setFormMode(null);
    setEditingId(null);
    setFormError(null);
  }, []);

  const setFormField = useCallback((field: keyof DocFormState, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleSave = useCallback(async (): Promise<boolean> => {
    setFormError(null);
    if (!form.templateName.trim() && formMode !== 'REPLACE_FILE') {
      setFormError('模板名称为必填项');
      return false;
    }
    if (!form.fileUrl.trim()) {
      setFormError('文件 URL 为必填项');
      return false;
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
      closeForm();
      await load();
      return true;
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '操作失败');
      return false;
    } finally {
      setSaving(false);
    }
  }, [form, formMode, editingId, closeForm, load]);

  const handleToggle = useCallback(async (t: DocTemplateRecord) => {
    const next = t.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    await toggleDocTemplate(t.templateId, next);
    await load();
  }, [load]);

  return {
    items,
    total,
    loading,
    error,
    keyword,
    category,
    page,
    pageSize,
    setKeyword,
    setCategory,
    setPage,
    refresh: load,
    formMode,
    editingId,
    form,
    saving,
    formError,
    openCreate,
    openEdit,
    openReplaceFile,
    closeForm,
    setFormField,
    handleSave,
    handleToggle,
  };
}
