import React, { useEffect, useState } from 'react';
import { 
  Search, 
  Menu, 
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Shield,
  LogOut,
  UserRound,
  Building2
} from 'lucide-react';
import type { AppMenuGroup } from '../constants/menu';
import type { AuthUser } from '../types';
import NotificationPopover from './NotificationPopover';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { taskApi } from '../services/api';

interface DashboardLayoutProps {
  children: React.ReactNode;
  user: AuthUser;
  menuGroups: AppMenuGroup[];
  activeMenu: string;
  onMenuChange: (menuId: string) => void;
  onLogout: () => void;
}

export default function DashboardLayout({ children, user, menuGroups, activeMenu, onMenuChange, onLogout }: DashboardLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [taskOpenCount, setTaskOpenCount] = useState<number | null>(null);

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  const currentMenuGroups = menuGroups;

  useEffect(() => {
    let isMounted = true;
    taskApi.getCounts()
      .then(counts => {
        if (isMounted) {
          setTaskOpenCount(counts.totalOpen);
        }
      })
      .catch(() => {
        if (isMounted) {
          setTaskOpenCount(null);
        }
      });
    return () => {
      isMounted = false;
    };
  }, [user.userId]);

  // Find active menu item for breadcrumb
  let activeItemLabel = '';
  let activeGroupTitle = '';
  currentMenuGroups.forEach(group => {
    const item = group.items.find(i => i.id === activeMenu);
    if (item) {
      activeItemLabel = item.label;
      activeGroupTitle = group.title;
    }
  });

  return (
    <div className="flex h-screen w-full bg-gray-50 overflow-hidden font-sans">
      {/* Sidebar */}
      <aside 
        className={`bg-slate-900 text-slate-300 flex flex-col transition-all duration-300 ease-in-out ${
          isSidebarOpen ? 'w-64' : 'w-20'
        } shrink-0`}
      >
        {/* Navigation */}
        <div className="flex-1 overflow-y-auto py-6 scrollbar-thin scrollbar-thumb-slate-700">
          {currentMenuGroups.map((group, groupIdx) => (
            <div key={groupIdx} className="mb-6">
              {isSidebarOpen && (
                <div className="px-6 mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {group.title}
                </div>
              )}
              <ul className="space-y-1 px-3">
                {group.items.map((item) => {
                  const isActive = activeMenu === item.id;
                  const Icon = item.icon;
                  const badge =
                    (item.id === 'hq-tasks' || item.id === 'branch-tasks')
                      ? taskOpenCount
                      : item.badge;
                  return (
                    <li key={item.id}>
                      <button
                        data-testid={`nav-${item.id}`}
                        onClick={() => onMenuChange(item.id)}
                        className={`w-full flex items-center px-3 py-2.5 rounded-md transition-colors duration-200 group relative ${
                          isActive 
                            ? 'bg-blue-600/20 text-blue-400' 
                            : 'hover:bg-slate-800 hover:text-white'
                        }`}
                        title={!isSidebarOpen ? item.label : undefined}
                      >
                        <Icon className={`w-5 h-5 shrink-0 ${
                          isActive ? 'text-blue-400' : item.highlight ? 'text-amber-400' : 'text-slate-400 group-hover:text-white'
                        }`} />
                        
                        {isSidebarOpen && (
                          <span className={`ml-3 text-sm font-medium truncate ${
                            isActive ? 'text-blue-400' : item.highlight ? 'text-amber-400' : ''
                          }`}>
                            {item.label}
                          </span>
                        )}

                        {/* Badge */}
                        {badge ? (
                          <span className={`absolute right-3 px-2 py-0.5 rounded-full text-xs font-bold ${
                            isActive ? 'bg-blue-500 text-white' : 'bg-red-500 text-white'
                          } ${!isSidebarOpen ? 'top-1 right-1 px-1.5 py-0.5 text-[10px]' : ''}`}>
                            {badge}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        {/* Collapse Toggle */}
        <div className="h-12 border-t border-slate-800 flex items-center justify-center">
          <button 
            onClick={toggleSidebar}
            className="w-full h-full flex items-center justify-center hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            {isSidebarOpen ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 lg:px-6 shrink-0">
          <div className="flex items-center flex-1">
            {/* Mobile menu button */}
            <button className="lg:hidden mr-4 text-gray-500 hover:text-gray-700">
              <Menu className="w-6 h-6" />
            </button>

            {/* Logo Area (Header) */}
            <div className="flex items-center mr-8">
              <Shield className="w-8 h-8 text-blue-600 shrink-0" />
              <span className="ml-3 font-bold text-slate-800 truncate text-lg hidden sm:block">
                合规风控平台
              </span>
            </div>
            
            {/* Search Bar */}
            <div className="max-w-md w-full hidden md:block relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-gray-400" />
              </div>
              <input
                type="text"
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-gray-50 placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
                placeholder="搜索问题、指标、计划..."
              />
            </div>
          </div>

          <div className="flex items-center space-x-4 lg:space-x-6">
            {/* Notification Bell */}
            <NotificationPopover onNavigate={onMenuChange} />

            {/* User Profile */}
            <Popover>
              <PopoverTrigger className="flex items-center space-x-3 cursor-pointer hover:bg-gray-50 p-1.5 rounded-md transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30">
                <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm">
                  {user.avatarLabel}
                </div>
                <div className="hidden md:block text-sm text-left">
                  <p className="font-medium text-gray-700">{user.displayName}</p>
                  <p className="text-xs text-gray-500">{user.department}</p>
                </div>
                <ChevronDown className="h-4 w-4 text-gray-400 hidden md:block" />
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 bg-white p-3 border border-slate-200 shadow-lg">
                <div className="flex items-start gap-3 rounded-lg bg-slate-50 p-3">
                  <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm">
                    {user.avatarLabel}
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 truncate">{user.displayName}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{user.title}</div>
                    <div className="text-xs text-slate-400 mt-0.5 truncate">{user.organizationName}</div>
                  </div>
                </div>
                <div className="mt-3 grid gap-1 text-sm">
                  <div className="flex items-center gap-2 rounded-md px-2 py-2 text-slate-600">
                    <UserRound className="h-4 w-4 text-slate-400" />
                    <span className="truncate">{user.username}</span>
                  </div>
                  <div className="flex items-center gap-2 rounded-md px-2 py-2 text-slate-600">
                    <Building2 className="h-4 w-4 text-slate-400" />
                    <span className="truncate">{user.department}</span>
                  </div>
                  <button
                    type="button"
                    onClick={onLogout}
                    className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-rose-600 transition-colors hover:bg-rose-50"
                  >
                    <LogOut className="h-4 w-4" />
                    退出登录
                  </button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </header>

        {/* Main Content */}
        <main data-testid="dashboard-main" className="flex-1 w-full h-full relative overflow-auto bg-gray-50">
          {children}
        </main>
      </div>
    </div>
  );
}
