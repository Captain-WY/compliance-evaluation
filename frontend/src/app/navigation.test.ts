import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BRANCH_MENU_IDS, HQ_MENU_IDS } from '../modules/compliance-shared/constants/menu';
import { getActiveItem, getNavigation } from './navigation';

const admin = getNavigation({ role_codes: ['platform_admin'], role: 'LEGAL_ADMIN', permittedMenuIds: HQ_MENU_IDS });

test('five roles retain their module boundaries', () => {
  const cases: [string, string, string[], string[]][] = [
    ['platform_admin', 'LEGAL_ADMIN', HQ_MENU_IDS, ['cases', 'inspections', 'assessments', 'system']],
    ['hq_business', 'LEGAL_ADMIN', HQ_MENU_IDS, ['cases', 'inspections', 'assessments']],
    ['branch_business', 'BUSINESS_UNIT', BRANCH_MENU_IDS, ['cases', 'inspections', 'assessments']],
    ['department_business', 'BUSINESS_UNIT', [], ['cases']],
    ['external_lawyer', 'EXTERNAL_LAWYER', [], ['cases']],
  ];
  for (const [code, role, permittedMenuIds, expected] of cases) {
    const groups = getNavigation({ role_codes: [code], role, permittedMenuIds });
    assert.deepEqual(groups.map(group => group.id), expected, code);
    if (code === 'branch_business') assert.ok(groups.slice(1).every(group => group.items.every(item => item.href.includes('/branch-'))));
    if (code === 'external_lawyer') assert.deepEqual(groups[0].items.map(item => item.label), ['律师工作台']);
    if (code === 'department_business') assert.deepEqual(groups[0].items.map(item => item.href), ['/cases', '/cases/report', '/cases/tasks']);
  }
});

test('details select exactly their most specific parent', () => {
  for (const [path, expected] of [
    ['/cases/case_123', '/cases'], ['/cases/clues/clue_123', '/cases/clues'],
    ['/cases/new', '/cases/new'], ['/inspections/hq-plans/plan_123', '/inspections/hq-plans'],
    ['/assessments/dispatch-detail', '/assessments/hq-workflow-center'],
    ['/assessments/hq-unified-workbench', '/assessments/hq-review'],
  ]) assert.equal(getActiveItem(admin, path, '')?.href, expected);
});

test('system query tabs and default route select a single matching entry', () => {
  for (const tab of ['dict', 'role', 'menu', 'process']) {
    assert.equal(getActiveItem(admin, '/system/admin', `?keyword=x&tab=${tab}`)?.href, `/system/admin?tab=${tab}`);
  }
  for (const query of ['', '?tab=unknown']) assert.equal(getActiveItem(admin, '/system/admin', query)?.href, '/system/admin?tab=dict');
});

test('permitted menu filtering hides empty groups and ungranted children', () => {
  const groups = getNavigation({ role_codes: ['hq_business'], role: 'LEGAL_ADMIN', permittedMenuIds: ['hq-review'] });
  assert.deepEqual(groups.map(group => group.id), ['cases', 'assessments']);
  assert.deepEqual(groups[1].items.map(item => item.href), ['/assessments/hq-review']);
  assert.equal(getActiveItem(groups, '/system/admin', ''), undefined);
});
