/**
 * 日期时间处理工具
 * 统一使用 ISO 8601 格式 (UTC)
 */

import { format, parseISO, formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'

/**
 * 解析 ISO 8601 字符串为 Date 对象
 * @param isoString ISO 8601 格式的日期字符串
 * @returns Date 对象
 */
export function parseDate(isoString: string): Date {
  return parseISO(isoString)
}

/**
 * 格式化日期为本地显示
 * @param date Date 对象或 ISO 8601 字符串
 * @param formatStr 格式字符串，默认 'yyyy-MM-dd'
 * @returns 格式化后的日期字符串
 */
export function formatDate(date: Date | string, formatStr: string = 'yyyy-MM-dd'): string {
  const d = typeof date === 'string' ? parseDate(date) : date
  return format(d, formatStr, { locale: zhCN })
}

/**
 * 格式化日期时间
 * @param date Date 对象或 ISO 8601 字符串
 * @returns 格式化后的日期时间字符串 'yyyy-MM-dd HH:mm:ss'
 */
export function formatDateTime(date: Date | string): string {
  return formatDate(date, 'yyyy-MM-dd HH:mm:ss')
}

/**
 * 格式化为相对时间（如：3 天前）
 * @param date Date 对象或 ISO 8601 字符串
 * @returns 相对时间字符串
 */
export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? parseDate(date) : date
  const now = new Date()
  const diffInMs = now.getTime() - d.getTime()
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24))

  if (diffInDays === 0) return '今天'
  if (diffInDays === 1) return '昨天'
  if (diffInDays < 7) return `${diffInDays} 天前`
  if (diffInDays < 30) return `${Math.floor(diffInDays / 7)} 周前`
  if (diffInDays < 365) return `${Math.floor(diffInDays / 30)} 个月前`
  return `${Math.floor(diffInDays / 365)} 年前`
}

/**
 * 格式化货币金额
 * @param amount 金额数值
 * @param currency 货币符号，默认 '¥'
 * @returns 格式化后的金额字符串
 */
export function formatCurrency(amount: number, currency: string = '¥'): string {
  return `${currency}${amount.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

/**
 * 格式化文件大小
 * @param bytes 字节数
 * @returns 格式化后的文件大小字符串
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'

  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

/**
 * 获取当前时间的 ISO 8601 字符串
 * @returns ISO 8601 格式的日期时间字符串
 */
export function getCurrentISOTime(): string {
  return new Date().toISOString()
}

/**
 * 检查日期是否过期
 * @param date Date 对象或 ISO 8601 字符串
 * @returns 是否过期
 */
export function isExpired(date: Date | string): boolean {
  const d = typeof date === 'string' ? parseDate(date) : date
  return d.getTime() < Date.now()
}

/**
 * 计算距离截止日期的剩余天数
 * @param deadline Date 对象或 ISO 8601 字符串
 * @returns 剩余天数（负数表示已过期）
 */
export function daysUntilDeadline(deadline: Date | string): number {
  const d = typeof deadline === 'string' ? parseDate(deadline) : deadline
  const now = new Date()
  const diffInMs = d.getTime() - now.getTime()
  return Math.ceil(diffInMs / (1000 * 60 * 60 * 24))
}