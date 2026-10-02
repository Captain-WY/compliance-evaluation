/**
 * 权限管理 React Query Hooks
 */

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from './useAuth'
import {
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  hasRole,
  isInternalUser,
  isExternalCounsel,
  canAccessField,
} from '@cases/utils/permission'
import type { Permission } from '@cases/utils/permission'

/**
 * 查询用户权限列表
 */
export function usePermissions() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['permissions', user?.id],
    queryFn: async () => {
      // 如果已经有用户权限信息，直接返回
      if (user?.permissions) {
        return user.permissions
      }

      // 否则从后端获取
      // TODO: 实现权限查询 API
      return []
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // 5分钟内不重新请求
  })
}

/**
 * 检查单个权限
 */
export function useHasPermission(permission: Permission) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['hasPermission', user?.id, permission],
    queryFn: () => hasPermission(user, permission),
    enabled: !!user,
  })
}

/**
 * 检查多个权限（任意一个）
 */
export function useHasAnyPermission(permissions: Permission[]) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['hasAnyPermission', user?.id, permissions],
    queryFn: () => hasAnyPermission(user, permissions),
    enabled: !!user,
  })
}

/**
 * 检查多个权限（所有）
 */
export function useHasAllPermissions(permissions: Permission[]) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['hasAllPermissions', user?.id, permissions],
    queryFn: () => hasAllPermissions(user, permissions),
    enabled: !!user,
  })
}

/**
 * 检查角色
 */
export function useHasRole(roles: string | string[]) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['hasRole', user?.id, roles],
    queryFn: () => hasRole(user, roles),
    enabled: !!user,
  })
}

/**
 * 检查是否为内部用户
 */
export function useIsInternalUser() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['isInternalUser', user?.id],
    queryFn: () => isInternalUser(user),
    enabled: !!user,
  })
}

/**
 * 检查是否为外部律师
 */
export function useIsExternalCounsel() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['isExternalCounsel', user?.id],
    queryFn: () => isExternalCounsel(user),
    enabled: !!user,
  })
}

/**
 * 检查字段访问权限
 */
export function useCanAccessField(fieldName: string) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['canAccessField', user?.id, fieldName],
    queryFn: () => canAccessField(user, fieldName),
    enabled: !!user,
  })
}

/**
 * 刷新权限缓存
 */
export function useRefreshPermissions() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return () => {
    queryClient.invalidateQueries({ queryKey: ['permissions', user?.id] })
    queryClient.invalidateQueries({ queryKey: ['hasPermission', user?.id] })
    queryClient.invalidateQueries({ queryKey: ['hasAnyPermission', user?.id] })
    queryClient.invalidateQueries({ queryKey: ['hasAllPermissions', user?.id] })
  }
}