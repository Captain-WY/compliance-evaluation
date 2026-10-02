import React from 'react';
import { Check } from 'lucide-react';
import type { InspectionPhase, InspectionStatus } from '../../types';
import {
  getInspectionPhaseLabel,
  getInspectionProgressIndex,
  INSPECTION_PROGRESS_PHASES,
} from '../../services/dictionaryMapper';

type StageTab = 'prep' | 'exec' | 'report' | 'rectify';

const stages: Array<{
  id: StageTab;
  label: string;
  phase: InspectionPhase;
}> = [
  { id: 'prep', label: '准备', phase: INSPECTION_PROGRESS_PHASES[0] },
  { id: 'exec', label: '实施', phase: INSPECTION_PROGRESS_PHASES[1] },
  { id: 'report', label: '报告', phase: INSPECTION_PROGRESS_PHASES[2] },
  { id: 'rectify', label: '整改', phase: INSPECTION_PROGRESS_PHASES[3] },
];

const isTerminalCompleted = (status?: InspectionStatus, phase?: InspectionPhase) =>
  status === 'COMPLETED' || phase === 'CLOSED' || phase === 'ARCHIVED';

const stageSubLabel = ({
  index,
  currentIndex,
  currentPhase,
  status,
  progress,
}: {
  index: number;
  currentIndex: number;
  currentPhase: InspectionPhase;
  status?: InspectionStatus;
  progress: number;
}) => {
  if (isTerminalCompleted(status, currentPhase) && index <= currentIndex) return '已完成';
  if (status === 'TERMINATED') return index <= currentIndex ? '已终止' : '未到达';
  if (index < currentIndex) return '已完成';
  if (index === currentIndex) {
    if (currentIndex === 0) return getInspectionPhaseLabel(currentPhase);
    return `${getInspectionPhaseLabel(currentPhase)} ${progress}%`;
  }
  return '待到达';
};

const CircularProgress = ({ progress, hideLabel }: { progress: number; hideLabel?: boolean }) => {
  const radius = 13;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div className="relative w-8 h-8 flex items-center justify-center">
      <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 32 32">
        <circle
          cx="16" cy="16" r={radius}
          stroke="currentColor" strokeWidth="3" fill="transparent"
          className="text-indigo-100"
        />
        <circle
          cx="16" cy="16" r={radius}
          stroke="currentColor" strokeWidth="3" fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className="text-indigo-600 transition-all duration-1000 ease-out"
        />
      </svg>
      {!hideLabel && <span className="absolute text-[9px] font-bold text-indigo-700">{progress}%</span>}
    </div>
  );
};

export default function InteractiveStageStepper({ 
  activeTab = 'exec', 
  onChange,
  currentPhase = 'EVIDENCE_COLLECTING',
  status,
  phaseProgress = 0,
}: { 
  activeTab?: StageTab,
  onChange?: (tab: StageTab) => void,
  currentPhase?: InspectionPhase,
  status?: InspectionStatus,
  phaseProgress?: number,
}) {
  const currentIndex = getInspectionProgressIndex(currentPhase);
  const normalizedProgress = Math.max(0, Math.min(phaseProgress, 100));
  return (
    <div className="w-full bg-white border-b border-slate-200 overflow-x-auto">
      <div className="min-w-max md:min-w-0 max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex w-full">
          {stages.map((stage, index) => {
            const isActive = activeTab === stage.id;
            const isCompleted = isTerminalCompleted(status, currentPhase)
              ? index <= currentIndex
              : index < currentIndex;
            const isInProgress = !isCompleted && status !== 'TERMINATED' && index === currentIndex;
            const isPending = !isCompleted && !isInProgress;
            const subLabel = stageSubLabel({
              index,
              currentIndex,
              currentPhase,
              status,
              progress: normalizedProgress,
            });

            return (
              <div 
                key={stage.id} 
                className={`flex ${index !== stages.length - 1 ? 'flex-1' : ''}`}
              >
                {/* Step Button */}
                <button 
                  onClick={() => onChange?.(stage.id)}
                  className={`group relative flex items-center px-4 py-4 border-b-[3px] outline-none transition-all hover:bg-slate-50/50 rounded-t-lg
                    ${isActive ? 'border-indigo-600' : 'border-transparent hover:border-slate-300'}
                  `}
                >
                  {/* Icon */}
                  <div className="flex-shrink-0">
                    {isCompleted && (
                      <div className="w-8 h-8 flex items-center justify-center rounded-full border-2 border-indigo-600 bg-indigo-50 text-indigo-600 shadow-sm transition-transform group-hover:scale-105">
                        <Check className="w-4 h-4 stroke-[3]" />
                      </div>
                    )}
                    {isInProgress && (
                      <div className="transition-transform group-hover:scale-105">
                        <CircularProgress progress={normalizedProgress} hideLabel={currentIndex === 0} />
                      </div>
                    )}
                    {isPending && (
                       <div className="w-8 h-8 flex items-center justify-center rounded-full border-2 border-slate-200 bg-slate-50 transition-transform group-hover:scale-105">
                         <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                       </div>
                    )}
                  </div>
                  
                  {/* Text */}
                  <div className="ml-3 text-left">
                    <p className={`text-sm tracking-tight transition-colors ${isActive ? 'font-bold text-indigo-900' : 'font-semibold text-slate-700'}`}>
                      {stage.label}
                    </p>
                    <p className={`text-[11px] mt-0.5 whitespace-nowrap transition-colors ${isActive ? 'text-indigo-600/80 font-medium' : 'text-slate-500'}`}>
                      {subLabel}
                    </p>
                  </div>
                </button>

                {/* Connecting Line */}
                {index !== stages.length - 1 && (
                  <div className="flex-1 hidden md:flex items-center px-4">
                     <div className="w-full h-[2px] bg-slate-100 rounded-full overflow-hidden">
                       <div 
                         className="h-full bg-indigo-500 transition-all duration-500"
                         style={{ width: isCompleted ? '100%' : '0%' }}
                       />
                     </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
