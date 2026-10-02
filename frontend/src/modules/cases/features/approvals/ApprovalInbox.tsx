import React, { useEffect, useState, useCallback } from 'react';
import { CheckCheck, Clock, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, ExternalLink, RefreshCw } from 'lucide-react';
import Button from '../../components/ui/Button';
import {
  listMyApprovalTodos,
  getApprovalDetail,
  processApproval,
  getUnreadCount,
  type ApprovalTodoItem,
  type ApprovalDetail,
} from '../../services/case';

const BUSINESS_TYPE_LABELS: Record<string, string> = {
  PAYMENT_REQ: '付款申请',
  CASE_CLOSURE: '结案审批',
  DOC_AUTH: '卷宗授权',
  REPORT_TASK: '报送审批',
  CONTRACT_APPROVAL: '合同审批',
};

const PAGE_SIZE = 20;

const ApprovalInbox: React.FC = () => {
  const [items, setItems] = useState<ApprovalTodoItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ApprovalDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [comment, setComment] = useState('');
  const [processing, setProcessing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    const res = await listMyApprovalTodos({ page: p, pageSize: PAGE_SIZE });
    setItems(res.items);
    setTotal(res.total);
    setLoading(false);
  }, []);

  useEffect(() => { load(page); }, [page, load]);

  const handleExpand = async (item: ApprovalTodoItem) => {
    if (expandedId === item.instanceId) {
      setExpandedId(null);
      setDetail(null);
      setComment('');
      setActionError(null);
      return;
    }
    setExpandedId(item.instanceId);
    setDetail(null);
    setComment('');
    setActionError(null);
    setDetailLoading(true);
    const d = await getApprovalDetail(item.instanceId);
    setDetail(d);
    setDetailLoading(false);
  };

  const handleProcess = async (action: 'APPROVE' | 'REJECT') => {
    if (!detail?.task) return;
    if (action === 'REJECT' && !comment.trim()) {
      setActionError('驳回时请填写审批意见');
      return;
    }
    setProcessing(true);
    setActionError(null);
    const result = await processApproval({
      taskId: detail.task.taskId,
      action,
      comment: comment.trim() || null,
    });
    setProcessing(false);
    if (result) {
      // 从列表移除已处理项并收起
      setItems(prev => prev.filter(i => i.instanceId !== expandedId));
      setExpandedId(null);
      setDetail(null);
      setTotal(prev => Math.max(0, prev - 1));
      // 通知全局：审批已处理，驾驶舱/通知角标需刷新
      getUnreadCount().catch(() => {});
      window.dispatchEvent(new CustomEvent('approval-processed'));
    } else {
      setActionError('操作失败，请重试');
    }
  };

  return (
    <div className="space-y-4">
      {/* 页头 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <CheckCheck className="w-5 h-5 text-brand-600" />
            审批收件箱
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">待我审批的事项 · 共 {total} 条</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => load(page)} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </Button>
      </div>

      {/* 列表 */}
      {loading ? (
        <div className="p-12 text-center text-slate-400">加载中...</div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <CheckCheck className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">暂无待审批事项</p>
          <p className="text-slate-400 text-sm mt-1">所有审批已处理完毕</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(item => {
            const isExpanded = expandedId === item.instanceId;
            return (
              <div
                key={item.instanceId}
                className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm"
              >
                {/* 行 */}
                <button
                  onClick={() => handleExpand(item)}
                  className="w-full text-left px-5 py-4 hover:bg-slate-50 transition-colors flex items-center gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[11px] font-medium bg-brand-50 text-brand-700 px-2 py-0.5 rounded">
                        {BUSINESS_TYPE_LABELS[item.businessType] ?? item.businessType}
                      </span>
                      <Clock className="w-3.5 h-3.5 text-slate-300" />
                      <span className="text-xs text-slate-400">
                        {item.submittedAt.slice(0, 16).replace('T', ' ')}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-slate-800 truncate">{item.title}</p>
                    <p className="text-xs text-slate-400 mt-0.5">申请人：{item.applicantName}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {item.referenceUrl && (
                      <a
                        href={`#${item.referenceUrl}`}
                        onClick={e => e.stopPropagation()}
                        className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded transition-colors"
                        title="查看关联记录"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                </button>

                {/* 展开详情 */}
                {isExpanded && (
                  <div className="border-t border-slate-100 px-5 py-4 bg-slate-50/50 space-y-4">
                    {detailLoading ? (
                      <div className="text-center text-slate-400 text-sm py-4">加载详情...</div>
                    ) : detail ? (
                      <>
                        {/* 审批任务信息 */}
                        {detail.task && (
                          <div className="text-sm text-slate-600 space-y-1">
                            <div className="flex gap-4">
                              <span className="text-slate-400 w-16 shrink-0">审批人</span>
                              <span>{detail.task.approverName}</span>
                            </div>
                            <div className="flex gap-4">
                              <span className="text-slate-400 w-16 shrink-0">业务类型</span>
                              <span>{BUSINESS_TYPE_LABELS[detail.businessType] ?? detail.businessType}</span>
                            </div>
                            <div className="flex gap-4">
                              <span className="text-slate-400 w-16 shrink-0">申请时间</span>
                              <span>{detail.submittedAt.slice(0, 16).replace('T', ' ')}</span>
                            </div>
                          </div>
                        )}

                        {/* 审批意见 */}
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1.5">
                            审批意见 <span className="text-slate-400">（驳回时必填）</span>
                          </label>
                          <textarea
                            value={comment}
                            onChange={e => setComment(e.target.value)}
                            placeholder="请填写审批意见..."
                            rows={3}
                            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-300 resize-none"
                          />
                        </div>

                        {actionError && (
                          <p className="text-xs text-red-500">{actionError}</p>
                        )}

                        {/* 操作按钮 */}
                        <div className="flex gap-3 justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleProcess('REJECT')}
                            disabled={processing}
                            className="text-red-600 border-red-200 hover:bg-red-50"
                          >
                            驳回
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleProcess('APPROVE')}
                            disabled={processing}
                          >
                            {processing ? '处理中...' : '通过'}
                          </Button>
                        </div>
                      </>
                    ) : (
                      <div className="text-center text-slate-400 text-sm py-4">详情加载失败</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 分页控件 */}
      {!loading && total > PAGE_SIZE && (() => {
        const totalPages = Math.ceil(total / PAGE_SIZE);
        return (
          <div className="flex items-center justify-between text-sm text-slate-500 pt-2">
            <span>第 {page} / {totalPages} 页 · 共 {total} 条</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded border border-slate-200 hover:border-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded border border-slate-200 hover:border-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default ApprovalInbox;
