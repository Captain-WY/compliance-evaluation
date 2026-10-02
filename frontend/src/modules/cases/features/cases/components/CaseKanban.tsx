
import React, { useState, useMemo } from 'react';
import { Case, CaseStage, RiskLevel, CaseType, ProcedureType } from '../../../types';
import { Briefcase, Clock, User, Layers, Gavel, ShieldAlert } from 'lucide-react';
import useDict, { DICT_TYPES } from '../../../hooks/useDict';

interface CaseKanbanProps {
  cases: Case[];
  selectedId: string | null;
  onSelectCase: (id: string) => void;
  onStageChange: (caseId: string, newStage: CaseStage) => void;
}

// 1. Configuration for each view type
interface BoardConfig {
    id: ProcedureType | 'ALL_OTHERS'; 
    label: string;
    icon: React.ElementType;
    stages: CaseStage[];
    themeColor: string; 
}

const BOARDS: BoardConfig[] = [
    {
        id: 'CIVIL_LITIGATION',
        label: '案件',
        icon: Briefcase,
        stages: [
            CaseStage.CLUE,
            CaseStage.FILING,
            CaseStage.ARBITRATION,
            CaseStage.FIRST_INSTANCE,
            CaseStage.SECOND_INSTANCE,
            CaseStage.ENFORCEMENT,
            CaseStage.CLOSED
        ],
        themeColor: 'blue'
    },
    // Arbitration board removed as it is now merged
    {
        id: 'ADMIN',
        label: '行政监管',
        icon: ShieldAlert,
        stages: [
            CaseStage.CLUE,
            CaseStage.FILING,
            CaseStage.ADMIN_HEARING,
            CaseStage.CLOSED
        ],
        themeColor: 'red'
    }
];

