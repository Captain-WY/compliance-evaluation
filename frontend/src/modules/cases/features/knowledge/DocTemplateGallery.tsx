import React from 'react';
import {
  Plus,
  Loader2,
  Search,
  Download,
  FileText,
  File,
  Pencil,
  RefreshCw,
  ToggleLeft,
  ToggleRight,
  X,
  Save,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
} from 'lucide-react';
import Button from '../../components/ui/Button';
import {
  useDocTemplates,
  CATEGORY_OPTIONS,
  FILE_TYPE_OPTIONS,
  EMPTY_FORM,
  type DocFormMode,
} from './hooks/useDocTemplates';
import type { DocTemplateRecord } from '../../services/case';

interface DocTemplateGalleryProps {
  isAdmin?: boolean;
}

function getFileIcon(fileType: string) {
  const t = fileType.toUpperCase();
  if (t === 'WORD' || t === 'PDF') return <FileText className="w-6 h-6" />;
  if (t === 'EXCEL') return <File className="w-6 h-6" />;
  return <File className="w-6 h-6" />;
}

function getFileIconColor(fileType: string): string {
  const t = fileType.toUpperCase();
  if (t === 'WORD') return 'bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white';
  if (t === 'PDF') return 'bg-red-50 text-red-600 group-hover:bg-red-600 group-hover:text-white';
  if (t === 'EXCEL') return 'bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white';
  return 'bg-slate-50 text-slate-600 group-hover:bg-slate-600 group-hover:text-white';
}

function SkeletonCard() {
  return (
    <div className="p-4 border border-slate-200 rounded-xl bg-white">
      <div className="flex items-start justify-between mb-3">
        <div className="w-12 h-12 bg-slate-100 rounded-lg animate-pulse" />
        <div className="w-14 h-5 bg-slate-100 rounded-full animate-pulse" />
      </div>
      <div className="w-3/4 h-4 bg-slate-100 rounded animate-pulse mb-2" />
      <div className="w-1/2 h-3 bg-slate-100 rounded animate-pulse mb-4" />
      <div className="flex items-center justify-between border-t border-slate-100 pt-3">
        <div className="w-16 h-3 bg-slate-100 rounded animate-pulse" />
        <div className="w-12 h-6 bg-slate-100 rounded animate-pulse" />
      </div>
    </div>
  );
}

