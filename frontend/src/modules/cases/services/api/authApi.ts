/**
 * Authentication API Service
 * Handles login, logout, and user info operations
 */

import { apiClient, tokenManager } from './client';
import { User, UserRole } from '../../types';

// Backend response types (snake_case)
interface LoginRequest {
  username: string;
  password: string;
  organization?: string;
}

interface LoginResponse {
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  user: UserInfo;
}

interface UserInfo {
  id: string;
  username: string;
  realName?: string;
  employeeNo?: string;
  departmentId?: string;
  email?: string;
  phone?: string;
  status: string;
  avatarUrl?: string;
  tenantId: string;
  createdAt?: string;
  updatedAt?: string;
}

// Map backend user to frontend User type
function mapUser(userInfo: UserInfo): User {
  // Map backend fields to frontend User type
  // Note: Backend doesn't have 'role' and 'department' fields directly
  // These would need to be added to backend or derived from user groups/permissions

  // For now, default to LEGAL_ADMIN role
  // TODO: Implement proper role mapping from backend user groups/permissions
  let role = UserRole.LEGAL_ADMIN;

  // Simple heuristic based on username or department
  if (userInfo.username.includes('biz') || userInfo.departmentId?.includes('BIZ')) {
    role = UserRole.BUSINESS_UNIT;
  } else if (userInfo.username.includes('ext') || userInfo.email?.includes('lawfirm')) {
    role = UserRole.EXTERNAL_LAWYER;
  }

  return {
    id: userInfo.id,
    name: userInfo.realName || userInfo.username,
    role: role,
    department: userInfo.departmentId || 'Unknown Department'
  };
}

export const authApi = {
  /**
   * Login with username and password
   */
  async login(params: { username: string; password: string; organization?: string }): Promise<User> {
    const { username, password, organization } = params;
    const response: LoginResponse = await apiClient.post<LoginResponse>('/auth/login', {
      username,
      password,
      organization
    } as LoginRequest);

    // Store token
    tokenManager.set(response.accessToken);

    // Map and return user
    return mapUser(response.user);
  },

  /**
   * Get current user info
   */
  async getCurrentUser(): Promise<User> {
    const userInfo: UserInfo = await apiClient.get<UserInfo>('/auth/me');
    return mapUser(userInfo);
  },

  /**
   * Logout
   */
  logout(): void {
    tokenManager.remove();
    // Redirect to login page
    window.location.href = '/login';
  },

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return tokenManager.isValid();
  },

  /**
   * Switch role (for demo purposes)
   * Note: This is a frontend-only feature for demo
   * In production, roles should come from backend
   */
  switchRole(role: UserRole): void {
    localStorage.setItem('sld_demo_role', role);
    window.location.reload();
  }
};