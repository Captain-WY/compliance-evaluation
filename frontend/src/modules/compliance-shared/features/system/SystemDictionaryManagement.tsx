import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Braces,
  CheckCircle2,
  Loader2,
  LockKeyhole,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '../../contexts/AuthContext';
import { systemApi } from '../../services/api';
import type {
  DictionaryAdminItem,
  DictionaryAdminTypeSummary,
} from '../../services/api';

type ActiveFilter = 'all' | 'active' | 'inactive';
type FormMode = 'create' | 'edit';

interface DictionaryFormState {
  dictType: string;
  dictCode: string;
  label: string;
  labelEn: string;
  sortOrder: string;
  active: boolean;
  description: string;
  uiMetaText: string;
}

const SYSTEM_ADMIN_PERMISSION = 'PERM-SYSTEM-ADMIN';
const PAGE_SIZE = 50;

const policyLabelMap: Record<string, string> = {
  ADMIN_EDITABLE: '管理员可维护',
  SEEDED_LOCKED: '预置锁定',
  SYSTEM_LOCKED: '系统锁定',
};

const defaultFormState = (dictType = ''): DictionaryFormState => ({
  dictType,
  dictCode: '',
  label: '',
  labelEn: '',
  sortOrder: '0',
  active: true,
  description: '',
  uiMetaText: '{}',
});

const formStateFromItem = (item: DictionaryAdminItem): DictionaryFormState => ({
  dictType: item.dictType,
  dictCode: item.dictCode,
  label: item.label,
  labelEn: item.labelEn ?? '',
  sortOrder: String(item.sortOrder),
  active: item.active,
  description: item.description ?? '',
  uiMetaText: JSON.stringify(item.uiMeta ?? {}, null, 2),
});

const errorText = (error: unknown, fallback: string) => {
  if (error instanceof Error) return error.message;
  return fallback;
};

const isForbiddenError = (error: unknown) => {
  return typeof error === 'object'
    && error !== null
    && 'status' in error
    && Number((error as { status?: number }).status) === 403;
};

const isSystemLocked = (item: DictionaryAdminItem) => item.editPolicy === 'SYSTEM_LOCKED';
const isDeleteLocked = (item: DictionaryAdminItem) =>
  item.isSystem || item.editPolicy === 'SYSTEM_LOCKED' || item.editPolicy === 'SEEDED_LOCKED';

const compactJson = (value: Record<string, unknown>) => JSON.stringify(value ?? {});

