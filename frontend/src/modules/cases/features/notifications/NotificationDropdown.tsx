import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Bell, Check, CheckCheck, X, ExternalLink } from 'lucide-react';
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getUnreadCount,
  type NotificationRecord,
} from '../../services/case';

interface NotificationDropdownProps {
  unreadCount: number;
  onUnreadCountChange: (count: number) => void;
}

const NOTIFY_TYPE_LABELS: Record<string, string> = {
  TODO_TASK: '审批待办',
  SYSTEM_ALERT: '系统通知',
  MENTION: '提及',
  DUE_REMINDER: '到期提醒',
};

const NotificationDropdown: React.FC<NotificationDropdownProps> = ({
  unreadCount,
  onUnreadCountChange,
}) => {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    const res = await listNotifications({ pageSize: 20 });
    setItems(res.items);
    onUnreadCountChange(res.unreadCount);
    setLoading(false);
  }, [onUnreadCountChange]);

  // 打开时拉取列表
  useEffect(() => {
    if (open) loadNotifications();
  }, [open, loadNotifications]);

  // click-outside 关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleMarkRead = async (item: NotificationRecord) => {
    if (item.isRead) {
      if (item.referenceUrl) window.location.hash = item.referenceUrl;
      return;
    }
    await markNotificationRead(item.notificationId);
    setItems(prev => prev.map(n => n.notificationId === item.notificationId ? { ...n, isRead: true } : n));
    const newCount = await getUnreadCount();
    onUnreadCountChange(newCount);
    if (item.referenceUrl) window.location.hash = item.referenceUrl;
  };

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    await markAllNotificationsRead();
    setItems(prev => prev.map(n => ({ ...n, isRead: true })));
    onUnreadCountChange(0);
    setMarkingAll(false);
  };

  const displayCount = unreadCount > 99 ? '99+' : unreadCount > 0 ? String(unreadCount) : null;

  return (
    <div className="relative" ref={panelRef}>
      {/* 铃铛按钮 */}
      <button
        onClick={() => setOpen(v => !v)}
        className={`relative p-2 rounded-full transition-colors ${open ? 'bg-brand-50 text-brand-600' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}
        title="通知"
      >
        <Bell className="w-5 h-5" />
        {displayCount && (
          <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] px-1 bg-red-500 rounded-full border-2 border-white text-[10px] font-bold text-white flex items-center justify-center">
            {displayCount}
          </span>
        )}
      </button>

      {/* 下拉面板 */}
      {open && (
        <div className="absolute right-0 mt-2 w-96 bg-white rounded-xl shadow-xl border border-slate-200 z-[9999] overflow-hidden">
          {/* 面板头部 */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-800">通知中心</h3>
              {unreadCount > 0 && (
                <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-medium">
                  {unreadCount} 条未读
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  disabled={markingAll}
                  className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 px-2 py-1 rounded hover:bg-brand-50 transition-colors disabled:opacity-50"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  全部已读
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* 通知列表 */}
          <div className="max-h-[420px] overflow-y-auto divide-y divide-slate-50">
            {loading ? (
              <div className="p-8 text-center text-slate-400 text-sm">加载中...</div>
            ) : items.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">暂无通知</div>
            ) : (
              items.map(item => (
                <button
                  key={item.notificationId}
                  onClick={() => handleMarkRead(item)}
                  className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors flex items-start gap-3 ${!item.isRead ? 'bg-blue-50/40' : ''}`}
                >
                  {/* 未读蓝点 */}
                  <div className="mt-1.5 shrink-0">
                    {item.isRead ? (
                      <Check className="w-3.5 h-3.5 text-slate-300" />
                    ) : (
                      <span className="block w-2 h-2 bg-blue-500 rounded-full" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">
                        {NOTIFY_TYPE_LABELS[item.notifyType] ?? item.notifyType}
                      </span>
                      {item.referenceUrl && (
                        <ExternalLink className="w-3 h-3 text-slate-300" />
                      )}
                    </div>
                    <p className={`text-sm leading-snug ${item.isRead ? 'text-slate-500' : 'text-slate-800 font-medium'}`}>
                      {item.title}
                    </p>
                    {item.content && (
                      <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{item.content}</p>
                    )}
                    <p className="text-[10px] text-slate-300 mt-1">{item.createdAt.slice(0, 16).replace('T', ' ')}</p>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* 底部链接 */}
          <div className="px-4 py-2 border-t border-slate-100 bg-slate-50 text-center">
            <button
              onClick={() => { setOpen(false); window.location.hash = '/notifications'; }}
              className="text-[11px] text-brand-600 hover:text-brand-700 hover:underline font-medium transition-colors"
            >
              查看完整通知历史 →
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationDropdown;
