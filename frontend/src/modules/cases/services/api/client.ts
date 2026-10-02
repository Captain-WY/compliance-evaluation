import {requestRaw,tokenStore} from '../../../../platform/transport';
/**
 * API Client Infrastructure
 * Handles all HTTP communication with the backend
 */

// API Configuration
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';
const API_TIMEOUT = 30000; // 30 seconds

// Types
interface StandardResponse<T = any> {
  code: number;
  message: string;
  data: T | null;
  trace_id?: string;
}

interface ApiError {
  code: number;
  message: string;
  details?: Record<string, any>;
}

interface RequestConfig {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: any;
  params?: Record<string, string | number | boolean>;
  timeout?: number;
}

// Token Management
const TOKEN_KEY = 'compliance-platform-token';

export const tokenManager = {
  get(): string | null {
    return tokenStore.get();
  },

  set(token: string): void {
    tokenStore.set(token);
  },

  remove(): void {
    tokenStore.clear();
  },

  isValid(): boolean {
    const token = this.get();
    if (!token) return false;

    try {
      // Decode JWT payload (simple base64 decode)
      const payload = JSON.parse(atob(token.split('.')[1]));
      const exp = payload.exp * 1000; // Convert to milliseconds
      return Date.now() < exp;
    } catch {
      return false;
    }
  }
};

// Snake_case to camelCase converter
function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function keysToCamelCase(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(keysToCamelCase);
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj).reduce((acc, key) => {
      acc[toCamelCase(key)] = keysToCamelCase(obj[key]);
      return acc;
    }, {} as any);
  }
  return obj;
}

// camelCase to snake_case converter
function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

function keysToSnakeCase(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(keysToSnakeCase);
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj).reduce((acc, key) => {
      acc[toSnakeCase(key)] = keysToSnakeCase(obj[key]);
      return acc;
    }, {} as any);
  }
  return obj;
}

// Error handling
class ApiException extends Error {
  code: number;
  details?: Record<string, any>;

  constructor(error: ApiError) {
    super(error.message);
    this.name = 'ApiException';
    this.code = error.code;
    this.details = error.details;
  }
}

// Request interceptor
function buildUrl(endpoint: string, params?: Record<string, string | number | boolean>): string {
  const url = new URL(`${API_BASE_URL}${endpoint}`, window.location.origin);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, String(value));
    });
  }

  return url.toString();
}

function buildHeaders(customHeaders?: Record<string, string>): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...customHeaders
  };

  const token = tokenManager.get();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
}

async function makeRequest<T = any>(
  endpoint: string,
  config: RequestConfig = {}
): Promise<T> {
  const {
    method = 'GET',
    headers: customHeaders,
    body,
    params,
    timeout = API_TIMEOUT
  } = config;

  const url = buildUrl(endpoint, params);
  const headers = buildHeaders(customHeaders);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await requestRaw(url, {
      method,
      headers,
      body: body ? JSON.stringify(keysToSnakeCase(body)) : undefined,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const responseData: StandardResponse = await response.json();

    // Handle HTTP errors
    if (!response.ok) {
      const error: ApiError = {
        code: responseData.code || response.status,
        message: responseData.message || 'Request failed',
        details: responseData.data || undefined
      };

      // Handle 401 Unauthorized
      if (response.status === 401) {
        tokenManager.remove();
        window.location.href = '/login';
        throw new ApiException({
          code: 401,
          message: 'Authentication required. Please login again.'
        });
      }

      throw new ApiException(error);
    }

    // Handle business errors
    if (![0,200].includes(responseData.code)) {
      throw new ApiException({
        code: responseData.code,
        message: responseData.message,
        details: responseData.data || undefined
      });
    }

    // Convert response data to camelCase
    return keysToCamelCase(responseData.data);

  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof ApiException) {
      throw error;
    }

    // Handle network errors
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new ApiException({
          code: 408,
          message: 'Request timeout'
        });
      }

      throw new ApiException({
        code: 0,
        message: error.message || 'Network error'
      });
    }

    throw new ApiException({
      code: 0,
      message: 'Unknown error occurred'
    });
  }
}

// Export API client methods
export const apiClient = {
  get<T = any>(endpoint: string, params?: Record<string, string | number | boolean>): Promise<T> {
    return makeRequest<T>(endpoint, { method: 'GET', params });
  },

  post<T = any>(endpoint: string, body?: any): Promise<T> {
    return makeRequest<T>(endpoint, { method: 'POST', body });
  },

  put<T = any>(endpoint: string, body?: any): Promise<T> {
    return makeRequest<T>(endpoint, { method: 'PUT', body });
  },

  patch<T = any>(endpoint: string, body?: any): Promise<T> {
    return makeRequest<T>(endpoint, { method: 'PATCH', body });
  },

  delete<T = any>(endpoint: string): Promise<T> {
    return makeRequest<T>(endpoint, { method: 'DELETE' });
  }
};

export { ApiException };