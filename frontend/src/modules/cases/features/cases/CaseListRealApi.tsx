/**
 * 案件列表组件 - 使用真实 API
 *
 * 这是一个示例组件，展示如何使用真实 API 和 React Query Hooks
 * 可以作为替换 CaseList.tsx 的参考
 */

import React, { useState } from 'react'
import { useCases, useDeleteCase } from '@cases/hooks/useCases'
import { CaseStage, CaseStatus } from '@cases/types/api/case'
import type { CaseListRequest } from '@cases/types/api/case'
import { formatDate, formatCurrency } from '@cases/utils/dateUtils'
import { Loading } from '../../components/Loading'
import { toast } from 'sonner'
import {
  LayoutList,
  LayoutGrid,
  Plus,
  Filter,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  FileText,
} from 'lucide-react'
import Button from '../../components/ui/Button'

interface CaseListRealApiProps {
  onCreateCase?: () => void
  onViewCase?: (caseId: string) => void
}

const CaseListRealApi: React.FC<CaseListRealApiProps> = ({
  onCreateCase,
  onViewCase,
}) => {
  // 分页状态
  const [page, setPage] = useState(1)
  const [size] = useState(20)

  // 筛选状态
  const [filters, setFilters] = useState<CaseListRequest>({
    page,
    size,
  })

  // 查询案件列表
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useCases(filters)

  // 删除案件
  const deleteMutation = useDeleteCase()

  // 处理删除
  const handleDelete = async (caseId: string) => {
    if (!confirm('确定要删除这个案件吗？')) return

    try {
      await deleteMutation.mutateAsync(caseId)
      toast.success('案件已删除')
    } catch (error) {
      toast.error('删除失败')
    }
  }

  // 处理筛选
  const handleFilter = (newFilters: Partial<CaseListRequest>) => {
    setFilters(prev => ({ ...prev, ...newFilters, page: 1 }))
    setPage(1)
  }

  // 处理分页
  const handlePageChange = (newPage: number) => {
    setFilters(prev => ({ ...prev, page: newPage }))
    setPage(newPage)
  }

  // Loading 状态
  if (isLoading) {
    return <Loading />
  }

  // Error 状态
  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <AlertCircle className="w-16 h-16 text-red-500" />
        <div className="text-xl font-semibold text-red-600">加载失败</div>
        <div className="text-slate-600">{error?.message || '未知错误'}</div>
        <Button onClick={() => refetch()}>重试</Button>
      </div>
    )
  }

  // Empty 状态
  if (!data || data.items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <FileText className="w-16 h-16 text-slate-400" />
        <div className="text-xl font-semibold text-slate-600">暂无案件数据</div>
        <div className="text-slate-500">点击下方按钮创建第一个案件</div>
        <Button onClick={onCreateCase}>
          <Plus className="w-4 h-4 mr-2" />
          创建案件
        </Button>
      </div>
    )
  }

  // 正常渲染
  return (
    <div className="space-y-4">
      {/* 头部：标题和操作 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">案件列表</h1>
          <p className="text-slate-600">共 {data.total} 个案件</p>
        </div>
        <Button onClick={onCreateCase}>
          <Plus className="w-4 h-4 mr-2" />
          创建案件
        </Button>
      </div>

      {/* 筛选栏 */}
      <div className="flex items-center space-x-4">
        <select
          className="px-3 py-2 border border-slate-300 rounded-lg"
          value={filters.stageCode || ''}
          onChange={(e) => handleFilter({ stageCode: e.target.value as CaseStage || undefined })}
        >
          <option value="">全部阶段</option>
          <option value={CaseStage.CLUE}>线索</option>
          <option value={CaseStage.FILING}>立案</option>
          <option value={CaseStage.FIRST_INSTANCE}>一审</option>
          <option value={CaseStage.SECOND_INSTANCE}>二审</option>
          <option value={CaseStage.ENFORCEMENT}>执行</option>
          <option value={CaseStage.CLOSED}>已结案</option>
        </select>

        <select
          className="px-3 py-2 border border-slate-300 rounded-lg"
          value={filters.caseStatus || ''}
          onChange={(e) => handleFilter({ caseStatus: e.target.value as CaseStatus || undefined })}
        >
          <option value="">全部状态</option>
          <option value={CaseStatus.PENDING}>待处理</option>
          <option value={CaseStatus.ACTIVE}>进行中</option>
          <option value={CaseStatus.SUSPENDED}>中止</option>
          <option value={CaseStatus.CLOSED}>已结案</option>
        </select>

        <input
          type="text"
          placeholder="搜索案件名称或案号..."
          className="flex-1 px-3 py-2 border border-slate-300 rounded-lg"
          value={filters.keyword || ''}
          onChange={(e) => handleFilter({ keyword: e.target.value })}
        />
      </div>

      {/* 案件列表表格 */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                案号
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                案件名称
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                案件类型
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                业务条线
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                当前阶段
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                标的额
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                立案日期
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                操作
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200">
            {data.items.map((caseItem) => (
              <tr
                key={caseItem.id}
                className="hover:bg-slate-50 cursor-pointer"
                onClick={() => onViewCase?.(caseItem.id)}
              >
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                  {caseItem.internalCaseNo}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                  {caseItem.caseName}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                  {caseItem.caseTypeCode}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                  {caseItem.businessLine || '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                    {caseItem.currentStageCode || '未设置'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                  {caseItem.targetAmount ? formatCurrency(caseItem.targetAmount) : '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                  {caseItem.filingDate ? formatDate(caseItem.filingDate) : '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                  <button
                    className="text-red-600 hover:text-red-800 mr-2"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(caseItem.id)
                    }}
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-700">
          显示第 {(page - 1) * size + 1} 到 {Math.min(page * size, data.total)} 条，共 {data.total} 条
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(page - 1)}
            disabled={page === 1}
          >
            <ChevronLeft className="w-4 h-4" />
            上一页
          </Button>
          <div className="text-sm text-slate-700">
            第 {page} / {Math.ceil(data.total / size)} 页
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(page + 1)}
            disabled={page >= Math.ceil(data.total / size)}
          >
            下一页
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

export default CaseListRealApi