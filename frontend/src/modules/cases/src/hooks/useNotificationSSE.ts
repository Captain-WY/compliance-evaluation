/**
 * useNotificationSSE — 全局 SSE 订阅 hook (S18)
 *
 * LegalLayout 挂载时调用，驱动 Header 铃铛 badge 实时更新。
 * 心跳帧 {"type":"ping"} 静默忽略。
 * 连接断开后指数退避重连（初始 3s，上限 30s）。
 */

import { useEffect, useRef, useCallback } from 'react';
import { SSE_URL } from '../services/api/notificationsBffApi';
import { getAuthToken } from '../services/api/client';

interface UseNotificationSSEOptions {
  onNewNotification: () => void; // 收到新通知时回调（触发 unreadCount + 1 或重新拉取）
  enabled?: boolean;
}

export function useNotificationSSE({ onNewNotification, enabled = true }: UseNotificationSSEOptions) {
  const esRef = useRef<EventSource | null>(null);
  const retryDelayRef = useRef(3000);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!mountedRef.current || !enabled) return;

    const token = getAuthToken();
    const url = token ? `${SSE_URL}?token=${encodeURIComponent(token)}` : SSE_URL;

    const es = new EventSource(url);
    esRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data?.type === 'ping') return; // 心跳帧静默忽略
        if (mountedRef.current) {
          onNewNotification();
        }
      } catch {
        // 忽略解析失败
      }
    };

    es.onerror = () => {
      es.close();
      esRef.current = null;
      if (!mountedRef.current) return;
      // 指数退避重连
      const delay = retryDelayRef.current;
      retryDelayRef.current = Math.min(delay * 2, 30000);
      retryTimerRef.current = setTimeout(() => {
        if (mountedRef.current) connect();
      }, delay);
    };

    es.onopen = () => {
      retryDelayRef.current = 3000; // 重置退避
    };
  }, [enabled, onNewNotification]);

  useEffect(() => {
    mountedRef.current = true;
    if (enabled) connect();

    return () => {
      mountedRef.current = false;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
  }, [connect, enabled]);
}