function FormPanel({
  mode,
  form,
  saving,
  error,
  onClose,
  onSave,
  onChange,
}: {
  mode: DocFormMode;
  form: typeof EMPTY_FORM;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: () => void;
  onChange: (field: keyof typeof EMPTY_FORM, value: string) => void;
}) {
  if (!mode) return null;

  const title =
    mode === 'CREATE' ? '新建文档模板' :
    mode === 'EDIT' ? '编辑元数据' :
    '替换文件 (版本升级)';

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4 mb-4">
      <div className="flex justify-between items-center">
        <h4 className="text-sm font-semibold text-slate-700">{title}</h4>
        <button onClick={onClose} className="p-1 rounded hover:bg-slate-200">
          <X className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 border border-red-200 text-xs rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {mode !== 'REPLACE_FILE' && (
          <>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">模板名称 *</label>
              <input
                type="text"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                value={form.templateName}
                onChange={e => onChange('templateName', e.target.value)}
                placeholder="例如：股权纠纷起诉书模板"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">分类</label>
              <select
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-brand-500"
                value={form.category}
                onChange={e => onChange('category', e.target.value)}
              >
                {CATEGORY_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </>
        )}

        {(mode === 'CREATE' || mode === 'REPLACE_FILE') && (
          <>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">文件 URL *</label>
              <input
                type="text"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 font-mono"
                value={form.fileUrl}
                onChange={e => onChange('fileUrl', e.target.value)}
                placeholder="https://storage.sld.internal/templates/xxx.docx"
              />
              <p className="text-xs text-slate-400 mt-1">直接填写文件存储路径，无需上传</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">文件类型</label>
              <select
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-brand-500"
                value={form.fileType}
                onChange={e => onChange('fileType', e.target.value)}
              >
                {FILE_TYPE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </>
        )}

        {mode === 'REPLACE_FILE' && (
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">版本说明</label>
            <input
              type="text"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
              value={form.versionNote}
              onChange={e => onChange('versionNote', e.target.value)}
              placeholder="例如：更新赔偿计算公式"
            />
          </div>
        )}

        {mode !== 'REPLACE_FILE' && (
          <div className={mode === 'EDIT' ? 'md:col-span-2' : ''}>
            <label className="block text-xs font-medium text-slate-600 mb-1">备注描述</label>
            <input
              type="text"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
              value={form.description}
              onChange={e => onChange('description', e.target.value)}
              placeholder="模板用途说明"
            />
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>取消</Button>
        <Button size="sm" onClick={onSave} disabled={saving}>
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Save className="w-3.5 h-3.5 mr-1" />}
          {mode === 'REPLACE_FILE' ? '替换文件' : '保存'}
        </Button>
      </div>
    </div>
  );
}

function TemplateCard({
  item,
  isAdmin,
  onEdit,
  onReplace,
  onToggle,
}: {
  item: DocTemplateRecord;
  isAdmin: boolean;
  onEdit: (t: DocTemplateRecord) => void;
  onReplace: (t: DocTemplateRecord) => void;
  onToggle: (t: DocTemplateRecord) => void;
}) {
  return (
    <div className="p-4 border border-slate-200 rounded-xl hover:border-brand-300 hover:shadow-md transition-all group bg-white flex flex-col">
      <div className="flex items-start justify-between mb-3">
        <div className={`p-3 rounded-lg transition-colors ${getFileIconColor(item.fileType)}`}>
          {getFileIcon(item.fileType)}
        </div>
        <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-1 rounded-full shrink-0">
          {item.categoryName}
        </span>
      </div>

      <h4 className="font-bold text-slate-800 mb-1 line-clamp-1" title={item.templateName}>
        {item.templateName}
      </h4>

      {item.description && (
        <p className="text-xs text-slate-400 mb-2 line-clamp-1" title={item.description}>
          {item.description}
        </p>
      )}

      <div className="flex items-center gap-2 text-xs text-slate-400 mb-3">
        <span className="bg-brand-50 text-brand-600 text-[10px] font-bold px-1.5 py-0.5 rounded">v{item.version}</span>
        <span>•</span>
        <span>更新于 {item.updatedAt ? item.updatedAt.slice(0, 10) : '—'}</span>
      </div>

      <div className="mt-auto pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
        <Button
          size="sm"
          variant="ghost"
          className="text-brand-600 hover:bg-brand-50 h-8"
          onClick={() => window.open(item.fileUrl, '_blank')}
        >
          <Download className="w-4 h-4 mr-1" /> 下载
        </Button>

        {isAdmin && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => onEdit(item)}
              className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-brand-600"
              title="编辑元数据"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onReplace(item)}
              className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-amber-600"
              title="替换文件"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onToggle(item)}
              className={`p-1.5 rounded hover:bg-slate-100 ${item.status === 'ACTIVE' ? 'text-emerald-500 hover:text-emerald-700' : 'text-slate-400 hover:text-emerald-600'}`}
              title={item.status === 'ACTIVE' ? '停用' : '启用'}
            >
              {item.status === 'ACTIVE' ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (p: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const pages: (number | string)[] = [];
  const showEllipsis = totalPages > 7;

  if (!showEllipsis) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    if (page <= 3) {
      pages.push(1, 2, 3, 4, '...', totalPages);
    } else if (page >= totalPages - 2) {
      pages.push(1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
    } else {
      pages.push(1, '...', page - 1, page, page + 1, '...', totalPages);
    }
  }

  return (
    <div className="flex items-center justify-center gap-2 py-4">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <ChevronLeft className="w-4 h-4 text-slate-600" />
      </button>

      {pages.map((p, i) =>
        p === '...' ? (
          <span key={`ellipsis-${i}`} className="px-2 text-slate-400 text-sm">...</span>
        ) : (
          <button
            key={p}
            onClick={() => onPageChange(p as number)}
            className={`min-w-[2rem] h-8 px-2 rounded-lg text-sm font-medium transition-colors ${
              page === p
                ? 'bg-brand-600 text-white'
                : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {p}
          </button>
        )
      )}

      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <ChevronRight className="w-4 h-4 text-slate-600" />
      </button>

      <span className="text-xs text-slate-400 ml-2">
        共 {total} 条
      </span>
    </div>
  );
}

const DocTemplateGallery: React.FC<DocTemplateGalleryProps> = ({ isAdmin = false }) => {
  const {
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
    formMode,
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
  } = useDocTemplates(12);

  const handleCategoryClick = (catValue: string | null) => {
    setCategory(catValue);
    setPage(1);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm h-full flex flex-col animate-in slide-in-from-bottom-2">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-slate-50 rounded-t-xl shrink-0">
        <h3 className="font-bold text-slate-800 flex items-center gap-2">
          <FileText className="w-5 h-5 text-brand-600" /> 常用法律文书模版
        </h3>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-none">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="搜索模版名称..."
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              className="pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 w-full sm:w-64"
            />
          </div>
          {isAdmin && (
            <Button size="sm" onClick={openCreate}>
              <Plus className="w-3.5 h-3.5 mr-1" /> 新建
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-6">
        {/* Category Pills */}
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => handleCategoryClick(null)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              category === null
                ? 'bg-slate-800 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            全部
          </button>
          {CATEGORY_OPTIONS.map(cat => (
            <button
              key={cat.value}
              onClick={() => handleCategoryClick(cat.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                category === cat.value
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Admin Form Panel */}
        {isAdmin && (
          <FormPanel
            mode={formMode}
            form={form}
            saving={saving}
            error={formError}
            onClose={closeForm}
            onSave={handleSave}
            onChange={setFormField}
          />
        )}

        {/* Loading */}
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <p className="text-sm mb-3">{error}</p>
            <Button size="sm" variant="secondary" onClick={() => window.location.reload()}>重试</Button>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <FolderOpen className="w-12 h-12 mb-3 text-slate-300" />
            <p className="text-sm">
              {keyword || category ? '未找到匹配的模版，请尝试其他关键词或分类' : '暂无文书模版'}
            </p>
          </div>
        )}

        {/* Cards Grid */}
        {!loading && !error && items.length > 0 && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map(item => (
                <TemplateCard
                  key={item.templateId}
                  item={item}
                  isAdmin={isAdmin}
                  onEdit={openEdit}
                  onReplace={openReplaceFile}
                  onToggle={handleToggle}
                />
              ))}
            </div>
            <Pagination
              page={page}
              pageSize={pageSize}
              total={total}
              onPageChange={setPage}
            />
          </>
        )}
      </div>
    </div>
  );
};

export default DocTemplateGallery;
