
import React from 'react';
import { UserRole } from '../../types';
import {
  Briefcase,
  PieChart,
  FileBarChart,
  BookOpen,
  Settings,
  CheckCheck,
} from 'lucide-react';

interface SidebarProps {
  role: UserRole;
  currentPath: string;
  onNavigate: (path: string) => void;
  pendingRiskCount?: number;
}

const Sidebar: React.FC<SidebarProps> = ({ role, currentPath, onNavigate, pendingRiskCount = 0 }) => {
  
  const navItems = [
    { 
      id: 'cases', 
      label: '案件管理', 
      subLabel: 'Case Management',
      icon: Briefcase, 
      path: '/cases' 
    },
    { 
      id: 'reporting', 
      label: '案件报送', 
      subLabel: 'Reporting',
      icon: PieChart, 
      path: '/reports', 
      badge: pendingRiskCount 
    },
    { 
      id: 'finance', 
      label: '财务与成本', 
      subLabel: 'Finance',
      icon: FileBarChart, 
      path: '/finance' 
    },
    {
      id: 'knowledge',
      label: '知识与资源',
      subLabel: 'Resources',
      icon: BookOpen,
      path: '/knowledge',
    },
    {
      id: 'approvals',
      label: '审批收件箱',
      subLabel: 'Approvals',
      icon: CheckCheck,
      path: '/approvals',
    },
    {
      id: 'admin',
      label: '系统管理',
      subLabel: 'Admin',
      icon: Settings,
      path: '/admin',
    },
  ];

  return (
    <div className="w-64 bg-[#0f172a] text-slate-300 h-screen flex flex-col fixed left-0 top-0 border-r border-slate-800 shadow-xl z-40">
      {/* 1. App Brand - Minimal */}
      <div className="h-16 flex items-center px-6 border-b border-slate-800/50 bg-[#0f172a] shrink-0">
        <div className="flex items-center gap-3 text-white">
          <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center shadow-lg shadow-brand-500/30">
            <span className="font-bold text-lg leading-none">S</span>
          </div>
          <span className="font-bold text-base tracking-tight">SLD 法务中台</span>
        </div>
      </div>

      {/* 2. Main Navigation - Flat List */}
      <nav className="flex-1 py-6 px-3 space-y-2">
        {navItems.map((item) => {
            // Active if current path starts with item path (handling sub-routes)
            // Exception for root path vs cases path handling handled in parent
            const isActive = currentPath.startsWith(item.path);
            
            return (
                <button
                key={item.id}
                onClick={() => onNavigate(item.path)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 group ${
                    isActive
                    ? 'bg-brand-600 text-white shadow-md shadow-brand-900/20'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                }`}
                >
                    <div className="flex items-center gap-3">
                        <item.icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'}`} />
                        <div className="flex flex-col items-start">
                            <span className={`text-sm ${isActive ? 'font-bold' : 'font-medium'}`}>{item.label}</span>
                            <span className={`text-[10px] ${isActive ? 'text-brand-100' : 'text-slate-600 group-hover:text-slate-500'}`}>{item.subLabel}</span>
                        </div>
                    </div>
                    
                    {item.badge && item.badge > 0 && (
                        <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-sm">
                        {item.badge > 99 ? '99+' : item.badge}
                        </span>
                    )}
                </button>
            );
        })}
      </nav>

      {/* 3. Footer Area (Minimal Info) */}
      <div className="p-6 text-center">
          <p className="text-[10px] text-slate-600 font-mono">v1.2.0 • Security Mode</p>
      </div>
    </div>
  );
};

export default Sidebar;
