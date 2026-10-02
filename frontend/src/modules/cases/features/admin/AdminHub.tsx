import React, { useState } from 'react';
import DictAdmin from './DictAdmin';
import RoleAdmin from './RoleAdmin';
import MenuAdmin from './MenuAdmin';
import ProcessTemplateAdmin from '../templates/ProcessTemplateAdmin';
import { BookOpen, ShieldCheck, Menu, Settings, GitBranch } from 'lucide-react';

type AdminTab = 'dict' | 'role' | 'menu' | 'process';

const TABS: { id: AdminTab; label: string; sub: string; icon: React.ElementType }[] = [
  { id: 'dict', label: '系统字典', sub: 'Dictionary', icon: BookOpen },
  { id: 'role', label: '角色管理', sub: 'Roles', icon: ShieldCheck },
  { id: 'menu', label: '菜单管理', sub: 'Menus', icon: Menu },
  { id: 'process', label: '流程与任务模板', sub: 'Process Templates', icon: GitBranch },
];

const AdminHub: React.FC = () => {
  const [tab, setTab] = useState<AdminTab>(() => {const tab=new URLSearchParams(window.location.search).get('tab');return ['dict','role','menu','process'].includes(tab||'') ? tab as AdminTab : 'dict';});

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center shadow">
          <Settings className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">系统管理后台</h1>
          <p className="text-xs text-slate-400">字典 · 角色 · 菜单 · 流程模板 — 仅系统管理员可访问</p>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.id
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'dict' && <DictAdmin />}
      {tab === 'role' && <RoleAdmin />}
      {tab === 'menu' && <MenuAdmin />}
      {tab === 'process' && <ProcessTemplateAdmin />}
    </div>
  );
};

export default AdminHub;
