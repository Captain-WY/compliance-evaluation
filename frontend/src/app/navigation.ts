import {
  Bell, BookOpen, BriefcaseBusiness, ClipboardCheck, ClipboardList, FilePlus,
  FileSearch, FileText, GitBranch, Inbox, Landmark, List, Menu, Scale,
  Settings, ShieldCheck, Users, Wallet, type LucideIcon,
} from 'lucide-react';
import { BRANCH_MENU_GROUPS, HQ_MENU_GROUPS } from '../modules/compliance-shared/constants/menu';
import type { PlatformUser } from '../platform/AuthProvider';

export interface NavigationItem {
  href: string;
  label: string;
  icon: LucideIcon;
  highlight?: boolean;
}
export interface NavigationGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  items: NavigationItem[];
}

const assessmentMenus = new Set([
  'hq-indicators', 'hq-rules', 'hq-workflow-center', 'hq-review', 'hq-assessment-dashboard',
  'hq-workflow-designer', 'hq-scheduler', 'hq-unified-workbench', 'hq-data-cockpit',
  'branch-reporting', 'branch-self-assessment', 'branch-daily-ledger', 'dispatch-detail',
]);
const caseItems: NavigationItem[] = [
  { href: '/cases', label: '案件列表', icon: List },
  { href: '/cases/clues', label: '线索管理', icon: FileSearch },
  { href: '/cases/report', label: '上报线索', icon: FileText },
  { href: '/cases/new', label: '新建案件', icon: FilePlus },
  { href: '/cases/approvals', label: '审批中心', icon: ClipboardCheck },
  { href: '/cases/inbox', label: '智能收件箱', icon: Inbox },
  { href: '/cases/finance', label: '财务中心', icon: Wallet },
  { href: '/cases/reports', label: '报告与监管', icon: ClipboardList },
  { href: '/cases/vendors', label: '外聘律所', icon: Landmark },
  { href: '/cases/knowledge', label: '知识资源', icon: BookOpen },
  { href: '/cases/notifications', label: '通知记录', icon: Bell },
];

export function getNavigation(user: Pick<PlatformUser, 'role_codes' | 'role' | 'permittedMenuIds'>): NavigationGroup[] {
  const admin = user.role_codes.includes('platform_admin');
  const branch = user.role_codes.includes('branch_business');
  const lawyer = user.role_codes.includes('external_lawyer');
  const groups: NavigationGroup[] = [{
    id: 'cases', label: '案件管理', icon: BriefcaseBusiness,
    items: lawyer ? [{ href: '/cases', label: '律师工作台', icon: Scale }]
      : user.role === 'BUSINESS_UNIT' ? [
        { href: '/cases', label: '我的上报记录', icon: List },
        { href: '/cases/report', label: '上报线索', icon: FileText },
        { href: '/cases/tasks', label: '协查任务', icon: ClipboardCheck },
      ] : caseItems,
  }];
  if (admin || user.role_codes.some(role => ['hq_business', 'branch_business'].includes(role))) {
    const menus = (branch ? BRANCH_MENU_GROUPS : HQ_MENU_GROUPS).flatMap(group => group.items)
      .filter(item => user.permittedMenuIds.includes(item.id) && !['hq-org', 'hq-dictionaries'].includes(item.id));
    for (const [id, label, icon] of [
      ['inspections', '合规检查', ShieldCheck], ['assessments', '合规考核', ClipboardCheck],
    ] as const) {
      const items = menus.filter(item => assessmentMenus.has(item.id) === (id === 'assessments'))
        .map(item => ({ href: `/${id}/${item.id}`, label: item.label, icon: item.icon, highlight: item.highlight }));
      if (items.length) groups.push({ id, label, icon, items });
    }
  }
  if (admin) groups.push({
    id: 'system', label: '系统管理', icon: Settings,
    items: [
      { href: '/system/admin?tab=dict', label: '公共字典', icon: BookOpen },
      { href: '/system/admin?tab=role', label: '角色管理', icon: ShieldCheck },
      { href: '/system/admin?tab=menu', label: '菜单管理', icon: Menu },
      { href: '/system/admin?tab=process', label: '流程模板', icon: GitBranch },
      { href: '/system/hq-org', label: '组织与权限范围', icon: Users },
      { href: '/system/hq-dictionaries', label: '合规受保护字典', icon: BookOpen },
    ],
  });
  return groups;
}

// Resolve the most specific entry so detail routes keep their parent selected.
export function getActiveItem(groups: NavigationGroup[], pathname: string, search: string) {
  const params = new URLSearchParams(search);
  const tab = params.get('tab');
  const adminTab = ['dict', 'role', 'menu', 'process'].includes(tab || '') ? tab : 'dict';
  const ownerRoutes: Record<string, string> = {
    '/assessments/dispatch-detail': '/assessments/hq-workflow-center',
    '/assessments/hq-workflow-designer': '/assessments/hq-rules',
    '/assessments/hq-scheduler': '/assessments/hq-workflow-center',
    '/assessments/hq-unified-workbench': '/assessments/hq-review',
    '/assessments/hq-data-cockpit': '/assessments/hq-assessment-dashboard',
  };
  const path = ownerRoutes[pathname] || pathname;
  return groups.flatMap(group => group.items).filter(item => {
    const [itemPath, query] = item.href.split('?');
    if (query) return pathname === itemPath && new URLSearchParams(query).get('tab') === adminTab;
    return path === itemPath || path.startsWith(`${itemPath}/`);
  }).sort((a, b) => b.href.length - a.href.length)[0];
}
