import { QueryClient } from '@tanstack/react-query';

export const POLL_INTERVAL_CATALOG = 15000; // 15s - Public catalog landing & details
export const POLL_INTERVAL_ORDERS = 10000;  // 10s - Seller list/detail, notifications, guest/customer order tracking
export const POLL_INTERVAL_DASHBOARD = 30000; // 30s - Seller dashboard summary

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: any) => {
        // Do not retry 4xx client errors (400, 401, 403, 404, 409)
        if (error?.status >= 400 && error?.status < 500) {
          return false;
        }
        return failureCount < 2;
      },
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      staleTime: 5000,
    },
    mutations: {
      retry: false,
    },
  },
});
