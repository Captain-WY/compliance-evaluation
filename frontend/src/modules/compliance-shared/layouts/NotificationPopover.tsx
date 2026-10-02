import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Archive,
  Bell,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Speaker,
} from 'lucide-react';

import { notificationApi } from '../services/api';
import type { NotificationItem } from '../services/api';

const notificationIconMap = {
  speaker: {
    icon: Speaker,
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
  },
  checkCircle: {
    icon: CheckCircle2,
    iconBg: 'bg-emerald-100',
    iconColor: 'text-emerald-600',
  },
  archive: {
    icon: Archive,
    iconBg: 'bg-slate-100',
    iconColor: 'text-slate-600',
  },
  shieldAlert: {
    icon: ShieldAlert,
    iconBg: 'bg-rose-100',
    iconColor: 'text-rose-600',
  },
  loader: {
    icon: Loader2,
    iconBg: 'bg-indigo-100',
    iconColor: 'text-indigo-600',
  },
} as const;

const formatNotificationTime = (value: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

export default function NotificationPopover({ onNavigate }: { onNavigate?: (path: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const loadNotifications = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [page, count] = await Promise.all([
        notificationApi.list({ pageSize: 20 }),
        notificationApi.unreadCount(),
      ]);
      setNotifications(page.items);
      setUnreadCount(count.unreadCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : '消息通知加载失败');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const markNotificationRead = async (notification: NotificationItem) => {
    setMutatingId(notification.id);
    setError(null);
    try {
      const updated = notification.isRead
        ? notification
        : await notificationApi.markRead(notification.notificationId);
      setNotifications(prev => prev.map(item => item.id === notification.id ? { ...item, ...updated } : item));
      setUnreadCount(prev => notification.isRead ? prev : Math.max(0, prev - 1));
      const targetMenuId = updated.actionTarget?.menuId ?? notification.actionTarget?.menuId;
      if (targetMenuId && targetMenuId !== 'NotificationCenter') {
        setIsOpen(false);
        onNavigate?.(targetMenuId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '消息已读回执失败');
    } finally {
      setMutatingId(null);
    }
  };

  const handleMarkAllAsRead = async () => {
    setMutatingId('all');
    setError(null);
    try {
      await notificationApi.markAllRead();
      setNotifications(prev => prev.map(item => ({ ...item, isRead: true, readState: 'READ' })));
      setUnreadCount(0);
      setExpandedIds([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : '全部已读回执失败');
    } finally {
      setMutatingId(null);
    }
  };

  const toggleExpand = (id: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setExpandedIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  return (
    <div className="relative" ref={popoverRef}>
      <button
        type="button"
        data-testid="notification-bell"
        className="relative cursor-pointer rounded-full p-2 transition-colors hover:bg-slate-100"
        onClick={() => setIsOpen(prev => !prev)}
        aria-label="消息通知"
      >
        <Bell className="h-5 w-5 text-slate-500 hover:text-slate-800" />
        {unreadCount > 0 && (
          <span
            data-testid="notification-unread-badge"
            className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-white bg-rose-500 px-1 text-[9px] font-bold text-white"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          data-testid="notification-popover"
          className="absolute right-0 z-50 mt-3 flex w-96 origin-top-right flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-4 py-3">
            <h3 className="text-sm font-bold text-slate-800">消息通知</h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                onClick={() => void loadNotifications()}
                disabled={isLoading}
                aria-label="刷新消息"
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
              {unreadCount > 0 && (
                <button
                  type="button"
                  data-testid="notification-mark-all-read"
                  className="text-xs font-medium text-indigo-600 transition-colors hover:text-indigo-800 disabled:text-slate-400"
                  onClick={() => void handleMarkAllAsRead()}
                  disabled={mutatingId === 'all'}
                >
                  全部标为已读
                </button>
              )}
            </div>
          </div>

          {error && (
            <div
              data-testid="notification-error"
              className="border-b border-rose-100 bg-rose-50 px-4 py-2 text-xs text-rose-700"
            >
              {error}
            </div>
          )}

          <div className="flex max-h-[400px] flex-col divide-y divide-slate-100 overflow-y-auto">
            {isLoading && notifications.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                加载中
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-500">暂无消息</div>
            ) : (
              notifications.map(notification => {
                const iconConfig = notificationIconMap[notification.iconKey];
                const IconData = iconConfig.icon;
                const isExpanded = expandedIds.includes(notification.id);
                const isMutating = mutatingId === notification.id || mutatingId === notification.notificationId;

                return (
                  <button
                    type="button"
                    data-testid={`notification-item-${notification.notificationId}`}
                    key={notification.id}
                    className={`relative flex w-full cursor-pointer gap-3 p-4 text-left transition-colors ${
                      notification.isRead
                        ? 'bg-white opacity-75 hover:bg-slate-50'
                        : 'bg-indigo-50/30 hover:bg-indigo-50/50'
                    }`}
                    onClick={() => void markNotificationRead(notification)}
                    disabled={isMutating}
                  >
                    {!notification.isRead && (
                      <span className="absolute left-2 top-6 h-1.5 w-1.5 rounded-full bg-indigo-600" />
                    )}

                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${iconConfig.iconBg} ${iconConfig.iconColor}`}>
                      <IconData className={`h-4 w-4 ${isMutating ? 'animate-spin' : ''}`} />
                    </span>

                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex items-start justify-between gap-3">
                        <span className="line-clamp-1 text-sm font-bold text-slate-800">{notification.title}</span>
                        <span className="shrink-0 text-[10px] text-slate-400">{formatNotificationTime(notification.time)}</span>
                      </span>

                      <span className="block">
                        <span className={`block text-xs text-slate-500 ${isExpanded ? '' : 'line-clamp-2'}`}>
                          {notification.content}
                        </span>
                        {notification.content.length > 72 && (
                          <span
                            role="button"
                            tabIndex={0}
                            className="mt-1 inline-flex text-xs font-medium text-indigo-500 hover:text-indigo-700"
                            onClick={(event) => toggleExpand(notification.id, event)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                toggleExpand(notification.id, event as unknown as React.MouseEvent);
                              }
                            }}
                          >
                            {isExpanded ? '收起' : '展开全文'}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>

          <div className="flex justify-center border-t border-slate-100 bg-slate-50 p-2">
            <button
              type="button"
              data-testid="notification-center-deferred"
              className="w-full rounded py-2 text-xs font-medium text-slate-400"
              disabled
            >
              完整消息中心将在后续批次开放
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
