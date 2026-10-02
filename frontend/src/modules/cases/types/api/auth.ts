/**
 * Authentication API Types
 *
 * Type definitions for authentication-related API requests and responses.
 */

/**
 * Login request payload
 */
export interface LoginRequest {
  /** Username */
  username: string;

  /** Password */
  password: string;

  /** Organization name (default: "built-in") */
  organization?: string;
}

/**
 * Login response
 * Note: Field names are in camelCase after client transformation
 */
export interface LoginResponse {
  /** JWT access token */
  accessToken: string;

  /** Refresh token */
  refreshToken: string;

  /** Token type (usually "Bearer") */
  tokenType: string;

  /** Token expiration time in seconds */
  expiresIn: number;

  /** Authenticated user information */
  user: UserInfoResponse;
}

/**
 * User information response
 * Note: Field names are in camelCase after client transformation
 */
export interface UserInfoResponse {
  /** User ID (Casdoor UUID) */
  id: string;

  /** Username */
  username: string;

  /** Real name */
  realName: string;

  /** Email address */
  email?: string;

  /** Phone number */
  phone?: string;

  /** Avatar URL */
  avatarUrl?: string;

  /** Employee number */
  employeeNo?: string;

  /** Department ID */
  departmentId?: string;

  /** Department name */
  department?: string;

  /** Job title */
  title?: string;

  /** User status */
  status: string;

  /** User roles */
  roles: string[];

  /** User permissions */
  permissions: string[];
}

/**
 * Refresh token request
 */
export interface RefreshTokenRequest {
  /** Refresh token */
  refresh_token: string;
}

/**
 * User context for request context
 */
export interface UserContext {
  /** User ID */
  user_id: string;

  /** Username */
  username: string;

  /** Real name */
  real_name: string;

  /** Tenant ID */
  tenant_id: string;

  /** User roles */
  roles: string[];

  /** User permissions */
  permissions: string[];
}