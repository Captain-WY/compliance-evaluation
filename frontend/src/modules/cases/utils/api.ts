import type {AxiosRequestConfig} from 'axios';
import apiClient from '../src/services/api/client';
export {apiClient};
export interface ApiResponse<T=unknown>{code:number;message:string;data:T;}
export const api = {
  get: <T>(url: string, config?: AxiosRequestConfig) => 
    apiClient.get<ApiResponse<T>>(url, config).then(res => res.data.data),
    
  post: <T>(url: string, data?: any, config?: AxiosRequestConfig) => 
    apiClient.post<ApiResponse<T>>(url, data, config).then(res => res.data.data),
    
  put: <T>(url: string, data?: any, config?: AxiosRequestConfig) => 
    apiClient.put<ApiResponse<T>>(url, data, config).then(res => res.data.data),
    
  delete: <T>(url: string, config?: AxiosRequestConfig) => 
    apiClient.delete<ApiResponse<T>>(url, config).then(res => res.data.data),
};
