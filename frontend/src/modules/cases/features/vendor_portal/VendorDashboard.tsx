import React, { useState, useEffect, useCallback } from 'react';
import { User } from '../../types';
import {
  getVendorPortalSummary,
  getVendorMyCases,
  type VendorPortalSummary,
  type VendorCaseRecord,
} from '../../services/case';
import { CheckSquare, Clock, FileText, AlertCircle, Calendar, ChevronDown } from 'lucide-react';

const PAGE_SIZE = 20;

interface VendorDashboardProps {
  user: User;
}

const VendorDashboard: React.FC<VendorDashboardProps> = ({ user }) => {
  const [summary, setSummary] = useState<VendorPortalSummary | null>(null);
  const [cases, setCases] = useState<VendorCaseRecord[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCases = useCallback(async (p: number, append: boolean) => {
    if (append) setLoadingMore(true); else setLoading(true);
    setError(null);
    try {
      const [s, newCases] = await Promise.all([
        p === 1 ? getVendorPortalSummary() : Promise.resolve(null),
        getVendorMyCases({ page: p, pageSize: PAGE_SIZE }),
      ]);
      if (s) setSummary(s);
      setCases(prev => append ? [...prev, ...newCases] : newCases);
      setHasMore(newCases.length === PAGE_SIZE);
      setPage(p);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '律师工作台加载失败，请重试。');
    } finally {
      if (append) setLoadingMore(false); else setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCases(1, false);
  }, [loadCases]);

  const handleLoadMore = () => {
    const nextPage = page + 1;
    loadCases(nextPage, true);
  };

  if (loading) {
    return <div className="p-12 text-center text-slate-400">加载供应商门户...</div>;
  }

  const firmName = summary?.firmName || user.name;
  const rating = summary?.rating ?? 0;
  const pendingCount = summary?.pendingTaskCount ?? 0;

  return (
    <div className="space-y-8">
      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{error}<button type="button" onClick={() => void loadCases(1, false)} className="ml-3 underline">重试</button></div>}
      {/* Welcome Banner */}
      <div className="bg-indigo-600 rounded-xl p-8 text-white shadow-lg flex justify-between items-center">
         <div>
            <h2 className="text-2xl font-bold mb-2">欢迎回来, {user.name}</h2>
            <p className="text-indigo-100">{firmName} | 合作评级: {rating.toFixed(1)} ⭐</p>
         </div>
         <div className="text-right hidden md:block">
            <p className="text-3xl font-bold">{pendingCount}</p>
            <p className="text-xs uppercase text-indigo-200 tracking-wider">待办任务</p>
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
         {/* Case List */}
         <div className="lg:col-span-2 space-y-4">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
               <CheckSquare className="w-5 h-5 text-indigo-600" /> 我的案件
               <span className="text-sm font-normal text-slate-400">({cases.length} 条)</span>
            </h3>

            {cases.length === 0 ? (
              <div className="bg-slate-50 border border-dashed border-slate-300 rounded-lg p-8 text-center text-slate-400">
                <p className="text-sm">暂无分配案件</p>
              </div>
            ) : (
              <>
                {cases.map(c => (
                  <div key={c.caseId} className="bg-white border border-slate-200 rounded-lg p-4 flex items-center justify-between hover:shadow-md transition-shadow">
                     <div className="flex items-start gap-4">
                        <div className="mt-1 w-2 h-2 rounded-full bg-indigo-500"></div>
                        <div>
                           <h4 className="font-bold text-slate-800">{c.caseTitle}</h4>
                           <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                              <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded">{c.caseCode}</span>
                              <span className="flex items-center gap-1">
                                 <Clock className="w-3 h-3" /> 更新: {c.lastUpdateDate.slice(0, 10)}
                              </span>
                           </div>
                        </div>
                     </div>
                     <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded font-medium">{c.stage}</span>
                  </div>
                ))}

                {hasMore ? (
                  <button
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    className="w-full py-3 border border-dashed border-slate-300 rounded-lg text-sm text-slate-500 hover:text-indigo-600 hover:border-indigo-300 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <ChevronDown className="w-4 h-4" />
                    {loadingMore ? '加载中...' : '加载更多'}
                  </button>
                ) : (
                  <div className="bg-slate-50 border border-dashed border-slate-300 rounded-lg p-4 text-center text-slate-400">
                    <p className="text-sm">没有更多案件了</p>
                  </div>
                )}
              </>
            )}
         </div>

         {/* Notices */}
         <div className="space-y-6">
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
               <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-indigo-600" /> 门户说明
               </h3>
               <div className="space-y-3 text-sm text-slate-600">
                  <div className="flex items-start gap-2">
                     <FileText className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
                     <p>请及时更新案件进展，保持信息同步。</p>
                  </div>
                  <div className="flex items-start gap-2">
                     <Clock className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                     <p>费用结算申请须在月末前完成。</p>
                  </div>
               </div>
            </div>

            <div className="bg-amber-50 border border-amber-100 rounded-xl p-5">
               <h3 className="font-bold text-amber-800 mb-2 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" /> 合作须知
               </h3>
               <p className="text-xs text-amber-700 leading-relaxed">
                  请各位合作伙伴注意，本季度费用结算申请截止日期为每月 25 日。请务必在此之前完成所有案件进度更新，否则将影响付款流程。
               </p>
            </div>
         </div>
      </div>
    </div>
  );
};

export default VendorDashboard;
