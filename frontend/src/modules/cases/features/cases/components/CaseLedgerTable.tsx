import React, { useMemo, useState, useEffect } from 'react';
import { Case, CaseStage, RiskLevel, ProcedureType, CaseRole } from '../../../types';
import { getProcedureRecords, getCommunicationLogs } from '../../../services/mock/ledgers';
import { AlertTriangle, Clock, MessageSquare, ExternalLink, ChevronRight } from 'lucide-react';
import useDict, { DICT_TYPES } from '../../../hooks/useDict';

interface CaseLedgerTableProps {
  cases: Case[];
  onSelectCase: (id: string) => void;
}

// Helper to format currency
const formatCurrency = (amount?: number) => {
  if (amount === undefined || amount === null) return '-';
  return new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
};

// Helper for Risk Badge
const RiskBadge = ({ level }: { level: RiskLevel }) => {
  const styles = {
    [RiskLevel.CRITICAL]: 'bg-red-100 text-red-800 border-red-200',
    [RiskLevel.HIGH]: 'bg-orange-100 text-orange-800 border-orange-200',
    [RiskLevel.MEDIUM]: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    [RiskLevel.LOW]: 'bg-slate-100 text-slate-600 border-slate-200',
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${styles[level] || styles[RiskLevel.LOW]}`}>
      {level}
    </span>
  );
};

// Magic Column Component
const MagicProgressCell = ({ caseId, stage }: { caseId: string, stage: string }) => {
  const [nextDeadline, setNextDeadline] = useState<{ node: string, date: string, status: string } | null>(null);
  const [latestLog, setLatestLog] = useState<{ summary: string, date: string } | null>(null);

  useEffect(() => {
    let isMounted = true;
    
    // Parallel fetch for magic column data
    Promise.all([
      getProcedureRecords(caseId),
      getCommunicationLogs(caseId)
    ]).then(([procedures, logs]) => {
      if (!isMounted) return;

      // 1. Find next pending deadline
      const pending = procedures
        .filter(p => p.status !== 'COMPLETED')
        .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())[0];
      
      if (pending) {
        setNextDeadline({
          node: pending.nodeName,
          date: pending.deadline,
          status: pending.status
        });
      }

      // 2. Find latest log
      const latest = logs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
      if (latest) {
        setLatestLog({
          summary: latest.summary,
          date: latest.date
        });
      }
    });

    return () => { isMounted = false; };
  }, [caseId]);

  return (
    <div className="flex flex-col gap-1 text-[11px] leading-tight max-w-[300px]">
      {/* Top: Next Action */}
      {nextDeadline ? (
        <div className={`flex items-center gap-1.5 ${nextDeadline.status === 'OVERDUE' ? 'text-red-600 font-bold' : 'text-amber-600'}`}>
          <Clock className="w-3 h-3 shrink-0" />
          <span className="truncate">
            {nextDeadline.status === 'OVERDUE' ? '[逾期]' : ''} 
            {nextDeadline.node} ({nextDeadline.date.slice(5)})
          </span>
        </div>
      ) : (
        <div className="text-slate-400 flex items-center gap-1.5">
          <Clock className="w-3 h-3 shrink-0" /> 暂无待办
        </div>
      )}

      {/* Bottom: Latest Log */}
      {latestLog ? (
        <div className="flex items-start gap-1.5 text-slate-600 border-t border-slate-100 pt-1 mt-0.5">
          <MessageSquare className="w-3 h-3 shrink-0 mt-0.5 text-slate-400" />
          <span className="truncate" title={latestLog.summary}>
            {latestLog.summary}
          </span>
        </div>
      ) : (
        <div className="text-slate-300 text-[10px] pl-5">无沟通记录</div>
      )}
    </div>
  );
};

const CaseLedgerTable: React.FC<CaseLedgerTableProps> = ({ cases, onSelectCase }) => {
  const { lookup } = useDict();
  return (
    <div className="h-full flex flex-col bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="flex-1 overflow-auto custom-scrollbar relative">
        <table className="w-full text-left border-collapse min-w-[1800px]">
          <thead className="bg-slate-50 sticky top-0 z-20 shadow-sm">
            <tr>
              <th className="sticky left-0 z-30 bg-slate-50 border-b border-r border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 w-12 text-center">序号</th>
              <th className="sticky left-12 z-30 bg-slate-50 border-b border-r border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 w-32">内部案号</th>
              <th className="sticky left-44 z-30 bg-slate-50 border-b border-r border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 w-64">案件名称</th>
              <th className="border-b border-r border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 w-48">外部案号</th>
              <th className="border-b border-r border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 w-24">状态</th>
              <th className="border-b border-r border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 w-24">业务条线</th>
              <th className="border-b border-r border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 w-32">案由</th>
              <th className="border-b border-r border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 w-32">标的证券/项目</th>
              <th className="border-b border-r border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 w-20">我方地位</th>
              <th className="border-b border-r border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 w-40">原告/申请人</th>
              <th className="border-b border-r border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 w-40">被告/被申请人</th>
              <th className="border-b border-r border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 w-32 text-right">涉案金额(元)</th>
              <th className="border-b border-r border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 w-32 text-right">预计负债(元)</th>
              <th className="border-b border-r border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 w-40">受理机构</th>
              <th className="border-b border-r border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 w-32">主审法官</th>
              <th className="border-b border-r border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 w-32">外聘律师</th>
              <th className="border-b border-r border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 w-24">经办人</th>
              <th className="border-b border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 min-w-[300px]">最新进展与下步计划 (Magic Column)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {cases.map((c, index) => (
              <tr 
                key={c.id} 
                onClick={() => onSelectCase(c.id)}
                className="hover:bg-blue-50/50 transition-colors cursor-pointer group text-xs"
              >
                <td className="sticky left-0 bg-white group-hover:bg-blue-50/50 border-r border-slate-100 px-3 py-2 text-center text-slate-400 font-mono">
                  {index + 1}
                </td>
                <td className="sticky left-12 bg-white group-hover:bg-blue-50/50 border-r border-slate-100 px-3 py-2 font-mono text-slate-600 font-medium truncate">
                  {c.code}
                </td>
                <td className="sticky left-44 bg-white group-hover:bg-blue-50/50 border-r border-slate-100 px-3 py-2 text-slate-900 font-bold truncate max-w-[256px]" title={c.title}>
                  <div className="flex items-center gap-2">
                    <RiskBadge level={c.riskLevel} />
                    <span className="truncate">{c.title}</span>
                  </div>
                </td>
                <td className="border-r border-slate-100 px-3 py-2 text-slate-500 truncate font-mono" title={c.externalCaseNo}>
                  {c.externalCaseNo || '-'}
                </td>
                <td className="border-r border-slate-100 px-3 py-2 text-slate-600">
                  <span className="bg-slate-100 px-2 py-0.5 rounded-full text-[10px]">{c.stage}</span>
                </td>
                <td className="border-r border-slate-100 px-3 py-2 text-slate-600 truncate">{lookup(DICT_TYPES.BUSINESS_LINE, c.businessLine, c.businessLine)}</td>
                <td className="border-r border-slate-100 px-3 py-2 text-slate-600 truncate" title={c.cause}>{lookup(DICT_TYPES.CAUSE_OF_ACTION, c.cause, c.cause)}</td>
                <td className="border-r border-slate-100 px-3 py-2 text-slate-600 truncate" title={c.targetSubject}>{c.targetSubject || '-'}</td>
                <td className="border-r border-slate-100 px-3 py-2 text-slate-600 truncate">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] ${c.ourRole === CaseRole.PLAINTIFF ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                    {c.ourRole || '-'}
                  </span>
                </td>
                <td className="border-r border-slate-100 px-3 py-2 text-slate-600 truncate max-w-[160px]" title={c.plaintiff}>{c.plaintiff}</td>
                <td className="border-r border-slate-100 px-3 py-2 text-slate-600 truncate max-w-[160px]" title={c.defendant}>{c.defendant}</td>
                <td className="border-r border-slate-100 px-3 py-2 text-slate-900 font-mono text-right font-medium">
                  {formatCurrency(c.regulatoryAttrs?.amountNoInterest)}
                </td>
                <td className="border-r border-slate-100 px-3 py-2 text-slate-500 font-mono text-right">
                  {formatCurrency(c.provisionAmount)}
                </td>
                <td className="border-r border-slate-100 px-3 py-2 text-slate-600 truncate" title={c.court}>{c.court}</td>
                <td className="border-r border-slate-100 px-3 py-2 text-slate-600 truncate">
                  {c.judge ? (
                    <div className="flex flex-col">
                      <span>{c.judge.name}</span>
                      <span className="text-[10px] text-slate-400 scale-90 origin-left">{c.judge.phone}</span>
                    </div>
                  ) : '-'}
                </td>
                <td className="border-r border-slate-100 px-3 py-2 text-slate-600 truncate">
                  {/* Mock Lawyer Data */}
                  {c.lawyerId ? '君合律所-刘律师' : '-'}
                </td>
                <td className="border-r border-slate-100 px-3 py-2 text-slate-600 truncate">
                  {c.authorizedMembers?.find(m => m.role === 'OWNER')?.userName || '-'}
                </td>
                <td className="px-3 py-2 bg-slate-50/30">
                  <MagicProgressCell caseId={c.id} stage={c.stage} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="bg-slate-50 border-t border-slate-200 px-4 py-2 text-xs text-slate-500 flex justify-between items-center shrink-0">
        <span>共 {cases.length} 条记录</span>
        <div className="flex items-center gap-2">
           <span className="w-2 h-2 rounded-full bg-red-500"></span> 逾期风险
           <span className="w-2 h-2 rounded-full bg-amber-500 ml-2"></span> 待办提醒
        </div>
      </div>
    </div>
  );
};

export default CaseLedgerTable;
