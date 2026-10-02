import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildDashboardSummary,
  buildWorkflowDetailMetrics,
  toWorkflowInstances,
} from './assessmentWorkflowReadModel';

const instances = toWorkflowInstances([
  {
    cycleId: 'ACYC-REAL-001',
    cycleName: '真实运行考核',
    status: 'REPORTING',
    periodStart: '2026-06-01',
    periodEnd: '2026-06-30',
    dispatchedAtRef: '2026-06-02T09:15:00+08:00',
    targets: [
      {
        cycleTargetId: 'T-001',
        orgId: 'ORG-001',
        orgSnapshot: { orgName: '真实一部' },
        targetStatus: 'REPORTING',
        reportingTaskId: 'R-001',
      },
      {
        cycleTargetId: 'T-002',
        orgId: 'ORG-002',
        orgSnapshot: { orgName: '真实二部' },
        targetStatus: 'SUBMITTED',
        reportingTaskId: 'R-002',
      },
      {
        cycleTargetId: 'T-003',
        orgId: 'ORG-003',
        orgSnapshot: { orgName: '真实三部' },
        targetStatus: 'CLOSED',
        reportingTaskId: 'R-003',
      },
    ],
    reportingTasks: [
      { reportingTaskId: 'R-001', cycleTargetId: 'T-001', status: 'IN_PROGRESS', dueDate: '2026-06-20' },
      { reportingTaskId: 'R-002', cycleTargetId: 'T-002', status: 'SUBMITTED', dueDate: '2026-06-20' },
      { reportingTaskId: 'R-003', cycleTargetId: 'T-003', status: 'CLOSED', dueDate: '2026-06-20' },
    ],
  },
  {
    cycleId: 'ACYC-PENDING-001',
    cycleName: '真实待下发考核',
    status: 'DRAFT',
    selectedTargetOrgIds: ['ORG-010', 'ORG-011'],
    targets: [],
    reportingTasks: [],
  },
]);

const active = instances['ACYC-REAL-001'];
const pending = instances['ACYC-PENDING-001'];
assert.equal(active.targetCount, 3);
assert.equal(active.tableData.length, 3);
assert.equal(active.tableData[0].status, '填报中');
assert.equal(active.tableData[1].status, '审批流转中');
assert.equal(active.tableData[2].status, '已完结');
assert.equal(pending.bucket, 'pending');
assert.equal(pending.progressText, '暂无目标机构');

const summary = buildDashboardSummary(Object.values(instances));
assert.equal(summary.activeCount, 1);
assert.equal(summary.pendingCount, 1);
assert.equal(summary.totalTargets, 3);
assert.notEqual(summary.overallProgress, 68);

const detail = buildWorkflowDetailMetrics(active);
assert.equal(detail.totals.total, 3);
assert.equal(detail.totals.filling, 1);
assert.equal(detail.totals.reviewing, 1);
assert.equal(detail.totals.completed, 1);
assert.equal(detail.dueDateLabel, '2026-06-20');
assert.notEqual(detail.pct, '100%');

const dashboardSource = readFileSync(
  resolve('src/features/assessment/WorkflowDispatchDashboard.tsx'),
  'utf8',
);
const detailSource = readFileSync(
  resolve('src/features/assessment/WorkflowDispatchDetail.tsx'),
  'utf8',
);
for (const leakedSample of ['68%', '2026-04-15', '04-01 10:00', '2026-07-01 09:00', '考核对象总数: 50 家']) {
  assert.equal(dashboardSource.includes(leakedSample), false, `${leakedSample} leaked in dashboard`);
  assert.equal(detailSource.includes(leakedSample), false, `${leakedSample} leaked in detail`);
}

console.log('assessment workflow dispatch read model focused tests passed');
