
import React, { useState, useEffect, useRef } from 'react';
import { Search, Plus, FileText, Gavel, ArrowRight, Wallet, ShieldAlert, BarChart3, LayoutDashboard, Inbox, Calculator } from 'lucide-react';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (path: string) => void;
}

interface CommandItem {
  id: string;
  label: string;
  icon: any;
  path: string;
  type?: string;
  meta?: string;
}

const GlobalCommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose, onNavigate }) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Mock Data for Search - Localized
  const groups: { label: string; items: CommandItem[] }[] = [
    {
      label: "快捷操作 (Actions)",
      items: [
        { id: 'new-case', label: '登记新案件 (立案)', icon: Plus, path: '/cases/new', type: 'action' },
        { id: 'report-risk', label: '上报风险线索', icon: ShieldAlert, path: '/report', type: 'action' },
      ]
    },
    {
      label: "系统导航 (Navigation)",
      items: [
        { id: 'dash', label: '法务指挥舱 (Dashboard)', icon: LayoutDashboard, path: '/' },
        { id: 'inbox', label: '智能收件箱 (Inbox)', icon: Inbox, path: '/inbox' },
        { id: 'cases', label: '案件库 (All Cases)', icon: Gavel, path: '/cases' },
        { id: 'reports', label: '监管报送中心', icon: BarChart3, path: '/reports' },
        { id: 'finance', label: '财务与成本控制', icon: Wallet, path: '/finance' },
      ]
    },
    {
      label: "最近访问 (Recent)",
      items: [
        { id: 'c-004', label: 'TD-GPYW-2026-012 实控人股票质押违约案', icon: FileText, path: '/cases/c-004', meta: '特大风险' },
        { id: 'c-001', label: 'ZD-JRJK-2026-001 永绿集团债券违约纠纷案', icon: FileText, path: '/cases/c-001', meta: '重大' },
      ]
    }
  ];

  // Flatten items for keyboard navigation
  const filteredGroups = groups.map(g => ({
    ...g,
    items: g.items.filter(i => i.label.toLowerCase().includes(query.toLowerCase()))
  })).filter(g => g.items.length > 0);

  const flatItems = filteredGroups.flatMap(g => g.items);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setSelectedIndex(0);
    } else {
        setQuery('');
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % flatItems.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + flatItems.length) % flatItems.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (flatItems[selectedIndex]) {
          handleSelect(flatItems[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, flatItems, selectedIndex]);

  const handleSelect = (item: CommandItem) => {
    onNavigate(item.path);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-[2px] flex items-start justify-center pt-[15vh] animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-2xl rounded-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[60vh]">
        {/* Input */}
        <div className="flex items-center px-4 py-3 border-b border-slate-100">
          <Search className="w-5 h-5 text-slate-400 mr-3" />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 text-lg outline-none placeholder:text-slate-300 text-slate-800"
            placeholder="输入命令或搜索案件..."
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <div className="text-xs font-medium text-slate-400 border border-slate-200 px-1.5 py-0.5 rounded bg-slate-50">ESC</div>
        </div>

        {/* List */}
        <div className="overflow-y-auto p-2 scroll-py-2">
          {filteredGroups.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-sm">未找到相关结果</div>
          ) : (
            filteredGroups.map((group, gIdx) => (
              <div key={group.label} className="mb-2">
                <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  {group.label}
                </div>
                {group.items.map((item) => {
                  // Calculate absolute index for highlighting
                  const absIndex = flatItems.indexOf(item);
                  const isSelected = absIndex === selectedIndex;

                  return (
                    <div
                      key={item.id}
                      onClick={() => handleSelect(item)}
                      className={`flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer text-sm transition-colors ${
                        isSelected ? 'bg-brand-50 text-brand-900' : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-1.5 rounded-md ${isSelected ? 'bg-white text-brand-600 shadow-sm' : 'bg-slate-100 text-slate-500'}`}>
                            <item.icon className="w-4 h-4" />
                        </div>
                        <span className={isSelected ? 'font-medium' : ''}>{item.label}</span>
                      </div>
                      
                      <div className="flex items-center gap-2">
                          {item.meta && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                                  item.meta.includes('特大') || item.meta === 'Critical' ? 'bg-red-50 text-red-600 border-red-100' : 'bg-slate-100 text-slate-500 border-slate-200'
                              }`}>
                                  {item.meta}
                              </span>
                          )}
                          {isSelected && <ArrowRight className="w-4 h-4 text-brand-500 opacity-50" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
        
        {/* Footer */}
        <div className="bg-slate-50 px-4 py-2 border-t border-slate-100 text-[10px] text-slate-400 flex justify-between">
            <div className="flex gap-3">
                <span><strong className="font-medium text-slate-500">↑↓</strong> 切换</span>
                <span><strong className="font-medium text-slate-500">↵</strong> 确认</span>
            </div>
            <span>全局命令菜单 (Command Menu)</span>
        </div>
      </div>
    </div>
  );
};

export default GlobalCommandPalette;
