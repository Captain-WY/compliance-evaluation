import { QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

// ============================================================================
// React Query Client Configuration
// ============================================================================

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 生产环境配置
      staleTime: 1000 * 60 * 5, // 5 分钟内数据被认为是新鲜的，不会触发后台刷新
      gcTime: 1000 * 60 * 30, // 30 分钟垃圾回收时间 (原 cacheTime)
      refetchOnWindowFocus: false, // 失去焦点再回来时不自动刷新，避免频繁请求
      refetchOnReconnect: true, // 断网重连时自动刷新
      retry: (failureCount, error: any) => {
        // 401, 403, 404 等明确错误不重试
        if (error?.response?.status && [401, 403, 404].includes(error.response.status)) {
          return false;
        }
        // 最多重试 3 次
        return failureCount < 3;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // 指数退避重试
    },
    mutations: {
      // 全局 Mutation 错误处理
      onError: (error: any) => {
        // Axios 拦截器已经处理了大部分 Toast，这里可以做一些特定逻辑
        console.error('Mutation Error:', error);
      },
    },
  },
});
