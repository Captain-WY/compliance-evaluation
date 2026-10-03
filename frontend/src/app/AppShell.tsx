import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown, ChevronLeft, ChevronRight, LogOut, Menu, Shield, X } from 'lucide-react';
import type { PlatformUser } from '../platform/AuthProvider';
import { getActiveItem, getNavigation, type NavigationGroup } from './navigation';

const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-inset';

function SidebarNavigation({ groups, compact, onExpand, onNavigate }: {
  groups: NavigationGroup[]; compact: boolean; onExpand: () => void; onNavigate?: () => void;
}) {
  const location = useLocation();
  const activeModule = location.pathname.split('/')[1];
  const active = getActiveItem(groups, location.pathname, location.search);
  const [openGroup, setOpenGroup] = useState(activeModule);
  const id = useId();
  useEffect(() => { setOpenGroup(activeModule); }, [activeModule, location.pathname, location.search]);

  return <nav aria-label="主导航" className="flex-1 min-h-0 overflow-y-auto py-6 px-3 [scrollbar-width:thin] [scrollbar-color:#334155_transparent]">
    {groups.map(group => {
      const Icon = group.icon;
      const expanded = !compact && openGroup === group.id;
      const selected = activeModule === group.id;
      return <section key={group.id} className="mb-3">
        <button type="button" aria-label={group.label} aria-expanded={expanded}
          aria-controls={`${id}-${group.id}`} title={compact ? group.label : undefined}
          onClick={() => { if (compact) onExpand(); setOpenGroup(expanded ? '' : group.id); }}
          className={`flex w-full items-center gap-3 rounded-md px-3 py-3 text-sm font-semibold transition-colors ${focus} ${selected ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>
          <Icon className="h-5 w-5 shrink-0" />
          {!compact && <><span className="flex-1 text-left">{group.label}</span><ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${expanded ? '' : '-rotate-90'}`} /></>}
        </button>
        <ul id={`${id}-${group.id}`} hidden={!expanded} className="mt-1 space-y-1">
          {group.items.map(item => {
            const ItemIcon = item.icon;
            const isActive = active?.href === item.href;
            return <li key={item.href}><Link to={item.href} onClick={onNavigate}
              aria-current={isActive ? 'page' : undefined}
              className={`group flex items-center rounded-md py-2.5 pl-5 pr-3 text-sm font-medium transition-colors ${focus} ${isActive ? 'bg-blue-600/20 text-blue-400' : item.highlight ? 'text-amber-400 hover:bg-slate-800' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>
              <ItemIcon className={`mr-3 h-5 w-5 shrink-0 ${isActive ? 'text-blue-400' : item.highlight ? 'text-amber-400' : 'text-slate-400 group-hover:text-white'}`} />
              <span className="truncate">{item.label}</span>
            </Link></li>;
          })}
        </ul>
      </section>;
    })}
  </nav>;
}

// The original compliance pages own their spacing and fill the main viewport.
// Cases use their original role-specific content frames, without a second sidebar.
function PageFrame({ user, children }: { user: PlatformUser; children: ReactNode }) {
  const { pathname } = useLocation();
  if (pathname === '/system/admin') return <div className="min-h-full p-6">{children}</div>;
  if (!pathname.startsWith('/cases')) return <>{children}</>;
  if (user.role === 'BUSINESS_UNIT') return <div className="mx-auto max-w-5xl p-4 pb-24 md:p-8 md:pb-24">{children}</div>;
  if (user.role === 'EXTERNAL_LAWYER') return <div className="mx-auto w-full max-w-7xl p-6"><div className="min-h-[600px] rounded-lg border border-slate-200 bg-white p-6 shadow-sm">{children}</div></div>;
  return <div className="min-h-full p-6">{children}</div>;
}

export default function AppShell({ user, logout, children }: {
  user: PlatformUser; logout: () => Promise<void>; children: ReactNode;
}) {
  const location = useLocation();
  const groups = getNavigation(user);
  const [compact, setCompact] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const drawer = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (mobileOpen) drawer.current?.showModal();
    else drawer.current?.close();
  }, [mobileOpen]);
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)');
    const closeOnDesktop = () => { if (desktop.matches) setMobileOpen(false); };
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, []);
  const caseBackground = location.pathname.startsWith('/cases')
    ? user.role === 'EXTERNAL_LAWYER' ? 'bg-slate-100' : user.role === 'LEGAL_ADMIN' ? 'bg-gray-50/50' : 'bg-gray-50'
    : 'bg-gray-50';

  return <div className="flex h-dvh w-full overflow-hidden bg-white font-sans text-slate-900">
    <aside aria-label="侧边栏" className={`hidden shrink-0 flex-col bg-slate-900 text-slate-300 lg:flex ${compact ? 'w-20' : 'w-64'}`}>
      <SidebarNavigation groups={groups} compact={compact} onExpand={() => setCompact(false)} />
      <button type="button" onClick={() => setCompact(!compact)} aria-label={compact ? '展开侧边栏' : '收起侧边栏'}
        className={`flex h-12 shrink-0 items-center justify-center border-t border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-white ${focus}`}>
        {compact ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
      </button>
    </aside>
    <dialog ref={drawer} aria-label="移动端导航" onCancel={() => setMobileOpen(false)} onClose={() => setMobileOpen(false)}
      onClick={event => { if (event.target === event.currentTarget) setMobileOpen(false); }}
      className="fixed inset-y-0 left-0 m-0 h-dvh max-h-none w-72 max-w-[85vw] border-0 bg-slate-900 p-0 text-slate-300 backdrop:bg-slate-950/50">
      <div className="flex h-full flex-col">
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-800 px-5">
          <span className="font-semibold text-white">功能导航</span>
          <button type="button" aria-label="关闭导航" onClick={() => setMobileOpen(false)} className={`rounded p-2 hover:bg-slate-800 ${focus}`}><X size={20} /></button>
        </div>
        <SidebarNavigation groups={groups} compact={false} onExpand={() => {}} onNavigate={() => setMobileOpen(false)} />
      </div>
    </dialog>
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 lg:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" aria-label="打开导航" aria-haspopup="dialog" aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(true)} className={`rounded p-2 text-gray-500 hover:bg-gray-100 lg:hidden ${focus}`}><Menu size={24} /></button>
          <Shield className="h-8 w-8 shrink-0 text-blue-600" />
          <span className="truncate text-base font-bold text-slate-800 sm:text-lg">合规与案件管理平台</span>
        </div>
        <div className="flex shrink-0 items-center gap-3 lg:gap-5">
          <div className="hidden items-center gap-3 sm:flex">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-600">{user.avatarLabel}</div>
            <div className="hidden max-w-48 text-sm md:block"><p className="truncate font-medium text-gray-700">{user.displayName}</p><p className="truncate text-xs text-gray-500">{user.organizationName}</p></div>
          </div>
          <button type="button" onClick={() => void logout()} aria-label="退出登录" className={`flex items-center gap-1 rounded-md p-2 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-800 ${focus}`}><LogOut size={16} /><span className="hidden sm:inline">退出</span></button>
        </div>
      </header>
      <main key={location.pathname + location.search} data-testid="dashboard-main" className={`relative min-h-0 w-full flex-1 overflow-auto ${caseBackground}`}>
        <PageFrame user={user}>{children}</PageFrame>
      </main>
    </div>
  </div>;
}
