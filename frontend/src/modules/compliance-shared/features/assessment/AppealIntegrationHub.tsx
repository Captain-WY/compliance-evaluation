import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, AlertCircle, FileText, ExternalLink, 
  CheckCircle2, Clock, ShieldAlert, GitCommit, Search, RefreshCw
} from 'lucide-react';
import { mockApiSync } from '../../services/api';

interface AppealCase {
  id: string;
  targetIndicator: string;
  originalScore: number;
  requestedScore: number;
  reason: string;
  ekpStatus: 'DRAFT' | 'PROCESSING' | 'APPROVED' | 'REJECTED';
  ekpCurrentNode: string;
  ekpFlowUrl: string;
  evidenceDesc: string;
  hqComment: string;
  maxScore: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  caseData: AppealCase | null;
  onSubmit: (score: number, reason: string) => void;
}



export default function AppealIntegrationHub({ isOpen, onClose, caseData, onSubmit }: Props) {
  const ekpNodes = mockApiSync.assessment.getAppealEkpNodes();
  const [requestedScore, setRequestedScore] = useState<number | ''>('');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (caseData) {
      setRequestedScore(caseData.requestedScore || '');
      setReason(caseData.reason || '');
    }
  }, [caseData]);

  if (!isOpen || !caseData) return null;

  const handleSubmit = () => {
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      onSubmit(Number(requestedScore) || 0, reason);
    }, 1500);
  };

  const isProcessing = caseData.ekpStatus === 'PROCESSING';
  const isApproved = caseData.ekpStatus === 'APPROVED';

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-slate-900/60 z-50 backdrop-blur-sm flex items-center justify-center p-4 lg:p-8"
      >
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="bg-slate-50 w-full max-w-5xl h-full max-h-[800px] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0">
            <div className="flex items-center">
              <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center mr-4">
                <ShieldAlert className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <h1 className="text-lg font-black text-slate-800">异议申诉与 EKP 桥接枢纽 (Appeal Integration Hub)</h1>
                <p className="text-xs text-slate-500 font-medium mt-0.5">流水号: {caseData.id}</p>
              </div>
            </div>
            {isProcessing && (
              <div className="flex items-center px-4 py-1.5 bg-blue-50 border border-blue-200 rounded-full">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse mr-2"></span>
                <span className="text-xs font-bold text-blue-700">EKP 流程同步锁定中</span>
              </div>
            )}
            {!isProcessing && (
              <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Alert Banner */}
          {isProcessing && (
            <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 flex items-start shrink-0">
              <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5 mr-3" />
              <div>
                <h4 className="text-sm font-bold text-amber-800">数据已临时锁定 (Data Locked)</h4>
                <p className="text-xs text-amber-600 mt-0.5">正在进行 EKP 异议申诉流程，此条目的“确认”与“修改”操作已禁用，待 OA 流程终审后将自动更新考核分数。</p>
              </div>
            </div>
          )}

          {isApproved && (
            <div className="bg-emerald-50 border-b border-emerald-200 px-6 py-3 flex items-start shrink-0">
              <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5 mr-3" />
              <div>
                <h4 className="text-sm font-bold text-emerald-800">申诉流程已完结 (Appeal Approved)</h4>
                <p className="text-xs text-emerald-600 mt-0.5">根据 EKP 流程审批结果，已完成分数修正机制同步。</p>
              </div>
            </div>
          )}

          {/* Split Content */}
          <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
            
            {/* Left: The Verdict */}
            <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-white md:border-r border-slate-200">
              <h2 className="text-xs font-black uppercase text-slate-400 tracking-widest mb-6">The Verdict (原判定)</h2>
              
              <div className="mb-8">
                <label className="text-[10px] font-bold text-slate-500 uppercase">考核指标</label>
                <div className="text-sm font-bold text-slate-800 mt-1">{caseData.targetIndicator}</div>
              </div>

              <div className="grid grid-cols-2 gap-6 mb-8">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">系统/总部判定得分</label>
                  <div className="mt-2 flex items-baseline">
                    <span className={`text-4xl font-black font-mono leading-none ${isApproved ? 'text-slate-300 line-through' : 'text-rose-500'}`}>
                      {caseData.originalScore}
                    </span>
                    <span className="text-sm text-slate-500 font-bold ml-2">/ {caseData.maxScore}</span>
                  </div>
                </div>
                
                {isApproved && (
                   <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100 relative overflow-hidden">
                     <div className="absolute right-0 top-0 w-16 h-16 bg-emerald-100 rounded-bl-full flex items-start justify-end p-2 opacity-50">
                       <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                     </div>
                     <label className="text-[10px] font-bold text-emerald-600 uppercase">修正后总分 (Approved)</label>
                     <div className="mt-2 flex items-baseline">
                       <span className="text-4xl font-black font-mono leading-none text-emerald-600">
                         {caseData.requestedScore}
                       </span>
                     </div>
                   </div>
                )}
              </div>

              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase">判定依据 / 总部复核意见</label>
                  <div className="mt-1 p-4 bg-rose-50/50 text-slate-700 text-sm rounded-lg border border-rose-100 leading-relaxed font-medium">
                    "{caseData.hqComment}"
                  </div>
                </div>
                
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase">系统佐证快照</label>
                  <div className="mt-1 flex items-center p-3 bg-slate-50 border border-slate-200 rounded-lg">
                    <div className="w-8 h-8 rounded bg-slate-200 flex items-center justify-center mr-3 text-slate-500">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-700">{caseData.evidenceDesc}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">采集时间: 2026-04-09 18:00</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: The Defense & EKP Bridge */}
            <div className="flex-1 flex flex-col bg-slate-50/80 relative">
              <div className="flex-1 overflow-y-auto p-6 md:p-8">
                <h2 className="text-xs font-black uppercase text-indigo-500 tracking-widest mb-6">The Defense (申诉与同步)</h2>

                {!isProcessing && !isApproved ? (
                  <div className="space-y-6">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase">申请修正分数</label>
                      <input 
                        type="number" 
                        value={requestedScore}
                        onChange={e => setRequestedScore(Number(e.target.value))}
                        className="w-full mt-1 px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 font-mono text-lg font-bold text-slate-800 shadow-sm"
                        placeholder={`满分 ${caseData.maxScore}`}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase">异议与申诉理由 (将同步至 EKP)</label>
                      <textarea 
                        value={reason}
                        onChange={e => setReason(e.target.value)}
                        rows={6}
                        className="w-full mt-1 px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 text-sm font-medium text-slate-700 shadow-sm placeholder-slate-400"
                        placeholder="清晰阐述异议点并建议附件..."
                      />
                    </div>
                    
                    <button 
                      className="w-full py-4 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 border-dashed rounded-xl flex items-center justify-center font-bold transition-colors text-sm"
                    >
                      <FileText className="w-4 h-4 mr-2" /> 上传补充佐证材料 (Optional)
                    </button>
                  </div>
                ) : (
                  <div className="space-y-8">
                    {/* Read-only Defense */}
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                      <div className="flex justify-between items-center mb-4">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">申请修正分数</label>
                        <span className="font-mono font-black text-lg text-indigo-600">{caseData.requestedScore}</span>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">申诉理由</label>
                        <p className="text-sm text-slate-600 font-medium leading-relaxed">
                          {caseData.reason}
                        </p>
                      </div>
                    </div>

                    {/* EKP Sync Timeline */}
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">EKP 审批流同步</label>
                        <a href={caseData.ekpFlowUrl} target="_blank" rel="noreferrer" className="flex items-center text-xs font-bold text-indigo-600 hover:text-indigo-800">
                          <ExternalLink className="w-3.5 h-3.5 mr-1" /> 查看 EKP 原文
                        </a>
                      </div>
                      
                      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
                         <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
                         
                         <div className="space-y-6">
                           {ekpNodes.map((node, idx) => (
                             <div key={node.id} className="flex relative">
                               {idx < ekpNodes.length - 1 && (
                                 <div className={`absolute top-6 left-[11px] w-0.5 h-full -ml-[1px] ${node.status === 'done' ? 'bg-indigo-200' : 'bg-slate-100'}`}></div>
                               )}
                               <div className="relative z-10 flex items-start pb-2">
                                 <div className={`w-6 h-6 rounded-full flex items-center justify-center border-2 bg-white shrink-0
                                   ${node.status === 'done' ? 'border-indigo-500 text-indigo-500' :
                                     node.status === 'active' ? 'border-amber-500 text-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]' :
                                     'border-slate-300 text-slate-300'
                                   }`}
                                 >
                                   {node.status === 'done' ? <CheckCircle2 className="w-3.5 h-3.5" /> : 
                                    node.status === 'active' ? <RefreshCw className="w-3 h-3 animate-spin"/> :
                                    <div className="w-1.5 h-1.5 bg-slate-300 rounded-full"></div>}
                                 </div>
                                 <div className="ml-4">
                                   <div className={`text-sm font-bold ${node.status === 'pending' ? 'text-slate-400' : 'text-slate-800'}`}>
                                     {node.label}
                                   </div>
                                   {node.date && <div className="text-[10px] font-mono text-slate-500 mt-0.5">{node.date}</div>}
                                 </div>
                               </div>
                             </div>
                           ))}
                         </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Footer */}
              {!isProcessing && !isApproved && (
                <div className="shrink-0 p-6 bg-white border-t border-slate-200 flex justify-end gap-3">
                  <button 
                    onClick={onClose}
                    className="px-6 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200"
                  >
                    取消
                  </button>
                  <button 
                    onClick={handleSubmit}
                    disabled={isSubmitting || !requestedScore || !reason}
                    className="px-6 py-2.5 flex items-center text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-md transition-colors"
                  >
                    {isSubmitting ? (
                      <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> 同步 EKP 中...</>
                    ) : (
                      <><GitCommit className="w-4 h-4 mr-2" /> 发起 EKP 申诉流程</>
                    )}
                  </button>
                </div>
              )}
              {isApproved && (
                <div className="shrink-0 p-6 bg-white border-t border-slate-200 flex justify-end gap-3">
                  <button 
                    onClick={onClose}
                    className="px-8 py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-md transition-colors"
                  >
                    完成并返回
                  </button>
                </div>
              )}
            </div>

          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