const CaseKanban: React.FC<CaseKanbanProps> = ({ cases, selectedId, onSelectCase, onStageChange }) => {
  // Default to Civil as it's the most common
  const [activeTab, setActiveTab] = useState<string>('CIVIL_LITIGATION');
  
  // DnD State
  const [draggedCaseId, setDraggedCaseId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<CaseStage | null>(null);

  // 字典映射
  const { lookup } = useDict();

  const activeConfig = BOARDS.find(b => b.id === activeTab) || BOARDS[0];

  // Filter cases for the current view
  const currentCases = useMemo(() => {
      return cases.filter(c => {
          // If tab is Civil (now General), include Litigation, Arbitration, and Clues
          if (activeTab === 'CIVIL_LITIGATION') {
              return c.procedureType === 'CIVIL_LITIGATION' || c.procedureType === 'ARBITRATION' || !c.procedureType || c.stage === CaseStage.CLUE;
          }
          return c.procedureType === activeTab;
      });
  }, [cases, activeTab]);

  const getRiskStyles = (level: RiskLevel) => {
      switch (level) {
          case RiskLevel.CRITICAL: return 'bg-red-50 text-red-700 border-red-200';
          case RiskLevel.HIGH: return 'bg-orange-50 text-orange-700 border-orange-200';
          default: return 'bg-slate-50 text-slate-600 border-slate-200';
      }
  };

  const getThemeStyles = (color: string) => {
      // Simplified mapping for tab active states
      const map: Record<string, string> = {
          blue: 'bg-blue-50 text-blue-700 border-blue-200 ring-1 ring-blue-200',
          orange: 'bg-orange-50 text-orange-700 border-orange-200 ring-1 ring-orange-200',
          red: 'bg-red-50 text-red-700 border-red-200 ring-1 ring-red-200',
      };
      return map[color] || map['blue'];
  };

  // --- DnD Handlers ---
  const handleDragStart = (e: React.DragEvent, id: string) => {
      setDraggedCaseId(id);
      e.dataTransfer.setData('text/plain', id);
      e.dataTransfer.effectAllowed = 'move';
      // Optional: Set a custom drag image or styling here if needed
  };

  const handleDragOver = (e: React.DragEvent, stage: CaseStage) => {
      e.preventDefault(); // Necessary to allow dropping
      if (dragOverStage !== stage) {
          setDragOverStage(stage);
      }
  };

  const handleDragLeave = (e: React.DragEvent) => {
      e.preventDefault();
      // Logic to clear highlight when leaving the valid drop zone completely
      // Simplified: We reset on Drop, but sometimes need finer control.
      // For now, rely on Drop resetting it or switching to another DragOver.
  };

  const handleDrop = (e: React.DragEvent, stage: CaseStage) => {
      e.preventDefault();
      const id = e.dataTransfer.getData('text/plain');
      
      if (id && id === draggedCaseId) {
          // Verify stage changed
          const caseItem = cases.find(c => c.id === id);
          if (caseItem && caseItem.stage !== stage) {
              onStageChange(id, stage);
          }
      }
      
      setDraggedCaseId(null);
      setDragOverStage(null);
  };

  return (
    <div className="flex flex-col h-full">
      
      {/* 1. View Switcher Tabs (Compressed) */}
      <div className="flex items-center gap-2 mb-2 shrink-0 overflow-x-auto pb-1 min-h-[36px]">
          {BOARDS.map(board => {
              const isActive = activeTab === board.id;
              const count = cases.filter(c => 
                  board.id === 'CIVIL_LITIGATION' 
                  ? (c.procedureType === 'CIVIL_LITIGATION' || !c.procedureType)
                  : c.procedureType === board.id
              ).length;

              return (
                  <button
                      key={board.id}
                      onClick={() => setActiveTab(board.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                          isActive 
                          ? getThemeStyles(board.themeColor)
                          : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                      }`}
                  >
                      <board.icon className={`w-3.5 h-3.5 ${isActive ? '' : 'text-slate-400'}`} />
                      {board.label}
                      <span className={`text-[10px] ml-1 px-1.5 py-0.5 rounded-full ${
                          isActive ? 'bg-white/50' : 'bg-slate-100 text-slate-400'
                      }`}>
                          {count}
                      </span>
                  </button>
              );
          })}
      </div>

      {/* 2. The Kanban Board Area */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden bg-slate-50/50 rounded-xl border border-slate-200">
          <div className="flex h-full min-w-max">
              {activeConfig.stages.map((stage, index) => {
                  const stageCases = currentCases.filter(c => c.stage === stage);
                  const count = stageCases.length;
                  const totalAmount = stageCases.reduce((sum, c) => sum + (c.regulatoryAttrs?.amountNoInterest || 0), 0);
                  const isDragOver = dragOverStage === stage;
                  
                  return (
                      <div 
                        key={stage}
                        onDragOver={(e) => handleDragOver(e, stage)}
                        onDrop={(e) => handleDrop(e, stage)}
                        onDragLeave={handleDragLeave}
                        className={`w-80 flex flex-col h-full border-r border-slate-200 last:border-r-0 transition-colors duration-200 ${
                            isDragOver ? 'bg-blue-50/80 ring-2 ring-inset ring-brand-300' : 
                            index % 2 === 0 ? 'bg-slate-50/30' : 'bg-white'
                        }`}
                      >
                          {/* Fixed Column Header (Compressed Single Line) */}
                          <div className="px-3 py-2 border-b border-slate-200 bg-slate-50/90 backdrop-blur flex justify-between items-center shrink-0 sticky top-0 z-10 h-9">
                              <h4 className="font-bold text-xs text-slate-700 flex items-center gap-2 w-full">
                                  <div className={`w-2 h-2 rounded-full shrink-0 ${count > 0 ? 'bg-brand-500' : 'bg-slate-300'}`}></div>
                                  <span className="truncate">{stage}</span>
                                  <span className="ml-auto text-[10px] text-slate-400 font-normal font-mono flex gap-2">
                                      <span>{count}</span>
                                      {totalAmount > 0 && <span>¥{(totalAmount/10000).toFixed(0)}w</span>}
                                  </span>
                              </h4>
                          </div>

                          {/* Scrollable Column Content */}
                          <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar relative">
                              {/* Drop Target Indicator */}
                              {isDragOver && (
                                  <div className="absolute inset-0 bg-brand-100/10 pointer-events-none z-0"></div>
                              )}

                              {stageCases.map(c => {
                                  const isEpic = c.caseType === CaseType.SERIES_MASTER;
                                  const isSelected = c.id === selectedId;
                                  const isDragging = c.id === draggedCaseId;

                                  return (
                                      <div 
                                          key={c.id} 
                                          draggable
                                          onDragStart={(e) => handleDragStart(e, c.id)}
                                          onClick={() => onSelectCase(c.id)}
                                          className={`bg-white p-3 rounded-lg border shadow-sm hover:shadow-md cursor-grab active:cursor-grabbing transition-all group relative ${
                                              isDragging ? 'opacity-40 scale-95 rotate-2 shadow-none ring-2 ring-slate-300' :
                                              isSelected ? 'ring-2 ring-brand-500 border-brand-500 z-10' :
                                              isEpic ? 'border-purple-200 ring-1 ring-purple-100 bg-purple-50/10' : 'border-slate-200 hover:border-brand-300'
                                          }`}
                                      >
                                          {/* Epic Badge */}
                                          {isEpic && (
                                              <div className="absolute -top-2 -right-2 bg-purple-600 text-white text-[10px] px-2 py-0.5 rounded-full shadow-sm flex items-center gap-1 z-10 font-bold">
                                                  <Layers className="w-3 h-3" /> 总案
                                              </div>
                                          )}

                                          {/* Card Header */}
                                          <div className="flex justify-between items-start mb-2">
                                              <span className="font-mono text-[10px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded group-hover:text-brand-600 transition-colors truncate max-w-[120px]">
                                                  {c.code}
                                              </span>
                                              <span className={`text-[10px] px-1.5 py-0.5 rounded border font-bold ${getRiskStyles(c.riskLevel)}`}>
                                                  {c.riskLevel}
                                              </span>
                                          </div>

                                          {/* Title */}
                                          <h5 className={`text-sm font-bold mb-2 line-clamp-3 leading-snug group-hover:text-brand-700 ${isEpic ? 'text-purple-900' : 'text-slate-800'}`}>
                                              {c.title}
                                          </h5>

                                          {/* Footer Meta */}
                                          <div className="flex items-end justify-between pt-2 border-t border-slate-50">
                                              <div className="flex items-center gap-2 text-xs text-slate-500">
                                                  {c.lawyerId ? (
                                                      <div className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600" title="外聘律师">
                                                          <User className="w-3 h-3" />
                                                      </div>
                                                  ) : (
                                                      <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                                                          <User className="w-3 h-3" />
                                                      </div>
                                                  )}
                                                  <span className="text-[10px] bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100 truncate max-w-[80px]">
                                                      {lookup(DICT_TYPES.BUSINESS_LINE, c.businessLine, c.businessLine)}
                                                  </span>
                                              </div>
                                              
                                              {c.nextDeadline && (
                                                  <div className={`flex items-center gap-1 text-[10px] font-bold ${
                                                      new Date(c.nextDeadline) < new Date() ? 'text-red-500' : 
                                                      new Date(c.nextDeadline).getTime() - Date.now() < 7 * 86400000 ? 'text-amber-500' : 'text-slate-400'
                                                  }`}>
                                                      <Clock className="w-3 h-3" />
                                                      {c.nextDeadline.slice(5)}
                                                  </div>
                                              )}
                                          </div>
                                      </div>
                                  );
                              })}
                              
                              {/* Empty State for Column */}
                              {count === 0 && !isDragOver && (
                                  <div className="h-32 flex flex-col items-center justify-center text-slate-300">
                                      <div className="w-10 h-10 rounded-full bg-slate-100/50 flex items-center justify-center mb-1">
                                          <Briefcase className="w-4 h-4 opacity-20" />
                                      </div>
                                      <p className="text-[10px]">暂无案件</p>
                                  </div>
                              )}
                          </div>
                      </div>
                  );
              })}
          </div>
      </div>
    </div>
  );
};

export default CaseKanban;
