import type { UnifiedTaskActionTarget } from '../../types';

export const DEPLOY_BASE_PATH = '/compliance' as const;

export type AppRouteScope = 'public' | 'hq' | 'branch';
export type AppRouteModule = 'auth' | 'dashboard' | 'inspection' | 'assessment' | 'issue' | 'system';

export interface AppRouteContract {
  id: string;
  menuId?: string;
  label: string;
  scope: AppRouteScope;
  module: AppRouteModule;
  appPath: string;
  publicPath: string;
  p0Candidate?: boolean;
}

const toPublicPath = (appPath: string) => {
  const normalizedAppPath = appPath.startsWith('/') ? appPath : `/${appPath}`;
  return `${DEPLOY_BASE_PATH}${normalizedAppPath}`;
};

const route = (item: Omit<AppRouteContract, 'publicPath'>): AppRouteContract => ({
  ...item,
  publicPath: toPublicPath(item.appPath),
});

export const APP_ROUTE_CONTRACTS = [
  route({ id: 'login', label: '登录', scope: 'public', module: 'auth', appPath: '/login', p0Candidate: true }),

  route({ id: 'hq-dashboard', menuId: 'hq-dashboard', label: '全局合规大屏', scope: 'hq', module: 'dashboard', appPath: '/hq/dashboard' }),
  route({ id: 'hq-branch-profile', menuId: 'hq-branch-profile', label: '全息机构画像', scope: 'hq', module: 'dashboard', appPath: '/hq/branches/profile' }),
  route({ id: 'hq-tasks', menuId: 'hq-tasks', label: '统一待办中心', scope: 'hq', module: 'dashboard', appPath: '/hq/tasks', p0Candidate: true }),

  route({ id: 'hq-plans', menuId: 'hq-plans', label: '检查计划大盘', scope: 'hq', module: 'inspection', appPath: '/hq/inspection/plans', p0Candidate: true }),
  route({ id: 'hq-monitor', menuId: 'hq-monitor', label: '实施进度监控', scope: 'hq', module: 'inspection', appPath: '/hq/inspection/execution', p0Candidate: true }),
  route({ id: 'hq-adjudication-console', menuId: 'hq-adjudication-console', label: '申辩裁决控制台', scope: 'hq', module: 'inspection', appPath: '/hq/inspection/adjudication', p0Candidate: true }),
  route({ id: 'hq-issue-hub', menuId: 'hq-issue-hub', label: '中央问题库与督办', scope: 'hq', module: 'issue', appPath: '/hq/issues', p0Candidate: true }),

  route({ id: 'hq-indicators', menuId: 'hq-indicators', label: '合规指标管理', scope: 'hq', module: 'assessment', appPath: '/hq/assessment/indicators' }),
  route({ id: 'hq-rules', menuId: 'hq-rules', label: '考核方案配置', scope: 'hq', module: 'assessment', appPath: '/hq/assessment/schemes' }),
  route({ id: 'hq-workflow-center', menuId: 'hq-workflow-center', label: '考核运行调度', scope: 'hq', module: 'assessment', appPath: '/hq/assessment/workflows' }),
  route({ id: 'hq-review', menuId: 'hq-review', label: '集中复核审批', scope: 'hq', module: 'assessment', appPath: '/hq/assessment/review' }),
  route({ id: 'hq-assessment-dashboard', menuId: 'hq-assessment-dashboard', label: '考核全景大盘', scope: 'hq', module: 'assessment', appPath: '/hq/assessment/dashboard' }),

  route({ id: 'hq-org', menuId: 'hq-org', label: '组织与权限矩阵', scope: 'hq', module: 'system', appPath: '/hq/system/org-permissions', p0Candidate: true }),
  route({ id: 'hq-dictionaries', menuId: 'hq-dictionaries', label: '系统字典管理', scope: 'hq', module: 'system', appPath: '/hq/system/dictionaries' }),

  route({ id: 'branch-tasks', menuId: 'branch-tasks', label: '统一待办中心', scope: 'branch', module: 'dashboard', appPath: '/branch/tasks', p0Candidate: true }),
  route({ id: 'branch-dashboard', menuId: 'branch-dashboard', label: '全息机构画像', scope: 'branch', module: 'dashboard', appPath: '/branch/dashboard' }),

  route({ id: 'branch-upload', menuId: 'branch-upload', label: '非现场材料报送', scope: 'branch', module: 'inspection', appPath: '/branch/inspection/materials', p0Candidate: true }),
  route({ id: 'branch-confirmation', menuId: 'branch-confirmation', label: '结论核对与申辩', scope: 'branch', module: 'inspection', appPath: '/branch/inspection/confirmation', p0Candidate: true }),
  route({ id: 'branch-ledger', menuId: 'branch-ledger', label: '本机构整改台账', scope: 'branch', module: 'issue', appPath: '/branch/issues/rectifications', p0Candidate: true }),

  route({ id: 'branch-daily-ledger', menuId: 'branch-daily-ledger', label: '日常合规履职台账', scope: 'branch', module: 'assessment', appPath: '/branch/assessment/daily-ledger' }),
  route({ id: 'branch-reporting', menuId: 'branch-reporting', label: '考核数据填报', scope: 'branch', module: 'assessment', appPath: '/branch/assessment/reporting' }),
  route({ id: 'branch-self-assessment', menuId: 'branch-self-assessment', label: '考核成绩与档案', scope: 'branch', module: 'assessment', appPath: '/branch/assessment/records' }),
  route({ id: 'dispatch-detail', label: '考核运行详情', scope: 'hq', module: 'assessment', appPath: '/hq/assessment/workflows/detail' }),
] as const satisfies readonly AppRouteContract[];

export const APP_ROUTE_BY_MENU_ID = APP_ROUTE_CONTRACTS.reduce<Record<string, AppRouteContract>>((acc, item) => {
  if (item.menuId) {
    acc[item.menuId] = item;
  }

  return acc;
}, {});

export const getRouteByMenuId = (menuId: string) => APP_ROUTE_BY_MENU_ID[menuId];

export const getPublicPathByMenuId = (menuId: string) => getRouteByMenuId(menuId)?.publicPath;

export const buildPublicDeepLink = (
  menuId: string,
  query?: Record<string, string | number | boolean | undefined>
) => {
  const publicPath = getPublicPathByMenuId(menuId) ?? toPublicPath(`/${menuId}`);

  if (!query) {
    return publicPath;
  }

  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined) {
      params.set(key, String(value));
    }
  });

  const queryString = params.toString();
  return queryString ? `${publicPath}?${queryString}` : publicPath;
};

export const buildTaskActionTarget = (
  menuId: string,
  params?: Record<string, string | number | boolean | undefined>,
  action?: string
): UnifiedTaskActionTarget => {
  const routeContract = getRouteByMenuId(menuId);
  const normalizedParams = params
    ? Object.fromEntries(
        Object.entries(params)
          .filter(([, value]) => value !== undefined)
          .map(([key, value]) => [key, String(value)])
      )
    : undefined;

  return {
    kind: 'route',
    menuId,
    appPath: routeContract?.appPath ?? `/${menuId}`,
    publicPath: buildPublicDeepLink(menuId, params),
    params: normalizedParams,
    action,
  };
};