export default function SystemDictionaryManagement() {
  const { user } = useAuth();
  const hasSystemAdmin = user?.permissionIds.includes(SYSTEM_ADMIN_PERMISSION) ?? false;

  const [types, setTypes] = useState<DictionaryAdminTypeSummary[]>([]);
  const [selectedType, setSelectedType] = useState('');
  const [items, setItems] = useState<DictionaryAdminItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('all');
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [isLoadingTypes, setIsLoadingTypes] = useState(false);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [permissionError, setPermissionError] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<FormMode>('create');
  const [editingItem, setEditingItem] = useState<DictionaryAdminItem | null>(null);
  const [formState, setFormState] = useState<DictionaryFormState>(() => defaultFormState());
  const [formOpen, setFormOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const selectedTypeSummary = useMemo(
    () => types.find(item => item.dictType === selectedType),
    [selectedType, types],
  );

  const canUseSortControls = useMemo(
    () => !keyword.trim() && activeFilter === 'all' && !includeDeleted,
    [activeFilter, includeDeleted, keyword],
  );

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const loadTypes = useCallback(async () => {
    if (!hasSystemAdmin) return;
    setIsLoadingTypes(true);
    setLoadError(null);
    setPermissionError(false);
    try {
      const response = await systemApi.getDictionaryAdminTypes();
      setTypes(response.items);
      setSelectedType(current => {
        if (current && response.items.some(item => item.dictType === current)) return current;
        return response.items[0]?.dictType ?? '';
      });
    } catch (error) {
      if (isForbiddenError(error)) setPermissionError(true);
      setLoadError(errorText(error, '字典类型加载失败'));
    } finally {
      setIsLoadingTypes(false);
    }
  }, [hasSystemAdmin]);

  const loadItems = useCallback(async () => {
    if (!hasSystemAdmin || !selectedType) return;
    setIsLoadingItems(true);
    setLoadError(null);
    setPermissionError(false);
    try {
      const response = await systemApi.getDictionaryAdminItems({
        dictType: selectedType,
        keyword: keyword.trim() || undefined,
        active: activeFilter === 'all' ? undefined : activeFilter === 'active',
        includeDeleted,
        page,
        pageSize: PAGE_SIZE,
      });
      setItems(response.items);
      setTotal(response.total);
    } catch (error) {
      if (isForbiddenError(error)) setPermissionError(true);
      setLoadError(errorText(error, '字典项加载失败'));
    } finally {
      setIsLoadingItems(false);
    }
  }, [activeFilter, hasSystemAdmin, includeDeleted, keyword, page, selectedType]);

  useEffect(() => {
    void loadTypes();
  }, [loadTypes]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  useEffect(() => {
    setPage(1);
  }, [activeFilter, includeDeleted, keyword, selectedType]);

  const refreshAll = async () => {
    await loadTypes();
    await loadItems();
  };

  const openCreateForm = () => {
    setFormMode('create');
    setEditingItem(null);
    setFormState(defaultFormState(selectedType));
    setFormError(null);
    setFormOpen(true);
  };

  const openEditForm = (item: DictionaryAdminItem) => {
    setFormMode('edit');
    setEditingItem(item);
    setFormState(formStateFromItem(item));
    setFormError(null);
    setFormOpen(true);
  };

  const updateForm = <K extends keyof DictionaryFormState>(key: K, value: DictionaryFormState[K]) => {
    setFormState(previous => ({ ...previous, [key]: value }));
  };

  const submitForm = async () => {
    setFormError(null);
    const dictType = formState.dictType.trim();
    const dictCode = formState.dictCode.trim();
    const label = formState.label.trim();
    if (!dictType || !dictCode || !label) {
      setFormError('字典类型、编码和展示名必填');
      return;
    }

    const sortOrder = Number.parseInt(formState.sortOrder, 10);
    if (!Number.isFinite(sortOrder)) {
      setFormError('排序值必须是整数');
      return;
    }

    let uiMeta: Record<string, unknown>;
    try {
      const parsed = JSON.parse(formState.uiMetaText || '{}');
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setFormError('uiMeta 必须是 JSON object');
        return;
      }
      uiMeta = parsed as Record<string, unknown>;
    } catch {
      setFormError('uiMeta JSON 解析失败');
      return;
    }

    const basePayload = {
      label,
      labelEn: formState.labelEn.trim() || null,
      sortOrder,
      active: formState.active,
      description: formState.description.trim() || null,
      uiMeta,
    };

    setSavingId('form');
    try {
      if (formMode === 'edit' && editingItem) {
        if (isSystemLocked(editingItem)) {
          setFormError('SYSTEM_LOCKED 字典项不可编辑');
          return;
        }
        await systemApi.updateDictionaryAdminItem(editingItem.dictId, {
          ...basePayload,
          version: editingItem.version,
        });
        toast.success('字典项已更新');
      } else {
        const created = await systemApi.createDictionaryAdminItem({
          ...basePayload,
          dictType,
          dictCode,
        });
        setSelectedType(created.dictType);
        toast.success('字典项已新增');
      }
      setFormOpen(false);
      await refreshAll();
    } catch (error) {
      setFormError(errorText(error, '字典项保存失败'));
    } finally {
      setSavingId(null);
    }
  };

  const toggleActive = async (item: DictionaryAdminItem) => {
    if (isSystemLocked(item) || item.isDeleted) return;
    setSavingId(item.dictId);
    try {
      await systemApi.updateDictionaryAdminItem(item.dictId, {
        version: item.version,
        active: !item.active,
      });
      toast.success(item.active ? '字典项已停用' : '字典项已启用');
      await refreshAll();
    } catch (error) {
      toast.error(errorText(error, '启停操作失败'));
    } finally {
      setSavingId(null);
    }
  };

  const deleteItem = async (item: DictionaryAdminItem) => {
    if (isDeleteLocked(item) || item.isDeleted) return;
    const confirmed = window.confirm(`确认删除字典项「${item.label}」？`);
    if (!confirmed) return;
    setSavingId(item.dictId);
    try {
      await systemApi.deleteDictionaryAdminItem(item.dictId, item.version);
      toast.success('字典项已软删除');
      await refreshAll();
    } catch (error) {
      toast.error(errorText(error, '删除失败'));
    } finally {
      setSavingId(null);
    }
  };

  const moveItem = async (item: DictionaryAdminItem, direction: -1 | 1) => {
    if (!canUseSortControls || isSystemLocked(item) || item.isDeleted) return;
    const sorted = [...items]
      .filter(row => !row.isDeleted)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.dictCode.localeCompare(b.dictCode));
    const index = sorted.findIndex(row => row.dictId === item.dictId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= sorted.length) return;
    const reordered = [...sorted];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];

    setSavingId(item.dictId);
    try {
      await systemApi.sortDictionaryAdminItems(
        reordered.map((row, rowIndex) => ({
          dictId: row.dictId,
          sortOrder: (rowIndex + 1) * 10,
          version: row.version,
        })),
      );
      toast.success('排序已保存');
      await refreshAll();
    } catch (error) {
      toast.error(errorText(error, '排序保存失败'));
    } finally {
      setSavingId(null);
    }
  };

  if (!hasSystemAdmin) {
    return (
      <div
        data-testid="system-dictionary-no-permission"
        className="flex min-h-[560px] w-full items-center justify-center bg-slate-50 p-8"
      >
        <div className="w-full max-w-md rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
          <LockKeyhole className="mx-auto mb-3 h-8 w-8 text-amber-600" />
          <h1 className="text-lg font-semibold text-slate-900">无系统管理权限</h1>
          <p className="mt-2 text-sm text-slate-600">当前账号未授予 PERM-SYSTEM-ADMIN。</p>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="system-dictionary-page" className="flex h-full min-h-[calc(100vh-80px)] flex-col bg-slate-50">
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900">字典管理</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
              <span data-testid="system-dictionary-selected-type">{(selectedTypeSummary?.typeLabel ?? selectedType) || '未选择类型'}</span>
              {selectedTypeSummary && (
                <Badge variant="secondary" className="bg-slate-100 text-slate-600">
                  {selectedTypeSummary.activeCount}/{selectedTypeSummary.itemCount} 启用
                </Badge>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={refreshAll}
              disabled={isLoadingTypes || isLoadingItems}
              data-testid="system-dictionary-refresh"
            >
              <RefreshCw className={isLoadingTypes || isLoadingItems ? 'animate-spin' : ''} />
              刷新
            </Button>
            <Button
              onClick={openCreateForm}
              disabled={!selectedType}
              className="bg-indigo-600 text-white hover:bg-indigo-700"
              data-testid="system-dictionary-create"
            >
              <Plus />
              新增
            </Button>
          </div>
        </div>
      </div>

      {permissionError && (
        <div className="border-b border-amber-200 bg-amber-50 px-6 py-3 text-sm text-amber-800" data-testid="system-dictionary-permission-error">
          <AlertCircle className="mr-2 inline h-4 w-4" />
          当前账号无法访问字典管理 API。
        </div>
      )}

      {loadError && !permissionError && (
        <div className="border-b border-rose-200 bg-rose-50 px-6 py-3 text-sm text-rose-700" data-testid="system-dictionary-error">
          <AlertCircle className="mr-2 inline h-4 w-4" />
          {loadError}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-80 shrink-0 overflow-y-auto border-r border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">字典类型</h2>
            {isLoadingTypes && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
          </div>
          <div className="space-y-2" data-testid="system-dictionary-type-list">
            {types.map(item => {
              const selected = item.dictType === selectedType;
              return (
                <button
                  key={item.dictType}
                  type="button"
                  onClick={() => setSelectedType(item.dictType)}
                  data-testid={`system-dictionary-type-${item.dictType}`}
                  className={`w-full rounded-md border p-3 text-left transition-colors ${
                    selected
                      ? 'border-indigo-200 bg-indigo-50 text-indigo-800'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{item.typeLabel}</span>
                    <Badge variant="secondary" className={selected ? 'bg-white text-indigo-700' : 'bg-slate-100 text-slate-600'}>
                      {item.itemCount}
                    </Badge>
                  </div>
                  <div className="mt-1 truncate font-mono text-xs text-slate-500">{item.dictType}</div>
                  <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                    <span>{item.activeCount} 启用</span>
                    <span>{item.inactiveCount} 停用</span>
                  </div>
                </button>
              );
            })}
            {!isLoadingTypes && types.length === 0 && (
              <div className="rounded-md border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">
                暂无字典类型
              </div>
            )}
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="border-b border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-64 flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={keyword}
                  onChange={event => setKeyword(event.target.value)}
                  placeholder="搜索 label / code / description"
                  className="pl-9"
                  data-testid="system-dictionary-search"
                />
              </div>
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-slate-400" />
                <select
                  value={activeFilter}
                  onChange={event => setActiveFilter(event.target.value as ActiveFilter)}
                  className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700"
                  data-testid="system-dictionary-active-filter"
                >
                  <option value="all">全部状态</option>
                  <option value="active">仅启用</option>
                  <option value="inactive">仅停用</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={includeDeleted}
                  onChange={event => setIncludeDeleted(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                  data-testid="system-dictionary-include-deleted"
                />
                包含已删除
              </label>
            </div>
          </div>

          <div className="flex-1 overflow-auto bg-white">
            <Table data-testid="system-dictionary-items-table">
              <TableHeader className="sticky top-0 z-10 bg-slate-50">
                <TableRow>
                  <TableHead className="min-w-44">展示名</TableHead>
                  <TableHead className="min-w-36">编码</TableHead>
                  <TableHead className="w-24">排序</TableHead>
                  <TableHead className="w-28">状态</TableHead>
                  <TableHead className="w-32">策略</TableHead>
                  <TableHead className="min-w-44">UI 元数据</TableHead>
                  <TableHead className="w-20">版本</TableHead>
                  <TableHead className="w-44 text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, index) => {
                  const rowSaving = savingId === item.dictId;
                  const editDisabled = item.isDeleted || isSystemLocked(item);
                  const deleteDisabled = item.isDeleted || isDeleteLocked(item);
                  const toggleDisabled = item.isDeleted || isSystemLocked(item);
                  const sortDisabled = !canUseSortControls || item.isDeleted || isSystemLocked(item);
                  return (
                    <TableRow
                      key={item.dictId}
                      data-testid={`system-dictionary-row-${item.dictId}`}
                      className={item.isDeleted ? 'bg-slate-50 text-slate-400' : ''}
                    >
                      <TableCell className="whitespace-normal">
                        <div className="font-semibold text-slate-900">{item.label}</div>
                        {item.labelEn && <div className="text-xs text-slate-500">{item.labelEn}</div>}
                        {item.parentId && <div className="text-xs text-slate-400">parent: {item.parentId}</div>}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-slate-600">{item.dictCode}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <span className="w-8 text-sm text-slate-700">{item.sortOrder}</span>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            disabled={sortDisabled || index === 0 || rowSaving}
                            onClick={() => moveItem(item, -1)}
                            title="上移"
                            data-testid={`system-dictionary-sort-up-${item.dictId}`}
                          >
                            <ArrowUp />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            disabled={sortDisabled || index === items.length - 1 || rowSaving}
                            onClick={() => moveItem(item, 1)}
                            title="下移"
                            data-testid={`system-dictionary-sort-down-${item.dictId}`}
                          >
                            <ArrowDown />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        {item.isDeleted ? (
                          <Badge variant="secondary" className="bg-slate-100 text-slate-500">已删除</Badge>
                        ) : item.active ? (
                          <Badge variant="secondary" className="bg-emerald-50 text-emerald-700">
                            <CheckCircle2 className="mr-1 h-3 w-3" />
                            启用
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-amber-50 text-amber-700">停用</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={isSystemLocked(item) ? 'border-slate-300 text-slate-500' : 'border-indigo-200 text-indigo-700'}>
                          {isSystemLocked(item) && <LockKeyhole className="mr-1 h-3 w-3" />}
                          {policyLabelMap[item.editPolicy] ?? item.editPolicy}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[220px] whitespace-normal break-words">
                        <div className="flex items-start gap-2 text-xs text-slate-600">
                          <Braces className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                          <code>{compactJson(item.uiMeta)}</code>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-slate-500">v{item.version}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          {rowSaving ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : null}
                          <Switch
                            checked={item.active}
                            disabled={toggleDisabled || rowSaving}
                            onCheckedChange={() => toggleActive(item)}
                            title={item.active ? '停用' : '启用'}
                            data-testid={`system-dictionary-toggle-${item.dictId}`}
                          />
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            disabled={editDisabled || rowSaving}
                            onClick={() => openEditForm(item)}
                            title="编辑"
                            data-testid={`system-dictionary-edit-${item.dictId}`}
                          >
                            <Pencil />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            disabled={deleteDisabled || rowSaving}
                            onClick={() => deleteItem(item)}
                            title="删除"
                            data-testid={`system-dictionary-delete-${item.dictId}`}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {isLoadingItems && (
              <div className="flex h-48 items-center justify-center text-sm text-slate-500" data-testid="system-dictionary-loading">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                正在加载字典项
              </div>
            )}

            {!isLoadingItems && items.length === 0 && (
              <div className="flex h-48 items-center justify-center text-sm text-slate-500" data-testid="system-dictionary-empty">
                当前筛选条件下没有字典项
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
            <span data-testid="system-dictionary-total">共 {total} 项</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}>
                上一页
              </Button>
              <span data-testid="system-dictionary-page-index">{page} / {pageCount}</span>
              <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage(value => Math.min(pageCount, value + 1))}>
                下一页
              </Button>
            </div>
          </div>
        </main>
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-[680px]" data-testid="system-dictionary-form-dialog">
          <DialogHeader>
            <DialogTitle>{formMode === 'create' ? '新增字典项' : '编辑字典项'}</DialogTitle>
            <DialogDescription>
              {formMode === 'create' ? '创建后 dictType / dictCode / parentId 不可修改。' : editingItem?.dictId}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm text-slate-700">
              <span>字典类型</span>
              <Input
                value={formState.dictType}
                disabled={formMode === 'edit'}
                onChange={event => updateForm('dictType', event.target.value)}
                data-testid="system-dictionary-form-dict-type"
              />
            </label>
            <label className="space-y-1 text-sm text-slate-700">
              <span>编码</span>
              <Input
                value={formState.dictCode}
                disabled={formMode === 'edit'}
                onChange={event => updateForm('dictCode', event.target.value)}
                data-testid="system-dictionary-form-dict-code"
              />
            </label>
            <label className="space-y-1 text-sm text-slate-700">
              <span>展示名</span>
              <Input
                value={formState.label}
                onChange={event => updateForm('label', event.target.value)}
                data-testid="system-dictionary-form-label"
              />
            </label>
            <label className="space-y-1 text-sm text-slate-700">
              <span>英文名</span>
              <Input
                value={formState.labelEn}
                onChange={event => updateForm('labelEn', event.target.value)}
                data-testid="system-dictionary-form-label-en"
              />
            </label>
            <label className="space-y-1 text-sm text-slate-700">
              <span>排序</span>
              <Input
                type="number"
                value={formState.sortOrder}
                onChange={event => updateForm('sortOrder', event.target.value)}
                data-testid="system-dictionary-form-sort-order"
              />
            </label>
            <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
              <span className="text-sm text-slate-700">启用</span>
              <Switch
                checked={formState.active}
                onCheckedChange={checked => updateForm('active', checked)}
                data-testid="system-dictionary-form-active"
              />
            </div>
            <label className="space-y-1 text-sm text-slate-700 md:col-span-2">
              <span>描述</span>
              <Textarea
                value={formState.description}
                onChange={event => updateForm('description', event.target.value)}
                data-testid="system-dictionary-form-description"
              />
            </label>
            <label className="space-y-1 text-sm text-slate-700 md:col-span-2">
              <span>uiMeta JSON</span>
              <Textarea
                value={formState.uiMetaText}
                onChange={event => updateForm('uiMetaText', event.target.value)}
                className="min-h-28 font-mono text-xs"
                data-testid="system-dictionary-form-ui-meta"
              />
            </label>
          </div>

          {formError && (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700" data-testid="system-dictionary-form-error">
              <AlertCircle className="mr-2 inline h-4 w-4" />
              {formError}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={savingId === 'form'}>
              取消
            </Button>
            <Button
              onClick={submitForm}
              disabled={savingId === 'form' || (formMode === 'edit' && editingItem ? isSystemLocked(editingItem) : false)}
              data-testid="system-dictionary-form-save"
              className="bg-indigo-600 text-white hover:bg-indigo-700"
            >
              {savingId === 'form' && <Loader2 className="animate-spin" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
