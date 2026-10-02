/**
 * 字段命名转换工具
 * 用于处理后端 snake_case 和前端 camelCase 之间的转换
 */

/**
 * 将 snake_case 转换为 camelCase
 * @example
 * toCamelCase('case_name') // 'caseName'
 * toCamelCase('current_stage_code') // 'currentStageCode'
 */
export function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
}

/**
 * 将 camelCase 转换为 snake_case
 * @example
 * toSnakeCase('caseName') // 'case_name'
 * toSnakeCase('currentStageCode') // 'current_stage_code'
 */
export function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)
}

/**
 * 递归转换对象的所有 key
 * @param obj 要转换的对象
 * @param transformer 转换函数 (toCamelCase 或 toSnakeCase)
 * @returns 转换后的对象
 */
export function transformKeys<T>(obj: any, transformer: (key: string) => string): T {
  // 处理数组
  if (Array.isArray(obj)) {
    return obj.map(item => transformKeys(item, transformer)) as T
  }

  // 处理对象
  if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj).reduce((acc, key) => {
      const transformedKey = transformer(key)
      acc[transformedKey] = transformKeys(obj[key], transformer)
      return acc
    }, {} as any) as T
  }

  // 基本类型直接返回
  return obj
}

/**
 * 将对象的 key 从 snake_case 转换为 camelCase
 * 用于处理后端 API 响应
 */
export function keysToCamelCase<T>(obj: any): T {
  return transformKeys<T>(obj, toCamelCase)
}

/**
 * 将对象的 key 从 camelCase 转换为 snake_case
 * 用于处理发送给后端的请求
 */
export function keysToSnakeCase<T>(obj: any): T {
  return transformKeys<T>(obj, toSnakeCase)
}