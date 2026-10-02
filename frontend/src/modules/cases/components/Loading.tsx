import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingProps {
  text?: string;
  fullScreen?: boolean;
}

export const Loading: React.FC<LoadingProps> = ({ text = '正在加载...', fullScreen = false }) => {
  const containerClass = fullScreen
    ? 'fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm'
    : 'flex flex-col items-center justify-center p-12 min-h-[300px] w-full';

  return (
    <div className={containerClass}>
      <Loader2 className="w-8 h-8 text-brand-600 animate-spin mb-4" />
      <p className="text-sm font-medium text-slate-500 animate-pulse">{text}</p>
    </div>
  );
};

export const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div className={`animate-pulse bg-slate-200 rounded ${className}`} />
  );
};

export const TableSkeleton: React.FC<{ rows?: number; columns?: number }> = ({ rows = 5, columns = 4 }) => {
  return (
    <div className="w-full border border-slate-200 rounded-lg overflow-hidden bg-white">
      <div className="flex bg-slate-50 border-b border-slate-200 p-4 gap-4">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={`th-${i}`} className="h-4 flex-1" />
        ))}
      </div>
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={`tr-${rowIndex}`} className="flex p-4 gap-4">
            {Array.from({ length: columns }).map((_, colIndex) => (
              <Skeleton key={`td-${rowIndex}-${colIndex}`} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export const CaseDetailSkeleton: React.FC = () => {
  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {/* Header Skeleton */}
      <div className="bg-slate-900 px-8 py-6 shrink-0">
        <div className="flex items-center gap-4 mb-4">
          <Skeleton className="w-8 h-8 rounded-full bg-slate-700" />
          <Skeleton className="h-6 w-1/3 bg-slate-700" />
        </div>
        <div className="flex gap-6">
          <Skeleton className="h-4 w-24 bg-slate-700" />
          <Skeleton className="h-4 w-32 bg-slate-700" />
          <Skeleton className="h-4 w-24 bg-slate-700" />
        </div>
      </div>
      
      {/* Content Skeleton */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 bg-white border-r border-slate-200 p-4 shrink-0 space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={`nav-${i}`} className="h-10 w-full rounded-lg" />
          ))}
        </div>
        
        {/* Main Content */}
        <div className="flex-1 p-8 overflow-y-auto space-y-6">
          <div className="grid grid-cols-3 gap-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={`card-${i}`} className="bg-white p-6 rounded-xl border border-slate-200">
                <Skeleton className="h-4 w-1/2 mb-4" />
                <Skeleton className="h-8 w-3/4" />
              </div>
            ))}
          </div>
          <div className="bg-white p-6 rounded-xl border border-slate-200 h-64">
            <Skeleton className="h-6 w-1/4 mb-6" />
            <div className="space-y-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-4/6" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
