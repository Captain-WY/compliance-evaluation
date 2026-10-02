import {toast} from 'sonner';
import React, { useEffect, useState } from 'react';
import {
  listDictTypes, getDictTree, createDictItem, updateDictItem, deleteDictItem,
  type DictTypeRecord, type DictItemRecord,
} from '../../services/case';
import { BookOpen, ChevronRight, ChevronDown, Plus, Pencil, Trash2, Loader2, RefreshCw, ToggleLeft, ToggleRight } from 'lucide-react';
import Button from '../../components/ui/Button';

// ── DictItemForm ────────────────────────────────────────────────────────────

interface DictItemFormProps {
  dictType: string;
  parentId?: string | null;
  existing?: DictItemRecord | null;
  onSave: () => void;
  onCancel: () => void;
}

const DictItemForm: React.FC<DictItemFormProps> = ({ dictType, parentId, existing, onSave, onCancel }) => {
  const [dictCode, setDictCode] = useState(existing?.dictCode ?? '');
  const [dictName, setDictName] = useState(existing?.dictName ?? '');
  const [remark, setRemark] = useState(existing?.remark ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    try {
    if (!dictName.trim()) return;
    setSaving(true);
    if (existing) {
      await updateDictItem({ dictId: existing.dictId, version: existing.version, sortOrder: existing.sortOrder, isActive: existing.isActive, dictName: dictName.trim(), remark: remark.trim() || null });
    } else {
      if (!dictCode.trim()) { setSaving(false); return; }
      await createDictItem({ dictType, dictCode: dictCode.trim(), dictName: dictName.trim(), parentId: parentId ?? null, remark: remark.trim() || null });
    }
    setSaving(false);
    onSave();
  
    } catch(error) { toast.error(error instanceof Error ? error.message : '操作失败，请重试'); } finally {setSaving(false);}
  };

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
      {!existing && (
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">字典编码 <span className="text-red-500">*</span></label>
          <input
            className="w-full border border-slate-300 rounded px-3 py-1.5 text-sm font-mono focus:ring-2 focus:ring-brand-500 outline-none"
            placeholder="如 BUSINESS_LINE / CIVIL_LITIGATION"
            value={dictCode}
            onChange={e => setDictCode(e.target.value.toUpperCase())}
          />
        </div>
      )}
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">显示名称 <span className="text-red-500">*</span></label>
        <input
          className="w-full border border-slate-300 rounded px-3 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
          placeholder="如 业务线 / 一般民事诉讼"
          value={dictName}
          onChange={e => setDictName(e.target.value)}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">备注（可选）</label>
        <input
          className="w-full border border-slate-300 rounded px-3 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
          placeholder=""
          value={remark}
          onChange={e => setRemark(e.target.value)}
        />
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={onCancel}>取消</Button>
        <Button size="sm" isLoading={saving} onClick={handleSave} disabled={!dictName.trim() || (!existing && !dictCode.trim())}>
          保存
        </Button>
      </div>
    </div>
  );
};

// ── DictTreeNode ────────────────────────────────────────────────────────────

interface DictTreeNodeProps {
  node: DictItemRecord;
  dictType: string;
  depth: number;
  onRefresh: () => void;
}

