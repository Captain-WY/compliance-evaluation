/**
 * 权限管理工具函数
 */

import type { User } from '@cases/types/api/auth'

/**
 * 权限类型定义
 */
export type Permission = string

/**
 * 检查用户是否拥有指定权限
 * @param user - 用户对象
 * @param permission - 权限标识
 * @returns 是否拥有权限
 */
export function hasPermission(user: User | null, permission: Permission): boolean {
  if (!user) return false

  // 超级管理员拥有所有权限
  if (user.role === 'SUPER_ADMIN') return true

  // 检查用户权限列表
  return user.permissions?.includes(permission) ?? false
}

/**
 * 检查用户是否拥有任意一个权限
 * @param user - 用户对象
 * @param permissions - 权限标识列表
 * @returns 是否拥有任意一个权限
 */
export function hasAnyPermission(user: User | null, permissions: Permission[]): boolean {
  if (!user) return false
  if (user.role === 'SUPER_ADMIN') return true

  return permissions.some(permission =>
    user.permissions?.includes(permission) ?? false
  )
}

/**
 * 检查用户是否拥有所有权限
 * @param user - 用户对象
 * @param permissions - 权限标识列表
 * @returns 是否拥有所有权限
 */
export function hasAllPermissions(user: User | null, permissions: Permission[]): boolean {
  if (!user) return false
  if (user.role === 'SUPER_ADMIN') return true

  return permissions.every(permission =>
    user.permissions?.includes(permission) ?? false
  )
}

/**
 * 检查用户角色
 * @param user - 用户对象
 * @param roles - 角色列表
 * @returns 是否拥有指定角色
 */
export function hasRole(user: User | null, roles: string | string[]): boolean {
  if (!user) return false

  const roleList = Array.isArray(roles) ? roles : [roles]
  return roleList.includes(user.role)
}

/**
 * 检查是否为内部用户
 * @param user - 用户对象
 * @returns 是否为内部用户
 */
export function isInternalUser(user: User | null): boolean {
  if (!user) return false

  const internalRoles = ['SUPER_ADMIN', 'ADMIN', 'LAWYER', 'PARALEGAL', 'SECRETARY']
  return internalRoles.includes(user.role)
}

/**
 * 检查是否为外部律师
 * @param user - 用户对象
 * @returns 是否为外部律师
 */
export function isExternalCounsel(user: User | null): boolean {
  if (!user) return false
  return user.role === 'EXTERNAL_COUNSEL'
}

/**
 * 获取用户可访问的案件字段列表
 * @param user - 用户对象
 * @returns 可访问的字段列表
 */
export function getAccessibleFields(user: User | null): string[] {
  if (!user) return []

  // 外部律师只能访问部分字段
  if (isExternalCounsel(user)) {
    return [
      'caseName',
      'caseType',
      'caseStage',
      'parties', // 部分当事人信息
      'tasks',
      'documents',
    ]
  }

  // 内部用户可以访问所有字段
  return ['*']
}

/**
 * 检查字段是否可访问
 * @param user - 用户对象
 * @param fieldName - 字段名称
 * @returns 字段是否可访问
 */
export function canAccessField(user: User | null, fieldName: string): boolean {
  const accessibleFields = getAccessibleFields(user)

  // 拥有所有字段访问权限
  if (accessibleFields.includes('*')) return true

  // 检查特定字段
  return accessibleFields.includes(fieldName)
}

/**
 * 数据脱敏 - 隐藏敏感信息
 * @param user - 用户对象
 * @param data - 原始数据
 * @param sensitiveFields - 敏感字段列表
 * @returns 脱敏后的数据
 */
export function maskSensitiveData<T extends Record<string, unknown>>(
  user: User | null,
  data: T,
  sensitiveFields: string[]
): Partial<T> {
  if (!user) return {}

  // 内部用户不脱敏
  if (isInternalUser(user)) {
    return data
  }

  // 外部用户脱敏处理
  const maskedData: Partial<T> = { ...data }

  for (const field of sensitiveFields) {
    if (field in maskedData) {
      delete maskedData[field as keyof T]
    }
  }

  return maskedData
}