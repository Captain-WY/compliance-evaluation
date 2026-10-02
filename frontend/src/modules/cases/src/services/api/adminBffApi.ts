/**
 * 系统管理 BFF API
 *
 * S16 — 23 端点全 POST（D1: 零 GET，零路径参数）
 *   dicts:      types/list, items/list, items/tree, items/detail,
 *               items/create, items/update, items/delete, items/sort  (8)
 *   roles:      list, detail, create, update, delete, toggle           (6)
 *   menus:      tree, detail, create, update, delete                   (5)
 *   role-menus: list, save                                             (2)
 *   user-roles: list, save                                             (2)
 *
 * 挂载路径: /api/bff/v1/admin/*
 * 错误码: 5100-5121
 *
 * 注意：后端 Admin BFF schemas 使用 camelCase 字段名（无 alias_generator），
 * 请求体必须使用 camelCase，与其他 BFF 的 snake_case 约定不同。
 */

import apiClient from './client';

const _origin = ((import.meta.env.VITE_API_BASE_URL as string) || '/api/v1').replace(/\/api\/v1\/?$/, '');
const BASE = `${_origin}/api/bff/v1/admin`;

const post = async (url: string, body: Record<string, unknown> = {}): Promise<any> => {
  const res = await apiClient.post(url, body);
  return res.data?.data ?? res.data;
};

