/**
 * useDict — 字典缓存与映射 Hook
 *
 * 用法：
 *   const { lookup, ready } = useDict()
 *   lookup('BUSINESS_LINE', 'CUSTODY')  // → "托管业务"
 *   lookup('CAUSE_OF_ACTION', 'STOCK_TRADING')  // → "股票交易纠纷"
 *
 * 字典数据在应用生命周期内只拉取一次（staleTime: Infinity），
 * 减少重复请求。
 */
import { useQuery } from '@tanstack/react-query'
import { fetchAllDicts, type DictItem } from '../src/services/api/dictApi'

// 常见的需要字典映射的 dictType 常量
export const DICT_TYPES = {
  BUSINESS_LINE: 'BUSINESS_LINE',
  CAUSE_OF_ACTION: 'CAUSE_OF_ACTION',
  CASE_TYPE: 'CASE_TYPE',
  RISK_LEVEL: 'RISK_LEVEL',
  CASE_STAGE: 'CASE_STAGE',
  CASE_STATUS: 'CASE_STATUS',
  COURT_LEVEL: 'COURT_LEVEL',
  COURT_REGION: 'COURT_REGION',
  PROCEDURE_TYPE: 'PROCEDURE_TYPE',
} as const

/** 字典映射表：{ dictType → { dictCode → dictName } } */
export type DictMap = Record<string, Record<string, string>>

/** 构建字典查找表 */
function buildDictMap(items: DictItem[]): DictMap {
  const map: DictMap = {}
  for (const item of items) {
    if (!map[item.dictType]) {
      map[item.dictType] = {}
    }
    map[item.dictType][item.dictCode] = item.dictName
  }
  return map
}

export function useDict() {
  const { data: dictMap = {}, isLoading, isError } = useQuery<DictMap>({
    queryKey: ['sysDict', 'all'],
    queryFn: async () => {
      const items = await fetchAllDicts()
      return buildDictMap(items)
    },
    // 字典几乎不变，缓存整个 session
    staleTime: Infinity,
    gcTime: Infinity,
  })

  /**
   * 查找字典名称
   * @param dictType  字典类型，如 'BUSINESS_LINE'
   * @param dictCode  字典编码，如 'CUSTODY'
   * @param fallback  未找到时的兜底值（默认返回原编码）
   */
  const lookup = (
    dictType: string,
    dictCode: string | undefined | null,
    fallback?: string
  ): string => {
    if (!dictCode) return fallback ?? ''
    return dictMap[dictType]?.[dictCode] ?? fallback ?? dictCode
  }

  return { lookup, dictMap, ready: !isLoading && !isError }
}

export default useDict
