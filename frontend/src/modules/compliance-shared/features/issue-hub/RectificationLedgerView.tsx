import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  AlertTriangle, 
  Clock, 
  CheckCircle2, 
  FileText, 
  ChevronRight, 
  MessageSquare,
  AlertCircle,
  Timer,
  Eye,
  Archive
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { fileApi, issueApi } from '../../services/api';
import { RectificationRecord, RectificationStatus } from '../../types';
import RectificationFeedbackDrawer from './RectificationFeedbackDrawer';

export default function RectificationLedgerView() {
  const [records, setRecords] = useState<RectificationRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [recentlyUpdatedId, setRecentlyUpdatedId] = useState<string | null>(null);
  const [isArchived, setIsArchived] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);
    issueApi.getBranchRectifications()
      .then(data => {
        if (!cancelled) {
          setRecords(data);const issueId=new URLSearchParams(window.location.search).get('issueId');
          if(issueId){const matches=data.filter(record=>record.sourceIssueId===issueId);if(matches.length===1){setSelectedRecordId(matches[0].id);setIsDrawerOpen(true);}else setLoadError('未找到唯一的已授权整改记录，请从本机构台账选择。');}
        }
      })
      .catch(error => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : '整改台账加载失败');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleOpenDrawer = (id: string) => {
    setSelectedRecordId(id);
    setIsDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
    setTimeout(() => setSelectedRecordId(null), 300); // Wait for animation
  };

  const handleSubmitFeedback = async (id: string, feedback: any, files: File[] = []) => {
    const current = records.find(record => record.id === id);
    if (current?.status === 'PENDING_RECTIFICATION') {
      await issueApi.startRectification(id);
    }
    const uploadedFiles = await Promise.all(files.map(file => fileApi.uploadFile(file)));
    const fileIds = uploadedFiles.map(file => file.fileId).filter(Boolean);
    const updated = await issueApi.submitFeedback(id, feedback.content, fileIds);

    setRecords(prev => prev.map(r => (r.id === id ? updated : r)));
    
    setRecentlyUpdatedId(id);
    setTimeout(() => {
      setRecentlyUpdatedId(null);
    }, 1000);
  };

  // Sort records by active workflow pressure first, then terminal records.
  const sortedRecords = [...records].sort((a, b) => {
    const statusOrder: Record<RectificationStatus, number> = {
      OVERDUE: 0,
      VERIFICATION_REJECTED: 1,
      PENDING_RECTIFICATION: 2,
      RECTIFYING: 3,
      PENDING_VERIFICATION: 4,
      DISCOVERED: 5,
      CLOSED: 6,
      ARCHIVED: 7,
    };
    return statusOrder[a.status] - statusOrder[b.status];
  });

  // Stats calculation
  const activeRecords = records.filter(r => r.status !== 'CLOSED' && r.status !== 'ARCHIVED');
  const archivedRecords = records.filter(r => r.status === 'CLOSED' || r.status === 'ARCHIVED');
  
  const displayRecords = isArchived ? archivedRecords : activeRecords;

  const pendingCount = activeRecords.filter(r => r.status === 'PENDING_RECTIFICATION').length;
  const overdueCount = activeRecords.filter(r => r.status === 'OVERDUE').length;
  const underReviewCount = activeRecords.filter(r => r.status === 'PENDING_VERIFICATION').length;

  const getDaysLeft = (dueDate: string) => {
    const diffTime = new Date(dueDate).getTime() - new Date().getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const renderStatusBadge = (status: RectificationStatus) => {
    switch (status) {
      case 'OVERDUE':
        return <span className="px-2.5 py-1 bg-rose-100 text-rose-700 rounded-full text-xs font-bold border border-rose-200 flex items-center"><AlertTriangle className="w-3 h-3 mr-1" /> 已逾期</span>;
      case 'PENDING_RECTIFICATION':
        return <span className="px-2.5 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-bold border border-amber-200 flex items-center"><Clock className="w-3 h-3 mr-1" /> 待整改</span>;
      case 'PENDING_VERIFICATION':
        return <span className="px-2.5 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-bold border border-blue-200 flex items-center"><FileText className="w-3 h-3 mr-1" /> 待总部核实</span>;
      case 'RECTIFYING':
        return <span className="px-2.5 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs font-bold border border-indigo-200 flex items-center"><Clock className="w-3 h-3 mr-1" /> 整改中</span>;
      case 'CLOSED':
      case 'ARCHIVED':
        return <span className="px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold border border-emerald-200 flex items-center"><CheckCircle2 className="w-3 h-3 mr-1" /> 已销号</span>;
      default:
        return <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-bold border border-slate-200 flex items-center">{status}</span>;
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 p-6 overflow-y-auto relative">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">本机构整改台账</h1>
        <p className="text-slate-500 mt-1 mb-4">集中处理总部下发的合规缺陷，请优先处理逾期和临近截止的任务。</p>
        
        <div className="flex bg-slate-100 p-1 rounded-lg w-fit">
          <button 
            onClick={() => setIsArchived(false)}
            className={`px-4 py-1.5 text-sm ${!isArchived ? 'font-bold rounded-md bg-white text-slate-800 shadow-sm' : 'font-medium rounded-md text-slate-500 hover:text-slate-700'}`}
          >
            ⏳ 待办与进行中
          </button>
          <button 
            onClick={() => setIsArchived(true)}
            className={`px-4 py-1.5 text-sm ${isArchived ? 'font-bold rounded-md bg-white text-slate-800 shadow-sm' : 'font-medium rounded-md text-slate-500 hover:text-slate-700'}`}
          >
            🗄️ 历史与已归档
          </button>
        </div>
      </div>

      {/* Top Stats Row (The Pressure Board) */}
      {!isArchived ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500 mb-1">待整改任务 (Pending)</p>
              <p className="text-3xl font-bold text-amber-600">{pendingCount}</p>
            </div>
            <div className="w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center">
              <Clock className="w-6 h-6 text-amber-500" />
            </div>
          </div>

          <div className="bg-rose-50 rounded-xl p-6 border-2 border-rose-200 shadow-sm flex items-center justify-between relative overflow-hidden">
            <div className="absolute top-0 right-0 w-2 h-full bg-rose-500"></div>
            <div>
              <p className="text-sm font-bold text-rose-700 mb-1">逾期警告 (Overdue)</p>
              <p className="text-3xl font-black text-rose-600">{overdueCount}</p>
            </div>
            <div className="w-12 h-12 bg-rose-100 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-rose-600 animate-pulse" />
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500 mb-1">待总部核实 (Under Review)</p>
              <p className="text-3xl font-bold text-blue-600">{underReviewCount}</p>
            </div>
            <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center">
              <FileText className="w-6 h-6 text-blue-500" />
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex flex-col justify-center">
            <div className="text-sm text-slate-500 mb-2">归档年度</div>
            <select className="w-full bg-white border border-slate-300 text-slate-700 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2">
              <option>2026年度</option>
              <option>2025年度</option>
            </select>
          </div>
          <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl flex flex-col justify-center">
            <div className="text-sm font-medium text-emerald-600">累计完成销号 (项)</div>
            <div className="text-2xl font-bold text-emerald-700 mt-1">{archivedRecords.length}</div>
          </div>
        </div>
      )}

      {/* Main Task List (The Ledger) */}
      <div className="space-y-4">
        {isLoading && (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-sm">
            正在加载整改台账...
          </div>
        )}
        {loadError && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-700 shadow-sm">
            {loadError}
          </div>
        )}
        <AnimatePresence mode="popLayout">
          {displayRecords.map((record, index) => {
            let actualDueDate = record.dueDate;
            let displayDateStr = '';
            
            // Handle valid Date object check just in case
            try {
              if (record.dueDate.includes('T')) {
                displayDateStr = new Date(record.dueDate).toLocaleDateString();
              } else {
                displayDateStr = record.dueDate;
              }
            } catch (e) {
               displayDateStr = record.dueDate;
            }

            const daysLeft = getDaysLeft(actualDueDate);
            const isOverdue = record.status === 'OVERDUE';
            const isUrgent = record.status === 'PENDING_RECTIFICATION' && daysLeft <= 3 && daysLeft >= 0;
            const isUnderReview = record.status === 'PENDING_VERIFICATION';
            const isCompleted = record.status === 'CLOSED' || record.status === 'ARCHIVED';
            const isRecentlyUpdated = record.id === recentlyUpdatedId;
            const requiresStartBeforeFeedback = record.status === 'PENDING_RECTIFICATION';

            let cardClasses = "bg-white border rounded-xl shadow-sm overflow-hidden transition-all duration-200 ";
            let borderClasses = "border-slate-200";
            
            if (isRecentlyUpdated) {
              cardClasses += "bg-emerald-50 ";
              borderClasses = "border-emerald-300 border-l-4 border-l-emerald-500";
            } else if (isOverdue) {
              cardClasses += "bg-rose-50/50 ";
              borderClasses = "border-rose-300 border-l-4 border-l-rose-500";
            } else if (isUrgent) {
              cardClasses += "bg-amber-50/30 ";
              borderClasses = "border-amber-200 border-l-4 border-l-amber-400";
            } else if (isUnderReview || isCompleted) {
              cardClasses += "opacity-80 ";
            } else {
              borderClasses = "border-slate-200 border-l-4 border-l-slate-300";
            }

            return (
              <motion.div
                key={record.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1, layout: { duration: 0.4, type: "spring", bounce: 0.2 } }}
                className={`${cardClasses} ${borderClasses}`}
              >
                <div className="p-5">
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    
                    {/* Left: ID & Status & Desc */}
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-3">
                        <span className="font-mono text-sm font-bold text-slate-700">{record.id}</span>
                        {isArchived ? (
                          <Badge className="bg-emerald-100 text-emerald-700 font-bold border-none">
                            <CheckCircle2 className="w-3 h-3 mr-1" />已结案
                          </Badge>
                        ) : (
                          renderStatusBadge(record.status)
                        )}
                        <span className="text-xs text-slate-400 flex items-center">
                          <AlertCircle className="w-3 h-3 mr-1" />
                          源自: {record.sourceIssueId}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-2 mb-2">
                        {record.riskLevel && (
                          <Badge className={`${record.riskLevel === 'HIGH' ? 'bg-rose-100 text-rose-700' : record.riskLevel === 'MEDIUM' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'} font-bold`}>
                            {record.riskLevel}
                          </Badge>
                        )}
                        <h3 className="text-base font-bold text-slate-800 line-clamp-2" title={record.issueDescription}>
                          {record.issueDescription}
                        </h3>
                      </div>
                      
                      <p className="text-sm text-slate-600 mb-3">
                        <span className="font-bold text-slate-700">整改要求:</span> {record.rectificationGoal}
                      </p>

                      {/* HQ Reject Reason Alert */}
                      {isOverdue && record.hqRejectReason && (
                        <div className="flex items-start p-3 bg-rose-100 text-rose-800 rounded-md text-sm border border-rose-200 mb-3">
                          <AlertTriangle className="w-4 h-4 mr-2 mt-0.5 shrink-0" />
                          <div>
                            <span className="font-bold block mb-0.5">整改反馈被总部打回</span>
                            {record.hqRejectReason}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Right: Urgency & Actions */}
                    <div className="flex flex-col items-end justify-between min-w-[200px] shrink-0 border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 md:pl-6">
                      <div className="text-right mb-4 w-full flex flex-col items-end">
                        {isArchived ? (
                           <>
                             <div className="text-slate-500 text-sm font-medium mt-1">结案日期: {displayDateStr}</div>
                           </>
                        ) : (
                          <>
                            <p className="text-xs font-bold text-slate-500 mb-1 uppercase tracking-wide">截止日期</p>
                            <p className="text-sm font-bold text-slate-800 mb-1">
                              {displayDateStr}
                            </p>
                            
                            {/* Time left chip */}
                            {isOverdue ? (
                              <div className="text-rose-600 font-bold text-sm flex items-center mt-1">
                                <AlertTriangle className="w-4 h-4 mr-1"/> 已逾期 {Math.abs(daysLeft)} 天
                              </div>
                            ) : isUrgent ? (
                              <div className="text-amber-600 font-bold text-sm flex items-center mt-1">
                                <Timer className="w-4 h-4 mr-1"/> 仅剩 {daysLeft} 天
                              </div>
                            ) : isUnderReview ? (
                              <div className="text-slate-500 font-medium text-sm mt-1">
                                已提交反馈
                              </div>
                            ) : (
                              <div className="text-slate-600 font-medium text-sm mt-1">
                                剩 {daysLeft} 天
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      <div className="w-full">
                        {isArchived ? (
                          <Button 
                            variant="ghost" 
                            className="w-full text-slate-600 hover:text-indigo-600 bg-white border border-slate-200 mt-2 shadow-sm"
                            onClick={() => handleOpenDrawer(record.id)}
                          >
                            <Eye className="w-4 h-4 mr-2"/> 查看销号案卷
                          </Button>
                        ) : isOverdue || isUrgent || record.status === 'PENDING_RECTIFICATION' ? (
                          <Button 
                            data-testid={`rect-start-feedback-${record.id}`}
                            className={`w-full ${isOverdue ? 'bg-rose-600 hover:bg-rose-700' : 'bg-indigo-600 hover:bg-indigo-700'} text-white shadow-sm mt-2`} 
                            onClick={() => handleOpenDrawer(record.id)}
                          >
                            <MessageSquare className="w-4 h-4 mr-2" />
                            {requiresStartBeforeFeedback ? '开始整改并反馈' : '反馈整改结果'}
                          </Button>
                        ) : isUnderReview ? (
                          <Button 
                            variant="outline"
                            onClick={() => handleOpenDrawer(record.id)}
                            className="w-full border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors mt-2"
                          >
                            <ChevronRight className="w-4 h-4 mr-1" />
                            查看进度
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      <RectificationFeedbackDrawer 
        isOpen={isDrawerOpen}
        onClose={handleCloseDrawer}
        record={records.find(r => r.id === selectedRecordId) || null}
        onSubmit={handleSubmitFeedback}
        isArchived={isArchived}
      />
    </div>
  );
}