const adminBffApi = {
  // ── 字典管理 (8 端点) ────────────────────────────────────────────
  // 注：后端字段名 camelCase：dictType / itemId / dictCode / dictName / parentId / sortOrder / isActive

  dictTypesList: (): Promise<any> =>
    post(`${BASE}/dicts/types/list`),

  dictItemsList: (params: {
    dictType?: string | null;
    keyword?: string | null;
    isActive?: boolean | null;
    page?: number;
    pageSize?: number;
  } = {}): Promise<any> =>
    post(`${BASE}/dicts/items/list`, {
      dictType: params.dictType ?? null,
      keyword: params.keyword ?? null,
      isActive: params.isActive ?? null,
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 50,
    }),

  // dictType 为必填字段（后端 DictTreeRequest.dictType: str）
  dictItemsTree: (dictType: string): Promise<any> =>
    post(`${BASE}/dicts/items/tree`, { dictType }),

  dictItemsDetail: (itemId: string): Promise<any> =>
    post(`${BASE}/dicts/items/detail`, { itemId }),

  dictItemsCreate: (params: {
    dictType: string;
    dictCode: string;
    dictName: string;
    parentId?: string | null;
    sortOrder?: number;
    isActive?: boolean;
    description?: string | null;
  }): Promise<any> =>
    post(`${BASE}/dicts/items/create`, {
      dictType: params.dictType,
      dictCode: params.dictCode,
      dictName: params.dictName,
      parentId: params.parentId ?? null,
      sortOrder: params.sortOrder ?? 0,
      isActive: params.isActive ?? true,
      description: params.description ?? null,
    }),

  // dictName 和 sortOrder 在后端 DictUpdateRequest 中均为必填（有 default 0）
  dictItemsUpdate: (params: {
    version?: number;
    itemId: string;
    dictName: string;
    sortOrder?: number;
    isActive?: boolean;
    description?: string | null;
  }): Promise<any> =>
    post(`${BASE}/dicts/items/update`, {
      itemId: params.itemId,
      version: params.version,
      dictName: params.dictName,
      sortOrder: params.sortOrder ?? 0,
      isActive: params.isActive ?? true,
      description: params.description ?? null,
    }),

  dictItemsDelete: (itemId: string): Promise<any> =>
    post(`${BASE}/dicts/items/delete`, { itemId }),

  dictItemsSort: (items: Array<{ itemId: string; sortOrder: number }>): Promise<any> =>
    post(`${BASE}/dicts/items/sort`, {
      items: items.map(i => ({ itemId: i.itemId, sortOrder: i.sortOrder })),
    }),

  // ── 角色管理 (6 端点) ────────────────────────────────────────────

  rolesList: (params: {
    keyword?: string | null;
    status?: string | null;
    page?: number;
    pageSize?: number;
  } = {}): Promise<any> =>
    post(`${BASE}/roles/list`, {
      keyword: params.keyword ?? null,
      status: params.status ?? null,
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 20,
    }),

  rolesDetail: (roleId: string): Promise<any> =>
    post(`${BASE}/roles/detail`, { roleId }),

  rolesCreate: (params: {
    roleCode: string;
    roleName: string;
    description?: string | null;
  }): Promise<any> =>
    post(`${BASE}/roles/create`, {
      roleCode: params.roleCode,
      roleName: params.roleName,
      description: params.description ?? null,
    }),

  // roleName 在后端 RoleUpdateRequest 中为必填
  rolesUpdate: (params: {
    roleId: string;
    roleName: string;
    description?: string | null;
  }): Promise<any> =>
    post(`${BASE}/roles/update`, {
      roleId: params.roleId,
      roleName: params.roleName,
      description: params.description ?? null,
    }),

  rolesDelete: (roleId: string): Promise<any> =>
    post(`${BASE}/roles/delete`, { roleId }),

  // 后端字段名为 targetStatus（非 status）
  rolesToggle: (roleId: string, targetStatus: 'ACTIVE' | 'INACTIVE'): Promise<any> =>
    post(`${BASE}/roles/toggle`, { roleId, targetStatus }),

  // ── 菜单管理 (5 端点) ────────────────────────────────────────────

  menusTree: (): Promise<any> =>
    post(`${BASE}/menus/tree`, { includeButton: true }),

  menusDetail: (menuId: string): Promise<any> =>
    post(`${BASE}/menus/detail`, { menuId }),

  // 后端字段：routePath（非 path），menuName/menuType 必填
  menusCreate: (params: {
    menuName: string;
    menuType: 'DIR' | 'MENU' | 'BUTTON';
    parentId?: string | null;
    routePath?: string | null;
    permissionKey?: string | null;
    icon?: string | null;
    sortOrder?: number;
    isHidden?: boolean;
  }): Promise<any> =>
    post(`${BASE}/menus/create`, {
      menuName: params.menuName,
      menuType: params.menuType,
      parentId: params.parentId ?? null,
      routePath: params.routePath ?? null,
      permissionKey: params.permissionKey ?? null,
      icon: params.icon ?? null,
      sortOrder: params.sortOrder ?? 0,
      isHidden: params.isHidden ?? false,
    }),

  // menuName 在后端 MenuUpdateRequest 中为必填；routePath 非 path
  menusUpdate: (params: {
    menuId: string;
    menuName: string;
    routePath?: string | null;
    permissionKey?: string | null;
    icon?: string | null;
    sortOrder?: number;
    isHidden?: boolean;
  }): Promise<any> =>
    post(`${BASE}/menus/update`, {
      menuId: params.menuId,
      menuName: params.menuName,
      routePath: params.routePath ?? null,
      permissionKey: params.permissionKey ?? null,
      icon: params.icon ?? null,
      sortOrder: params.sortOrder,
      isHidden: params.isHidden ?? false,
    }),

  menusDelete: (menuId: string): Promise<any> =>
    post(`${BASE}/menus/delete`, { menuId }),

  // ── 角色-菜单 (2 端点) ───────────────────────────────────────────

  roleMenusList: (roleId: string): Promise<any> =>
    post(`${BASE}/role-menus/list`, { roleId }),

  roleMenusSave: (roleId: string, menuIds: string[]): Promise<any> =>
    post(`${BASE}/role-menus/save`, { roleId, menuIds }),

  // ── 用户-角色 (2 端点) ───────────────────────────────────────────

  userRolesList: (userId: string): Promise<any> =>
    post(`${BASE}/user-roles/list`, { userId }),

  userRolesSave: (userId: string, roleIds: string[]): Promise<any> =>
    post(`${BASE}/user-roles/save`, { userId, roleIds }),
};

export default adminBffApi;
