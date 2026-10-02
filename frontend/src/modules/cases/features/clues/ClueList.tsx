import React from 'react';
import type { ClueRecord } from '../../services/case';
import { FileText, ChevronRight } from 'lucide-react';
import Button from '../../components/ui/Button';

interface ClueListProps {
  clues: ClueRecord[];
  onSelectClue: (id: string) => void;
}

const STATUS_STYLE: Record<string, string> = {
  NEW: 'bg-red-50 text-red-700 border-red-100',
  FOLLOWING: 'bg-amber-50 text-amber-700 border-amber-100',
  CONVERTED: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  REJECTED: 'bg-slate-100 text-slate-500 border-slate-200',
  CLOSED: 'bg-slate-100 text-slate-500 border-slate-200',
};

const ClueList: React.FC<ClueListProps> = ({ clues, onSelectClue }) => {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <h3 className="font-semibold text-slate-800 flex items-center gap-2">
          <span className="w-1.5 h-4 bg-brand-500 rounded-sm"></span>
          风险线索池
        </h3>
        <div className="text-xs text-slate-400">共 {clues.length} 条记录</div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 text-slate-500 font-medium">
            <tr>
              <th className="px-6 py-3">来源</th>
              <th className="px-6 py-3">上报时间</th>
              <th className="px-6 py-3">线索标题</th>
              <th className="px-6 py-3">对方当事人</th>
              <th className="px-6 py-3 text-right">预估金额</th>
              <th className="px-6 py-3">状态</th>
              <th className="px-6 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {clues.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                  <FileText className="w-10 h-10 mx-auto mb-2 opacity-20" />
                  暂无风险线索
                </td>
              </tr>
            ) : (
              clues.map(clue => (
                <tr key={clue.clueId} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                      {clue.sourceTypeName || clue.sourceType}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-600 font-mono text-xs">
                    {clue.createdAt.slice(0, 10)}
                  </td>
                  <td className="px-6 py-4 max-w-xs truncate text-slate-800 font-medium" title={clue.clueTitle}>
                    {clue.clueTitle}
                  </td>
                  <td className="px-6 py-4 text-slate-600">{clue.opponentName || '—'}</td>
                  <td className="px-6 py-4 text-right font-mono text-sm">
                    {clue.estimatedAmount != null
                      ? `¥${clue.estimatedAmount.toLocaleString()}`
                      : '—'}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${STATUS_STYLE[clue.status] ?? 'bg-slate-100 text-slate-500'}`}>
                      {clue.status === 'NEW' && (
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                        </span>
                      )}
                      {clue.statusName}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onSelectClue(clue.clueId)}
                      className="text-brand-600 hover:text-brand-700 hover:bg-brand-50"
                    >
                      处理 <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ClueList;
