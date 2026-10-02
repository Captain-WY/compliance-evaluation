import {
  LayoutDashboard,
  CheckSquare,
  FileText,
  FolderOpen,
  AlertTriangle,
  Settings,
  Users,
  BookOpen,
  UploadCloud,
  ClipboardList,
  Edit3,
  FileSearch,
  Activity,
  Building,
  Target,
  Rocket,
  Scale,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AuthUser } from '../types';

export interface AppMenuItem {
  id: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
  highlight?: boolean;
}

export interface AppMenuGroup {
  title: string;
  items: AppMenuItem[];
}

export const HQ_MENU_GROUPS: AppMenuGroup[] = [
  {
    title: '个人工作台',
    items: [
      { id: 'hq-dashboard', label: '全局合规大屏', icon: LayoutDashboard },
      { id: 'hq-branch-profile', label: '全息机构画像', icon: Building },
      { id: 'hq-tasks', label: '统一待办中心', icon: CheckSquare, badge: 5 },
    ]
  },
  {
    title: '合规检查',
    items: [
      { id: 'hq-plans', label: '检查计划大盘', icon: FileText },
      { id: 'hq-monitor', label: '实施进度监控', icon: Activity },
      { id: 'hq-adjudication-console', label: '申辩裁决控制台', icon: Scale },
      { id: 'hq-issue-hub', label: '中央问题库与督办', icon: AlertTriangle, highlight: true },
    ]
  },
  {
    title: '合规考核',
    items: [
      { id: 'hq-indicators', label: '合规指标管理', icon: Target },
      { id: 'hq-rules', label: '考核方案配置', icon: ClipboardList },
      { id: 'hq-workflow-center', label: '考核运行调度', icon: Rocket },
      { id: 'hq-review', label: '集中复核审批', icon: Scale },
      { id: 'hq-assessment-dashboard', label: '考核全景大盘', icon: Activity },
    ]
  },
  {
    title: '公共基座',
    items: [
      { id: 'hq-org', label: '组织与权限矩阵', icon: Users },
      { id: 'hq-dictionaries', label: '系统字典管理', icon: BookOpen },
    ]
  }
];

export const BRANCH_MENU_GROUPS: AppMenuGroup[] = [
  {
    title: '个人工作台',
    items: [
      { id: 'branch-tasks', label: '统一待办中心', icon: CheckSquare, badge: 12 },
      { id: 'branch-dashboard', label: '全息机构画像', icon: LayoutDashboard },
    ]
  },
  {
    title: '合规检查',
    items: [
      { id: 'branch-upload', label: '非现场材料报送', icon: UploadCloud },
      { id: 'branch-confirmation', label: '结论核对与申辩', icon: AlertTriangle, highlight: true },
      { id: 'branch-ledger', label: '本机构整改台账', icon: ClipboardList },
    ]
  },
  {
    title: '合规考核',
    items: [
      { id: 'branch-daily-ledger', label: '日常合规履职台账', icon: ClipboardList },
      { id: 'branch-reporting', label: '考核数据填报', icon: Edit3, badge: 2 },
      { id: 'branch-self-assessment', label: '考核成绩与档案', icon: FileSearch },
    ]
  }
];

export const HQ_MENU_IDS = HQ_MENU_GROUPS.flatMap(group => group.items.map(item => item.id));
export const BRANCH_MENU_IDS = BRANCH_MENU_GROUPS.flatMap(group => group.items.map(item => item.id));

const REVIEW_MENU_GROUPS: AppMenuGroup[] = [
  {
    title: '合规管理视角',
    items: [
      HQ_MENU_GROUPS
        .flatMap(group => group.items)
        .find(item => item.id === 'hq-review')!
    ]
  }
];

const filterMenuGroups = (groups: AppMenuGroup[], permittedMenuIds: string[]) => {
  const permitted = new Set(permittedMenuIds);

  return groups
    .map(group => ({
      ...group,
      items: group.items.filter(item => permitted.has(item.id))
    }))
    .filter(group => group.items.length > 0);
};

export const getMenuGroupsForUser = (user: Pick<AuthUser, 'menuMode' | 'permittedMenuIds'>) => {
  if (user.menuMode === 'branch-only') {
    return filterMenuGroups(BRANCH_MENU_GROUPS, user.permittedMenuIds);
  }

  if (user.menuMode === 'hybrid-review') {
    return [
      ...filterMenuGroups(BRANCH_MENU_GROUPS, user.permittedMenuIds),
      ...filterMenuGroups(REVIEW_MENU_GROUPS, user.permittedMenuIds)
    ];
  }

  return filterMenuGroups(HQ_MENU_GROUPS, user.permittedMenuIds);
};

export const getFirstMenuId = (groups: AppMenuGroup[]) => groups[0]?.items[0]?.id ?? '';
