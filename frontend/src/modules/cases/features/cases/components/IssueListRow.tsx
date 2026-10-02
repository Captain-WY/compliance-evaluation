
import React from 'react';
import { BaseIssue, IssueType, Case, Clue, EvidenceTask, RiskLevel } from '../../../types';
import { Layers, Bug, CheckSquare, AlertTriangle, Clock, User, Briefcase } from 'lucide-react';

interface IssueListRowProps {
  issue: BaseIssue;
  isSelected: boolean;
  onClick: () => void;
}

const IssueListRow: React.FC<IssueListRowProps> = ({ issue, isSelected, onClick }) => {
  
  const getIcon = () => {
      switch (issue.issueType) {
          case IssueType.EPIC: return <Layers className="w-3.5 h-3.5 text-purple-600" />;
          case IssueType.CASE: return <Briefcase className="w-3.5 h-3.5 text-brand-600" />;
          case IssueType.CLUE: return <Bug className="w-3.5 h-3.5 text-red-600" />;
          case IssueType.TASK: return <CheckSquare className="w-3.5 h-3.5 text-blue-600" />;
          default: return null;
      }
  };

  const getStatusColor = (status: string) => {
      if (status === '已结案' || status === 'CLOSED' || status === 'APPROVED') return 'bg-slate-100 text-slate-500';
      if (status === '待清洗' || status === 'OVERDUE') return 'bg-red-50 text-red-700 border-red-100';
      if (status === '执行' || status === 'ENFORCEMENT') return 'bg-orange-50 text-orange-700 border-orange-100';
      return 'bg-blue-50 text-blue-700 border-blue-100';
  };

  // Specific Data Extraction
  let amountDisplay = null;
  let deadlineDisplay = null;

  if (issue.issueType === IssueType.CASE) {
      const c = issue as Case;
      if (c.regulatoryAttrs?.amountNoInterest) {
          amountDisplay = `¥ ${(c.regulatoryAttrs.amountNoInterest / 10000).toFixed(0)}万`;
      }
      if (c.nextDeadline) deadlineDisplay = c.nextDeadline.slice(5); // MM-DD
  } else if (issue.issueType === IssueType.CLUE) {
      const c = issue as Clue;
      if (c.cleanedAmount) {
          amountDisplay = `¥ ${(c.cleanedAmount / 10000).toFixed(0)}万`;
      }
  } else if (issue.issueType === IssueType.TASK) {
      const t = issue as EvidenceTask; // or ProcessNode
      if ((t as any).deadline) deadlineDisplay = (t as any).deadline.slice(5);
  }

  const isCritical = issue.priority === RiskLevel.CRITICAL || issue.priority === RiskLevel.HIGH;

  return (
    <div 
        onClick={onClick}
        className={`relative p-3 border-b border-slate-100 cursor-pointer transition-all group ${
            isSelected ? 'bg-white shadow-sm z-10' : 'hover:bg-white hover:shadow-sm bg-slate-50/30'
        }`}
    >
        {/* Selection Marker */}
        {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand-600"></div>}

        {/* Row 1: Key + Badges + Time */}
        <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
                <div className={`p-1 rounded ${
                    issue.issueType === IssueType.EPIC ? 'bg-purple-100' :
                    issue.issueType === IssueType.CASE ? 'bg-brand-100' :
                    issue.issueType === IssueType.CLUE ? 'bg-red-100' : 'bg-blue-100'
                }`}>
                    {getIcon()}
                </div>
                <span className={`text-xs font-mono font-bold ${isSelected ? 'text-brand-700' : 'text-slate-600'}`}>
                    {issue.key}
                </span>
                {isCritical && (
                    <span className="text-[9px] bg-red-100 text-red-600 px-1.5 rounded-full font-bold border border-red-200">
                        {issue.priority}
                    </span>
                )}
            </div>
            {deadlineDisplay && (
                <div className={`text-[10px] flex items-center gap-1 font-mono ${
                    isSelected ? 'text-brand-600' : 'text-slate-400'
                }`}>
                    <Clock className="w-3 h-3" /> {deadlineDisplay}
                </div>
            )}
        </div>

        {/* Row 2: Title */}
        <h4 className={`text-sm font-medium mb-2 line-clamp-2 leading-snug ${
            isSelected ? 'text-slate-900' : 'text-slate-700 group-hover:text-brand-700'
        }`}>
            {issue.title}
        </h4>

        {/* Row 3: Footer Meta */}
        <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-2">
                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${getStatusColor(issue.status)}`}>
                    {issue.status}
                </span>
                {amountDisplay && (
                    <span className="text-[10px] text-slate-500 font-mono bg-slate-100 px-1.5 py-0.5 rounded">
                        {amountDisplay}
                    </span>
                )}
            </div>
            
            {issue.assignee && (
                <div className="flex items-center gap-1.5" title={`Assignee: ${issue.assignee}`}>
                    <div className="w-5 h-5 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center text-[9px] font-bold ring-1 ring-white">
                        {issue.assignee.charAt(0)}
                    </div>
                </div>
            )}
        </div>
    </div>
  );
};

export default IssueListRow;
