/**
 * API Services Index
 * Central export for all API services
 */

// Core API client
export { apiClient, tokenManager, ApiException } from './client';

// Individual service modules
export { authApi } from './authApi';
export { casesApi } from './casesApi';
export { partiesApi } from './partiesApi';
export { tasksApi } from './tasksApi';
export { financeApi } from './financeApi';
export { documentsApi } from './documentsApi';
export { complianceApi } from './complianceApi';
export { cluesApi } from './cluesApi';

// Re-export types
export type { Task } from './tasksApi';