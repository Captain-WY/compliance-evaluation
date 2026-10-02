import React from 'react';
import Sidebar from '../components/layout/Sidebar';
import { User, UserRole } from '../types';
import { Bell, Search, User as UserIcon } from 'lucide-react';
import { switchRole } from '../services/mock/auth';

interface MainLayoutProps {
  children: React.ReactNode;
  user: User;
  currentPath: string;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children, user, currentPath }) => {
  // Mock navigation handler - in a real app this would use router hooks
  const handleNavigate = (path: string) => {
    window.location.hash = path;
  };

  const handleRoleSwitch = (e: React.ChangeEvent<HTMLSelectElement>) => {
    switchRole(e.target.value as UserRole);
  };

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Sidebar - Fixed Left */}
      <Sidebar role={user.role} currentPath={currentPath} onNavigate={handleNavigate} />

      {/* Main Content Area */}
      <div className="flex-1 ml-64 flex flex-col h-screen overflow-hidden">
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 z-10">
          <div className="flex items-center gap-4 w-1/3">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input 
                type="text" 
                placeholder="Search cases, contracts, or clues..." 
                className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button className="relative p-2 text-gray-500 hover:text-brand-600 transition-colors">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
            </button>
            
            <div className="h-8 w-px bg-gray-200 mx-2"></div>
            
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-gray-900 leading-tight">{user.name}</p>
                <p className="text-xs text-gray-500">{user.department}</p>
              </div>
              <div className="w-9 h-9 bg-brand-100 rounded-full flex items-center justify-center text-brand-700 border border-brand-200">
                <UserIcon className="w-5 h-5" />
              </div>
            </div>
          </div>
        </header>

        {/* Scrollable Content */}
        <main className="flex-1 overflow-auto p-6 relative">
          {children}
        </main>
      </div>
    </div>
  );
};

export default MainLayout;