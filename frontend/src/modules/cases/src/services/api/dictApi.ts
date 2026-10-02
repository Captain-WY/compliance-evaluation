/**
 * 字典 API
 * GET /api/v1/dicts  —— 按类型查询字典项
 */
import apiClient from './client'

export interface DictItem {
  id: string
  dictType: string
  dictCode: string
  dictName: string
  sortOrder: number
  isActive: boolean
}

/** 按类型拉取字典项 */
export async function fetchDictsByType(type: string): Promise<DictItem[]> {
  const res = await apiClient.get('/dicts', { params: { type } })
  return res.data?.data || []
}

/** 一次性拉取所有字典 */
export async function fetchAllDicts(): Promise<DictItem[]> {
  const res = await apiClient.get('/dicts')
  return res.data?.data || []
}
