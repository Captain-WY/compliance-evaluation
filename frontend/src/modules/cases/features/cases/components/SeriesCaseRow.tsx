import React, { useState } from 'react';
import { Case, CaseStage, RiskLevel, CaseType } from '../../../types';
import { ChevronRight, ChevronDown, CornerDownRight, Users, MoreHorizontal } from 'lucide-react';

interface SeriesCaseRowProps {
  caseItem: Case;
  childrenCases: Case[];
  level: number;
  onNavigate: (id: string) => void;
  columns: any; // Simplified for demo
}

const SeriesCaseRow: React.FC<SeriesCaseRowProps> = ({ caseItem, childrenCases, level, onNavigate, columns }) => {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = childrenCases.length > 0;
  const isMaster = caseItem.caseType === CaseType.SERIES_MASTER;

  const handleRowClick = () => {
      onNavigate(`/cases/${caseItem.id}`);
  };

  const toggleExpand = (e: React.MouseEvent) => {
      e.stopPropagation();
      setExpanded(!expanded);
  };

  return (
    <>
      <tr 
        className={`hover:bg-slate-50 group cursor-pointer transition-colors border-b border-slate-100 ${isMaster ? 'bg-slate-50/50' : ''}`}
        onClick={handleRowClick}
      >
        {/* Code Column with Indentation */}
        <td className="px-6 py-3 font-mono text-xs text-slate-500">
            <div className="flex items-center" style={{ paddingLeft: `${level * 20}px` }}>
                {hasChildren ? (
                    <button onClick={toggleExpand} className="p-1 hover:bg-slate-200 rounded mr-2 transition-colors">
                        {expanded ? <ChevronDown className="w-3 h-3 text-slate-600" /> : <ChevronRight className="w-3 h-3 text-slate-400" />}
                    </button>
                ) : level > 0 ? (
                    <CornerDownRight className="w-3 h-3 text-slate-300 mr-2" />
                ) : (
                    <div className="w-6" /> // Spacer
                )}
                <span className={isMaster ? 'font-bold text-slate-700' : ''}>{caseItem.code}</span>
            </div>
        </td>

        {/* Title */}
        <td className="px-6 py-3">
            <div className="flex items-center gap-2">
                {isMaster && (
                    <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-200 font-bold whitespace-nowrap">
                        系列总案
                    </span>
                )}
                {caseItem.caseType === CaseType.SERIES_CHILD && (
                    <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200 whitespace-nowrap">
                        子案
                    </span>
                )}
                <div className="font-bold text-slate-800 truncate max-w-sm group-hover:text-brand-600 transition-colors">
                    {caseItem.title}
                </div>
            </div>
            {isMaster && (
                <div className="text-[10px] text-slate-400 mt-1 pl-1 flex items-center gap-1">
                    <Users className="w-3 h-3" /> 包含 {childrenCases.length} 个关联子案件
                </div>
            )}
        </td>

        {/* Stage */}
        <td className="px-6 py-3">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                {caseItem.stage}
            </span>
        </td>

        {/* Risk */}
        <td className="px-6 py-3">
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${
                caseItem.riskLevel === RiskLevel.CRITICAL ? 'bg-red-50 text-red-700 border-red-200' :
                caseItem.riskLevel === RiskLevel.HIGH ? 'bg-orange-50 text-orange-700 border-orange-200' :
                'bg-blue-50 text-blue-700 border-blue-200'
            }`}>
                {caseItem.riskLevel}
            </span>
        </td>

        {/* Amount */}
        <td className="px-6 py-3 text-right font-mono text-slate-700">
            {caseItem.regulatoryAttrs?.amountNoInterest ? `¥${(caseItem.regulatoryAttrs.amountNoInterest).toLocaleString()}` : '-'}
        </td>

        {/* Next Deadline */}
        <td className="px-6 py-3">
            {caseItem.nextDeadline ? (
                <div className={`flex items-center gap-1.5 text-xs ${
                    new Date(caseItem.nextDeadline) < new Date() ? 'text-red-600 font-bold' : 'text-slate-600'
                }`}>
                    {caseItem.nextDeadline}
                </div>
            ) : <span className="text-slate-300 text-xs">-</span>}
        </td>

        {/* Action */}
        <td className="px-6 py-3 text-center">
            <button className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-slate-100 rounded opacity-0 group-hover:opacity-100 transition-all">
                <MoreHorizontal className="w-4 h-4" />
            </button>
        </td>
      </tr>

      {/* Render Children Recursively */}
      {expanded && childrenCases.map(child => (
          <SeriesCaseRow 
            key={child.id} 
            caseItem={child} 
            childrenCases={[]} // Flattened for now, assuming 2 levels max for demo
            level={level + 1} 
            onNavigate={onNavigate}
            columns={columns}
          />
      ))}
    </>
  );
};

export default SeriesCaseRow;