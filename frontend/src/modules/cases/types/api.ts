// ============================================================================
// Base API Types
// ============================================================================

export interface ApiResponse<T = any> {
  code: number;
  message: string;
  data: T;
}

export interface PaginatedData<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PaginatedRequest {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// ============================================================================
// Common Enums
// ============================================================================

export enum ActionType {
  PASS = 'PASS',
  REJECT = 'REJECT',
  RETURN = 'RETURN',
  CANCEL = 'CANCEL',
}

export enum DataStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  DELETED = 'DELETED',
}
