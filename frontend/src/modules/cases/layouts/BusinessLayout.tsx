
import React from 'react';
import { User, UserRole } from '../types';
import { Bell, LogOut, PlusCircle, History, Search, Send } from 'lucide-react';
import { switchRole } from '../services/mock/auth';

interface BusinessLayoutProps {
  children: React.ReactNode;
  user: User;
  onLogout: () => void;
}

const BusinessLayout: React.FC<BusinessLayoutProps> = ({ children, user, onLogout }) => {
  // Get current path from hash
  const currentPath = window.location.hash.replace('#', '') || '/';

  // Navigate function
  const onNavigate = (path: string) => {
    window.location.hash = path;
  };

  const navItems = [
    { id: 'report', label: '上报线索', icon: PlusCircle, path: '/report' },
    { id: 'tasks', label: '取证任务', icon: Send, path: '/tasks' }, // New
    { id: 'history', label: '我的上报', icon: History, path: '/' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      {/* 极简顶部导航 */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => onNavigate('/')}>
            <div className="w-8 h-8 bg-brand-600 rounded flex items-center justify-center text-white font-bold">SLD</div>
            <span className="font-semibold text-gray-900 tracking-tight">法律协作门户</span>
          </div>

          <nav className="hidden md:flex items-center gap-1">
             {navItems.map(item => (
               <button 
                key={item.id}
                onClick={() => onNavigate(item.path)}
                className={`px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2 transition-colors ${
                  currentPath === item.path 
                    ? 'bg-brand-50 text-brand-700' 
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
               >
                 <item.icon className="w-4 h-4" />
                 {item.label}
               </button>
             ))}
          </nav>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
               <span className="text-sm text-gray-700 font-medium">{user.name}</span>
               <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{user.department}</span>
            </div>
            <button
              onClick={onLogout}
              className="text-gray-400 hover:text-gray-600"
              title="退出登录"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* 移动端底部导航 (Mobile Only) - 模拟移动端体验 */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around py-3 z-30 pb-safe">
        {navItems.map(item => (
          <button 
            key={item.id}
            onClick={() => onNavigate(item.path)}
            className={`flex flex-col items-center gap-1 ${
              currentPath === item.path ? 'text-brand-600' : 'text-gray-400'
            }`}
          >
            <item.icon className="w-6 h-6" />
            <span className="text-[10px] font-medium">{item.label}</span>
          </button>
        ))}
      </div>

      <main className="max-w-5xl mx-auto p-4 md:p-8 pb-24">
        {children}
      </main>
    </div>
  );
};

export default BusinessLayout;
