import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  size: number;
  total: number;
  onPageChange: (page: number) => void;
  onSizeChange?: (size: number) => void;
  className?: string;
}

const Pagination: React.FC<PaginationProps> = ({
  page, size, total, onPageChange, onSizeChange, className = ''
}) => {
  const totalPages = Math.max(1, Math.ceil(total / size));
  const startItem = (page - 1) * size + 1;
  const endItem = Math.min(page * size, total);

  const canPrev = page > 1;
  const canNext = page < totalPages;

  const pageSizes = [20, 50, 100];

  return (
    <div className={`flex items-center justify-between px-4 py-2 bg-white border-t border-slate-200 text-xs ${className}`}>
      {/* Left: Info */}
      <div className="flex items-center gap-3 text-slate-500">
        <span>
          共 <b className="text-slate-700">{total}</b> 条
        </span>
        {onSizeChange && (
          <select
            value={size}
            onChange={(e) => onSizeChange(Number(e.target.value))}
            className="h-7 px-2 border border-slate-200 rounded-md text-xs bg-white hover:border-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-300"
          >
            {pageSizes.map(s => (
              <option key={s} value={s}>{s} 条/页</option>
            ))}
          </select>
        )}
        <span className="text-slate-400">
          第 {startItem}-{endItem} 条
        </span>
      </div>

      {/* Right: Page Controls */}
      <div className="flex items-center gap-1">
        <button
          disabled={!canPrev}
          onClick={() => onPageChange(1)}
          className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="首页"
        >
          <ChevronsLeft className="w-3.5 h-3.5" />
        </button>
        <button
          disabled={!canPrev}
          onClick={() => onPageChange(page - 1)}
          className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="上一页"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>

        <span className="px-3 py-1 text-slate-700 font-medium">
          {page} / {totalPages}
        </span>

        <button
          disabled={!canNext}
          onClick={() => onPageChange(page + 1)}
          className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="下一页"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
        <button
          disabled={!canNext}
          onClick={() => onPageChange(totalPages)}
          className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="末页"
        >
          <ChevronsRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

export default Pagination;
