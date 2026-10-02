/**
 * Authentication API Service
 *
 * Provides API methods for authentication operations.
 * Integrates with backend Casdoor authentication endpoints.
 */
import apiClient from './client';
import type {
  LoginRequest,
  LoginResponse,
  UserInfoResponse,
} from '../../types/api/auth';

/**
 * API Response wrapper
 */
interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
  trace_id?: string | null;
}

/**
 * Authentication API service object
 */
export const authApi = {
  /**
   * Login with credentials
   *
   * @param credentials - Login credentials (username, password, organization)
   * @returns Login response with tokens and user info
   */
  login: async (credentials: LoginRequest): Promise<LoginResponse> => {
    const response = await apiClient.post<ApiResponse<LoginResponse>>('/auth/login', credentials);
    // Extract data from the wrapped response
    return response.data.data;
  },

  /**
   * Logout current user
   *
   * Clears server-side session if applicable.
   */
  logout: async (): Promise<void> => {
    await apiClient.post('/auth/logout');
  },

  /**
   * Refresh access token
   *
   * @param refreshToken - Refresh token
   * @returns New login response with fresh tokens
   */
  refreshToken: async (refreshToken: string): Promise<LoginResponse> => {
    const response = await apiClient.post<LoginResponse>('/auth/refresh', {
      refresh_token: refreshToken,
    });
    return response.data;
  },

  /**
   * Get current user info
   *
   * @returns Current authenticated user information
   */
  getCurrentUser: async (): Promise<UserInfoResponse> => {
    const response = await apiClient.get<UserInfoResponse>('/auth/me');
    return response.data;
  },

  /**
   * Get user permissions
   *
   * @returns List of permission strings
   */
  getPermissions: async (): Promise<string[]> => {
    const response = await apiClient.get<string[]>('/auth/permissions');
    return response.data;
  },
};