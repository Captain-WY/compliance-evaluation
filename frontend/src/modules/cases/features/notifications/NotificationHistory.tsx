import React, { useEffect, useState, useCallback } from 'react';
import { Bell, Check, CheckCheck, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getUnreadCount,
  type NotificationRecord,
} from '../../services/case';
import Button from '../../components/ui/Button';

const NOTIFY_TYPE_LABELS: Record<string, string> = {
  TODO_TASK: '审批待办',
  SYSTEM_ALERT: '系统通知',
  MENTION: '提及',
  DUE_REMINDER: '到期提醒',
};

const NOTIFY_TYPE_COLORS: Record<string, string> = {
  TODO_TASK: 'bg-brand-50 text-brand-700',
  SYSTEM_ALERT: 'bg-slate-100 text-slate-600',
  MENTION: 'bg-purple-50 text-purple-700',
  DUE_REMINDER: 'bg-amber-50 text-amber-700',
};

type FilterType = 'ALL' | 'UNREAD' | 'TODO_TASK' | 'SYSTEM_ALERT' | 'MENTION' | 'DUE_REMINDER';

const PAGE_SIZE = 20;

const NotificationHistory: React.FC = () => {
  const [items, setItems] = useState<NotificationRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<FilterType>('ALL');
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(async (p: number, f: FilterType) => {
    setLoading(true);
    const res = await listNotifications({
      page: p,
      pageSize: PAGE_SIZE,
      notifyType: f === 'ALL' || f === 'UNREAD' ? null : f,
      isRead: f === 'UNREAD' ? false : null,
    });
    setItems(res.items);
    setTotal(res.total);
    setUnreadCount(res.unreadCount);
    setLoading(false);
  }, []);

  useEffect(() => {
    load(page, filter);
  }, [page, filter, load]);

  const handleFilterChange = (f: FilterType) => {
    setFilter(f);
    setPage(1);
  };

  const handleMarkRead = async (item: NotificationRecord) => {
    if (!item.isRead) {
      await markNotificationRead(item.notificationId);
      setItems(prev => prev.map(n => n.notificationId === item.notificationId ? { ...n, isRead: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    }
    if (item.referenceUrl) window.location.hash = item.referenceUrl;
  };

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    await markAllNotificationsRead();
    setItems(prev => prev.map(n => ({ ...n, isRead: true })));
    setUnreadCount(0);
    setMarkingAll(false);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const FILTER_TABS: { key: FilterType; label: string }[] = [
    { key: 'ALL', label: '全部' },
    { key: 'UNREAD', label: `未读${unreadCount > 0 ? ` (${unreadCount})` : ''}` },
    { key: 'TODO_TASK', label: '审批待办' },
    { key: 'SYSTEM_ALERT', label: '系统通知' },
    { key: 'MENTION', label: '提及' },
    { key: 'DUE_REMINDER', label: '到期提醒' },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* 页头 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Bell className="w-5 h-5 text-brand-600" />
            通知历史
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">共 {total} 条 · {unreadCount} 条未读</p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={handleMarkAllRead} disabled={markingAll}>
            <CheckCheck className="w-4 h-4 mr-1.5" />
            全部标为已读
          </Button>
        )}
      </div>

      {/* 筛选 Tab */}
      <div className="flex gap-1 border-b border-slate-200">
        {FILTER_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => handleFilterChange(tab.key)}
            className={`px-3 py-2 text-sm font-medium transition-colors relative ${
              filter === tab.key
                ? 'text-brand-600'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {tab.label}
            {filter === tab.key && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-600 rounded-t-full" />
            )}
          </button>
        ))}
      </div>

      {/* 列表 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400">加载中...</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center">
            <Bell className="w-10 h-10 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">暂无通知</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {items.map(item => (
              <button
                key={item.notificationId}
                onClick={() => handleMarkRead(item)}
                className={`w-full text-left px-5 py-4 hover:bg-slate-50 transition-colors flex items-start gap-4 ${!item.isRead ? 'bg-blue-50/30' : ''}`}
              >
                <div className="mt-1.5 shrink-0">
                  {item.isRead ? (
                    <Check className="w-4 h-4 text-slate-300" />
                  ) : (
                    <span className="block w-2.5 h-2.5 bg-blue-500 rounded-full" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${NOTIFY_TYPE_COLORS[item.notifyType] ?? 'bg-slate-100 text-slate-500'}`}>
                      {NOTIFY_TYPE_LABELS[item.notifyType] ?? item.notifyType}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {item.createdAt.slice(0, 16).replace('T', ' ')}
                    </span>
                  </div>
                  <p className={`text-sm leading-snug ${item.isRead ? 'text-slate-500' : 'text-slate-800 font-medium'}`}>
                    {item.title}
                  </p>
                  {item.content && (
                    <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{item.content}</p>
                  )}
                </div>
                {item.referenceUrl && (
                  <ExternalLink className="w-4 h-4 text-slate-300 mt-1 shrink-0" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 分页 */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>第 {page} / {totalPages} 页，共 {total} 条</span>
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
      )}
    </div>
  );
};

export default NotificationHistory;
