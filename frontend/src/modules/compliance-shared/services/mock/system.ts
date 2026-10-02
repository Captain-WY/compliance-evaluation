export interface OrgNode {
  id: string;
  name: string;
  type: 'root' | 'dept' | 'branch' | 'sub-branch';
  children?: OrgNode[];
}

export const mockOrgTree: OrgNode = {
  id: 'org-1',
  name: 'XX证券集团',
  type: 'root',
  children: [
    {
      id: 'org-2',
      name: '零售业务条线总部',
      type: 'dept',
      children: [
        {
          id: 'org-3',
          name: '华东大区分公司',
          type: 'branch',
          children: [
            { id: 'org-4', name: '上海陆家嘴营业部', type: 'sub-branch' },
            { id: 'org-5', name: '杭州武林营业部', type: 'sub-branch' },
          ]
        },
        {
          id: 'org-6',
          name: '华南大区分公司',
          type: 'branch'
        }
      ]
    },
    { id: 'org-7', name: '合规管理部', type: 'dept' },
    { id: 'org-8', name: '稽核审计部', type: 'dept' },
  ]
};

export interface Personnel {
  id: string;
  userId?: string;
  name: string;
  employeeId: string;
  title: string;
  status: 'active' | 'inactive';
  lastSyncDate: string;
  orgId: string;
}

export const mockPersonnel: Personnel[] = [
  { id: 'p-1', name: '张建国', employeeId: 'EMP00001', title: '合规总监', status: 'active', lastSyncDate: '2026-05-11', orgId: 'org-1' },
  { id: 'p-2', name: '李明轩', employeeId: 'EMP00123', title: '合规部总经理', status: 'active', lastSyncDate: '2026-05-11', orgId: 'org-7' },
  { id: 'p-3', name: '王丽华', employeeId: 'EMP00456', title: '分公司合规主管', status: 'active', lastSyncDate: '2026-05-11', orgId: 'org-3' },
  { id: 'p-4', name: '赵强', employeeId: 'EMP00489', title: '客户经理', status: 'inactive', lastSyncDate: '2026-05-01', orgId: 'org-3' },
  { id: 'p-5', name: '陈文静', employeeId: 'EMP00892', title: '营业部合规专员', status: 'active', lastSyncDate: '2026-05-11', orgId: 'org-4' },
  { id: 'p-6', name: '周鹏', employeeId: 'EMP00895', title: '营业部合规专员', status: 'active', lastSyncDate: '2026-05-11', orgId: 'org-5' },
  { id: 'p-7', name: '吴昊', employeeId: 'EMP00211', title: '审计专员', status: 'active', lastSyncDate: '2026-05-11', orgId: 'org-8' },
  { id: 'p-8', name: '郑宇', employeeId: 'EMP00912', title: '业务总监', status: 'active', lastSyncDate: '2026-05-11', orgId: 'org-2' },
];

export interface SystemRole {
  id: string;
  name: string;
  iconKey: 'crown' | 'building' | 'fileText' | 'shield' | 'mapPin' | 'eye';
  description: string;
}

export const mockRoles: SystemRole[] = [
  { id: 'role-1', name: '合规总监', iconKey: 'crown', description: '拥有最高系统权限，可审批全局事项。' },
  { id: 'role-2', name: '总部合规部管理员', iconKey: 'building', description: '管理所有营业部的合规检查与评分。' },
  { id: 'role-3', name: '条线总部管理员', iconKey: 'fileText', description: '管理特定业务条线的合规事项。' },
  { id: 'role-4', name: '分公司合规主管', iconKey: 'shield', description: '审核并追踪所辖营业部的问题整改。' },
  { id: 'role-5', name: '营业部合规专员', iconKey: 'mapPin', description: '负责所在营业部的数据填报与整改反馈。' },
  { id: 'role-6', name: '审计只读员', iconKey: 'eye', description: '仅具有所有数据的查看权限，无操作权限。' },
];

export interface RoleAssignment {
  assignmentId?: string;
  roleId: string;
  personnelId: string;
  orgId?: string;
}

export const initialRoleAssignments: RoleAssignment[] = [
  { roleId: 'role-1', personnelId: 'p-1' },
  { roleId: 'role-4', personnelId: 'p-3' },
  { roleId: 'role-5', personnelId: 'p-5' },
  { roleId: 'role-5', personnelId: 'p-6' },
  { roleId: 'role-5', personnelId: 'p-4' }, // Inactive mapped user
];
