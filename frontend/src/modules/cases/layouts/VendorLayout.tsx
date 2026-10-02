import React from 'react';
import { User, UserRole } from '../types';
import { Briefcase, FileText, MessageSquare, LogOut } from 'lucide-react';

interface VendorLayoutProps {
  children: React.ReactNode;
  user: User;
  onLogout: () => void;
}

const VendorLayout: React.FC<VendorLayoutProps> = ({ children, user, onLogout }) => {
  // Get current path from hash
  const currentPath = window.location.hash.replace('#', '') || '/';

  // Navigate function
  const onNavigate = (path: string) => {
    window.location.hash = path;
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      {/* 顶部深色栏 */}
      <header className="bg-slate-900 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-500 rounded flex items-center justify-center">
              <Briefcase className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-lg tracking-wide">证券纠纷系统 <span className="text-indigo-400 font-normal">外部律师门户</span></h1>
            </div>
          </div>

          <nav className="flex items-center gap-6">
            <button 
              onClick={() => onNavigate('/')}
              className={`text-sm font-medium hover:text-white transition-colors flex items-center gap-2 ${currentPath === '/' ? 'text-white' : 'text-slate-400'}`}
            >
              <FileText className="w-4 h-4"/> 我的案件
            </button>
            <button 
              onClick={() => onNavigate('/fees')}
              className={`text-sm font-medium hover:text-white transition-colors flex items-center gap-2 ${currentPath === '/fees' ? 'text-white' : 'text-slate-400'}`}
            >
              <Briefcase className="w-4 h-4"/> 费用结算
            </button>
            <button className="text-sm font-medium text-slate-400 hover:text-white transition-colors flex items-center gap-2">
              <MessageSquare className="w-4 h-4"/> 消息中心
            </button>
          </nav>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-sm font-medium">{user.name}</div>
              <div className="text-xs text-slate-400">{user.department}</div>
            </div>
            <button
              onClick={onLogout}
              className="text-slate-400 hover:text-white transition-colors"
              title="退出登录"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* 提示条: 信息隔离 */}
      <div className="bg-indigo-900/10 border-b border-indigo-900/20 px-6 py-2 text-center">
        <p className="text-xs text-indigo-900">
          <span className="font-bold">安全提示：</span> 您正在访问受限的外部协作网络。所有操作已被记录审计日志 (Audit Log: #{Math.floor(Math.random()*10000)})。
        </p>
      </div>

      <main className="flex-1 max-w-7xl mx-auto w-full p-6">
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 min-h-[600px] p-6">
           {children}
        </div>
      </main>

      <footer className="bg-white border-t border-slate-200 py-6 text-center text-slate-400 text-sm">
        &copy; 2026 Securities Legal Dispute System. Partner Portal.
      </footer>
    </div>
  );
};

export default VendorLayout;