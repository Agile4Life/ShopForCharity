import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { notify, notifyError } from './feedback';

const failedQueries = new Set<string>();

export const POLL_INTERVAL_CATALOG = 15000; // 15s - Public catalog landing & details
export const POLL_INTERVAL_ORDERS = 10000;  // 10s - Seller list/detail, notifications, guest/customer order tracking
export const POLL_INTERVAL_DASHBOARD = 30000; // 30s - Seller dashboard summary

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (!failedQueries.has(query.queryHash) && navigator.onLine) notifyError(error);
      failedQueries.add(query.queryHash);
    },
    onSuccess: (_, query) => { failedQueries.delete(query.queryHash); },
  }),
  mutationCache: new MutationCache({
    onSuccess: (_, __, ___, mutation) => {
      if (typeof mutation.meta?.successMessage === 'string') notify(mutation.meta.successMessage, { tone: 'success' });
    },
  }),
  defaultOptions: {
    queries: {
      networkMode: 'always',
      retry: (failureCount, error: any) => {
        // Do not retry 4xx client errors (400, 401, 403, 404, 409)
        if (error?.status >= 400 && error?.status < 500) {
          return false;
        }
        if (['REQUEST_TIMEOUT', 'WRITE_TIMEOUT', 'NETWORK_ERROR'].includes(error?.code)) return false;
        return failureCount < 1;
      },
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      staleTime: 5000,
    },
    mutations: {
      retry: false,
      networkMode: 'always',
    },
  },
});
