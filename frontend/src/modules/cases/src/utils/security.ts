/**
 * 安全防护工具函数
 */

/**
 * XSS 防护：转义 HTML 特殊字符
 * @param str - 原始字符串
 * @returns 转义后的字符串
 */
export function escapeHtml(str: string): string {
  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }

  return str.replace(/[&<>"']/g, char => htmlEntities[char])
}

/**
 * XSS 防护：移除 HTML 标签
 * @param str - 原始字符串
 * @returns 移除 HTML 标签后的字符串
 */
export function stripHtml(str: string): string {
  return str.replace(/<[^>]*>/g, '')
}

/**
 * XSS 防护：安全地设置 HTML 内容
 * @param str - 原始字符串
 * @returns 安全的 HTML 字符串
 */
export function sanitizeHtml(str: string): string {
  // 允许的标签白名单
  const allowedTags = ['b', 'i', 'u', 'strong', 'em', 'br', 'p']

  // 移除所有 script 标签
  let sanitized = str.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')

  // 移除所有事件处理器
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '')

  // 移除 javascript: 协议
  sanitized = sanitized.replace(/javascript:/gi, '')

  // 只保留白名单标签
  const tagPattern = /<(\/?)(\w+)[^>]*>/g
  sanitized = sanitized.replace(tagPattern, (match, slash, tagName) => {
    if (allowedTags.includes(tagName.toLowerCase())) {
      return match
    }
    return ''
  })

  return sanitized
}

/**
 * 生成随机 CSRF Token
 * @param length - Token 长度
 * @returns CSRF Token
 */
export function generateCsrfToken(length = 32): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let token = ''

  if (window.crypto && window.crypto.getRandomValues) {
    const values = new Uint32Array(length)
    window.crypto.getRandomValues(values)

    for (let i = 0; i < length; i++) {
      token += charset[values[i] % charset.length]
    }
  } else {
    // Fallback for older browsers
    for (let i = 0; i < length; i++) {
      token += charset.charAt(Math.floor(Math.random() * charset.length))
    }
  }

  return token
}

/**
 * 存储 CSRF Token
 * @param token - CSRF Token
 */
export function setCsrfToken(token: string): void {
  sessionStorage.setItem('csrf_token', token)
}

/**
 * 获取 CSRF Token
 * @returns CSRF Token
 */
export function getCsrfToken(): string | null {
  return sessionStorage.getItem('csrf_token')
}

/**
 * 验证 CSRF Token
 * @param token - 待验证的 Token
 * @returns 是否有效
 */
export function validateCsrfToken(token: string): boolean {
  const storedToken = getCsrfToken()
  return storedToken !== null && storedToken === token
}

/**
 * 密码强度检查
 * @param password - 密码
 * @returns 强度等级：weak | medium | strong
 */
export function checkPasswordStrength(password: string): 'weak' | 'medium' | 'strong' {
  let score = 0

  // 长度检查
  if (password.length >= 8) score++
  if (password.length >= 12) score++

  // 包含小写字母
  if (/[a-z]/.test(password)) score++

  // 包含大写字母
  if (/[A-Z]/.test(password)) score++

  // 包含数字
  if (/[0-9]/.test(password)) score++

  // 包含特殊字符
  if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) score++

  if (score <= 2) return 'weak'
  if (score <= 4) return 'medium'
  return 'strong'
}

/**
 * 敏感数据掩码
 * @param data - 原始数据
 * @param visibleChars - 可见字符数
 * @param maskChar - 掩码字符
 * @returns 掩码后的数据
 */
export function maskSensitiveInfo(
  data: string,
  visibleChars = 4,
  maskChar = '*'
): string {
  if (data.length <= visibleChars * 2) {
    return maskChar.repeat(data.length)
  }

  const start = data.substring(0, visibleChars)
  const end = data.substring(data.length - visibleChars)
  const middle = maskChar.repeat(data.length - visibleChars * 2)

  return start + middle + end
}

/**
 * 手机号掩码
 * @param phone - 手机号
 * @returns 掩码后的手机号
 */
export function maskPhoneNumber(phone: string): string {
  return maskSensitiveInfo(phone, 3, '*')
}

/**
 * 邮箱掩码
 * @param email - 邮箱
 * @returns 掩码后的邮箱
 */
export function maskEmail(email: string): string {
  const [username, domain] = email.split('@')

  if (!username || !domain) {
    return email
  }

  const maskedUsername = username.substring(0, 2) + '***'
  return `${maskedUsername}@${domain}`
}

/**
 * 身份证号掩码
 * @param idCard - 身份证号
 * @returns 掩码后的身份证号
 */
export function maskIdCard(idCard: string): string {
  return maskSensitiveInfo(idCard, 4, '*')
}

/**
 * 银行卡号掩码
 * @param bankCard - 银行卡号
 * @returns 掩码后的银行卡号
 */
export function maskBankCard(bankCard: string): string {
  return maskSensitiveInfo(bankCard, 4, '*')
}

/**
 * 检测是否为敏感操作
 * @param action - 操作类型
 * @returns 是否为敏感操作
 */
export function isSensitiveAction(action: string): boolean {
  const sensitiveActions = [
    'DELETE_CASE',
    'DELETE_DOCUMENT',
    'APPROVE_FINANCE',
    'MODIFY_PERMISSION',
    'EXPORT_DATA',
  ]

  return sensitiveActions.includes(action)
}

/**
 * 敏感操作审计日志
 * @param action - 操作类型
 * @param details - 操作详情
 */
export function logSensitiveAction(action: string, details: Record<string, unknown>): void {
  const log = {
    timestamp: new Date().toISOString(),
    action,
    details,
    userAgent: navigator.userAgent,
    url: window.location.href,
  }

  // 发送到后端审计日志系统
  console.log('[AUDIT LOG]', log)

  // TODO: 实际项目中应该发送到后端
  // apiClient.post('/audit-logs', log)
}