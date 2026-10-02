
import React, { useCallback, useEffect, useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Sidebar from '../components/layout/Sidebar';
import GlobalCommandPalette from '../components/layout/GlobalCommandPalette';
import NotificationDropdown from '../features/notifications/NotificationDropdown';
import { User, UserRole } from '../types';
import { Bell, Search, AlertTriangle, ArrowRight, Command, Mail, User as UserIcon, LogOut, ChevronDown } from 'lucide-react';
import { getUnreadCount, getDashboardRiskItems, type DashboardRiskItem } from '../services/case';
import { useNotificationSSE } from '../src/hooks/useNotificationSSE';

/** 风险预警 queryKey — 供其他组件通过 useQueryClient().invalidateQueries 触发刷新 */
export const DASHBOARD_ALERTS_KEY = ['dashboard-alerts'] as const;

interface LegalLayoutProps {
  children: React.ReactNode;
  user: User;
  onLogout: () => void;
}

const LegalLayout: React.FC<LegalLayoutProps> = ({ children, user, onLogout }) => {
  const queryClient = useQueryClient();
  const [isCmdOpen, setIsCmdOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // 风险预警：React Query 托管，5 分钟轮询，标签页不可见时暂停
  const { data: tasks = [] } = useQuery<DashboardRiskItem[]>({
    queryKey: DASHBOARD_ALERTS_KEY,
    queryFn: () => getDashboardRiskItems({ status: 'PENDING' }),
    refetchInterval: 5 * 60 * 1000,       // 5 分钟
    refetchIntervalInBackground: false,    // 标签页隐藏时暂停轮询
    staleTime: 2 * 60 * 1000,             // 2 分钟内复用缓存，路由切换不重复请求
  });

  // SSE：收到新通知时 unreadCount + 1
  const handleNewNotification = useCallback(() => {
    setUnreadCount(prev => prev + 1);
  }, []);
  useNotificationSSE({ onNewNotification: handleNewNotification });

  // Get current path from hash
  const currentPath = window.location.hash.replace('#', '') || '/';

  // Navigate function
  const onNavigate = (path: string) => {
    window.location.hash = path;
  };

  // Close user menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    getUnreadCount().then(setUnreadCount);
  }, []);

  // 审批处理后：刷新未读角标 + 使风险预警缓存失效（触发一次性重新拉取）
  useEffect(() => {
    const handler = () => {
      getUnreadCount().then(setUnreadCount);
      queryClient.invalidateQueries({ queryKey: DASHBOARD_ALERTS_KEY });
    };
    window.addEventListener('approval-processed', handler);
    return () => window.removeEventListener('approval-processed', handler);
  }, [queryClient]);

  // Keyboard shortcut for Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCmdOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const urgentTasks = tasks.filter(t => {
      if (!t.deadline || !t.riskLevel) return false;
      const isCritical = t.riskLevel === '特大' || t.riskLevel === '重大';
      const deadlineDate = new Date(t.deadline);
      if (isNaN(deadlineDate.getTime())) return false;
      
      const daysLeft = Math.ceil((deadlineDate.getTime() - new Date().getTime()) / (1000 * 3600 * 24));
      return isCritical && daysLeft <= 1; 
  });

  return (
    <div className="flex h-screen bg-white overflow-hidden flex-col font-sans text-slate-900">
      
      {/* Global Command Palette */}
      <GlobalCommandPalette 
        isOpen={isCmdOpen} 
        onClose={() => setIsCmdOpen(false)} 
        onNavigate={onNavigate} 
      />

      {/* Notification Dropdown is rendered inline in header (see below) */}

      {/* Global Risk Banner */}
      {urgentTasks.length > 0 && (
          <div className="bg-red-600 text-white px-4 py-2 flex items-center justify-center gap-4 z-[60] shadow-md text-sm font-medium">
              <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 animate-pulse" />
                  <span>系统检测到 {urgentTasks.length} 项特大合规风险需在 24小时内 披露</span>
              </div>
              <button 
                onClick={() => onNavigate('/reports')}
                className="bg-white/20 hover:bg-white/30 text-white px-3 py-0.5 rounded text-xs flex items-center gap-1 transition-colors"
              >
                  立即处理 <ArrowRight className="w-3 h-3" />
              </button>
          </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar role={user.role} currentPath={currentPath} onNavigate={onNavigate} pendingRiskCount={tasks.length} />

        {/* Main Content Area */}
        <div className="flex-1 ml-64 flex flex-col h-full overflow-hidden bg-white">
            
            {/* Top Navigation Bar (App Shell Header) */}
            <header className="h-16 border-b border-slate-200 flex items-center justify-between px-6 bg-white shrink-0 z-10">
                {/* Search / Command Trigger */}
                <div className="w-1/3">
                    <button 
                        onClick={() => setIsCmdOpen(true)}
                        className="flex items-center gap-2 text-slate-400 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-3 py-2 rounded-lg text-sm w-72 transition-all group"
                    >
                        <Search className="w-4 h-4 group-hover:text-slate-600" />
                        <span className="flex-1 text-left">搜索案件、文书或输入命令...</span>
                        <div className="flex items-center gap-0.5 text-[10px] font-bold bg-white px-1.5 py-0.5 rounded border border-slate-200 text-slate-400">
                            <Command className="w-3 h-3" /> K
                        </div>
                    </button>
                </div>

                {/* Right Actions */}
                <div className="flex items-center gap-5">
                    {/* Inbox Action */}
                    <button 
                        onClick={() => onNavigate('/inbox')}
                        className={`relative p-2 rounded-full transition-colors ${currentPath === '/inbox' ? 'bg-brand-50 text-brand-600' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}
                        title="收件箱与消息"
                    >
                        <Mail className="w-5 h-5" />
                        {/* Red Dot if unread (mocked for now as 1) */}
                        <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
                    </button>

                    <NotificationDropdown
                      unreadCount={unreadCount}
                      onUnreadCountChange={setUnreadCount}
                    />
                    
                    <div className="h-6 w-px bg-slate-200"></div>
                    
                    {/* User Profile with Dropdown */}
                    <div className="relative" ref={userMenuRef}>
                      <button
                        onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                        className="flex items-center gap-3 cursor-pointer hover:bg-slate-50 p-1.5 rounded-lg transition-colors"
                      >
                        <div className="text-right hidden md:block">
                          <div className="text-sm font-bold text-slate-700">{user.name}</div>
                          <div className="text-[10px] text-slate-500">{user.department}</div>
                        </div>
                        <div className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500">
                          <UserIcon className="w-5 h-5" />
                        </div>
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      </button>

                      {/* Dropdown Menu - z-[9999] to ensure it's above all content */}
                      {isUserMenuOpen && (
                        <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-xl border border-slate-200 py-1 z-[9999]">
                          <div className="px-4 py-2 border-b border-slate-100">
                            <div className="text-sm font-medium text-slate-900">{user.name}</div>
                            <div className="text-xs text-slate-500">{user.email || '未设置邮箱'}</div>
                          </div>
                          <button
                            onClick={() => {
                              setIsUserMenuOpen(false);
                              onLogout();
                            }}
                            className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                          >
                            <LogOut className="w-4 h-4" />
                            退出登录
                          </button>
                        </div>
                      )}
                    </div>
                </div>
            </header>

            {/* Scrollable Content */}
            <main className="flex-1 overflow-auto relative scroll-smooth bg-gray-50/50">
                <div className="min-h-full p-6">
                    {children}
                </div>
            </main>
        </div>
      </div>
    </div>
  );
};

export default LegalLayout;
