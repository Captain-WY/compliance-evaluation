import assert from 'node:assert/strict';
import { formatReportingSubmitError } from './reportingSubmitErrors';

const indicators = [
  { id: 'RT-001-ITEM-001', indicatorId: 'IND-001', title: '客户身份识别完整率' },
  { id: 'RT-001-ITEM-002', indicatorId: 'IND-002', title: '异常交易线索处置说明' },
];

{
  const notice = formatReportingSubmitError(
    {
      status: 422,
      code: 'VALIDATION_ERROR',
      message: 'Reporting submission is incomplete',
      details: {
        errors: [
          { responseItemId: 'RT-001-ITEM-001', code: 'required_value_missing' },
          { responseItemId: 'RT-001-ITEM-002', code: 'required_evidence_missing' },
        ],
      },
    },
    indicators,
  );
  assert.equal(notice.title, '填报内容未通过校验');
  assert.match(notice.description, /客户身份识别完整率：未填写必填内容/);
  assert.match(notice.description, /异常交易线索处置说明：缺少必需佐证材料/);
  assert.match(notice.description, /VALIDATION_ERROR/);
}

{
  const notice = formatReportingSubmitError(
    {
      status: 409,
      code: 'INVALID_STATE',
      message: 'Invalid assessment reporting state transition',
      details: { status: 'SUBMITTED', action: 'submit_reporting' },
    },
    indicators,
  );
  assert.equal(notice.title, '当前填报任务状态不允许提交审核');
  assert.match(notice.description, /当前状态 SUBMITTED 不允许执行 submit_reporting/);
  assert.match(notice.description, /INVALID_STATE/);
}

{
  const notice = formatReportingSubmitError({ status: 403, code: 'FORBIDDEN' }, indicators);
  assert.equal(notice.title, '当前账号无权提交该填报任务');
}

console.log('reportingSubmitErrors focused tests passed');
