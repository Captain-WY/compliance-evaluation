export type ReportingSubmitIndicator = {
  id: string;
  indicatorId?: string;
  title: string;
};

export type ReportingSubmitErrorNotice = {
  title: string;
  description: string;
};

type ApiErrorLike = {
  message?: unknown;
  code?: unknown;
  status?: unknown;
  details?: unknown;
};

const ERROR_CODE_LABELS: Record<string, string> = {
  required_value_missing: '未填写必填内容',
  required_evidence_missing: '缺少必需佐证材料',
};

const stringValue = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const indicatorLabel = (
  indicators: ReportingSubmitIndicator[],
  responseItemId?: string,
) => {
  if (!responseItemId) return '未定位指标';
  const matched = indicators.find(
    (indicator) => indicator.id === responseItemId || indicator.indicatorId === responseItemId,
  );
  return matched?.title ?? responseItemId;
};

const summarizeValidationErrors = (
  errors: unknown,
  indicators: ReportingSubmitIndicator[],
) => {
  if (!Array.isArray(errors) || errors.length === 0) return undefined;
  const lines = errors
    .filter(isRecord)
    .slice(0, 4)
    .map((error) => {
      const responseItemId = stringValue(error.responseItemId);
      const code = stringValue(error.code);
      const label = code ? ERROR_CODE_LABELS[code] ?? code : '未通过校验';
      return `${indicatorLabel(indicators, responseItemId)}：${label}`;
    });
  if (!lines.length) return undefined;
  const suffix = errors.length > lines.length ? `；另有 ${errors.length - lines.length} 项待检查` : '';
  return `请检查 ${errors.length} 项填报内容：${lines.join('；')}${suffix}`;
};

const summarizeDetails = (
  details: unknown,
  indicators: ReportingSubmitIndicator[],
) => {
  if (!details) return undefined;
  if (Array.isArray(details)) {
    const lines = details
      .filter(isRecord)
      .map((item) => stringValue(item.message) ?? stringValue(item.reason) ?? stringValue(item.code))
      .filter(Boolean)
      .slice(0, 4);
    return lines.length ? lines.join('；') : undefined;
  }
  if (!isRecord(details)) return undefined;
  const validationSummary = summarizeValidationErrors(details.errors, indicators);
  if (validationSummary) return validationSummary;
  const status = stringValue(details.status);
  const action = stringValue(details.action);
  if (status && action) return `当前状态 ${status} 不允许执行 ${action}`;
  return stringValue(details.message) ?? stringValue(details.reason);
};

export const formatReportingSubmitError = (
  error: unknown,
  indicators: ReportingSubmitIndicator[],
): ReportingSubmitErrorNotice => {
  const apiError = isRecord(error) ? (error as ApiErrorLike) : {};
  const status = typeof apiError.status === 'number' ? apiError.status : undefined;
  const code = stringValue(apiError.code);
  const backendMessage = stringValue(apiError.message);
  const detailSummary = summarizeDetails(apiError.details, indicators);

  let title = '提交审核失败';
  if (status === 403 || code === 'FORBIDDEN') {
    title = '当前账号无权提交该填报任务';
  } else if (status === 409 || code === 'INVALID_STATE') {
    title = '当前填报任务状态不允许提交审核';
  } else if (status === 422 || code === 'VALIDATION_ERROR') {
    title = '填报内容未通过校验';
  } else if (status && status >= 500) {
    title = '提交服务暂时不可用';
  }

  const technicalHint = [code, status ? String(status) : undefined].filter(Boolean).join(' / ');
  const backendHint = backendMessage && backendMessage !== title ? backendMessage : undefined;
  const descriptionParts = [detailSummary, backendHint, technicalHint ? `错误码：${technicalHint}` : undefined]
    .filter(Boolean);

  return {
    title,
    description: descriptionParts.join('；') || '请稍后重试，或返回任务列表刷新当前状态后再提交。',
  };
};