const DictTreeNode: React.FC<DictTreeNodeProps> = ({ node, dictType, depth, onRefresh }) => {
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState(false);
  const [addingChild, setAddingChild] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState(false);

  const protectedItem = node.isSystem || ['LOCKED','READ_ONLY','SYSTEM_ONLY','PROTECTED'].includes(node.editPolicy || '');
  const hasChildren = node.children && node.children.length > 0;

  const handleDelete = async () => {
    try {
    if (!window.confirm(`确认删除字典项「${node.dictName}」？此操作不可撤销。`)) return;
    setDeleting(true);
    await deleteDictItem(node.dictId);
    setDeleting(false);
    onRefresh();
  
    } catch(error) { toast.error(error instanceof Error ? error.message : '操作失败，请重试'); } finally {setDeleting(false);}
  };

  const handleToggle = async () => {
    try {
    setToggling(true);
    await updateDictItem({ dictId: node.dictId, version: node.version, dictName: node.dictName, sortOrder: node.sortOrder, isActive: !node.isActive });
    setToggling(false);
    onRefresh();
  
    } catch(error) { toast.error(error instanceof Error ? error.message : '操作失败，请重试'); } finally {setToggling(false);}
  };

  return (
    <div>
      <div
        className="flex items-center gap-2 py-1.5 px-2 hover:bg-slate-50 rounded group"
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
      >
        <button onClick={() => setExpanded(v => !v)} className="w-4 h-4 flex items-center justify-center text-slate-400 shrink-0">
          {hasChildren ? (expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />) : <span className="w-3.5" />}
        </button>
        <span className="font-mono text-xs text-slate-400 w-48 truncate shrink-0">{node.dictCode}</span>
        <span className={`text-sm flex-1 truncate ${node.isActive ? 'text-slate-800' : 'text-slate-400 line-through'}`}>{node.dictName}</span>
        <span className="text-xs text-slate-400">{node.namespace}{protectedItem ? ' · 受保护' : ''}</span>
        {node.remark && <span className="text-xs text-slate-400 truncate max-w-[120px] hidden lg:block">{node.remark}</span>}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {depth < 2 && (
            <button onClick={() => setAddingChild(v => !v)} className="p-1 rounded hover:bg-brand-50 text-slate-400 hover:text-brand-600" title="添加子项">
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
          <button onClick={() => setEditing(v => !v)} className="p-1 rounded hover:bg-brand-50 text-slate-400 hover:text-brand-600" title="编辑">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={handleToggle} disabled={toggling || protectedItem} className="p-1 rounded hover:bg-brand-50 text-slate-400 hover:text-amber-600" title={node.isActive ? '禁用' : '启用'}>
            {node.isActive ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
          </button>
          <button onClick={handleDelete} disabled={deleting || protectedItem} className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-600" title="删除">
            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {editing && (
        <div style={{ paddingLeft: `${depth * 20 + 32}px`, paddingRight: '8px', paddingBottom: '8px' }}>
          <DictItemForm dictType={dictType} existing={node} onSave={() => { setEditing(false); onRefresh(); }} onCancel={() => setEditing(false)} />
        </div>
      )}

      {addingChild && (
        <div style={{ paddingLeft: `${(depth + 1) * 20 + 32}px`, paddingRight: '8px', paddingBottom: '8px' }}>
          <DictItemForm dictType={dictType} parentId={node.dictId} onSave={() => { setAddingChild(false); onRefresh(); }} onCancel={() => setAddingChild(false)} />
        </div>
      )}

      {expanded && hasChildren && node.children!.map(child => (
        <DictTreeNode key={child.dictId} node={child} dictType={dictType} depth={depth + 1} onRefresh={onRefresh} />
      ))}
    </div>
  );
};

// ── DictAdmin (main) ────────────────────────────────────────────────────────

const DictAdmin: React.FC = () => {
  const [types, setTypes] = useState<DictTypeRecord[]>([]);
  const [selectedType, setSelectedType] = useState<string | null>(new URLSearchParams(window.location.search).get('type'));
  const [tree, setTree] = useState<DictItemRecord[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(true);
  const [loadingTree, setLoadingTree] = useState(false);
  const [addingRoot, setAddingRoot] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');

  const loadTypes = async () => {
    try {
    setLoadingTypes(true);
    const data = await listDictTypes();
    setTypes(data);
    if (data.length > 0 && !selectedType) setSelectedType(data[0].dictType);
    setLoadingTypes(false);
  
    } catch(error) { toast.error(error instanceof Error ? error.message : '操作失败，请重试'); } finally {setLoadingTypes(false);}
  };

  const loadTree = async () => {
    try {
    if (!selectedType) return;
    setLoadingTree(true);
    const data = await getDictTree(selectedType);
    setTree(data);
    setLoadingTree(false);
  
    } catch(error) { toast.error(error instanceof Error ? error.message : '操作失败，请重试'); } finally {setLoadingTree(false);}
  };

  useEffect(() => { loadTypes(); }, []);
  useEffect(() => { loadTree(); }, [selectedType]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-brand-500" /> 系统字典管理
        </h2>
        <Button size="sm" variant="ghost" onClick={loadTypes}>
          <RefreshCw className="w-4 h-4 mr-1" /> 刷新
        </Button>
      </div>

      <div className="flex gap-4">
        {/* 左侧: 字典类型列表 */}
        <div className="w-56 shrink-0 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 text-xs font-semibold text-slate-500 uppercase tracking-wider">字典类型</div>
          {loadingTypes ? (
            <div className="p-6 text-center"><Loader2 className="w-5 h-5 animate-spin text-slate-300 mx-auto" /></div>
          ) : types.length === 0 ? (
            <div className="p-4 text-xs text-slate-400 text-center">暂无字典类型</div>
          ) : (
            <div className="py-2">
              {types.map(t => (
                <button
                  key={t.dictType}
                  onClick={() => setSelectedType(t.dictType)}
                  className={`w-full text-left px-4 py-2 text-sm transition-colors ${selectedType === t.dictType ? 'bg-brand-50 text-brand-700 font-semibold' : 'text-slate-700 hover:bg-slate-50'}`}
                >
                  <div className="truncate">{t.dictType}</div>
                  <div className="text-[10px] text-slate-400">{t.itemCount} 项</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 右侧: 字典树 */}
        <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-700">
              {selectedType ?? '请选择字典类型'}
            </div>
            {selectedType && (
              <Button size="sm" onClick={() => setAddingRoot(v => !v)}>
                <Plus className="w-4 h-4 mr-1" /> 新增根节点
              </Button>
            )}
          </div>

          {addingRoot && selectedType && (
            <div className="px-4 pt-3 pb-0">
              <DictItemForm
                dictType={selectedType}
                onSave={() => { setAddingRoot(false); setNewTypeName(''); loadTree(); }}
                onCancel={() => { setAddingRoot(false); setNewTypeName(''); }}
              />
            </div>
          )}

          {loadingTree ? (
            <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin text-slate-300 mx-auto" /></div>
          ) : !selectedType ? (
            <div className="p-8 text-center text-sm text-slate-400">请在左侧选择字典类型</div>
          ) : tree.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">该字典类型下暂无数据项</div>
          ) : (
            <div className="py-2">
              <div className="flex items-center gap-2 px-2 pb-2 text-xs font-medium text-slate-400 border-b border-slate-100">
                <span className="w-4 shrink-0" />
                <span className="w-48 shrink-0">编码</span>
                <span>名称</span>
              </div>
              {tree.map(node => (
                <DictTreeNode key={node.dictId} node={node} dictType={selectedType} depth={0} onRefresh={loadTree} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DictAdmin;
