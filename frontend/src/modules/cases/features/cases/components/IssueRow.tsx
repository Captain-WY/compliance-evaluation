
import React from 'react';
import { BaseIssue, IssueType, Case, Clue, EvidenceTask, RiskLevel } from '../../../types';
import { ChevronRight, MoreHorizontal, Layers, CheckSquare, Bug, Users, AlertTriangle, Clock } from 'lucide-react';

interface IssueRowProps {
  issue: BaseIssue;
  onNavigate: (path: string) => void;
}

const IssueRow: React.FC<IssueRowProps> = ({ issue, onNavigate }) => {
  
  const handleRowClick = () => {
      // Route based on type
      if (issue.issueType === IssueType.CASE || issue.issueType === IssueType.EPIC) {
          onNavigate(`/cases/${issue.id}`);
      } else if (issue.issueType === IssueType.CLUE) {
          onNavigate(`/clues/${issue.id}`);
      } else {
          // Tasks currently don't have a detail page in this demo, maybe open a modal?
          // For now, no-op or alert
      }
  };

  const getIcon = () => {
      switch (issue.issueType) {
          case IssueType.EPIC: return <div className="p-1 bg-purple-100 rounded text-purple-600"><Layers className="w-3 h-3" /></div>;
          case IssueType.CASE: return <div className="p-1 bg-brand-100 rounded text-brand-600"><Layers className="w-3 h-3" /></div>;
          case IssueType.CLUE: return <div className="p-1 bg-red-100 rounded text-red-600"><Bug className="w-3 h-3" /></div>;
          case IssueType.TASK: return <div className="p-1 bg-blue-100 rounded text-blue-600"><CheckSquare className="w-3 h-3" /></div>;
          default: return null;
      }
  };

  // Polymorphic Data Accessors
  const getSubtext = () => {
      if (issue.issueType === IssueType.CASE) return (issue as Case).court;
      if (issue.issueType === IssueType.CLUE) return `来源: ${(issue as Clue).source}`;
      if (issue.issueType === IssueType.TASK) return `部门: ${(issue as EvidenceTask).assigneeDept}`;
      return '';
  };

  const getAmount = () => {
      if (issue.issueType === IssueType.CASE) return (issue as Case).regulatoryAttrs?.amountNoInterest;
      if (issue.issueType === IssueType.CLUE) return (issue as Clue).cleanedAmount;
      return null;
  };

  const getAmountDisplay = () => {
      const amt = getAmount();
      return amt ? `¥${amt.toLocaleString()}` : '-';
  };

  return (
    <tr 
        className="hover:bg-slate-50 group cursor-pointer transition-colors border-b border-slate-100 last:border-0"
        onClick={handleRowClick}
    >
        {/* Type & Key */}
        <td className="px-6 py-3">
            <div className="flex items-center gap-3">
                {getIcon()}
                <span className="font-mono text-xs font-bold text-slate-600">{issue.key}</span>
            </div>
        </td>

        {/* Title */}
        <td className="px-6 py-3">
            <div className="font-bold text-slate-800 truncate max-w-md group-hover:text-brand-600 transition-colors text-sm">
                {issue.title}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
                {getSubtext()}
            </div>
        </td>

        {/* Status */}
        <td className="px-6 py-3">
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${
                issue.status === '已结案' || issue.status === 'APPROVED' ? 'bg-slate-100 text-slate-500 border-slate-200' :
                issue.status === '待清洗' ? 'bg-red-50 text-red-600 border-red-100' :
                'bg-blue-50 text-blue-600 border-blue-100'
            }`}>
                {issue.status}
            </span>
        </td>

        {/* Priority / Risk */}
        <td className="px-6 py-3">
            {issue.priority ? (
                <span className={`flex items-center gap-1 text-[10px] font-bold ${
                    issue.priority === RiskLevel.CRITICAL ? 'text-red-600' :
                    issue.priority === RiskLevel.HIGH ? 'text-orange-600' : 'text-slate-500'
                }`}>
                    {(issue.priority === RiskLevel.CRITICAL || issue.priority === RiskLevel.HIGH) && <AlertTriangle className="w-3 h-3" />}
                    {issue.priority}
                </span>
            ) : <span className="text-slate-300 text-xs">-</span>}
        </td>

        {/* Assignee */}
        <td className="px-6 py-3 text-xs text-slate-600">
            {issue.assignee ? (
                <div className="flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-[9px] font-bold text-slate-500">
                        {issue.assignee.charAt(0)}
                    </div>
                    {issue.assignee.split(' ')[0]}
                </div>
            ) : <span className="text-slate-300">-</span>}
        </td>

        {/* Dynamic Column (Amount or Deadline) */}
        <td className="px-6 py-3 text-right">
            {issue.issueType === IssueType.TASK ? (
                <div className="flex items-center justify-end gap-1 text-xs text-slate-500">
                    <Clock className="w-3 h-3" /> {(issue as EvidenceTask).deadline}
                </div>
            ) : (
                <span className="font-mono text-xs text-slate-700">{getAmountDisplay()}</span>
            )}
        </td>

        {/* Action */}
        <td className="px-6 py-3 text-center">
            <button className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-slate-100 rounded opacity-0 group-hover:opacity-100 transition-all">
                <ChevronRight className="w-4 h-4" />
            </button>
        </td>
    </tr>
  );
};

export default IssueRow;
