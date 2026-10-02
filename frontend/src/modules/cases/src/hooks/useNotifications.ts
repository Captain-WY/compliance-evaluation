/**
 * 消息通知 React Query Hooks
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { notificationApi } from '@cases/services/api/notificationApi'

/**
 * 查询消息通知列表
 */
export function useNotifications(params?: {
  page?: number
  size?: number
  isRead?: boolean
  notificationType?: string
}) {
  return useQuery({
    queryKey: ['notifications', params],
    queryFn: () => notificationApi.getNotifications(params),
  })
}

/**
 * 查询未读通知数量
 */
export function useUnreadNotificationCount() {
  return useQuery({
    queryKey: ['unreadNotificationCount'],
    queryFn: () => notificationApi.getUnreadCount(),
    refetchInterval: 60000, // 每分钟刷新一次
  })
}

/**
 * 标记通知为已读
 */
export function useMarkNotificationAsRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (notificationId: string) =>
      notificationApi.markAsRead(notificationId),
    onSuccess: () => {
      // 刷新通知列表和未读数量
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['unreadNotificationCount'] })
    },
  })
}

/**
 * 标记所有通知为已读
 */
export function useMarkAllNotificationsAsRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => notificationApi.markAllAsRead(),
    onSuccess: () => {
      // 刷新通知列表和未读数量
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['unreadNotificationCount'] })
    },
  })
}