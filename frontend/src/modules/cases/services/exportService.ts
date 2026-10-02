import { caseApi } from '../src/services/api/caseApi';

interface ExportFilterParams {
  keyword?: string;
  caseStatus?: string;
  riskLevel?: string;
  businessLine?: string;
  procedureType?: string;
  dateStart?: string;
  dateEnd?: string;
}

/**
 * 台账导出 - 调用后端 BFF 生成 Excel 并触发下载
 *
 * 替代原前端纯客户端导出方案，解决大数据量下:
 *  - 主线程阻塞 (OBS-006)
 *  - 缺少 loading 状态反馈 (OBS-005)
 *
 * 后端按当前筛选条件查询全量案件 + 子台账，生成多 sheet Excel 返回。
 */
export const exportCaseLedgerToExcel = async (filters: ExportFilterParams) => {
  // 构建 BFF 请求体 (camelCase，axios 拦截器会自动转 snake_case)
  const body: Record<string, any> = {};

  if (filters.keyword) body.keyword = filters.keyword;
  if (filters.caseStatus && filters.caseStatus !== 'ALL') {
    body.currentStageCode = [filters.caseStatus];
  }
  if (filters.riskLevel && filters.riskLevel !== 'ALL') {
    body.riskLevel = [filters.riskLevel];
  }
  if (filters.businessLine && filters.businessLine !== 'ALL') {
    body.businessLine = [filters.businessLine];
  }
  if (filters.procedureType && filters.procedureType !== 'ALL') {
    body.caseTypeCode = [filters.procedureType];
  }
  if (filters.dateStart) body.dateStart = filters.dateStart;
  if (filters.dateEnd) body.dateEnd = filters.dateEnd;

  const blob = await caseApi.exportLedgerBff(body);

  // 触发浏览器下载
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;

  // 从响应头提取文件名，或使用默认命名
  const today = new Date().toISOString().split('T')[0];
  link.download = `SLD_案件台账导出_${today}.xlsx`;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};
