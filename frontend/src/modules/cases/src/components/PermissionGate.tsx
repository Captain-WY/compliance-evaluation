/**
 * 权限控制组件
 * 用于根据用户权限控制组件的显示/隐藏
 */

import React from 'react'
import { useAuth } from '@cases/hooks/useAuth'
import { hasPermission, hasAnyPermission, hasAllPermissions } from '@cases/utils/permission'
import type { Permission } from '@cases/utils/permission'

interface PermissionGateProps {
  /** 需要的权限（单个或多个） */
  permission?: Permission | Permission[]
  /** 权限检查模式：any（任意一个）或 all（所有） */
  mode?: 'any' | 'all'
  /** 有权限时显示的内容 */
  children: React.ReactNode
  /** 无权限时显示的内容（可选） */
  fallback?: React.ReactNode
}

/**
 * 权限守卫组件
 *
 * @example
 * // 单个权限
 * <PermissionGate permission="case:create">
 *   <Button>创建案件</Button>
 * </PermissionGate>
 *
 * @example
 * // 多个权限（任意一个）
 * <PermissionGate permission={['case:create', 'case:edit']} mode="any">
 *   <Button>操作案件</Button>
 * </PermissionGate>
 *
 * @example
 * // 多个权限（所有）
 * <PermissionGate permission={['case:create', 'case:approve']} mode="all">
 *   <Button>创建并审批</Button>
 * </PermissionGate>
 *
 * @example
 * // 带降级显示
 * <PermissionGate permission="finance:view" fallback={<div>无权限查看</div>}>
 *   <FinanceReport />
 * </PermissionGate>
 */
export function PermissionGate({
  permission,
  mode = 'any',
  children,
  fallback = null,
}: PermissionGateProps) {
  const { user } = useAuth()

  // 未登录
  if (!user) {
    return <>{fallback}</>
  }

  // 无权限要求，直接显示
  if (!permission) {
    return <>{children}</>
  }

  // 权限检查
  const permissions = Array.isArray(permission) ? permission : [permission]

  const hasAccess =
    mode === 'all'
      ? hasAllPermissions(user, permissions)
      : hasAnyPermission(user, permissions)

  return hasAccess ? <>{children}</> : <>{fallback}</>
}

/**
 * 角色守卫组件
 */
interface RoleGateProps {
  /** 需要的角色 */
  role: string | string[]
  /** 有角色时显示的内容 */
  children: React.ReactNode
  /** 无角色时显示的内容（可选） */
  fallback?: React.ReactNode
}

export function RoleGate({ role, children, fallback = null }: RoleGateProps) {
  const { user } = useAuth()

  if (!user) {
    return <>{fallback}</>
  }

  const roles = Array.isArray(role) ? role : [role]
  const hasRole = roles.includes(user.role)

  return hasRole ? <>{children}</> : <>{fallback}</>
}

/**
 * 内部用户守卫组件
 */
interface InternalUserGateProps {
  children: React.ReactNode
  fallback?: React.ReactNode
}

export function InternalUserGate({ children, fallback = null }: InternalUserGateProps) {
  const { user } = useAuth()

  if (!user) {
    return <>{fallback}</>
  }

  const internalRoles = ['SUPER_ADMIN', 'ADMIN', 'LAWYER', 'PARALEGAL', 'SECRETARY']
  const isInternal = internalRoles.includes(user.role)

  return isInternal ? <>{children}</> : <>{fallback}</>
}

/**
 * 高阶组件：为组件添加权限控制
 */
export function withPermission<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  permission: Permission | Permission[],
  mode: 'any' | 'all' = 'any'
) {
  return function PermissionWrappedComponent(props: P) {
    return (
      <PermissionGate permission={permission} mode={mode}>
        <WrappedComponent {...props} />
      </PermissionGate>
    )
  }
}

/**
 * 高阶组件：为组件添加角色控制
 */
export function withRole<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  role: string | string[]
) {
  return function RoleWrappedComponent(props: P) {
    return (
      <RoleGate role={role}>
        <WrappedComponent {...props} />
      </RoleGate>
    )
  }
}