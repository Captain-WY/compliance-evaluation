import {toast} from 'sonner';
import React, { useEffect, useState } from 'react';
import {
  getMenuTree, createMenu, updateMenu, deleteMenu,
  type MenuNode,
} from '../../services/case';
import {
  Menu, Plus, Pencil, Trash2, Loader2, RefreshCw,
  ChevronRight, ChevronDown, ToggleLeft, ToggleRight,
} from 'lucide-react';
import Button from '../../components/ui/Button';

const MENU_TYPE_LABEL: Record<string, string> = { DIR: '目录', MENU: '菜单', BUTTON: '按钮' };
const MENU_TYPE_COLOR: Record<string, string> = {
  DIR: 'bg-purple-50 text-purple-700 border-purple-100',
  MENU: 'bg-blue-50 text-blue-700 border-blue-100',
  BUTTON: 'bg-slate-100 text-slate-500 border-slate-200',
};

// ── MenuForm ────────────────────────────────────────────────────────────────

interface MenuFormProps {
  parentId?: string | null;
  parentType?: MenuNode['menuType'] | null;
  existing?: MenuNode | null;
  onSave: () => void;
  onCancel: () => void;
}

const MenuForm: React.FC<MenuFormProps> = ({ parentId, parentType, existing, onSave, onCancel }) => {
  const allowedTypes: MenuNode['menuType'][] = existing
    ? [existing.menuType]
    : parentType === 'DIR' ? ['MENU']
    : parentType === 'MENU' ? ['BUTTON']
    : ['DIR'];

  const [menuName, setMenuName] = useState(existing?.menuName ?? '');
  const [menuType, setMenuType] = useState<MenuNode['menuType']>(existing?.menuType ?? allowedTypes[0]);
  const [path, setPath] = useState(existing?.path ?? '');
  const [permissionKey, setPermissionKey] = useState(existing?.permissionKey ?? '');
  const [icon, setIcon] = useState(existing?.icon ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    try {
    if (!menuName.trim()) return;
    setSaving(true);
    if (existing) {
      await updateMenu({
        menuId: existing.menuId,
        menuName: menuName.trim(),
        path: path.trim() || null,
        permissionKey: permissionKey.trim() || null,
        icon: icon.trim() || null,
      });
    } else {
      await createMenu({
        menuName: menuName.trim(),
        menuType,
        parentId: parentId ?? null,
        path: path.trim() || null,
        permissionKey: permissionKey.trim() || null,
        icon: icon.trim() || null,
      });
    }
    setSaving(false);
    onSave();
  
    } catch(error) { toast.error(error instanceof Error ? error.message : '操作失败，请重试'); } finally {setSaving(false);}
  };

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">菜单名称 <span className="text-red-500">*</span></label>
          <input
            className="w-full border border-slate-300 rounded px-3 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
            placeholder="如 案件管理"
            value={menuName}
            onChange={e => setMenuName(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">类型</label>
          <select
            className="w-full border border-slate-300 rounded px-3 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 outline-none bg-white"
            value={menuType}
            onChange={e => setMenuType(e.target.value as MenuNode['menuType'])}
            disabled={!!existing}
          >
            {allowedTypes.map(t => <option key={t} value={t}>{MENU_TYPE_LABEL[t]}</option>)}
          </select>
        </div>
      </div>
      {menuType !== 'DIR' && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">路由路径</label>
            <input
              className="w-full border border-slate-300 rounded px-3 py-1.5 text-sm font-mono focus:ring-2 focus:ring-brand-500 outline-none"
              placeholder="/cases"
              value={path}
              onChange={e => setPath(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">权限 Key</label>
            <input
              className="w-full border border-slate-300 rounded px-3 py-1.5 text-sm font-mono focus:ring-2 focus:ring-brand-500 outline-none"
              placeholder="case:view"
              value={permissionKey}
              onChange={e => setPermissionKey(e.target.value)}
            />
          </div>
        </div>
      )}
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={onCancel}>取消</Button>
        <Button size="sm" isLoading={saving} onClick={handleSave} disabled={!menuName.trim()}>
          保存
        </Button>
      </div>
    </div>
  );
};

// ── MenuTreeNode ────────────────────────────────────────────────────────────

interface MenuTreeNodeProps {
  node: MenuNode;
  depth: number;
  onRefresh: () => void;
}

const MenuTreeNode: React.FC<MenuTreeNodeProps> = ({ node, depth, onRefresh }) => {
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState(false);
  const [addingChild, setAddingChild] = useState(false);

  const canAddChild = node.menuType === 'DIR' || node.menuType === 'MENU';
  const hasChildren = node.children && node.children.length > 0;

  const handleDelete = async () => {
    try {
    if (hasChildren) { alert('请先删除子节点后再删除此节点'); return; }
    if (!window.confirm(`确认删除菜单「${node.menuName}」？`)) return;
    await deleteMenu(node.menuId);
    onRefresh();
  
    } catch(error) { toast.error(error instanceof Error ? error.message : '操作失败，请重试'); } finally {}
  };

  const handleToggle = async () => {
    try {
    await updateMenu({ menuId: node.menuId, menuName: node.menuName });
    onRefresh();
  
    } catch(error) { toast.error(error instanceof Error ? error.message : '操作失败，请重试'); } finally {}
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
        <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium border shrink-0 ${MENU_TYPE_COLOR[node.menuType]}`}>
          {MENU_TYPE_LABEL[node.menuType]}
        </span>
        <span className={`text-sm flex-1 truncate ${node.status === 'INACTIVE' ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{node.menuName}</span>
        {node.path && <span className="text-xs text-slate-400 font-mono hidden lg:block truncate max-w-[100px]">{node.path}</span>}
        {node.permissionKey && <span className="text-[10px] text-slate-400 font-mono hidden xl:block truncate max-w-[120px]">{node.permissionKey}</span>}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {canAddChild && depth < 2 && (
            <button onClick={() => setAddingChild(v => !v)} className="p-1 rounded hover:bg-brand-50 text-slate-400 hover:text-brand-600" title="添加子节点">
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
          <button onClick={() => setEditing(v => !v)} className="p-1 rounded hover:bg-brand-50 text-slate-400 hover:text-brand-600" title="编辑">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={handleToggle} className="p-1 rounded hover:bg-amber-50 text-slate-400 hover:text-amber-600" title={node.status === 'ACTIVE' ? '停用' : '启用'}>
            {node.status === 'ACTIVE' ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
          </button>
          <button onClick={handleDelete} className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-600" title="删除">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {editing && (
        <div style={{ paddingLeft: `${depth * 20 + 32}px`, paddingRight: '8px', paddingBottom: '8px' }}>
          <MenuForm existing={node} onSave={() => { setEditing(false); onRefresh(); }} onCancel={() => setEditing(false)} />
        </div>
      )}

      {addingChild && (
        <div style={{ paddingLeft: `${(depth + 1) * 20 + 32}px`, paddingRight: '8px', paddingBottom: '8px' }}>
          <MenuForm parentId={node.menuId} parentType={node.menuType} onSave={() => { setAddingChild(false); onRefresh(); }} onCancel={() => setAddingChild(false)} />
        </div>
      )}

      {expanded && hasChildren && node.children!.map(child => (
        <MenuTreeNode key={child.menuId} node={child} depth={depth + 1} onRefresh={onRefresh} />
      ))}
    </div>
  );
};

// ── MenuAdmin (main) ────────────────────────────────────────────────────────

const MenuAdmin: React.FC = () => {
  const [tree, setTree] = useState<MenuNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingRoot, setAddingRoot] = useState(false);

  const load = async () => {
    try {
    setLoading(true);
    const data = await getMenuTree();
    setTree(data);
    setLoading(false);
  
    } catch(error) { toast.error(error instanceof Error ? error.message : '操作失败，请重试'); } finally {setLoading(false);}
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <Menu className="w-5 h-5 text-brand-500" /> 菜单管理
        </h2>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={load}><RefreshCw className="w-4 h-4 mr-1" />刷新</Button>
          <Button size="sm" onClick={() => setAddingRoot(v => !v)}><Plus className="w-4 h-4 mr-1" />新增目录</Button>
        </div>
      </div>

      {addingRoot && (
        <MenuForm onSave={() => { setAddingRoot(false); load(); }} onCancel={() => setAddingRoot(false)} />
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-2 py-2 text-xs font-medium text-slate-400 border-b border-slate-100 bg-slate-50">
          <span className="w-4 shrink-0" />
          <span className="w-14 shrink-0">类型</span>
          <span className="flex-1">菜单名称</span>
          <span className="hidden lg:block w-24">路由路径</span>
          <span className="hidden xl:block w-28">权限 Key</span>
        </div>
        {loading ? (
          <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin text-slate-300 mx-auto" /></div>
        ) : tree.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">暂无菜单配置</div>
        ) : (
          <div className="py-2">
            {tree.map(node => (
              <MenuTreeNode key={node.menuId} node={node} depth={0} onRefresh={load} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MenuAdmin;
