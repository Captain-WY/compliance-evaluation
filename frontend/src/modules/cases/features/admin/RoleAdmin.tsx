import {toast} from 'sonner';
import React, { useEffect, useState } from 'react';
import {
  listRoles, createRole, updateRole, deleteRole, toggleRole,
  getMenuTree, getRoleMenuIds, saveRoleMenus,
  type RoleRecord, type MenuNode,
} from '../../services/case';
import {
  ShieldCheck, Plus, Pencil, Trash2, Loader2, RefreshCw,
  ToggleLeft, ToggleRight, ChevronRight, ChevronDown,
} from 'lucide-react';
import Button from '../../components/ui/Button';

// ── MenuCheckTree ───────────────────────────────────────────────────────────

interface MenuCheckTreeProps {
  nodes: MenuNode[];
  checked: Set<string>;
  onChange: (id: string, val: boolean) => void;
  depth?: number;
}

const MenuCheckTree: React.FC<MenuCheckTreeProps> = ({ nodes, checked, onChange, depth = 0 }) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(nodes.map(n => n.menuId)));

  const toggle = (id: string) => setExpanded(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  return (
    <>
      {nodes.map(node => (
        <div key={node.menuId}>
          <label
            className="flex items-center gap-2 py-1 px-2 hover:bg-slate-50 rounded cursor-pointer"
            style={{ paddingLeft: `${depth * 20 + 8}px` }}
          >
            <button
              type="button"
              onClick={e => { e.preventDefault(); toggle(node.menuId); }}
              className="w-4 h-4 shrink-0 text-slate-400"
            >
              {node.children?.length ? (expanded.has(node.menuId) ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />) : <span className="w-3.5" />}
            </button>
            <input
              type="checkbox"
              checked={checked.has(node.menuId)}
              onChange={e => onChange(node.menuId, e.target.checked)}
              className="accent-brand-600"
            />
            <span className="text-xs font-mono text-slate-400 w-20 truncate">[{node.menuType}]</span>
            <span className={`text-sm ${node.status === 'INACTIVE' ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{node.menuName}</span>
            {node.permissionKey && <span className="text-[10px] text-slate-400 font-mono truncate hidden lg:block">{node.permissionKey}</span>}
          </label>
          {expanded.has(node.menuId) && node.children?.length ? (
            <MenuCheckTree nodes={node.children} checked={checked} onChange={onChange} depth={depth + 1} />
          ) : null}
        </div>
      ))}
    </>
  );
};

// ── RoleForm ────────────────────────────────────────────────────────────────

interface RoleFormProps {
  existing?: RoleRecord | null;
  onSave: () => void;
  onCancel: () => void;
}

const RoleForm: React.FC<RoleFormProps> = ({ existing, onSave, onCancel }) => {
  const [roleCode, setRoleCode] = useState(existing?.roleCode ?? '');
  const [roleName, setRoleName] = useState(existing?.roleName ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    try {
    if (!roleName.trim()) return;
    setSaving(true);
    if (existing) {
      await updateRole({ roleId: existing.roleId, roleName: roleName.trim(), description: description.trim() || null });
    } else {
      if (!roleCode.trim()) { setSaving(false); return; }
      await createRole({ roleCode: roleCode.trim(), roleName: roleName.trim(), description: description.trim() || null });
    }
    setSaving(false);
    onSave();
  
    } catch(error) { toast.error(error instanceof Error ? error.message : '操作失败，请重试'); } finally {setSaving(false);}
  };

  return (
    <div className="space-y-3">
      {!existing && (
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">角色编码 <span className="text-red-500">*</span></label>
          <input
            className="w-full border border-slate-300 rounded px-3 py-1.5 text-sm font-mono focus:ring-2 focus:ring-brand-500 outline-none"
            placeholder="如 LEGAL_ADMIN / BUSINESS_UNIT"
            value={roleCode}
            onChange={e => setRoleCode(e.target.value.toUpperCase())}
          />
        </div>
      )}
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">角色名称 <span className="text-red-500">*</span></label>
        <input
          className="w-full border border-slate-300 rounded px-3 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
          placeholder="如 法务管理员"
          value={roleName}
          onChange={e => setRoleName(e.target.value)}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">描述（可选）</label>
        <input
          className="w-full border border-slate-300 rounded px-3 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
          value={description}
          onChange={e => setDescription(e.target.value)}
        />
      </div>
      <div className="flex gap-2 justify-end pt-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>取消</Button>
        <Button size="sm" isLoading={saving} onClick={handleSave} disabled={!roleName.trim() || (!existing && !roleCode.trim())}>
          保存
        </Button>
      </div>
    </div>
  );
};

// ── RoleMenuPanel ───────────────────────────────────────────────────────────

interface RoleMenuPanelProps {
  role: RoleRecord;
  onClose: () => void;
}

const RoleMenuPanel: React.FC<RoleMenuPanelProps> = ({ role, onClose }) => {
  const [menuTree, setMenuTree] = useState<MenuNode[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
    try {
      setLoading(true);
      const [tree, ids] = await Promise.all([getMenuTree(), getRoleMenuIds(role.roleId)]);
      setMenuTree(tree);
      setChecked(new Set(ids));
      setLoading(false);
    
    } catch(error) { toast.error(error instanceof Error ? error.message : '操作失败，请重试'); } finally {setLoading(false);}
  };
    load();
  }, [role.roleId]);

  const handleChange = (id: string, val: boolean) => {
    setChecked(prev => {
      const next = new Set(prev);
      val ? next.add(id) : next.delete(id);
      return next;
    });
  };

  const handleSave = async () => {
    try {
    setSaving(true);
    await saveRoleMenus(role.roleId, Array.from(checked));
    setSaving(false);
    onClose();
  
    } catch(error) { toast.error(error instanceof Error ? error.message : '操作失败，请重试'); } finally {setSaving(false);}
  };

  return (
    <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]">
        <div className="px-5 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 shrink-0">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-brand-500" />
            菜单权限分配 — {role.roleName}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg leading-none">×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="py-10 text-center"><Loader2 className="w-6 h-6 animate-spin text-slate-300 mx-auto" /></div>
          ) : menuTree.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">暂无菜单节点</div>
          ) : (
            <MenuCheckTree nodes={menuTree} checked={checked} onChange={handleChange} />
          )}
        </div>
        <div className="px-5 py-4 border-t border-slate-200 flex justify-between items-center shrink-0">
          <span className="text-xs text-slate-400">已选 {checked.size} 个菜单/按钮</span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>取消</Button>
            <Button isLoading={saving} onClick={handleSave}>保存权限</Button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── RoleAdmin (main) ────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  INACTIVE: 'bg-slate-100 text-slate-500 border-slate-200',
};

const RoleAdmin: React.FC = () => {
  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleRecord | null>(null);
  const [assigningRole, setAssigningRole] = useState<RoleRecord | null>(null);

  const load = async () => {
    try {
    setLoading(true);
    const data = await listRoles();
    setRoles(data);
    setLoading(false);
  
    } catch(error) { toast.error(error instanceof Error ? error.message : '操作失败，请重试'); } finally {setLoading(false);}
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (role: RoleRecord) => {
    try {
    if (role.isBuiltin) { alert('内置角色不可删除'); return; }
    if (!window.confirm(`确认删除角色「${role.roleName}」？`)) return;
    await deleteRole(role.roleId);
    load();
  
    } catch(error) { toast.error(error instanceof Error ? error.message : '操作失败，请重试'); } finally {}
  };

  const handleToggle = async (role: RoleRecord) => {
    try {
    await toggleRole(role.roleId, role.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE');
    load();
  
    } catch(error) { toast.error(error instanceof Error ? error.message : '操作失败，请重试'); } finally {}
  };

  return (
    <div className="space-y-4">
      {assigningRole && <RoleMenuPanel role={assigningRole} onClose={() => { setAssigningRole(null); }} />}

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-brand-500" /> 角色管理
        </h2>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={load}><RefreshCw className="w-4 h-4 mr-1" />刷新</Button>
          <Button size="sm" onClick={() => setShowCreate(v => !v)}><Plus className="w-4 h-4 mr-1" />新增角色</Button>
        </div>
      </div>

      {showCreate && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">新增角色</h3>
          <RoleForm onSave={() => { setShowCreate(false); load(); }} onCancel={() => setShowCreate(false)} />
        </div>
      )}

      {editingRole && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">编辑角色 — {editingRole.roleName}</h3>
          <RoleForm existing={editingRole} onSave={() => { setEditingRole(null); load(); }} onCancel={() => setEditingRole(null)} />
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin text-slate-300 mx-auto" /></div>
        ) : roles.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">暂无角色</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 font-medium text-xs">
              <tr>
                <th className="px-5 py-3 text-left">角色编码</th>
                <th className="px-5 py-3 text-left">角色名称</th>
                <th className="px-5 py-3 text-left">描述</th>
                <th className="px-5 py-3 text-left">状态</th>
                <th className="px-5 py-3 text-left">类型</th>
                <th className="px-5 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {roles.map(role => (
                <tr key={role.roleId} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3 font-mono text-xs text-slate-500">{role.roleCode}</td>
                  <td className="px-5 py-3 font-medium text-slate-800">{role.roleName}</td>
                  <td className="px-5 py-3 text-slate-500 max-w-xs truncate">{role.description ?? '—'}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_BADGE[role.status]}`}>
                      {role.status === 'ACTIVE' ? '启用' : '停用'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-400">{role.isBuiltin ? '系统内置' : '自定义'}</td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => setAssigningRole(role)} className="p-1.5 rounded hover:bg-brand-50 text-slate-400 hover:text-brand-600" title="菜单权限">
                        <ShieldCheck className="w-4 h-4" />
                      </button>
                      <button onClick={() => setEditingRole(role)} disabled={role.isBuiltin} className="p-1.5 rounded hover:bg-brand-50 text-slate-400 hover:text-brand-600 disabled:opacity-30" title="编辑">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleToggle(role)} className="p-1.5 rounded hover:bg-amber-50 text-slate-400 hover:text-amber-600" title={role.status === 'ACTIVE' ? '停用' : '启用'}>
                        {role.status === 'ACTIVE' ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                      </button>
                      <button onClick={() => handleDelete(role)} disabled={role.isBuiltin} className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-600 disabled:opacity-30" title="删除">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default RoleAdmin;
