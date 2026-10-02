
import React, { useState } from 'react';
import { Search, Filter, X, SlidersHorizontal, Layers, CheckSquare, Bug } from 'lucide-react';
import { RiskLevel, CaseStage, IssueType, BusinessLine, ProcedureType } from '../../../types';

interface CaseFilterBarProps {
  searchQuery: string;
  onSearchChange: (val: string) => void;
  activeFilters: {
    type: string;
    risk: string;
    stage: string;
    owner: string;
    businessLine?: string;
    procedure?: string; // New: Procedure Type Filter
    dateStart?: string;
    dateEnd?: string;
    showMasterOnly?: boolean;
  };
  onFilterChange: (type: string, value: any) => void;
  onReset: () => void;
}

const CaseFilterBar: React.FC<CaseFilterBarProps> = ({ 
  searchQuery, 
  onSearchChange, 
  activeFilters, 
  onFilterChange,
  onReset
}) => {
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  const hasActiveFilters = activeFilters.type !== 'ALL' || activeFilters.risk !== 'ALL' || activeFilters.stage !== 'ALL' || activeFilters.owner !== 'ALL' || activeFilters.businessLine !== 'ALL' || activeFilters.procedure !== 'ALL' || activeFilters.dateStart || activeFilters.dateEnd || activeFilters.showMasterOnly;

  const handleReset = () => {
      onReset();
      // Keep advanced open if it was open, just clear values
  };

  const procedureOptions: { label: string, value: string }[] = [
      { label: '案件类型', value: 'ALL' }, // Changed from '所有类型'
      { label: '民事诉讼', value: 'CIVIL_LITIGATION' },
      { label: '商事仲裁', value: 'ARBITRATION' },
      { label: '行政监管', value: 'ADMIN' },
      { label: '劳动争议', value: 'LABOR' },
  ];

  return (
    <div className="flex flex-col gap-3">
        {/* Top Row: Primary Filters */}
        <div className="flex flex-wrap items-center gap-3">
            {/* 1. Search Input (h-9 fixed) */}
            <div className="relative min-w-[240px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                type="text" 
                placeholder="搜索案号、名称、当事人..." 
                className="w-full pl-9 pr-4 h-9 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none bg-white shadow-sm transition-all hover:border-slate-300"
                value={searchQuery}
                onChange={e => onSearchChange(e.target.value)}
                />
            </div>

            {/* 2. Quick Filters (Capsules - h-9 fixed) */}
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                
                {/* Issue Type Filter */}
                <div className="flex bg-white rounded-lg border border-slate-200 p-0.5 h-9 items-center">
                    <button
                        onClick={() => onFilterChange('type', 'ALL')}
                        className={`px-3 h-8 flex items-center justify-center text-xs font-medium rounded-md transition-colors ${activeFilters.type === 'ALL' ? 'bg-slate-100 text-slate-900 font-bold' : 'text-slate-500 hover:bg-slate-50'}`}
                    >
                        全部
                    </button>
                    <button
                        onClick={() => onFilterChange('type', IssueType.CASE)}
                        className={`px-3 h-8 flex items-center justify-center text-xs font-medium rounded-md transition-colors gap-1.5 ${activeFilters.type === IssueType.CASE ? 'bg-brand-50 text-brand-700 font-bold' : 'text-slate-500 hover:bg-slate-50'}`}
                    >
                        <Layers className="w-3 h-3" /> 案件
                    </button>
                    <button
                        onClick={() => onFilterChange('type', IssueType.CLUE)}
                        className={`px-3 h-8 flex items-center justify-center text-xs font-medium rounded-md transition-colors gap-1.5 ${activeFilters.type === IssueType.CLUE ? 'bg-red-50 text-red-700 font-bold' : 'text-slate-500 hover:bg-slate-50'}`}
                    >
                        <Bug className="w-3 h-3" /> 线索
                    </button>
                    <button
                        onClick={() => onFilterChange('type', IssueType.TASK)}
                        className={`px-3 h-8 flex items-center justify-center text-xs font-medium rounded-md transition-colors gap-1.5 ${activeFilters.type === IssueType.TASK ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-500 hover:bg-slate-50'}`}
                    >
                        <CheckSquare className="w-3 h-3" /> 任务
                    </button>
                </div>

                <div className="w-px h-6 bg-slate-200 mx-1"></div>

                {/* Owner Filter */}
                <button 
                onClick={() => onFilterChange('owner', activeFilters.owner === 'ME' ? 'ALL' : 'ME')}
                className={`px-3 h-9 rounded-full text-xs font-medium border transition-all flex items-center gap-1.5 ${
                    activeFilters.owner === 'ME' 
                    ? 'bg-brand-50 text-brand-700 border-brand-200 shadow-sm' 
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
                >
                <span className={`w-2 h-2 rounded-full ${activeFilters.owner === 'ME' ? 'bg-brand-500' : 'bg-slate-300'}`}></span>
                仅看我的
                </button>

                {/* Master Case Filter (Simplified Text) */}
                <button 
                onClick={() => onFilterChange('showMasterOnly', !activeFilters.showMasterOnly)}
                className={`px-3 h-9 rounded-full text-xs font-medium border transition-all flex items-center gap-1.5 ${
                    activeFilters.showMasterOnly 
                    ? 'bg-indigo-50 text-indigo-700 border-indigo-200 shadow-sm' 
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
                >
                <Layers className={`w-3 h-3 ${activeFilters.showMasterOnly ? 'text-indigo-500' : 'text-slate-400'}`} />
                仅看总案
                </button>

                {/* Procedure Type Filter - Explicitly placed */}
                {(activeFilters.type === 'ALL' || activeFilters.type === IssueType.CASE) && (
                    <div className="relative group">
                        <select 
                            className={`appearance-none pl-3 pr-8 h-9 rounded-full text-xs font-medium border bg-white outline-none cursor-pointer transition-all ${
                                activeFilters.procedure !== 'ALL' 
                                ? 'bg-purple-50 text-purple-700 border-purple-200' 
                                : 'text-slate-600 border-slate-200 hover:bg-slate-50'
                            }`}
                            value={activeFilters.procedure}
                            onChange={(e) => onFilterChange('procedure', e.target.value)}
                        >
                            {procedureOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                        </select>
                        <Filter className="w-3 h-3 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                )}

                {/* Risk Filter (Dropdown) */}
                <div className="relative group">
                    <select 
                        className={`appearance-none pl-3 pr-8 h-9 rounded-full text-xs font-medium border bg-white outline-none cursor-pointer transition-all ${
                            activeFilters.risk !== 'ALL' 
                            ? 'bg-red-50 text-red-700 border-red-200' 
                            : 'text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                        value={activeFilters.risk}
                        onChange={(e) => onFilterChange('risk', e.target.value)}
                    >
                        <option value="ALL">风险等级</option> {/* Changed from '所有风险' */}
                        {Object.values(RiskLevel).map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <AlertTriangleIcon className={`w-3 h-3 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none ${
                         activeFilters.risk !== 'ALL' ? 'text-red-500' : 'text-slate-400'
                    }`} />
                </div>

                {/* Stage Filter Dropdown */}
                <div className="relative group">
                    <select 
                        className={`appearance-none pl-3 pr-8 h-9 rounded-full text-xs font-medium border bg-white outline-none cursor-pointer transition-all ${
                            activeFilters.stage !== 'ALL' 
                            ? 'bg-blue-50 text-blue-700 border-blue-200' 
                            : 'text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                        value={activeFilters.stage}
                        onChange={(e) => onFilterChange('stage', e.target.value)}
                    >
                        <option value="ALL">状态</option> {/* Changed from '所有状态' */}
                        {Object.values(CaseStage).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <Filter className="w-3 h-3 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
            </div>

            {/* 3. Reset Button */}
            {hasActiveFilters && (
                <button 
                onClick={handleReset}
                className="h-9 px-2 text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 rounded hover:bg-slate-100 transition-colors"
                >
                <X className="w-3 h-3" /> 重置
                </button>
            )}
            
            {/* 4. Advanced Toggle (Aligned right of filters) */}
            <div className="ml-auto border-l border-slate-200 pl-4 flex items-center gap-2">
                <button 
                    onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
                    className={`h-9 w-9 flex items-center justify-center rounded transition-colors ${
                        isAdvancedOpen || (activeFilters.businessLine !== 'ALL' || activeFilters.dateStart || activeFilters.dateEnd)
                        ? 'bg-brand-50 text-brand-600 border border-brand-200'
                        : 'text-slate-500 hover:text-brand-600 hover:bg-slate-100'
                    }`} 
                    title="高级筛选"
                >
                    <SlidersHorizontal className="w-4 h-4" />
                </button>
            </div>
        </div>

        {/* Bottom Row: Advanced Filters Panel */}
        {isAdvancedOpen && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 grid grid-cols-1 md:grid-cols-3 gap-4 animate-in slide-in-from-top-2">
                
                {/* Business Line */}
                <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">业务条线</label>
                    <select 
                        className="w-full h-8 text-xs border border-slate-300 rounded px-2 outline-none focus:border-brand-500"
                        value={activeFilters.businessLine || 'ALL'}
                        onChange={(e) => onFilterChange('businessLine', e.target.value)}
                    >
                        <option value="ALL">全部条线</option>
                        {Object.values(BusinessLine).map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                </div>

                {/* Date Range */}
                <div className="col-span-2">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">创建时间范围</label>
                    <div className="flex items-center gap-2">
                        <input 
                            type="date" 
                            className="flex-1 h-8 text-xs border border-slate-300 rounded px-2 outline-none focus:border-brand-500"
                            value={activeFilters.dateStart || ''}
                            onChange={(e) => onFilterChange('dateStart', e.target.value)}
                        />
                        <span className="text-slate-400 text-xs">-</span>
                        <input 
                            type="date" 
                            className="flex-1 h-8 text-xs border border-slate-300 rounded px-2 outline-none focus:border-brand-500"
                            value={activeFilters.dateEnd || ''}
                            onChange={(e) => onFilterChange('dateEnd', e.target.value)}
                        />
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

// Helper Icon
const AlertTriangleIcon = ({ className }: { className?: string }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width="24" height="24" viewBox="0 0 24 24" 
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" 
    className={className}
  >
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
    <path d="M12 9v4"/>
    <path d="M12 17h.01"/>
  </svg>
);

export default CaseFilterBar;
