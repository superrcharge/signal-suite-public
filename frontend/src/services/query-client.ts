import { QueryClient } from '@tanstack/react-query';
import { ApiClientError } from './api-client';

/**
 * Global query client configuration
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Stale time: how long data is considered fresh (5 minutes)
      staleTime: 5 * 60 * 1000,

      // Cache time: how long data stays in cache when unused (30 minutes)
      gcTime: 30 * 60 * 1000,

      // Retry logic
      retry: (failureCount, error) => {
        // Don't retry on 4xx errors (client errors)
        if (error instanceof ApiClientError) {
          const is4xxError =
            error.code === 'NOT_FOUND' ||
            error.code === 'UNAUTHORIZED' ||
            error.code === 'FORBIDDEN' ||
            error.code === 'VALIDATION_ERROR';

          if (is4xxError) return false;
        }

        // Retry up to 3 times for other errors
        return failureCount < 3;
      },

      // Retry delay with exponential backoff
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),

      // Refetch on window focus for fresh data
      refetchOnWindowFocus: true,

      // Don't refetch on reconnect by default
      refetchOnReconnect: false,
    },
    mutations: {
      // Don't retry mutations by default
      retry: false,
    },
  },
});

/**
 * Query key factory for consistent key management
 *
 * @example
 * ```ts
 * // List all users
 * queryKey: queryKeys.users.list()
 *
 * // Get single user
 * queryKey: queryKeys.users.detail(userId)
 *
 * // Invalidate all user queries
 * queryClient.invalidateQueries({ queryKey: queryKeys.users.all })
 * ```
 */
export const queryKeys = {
  users: {
    all: ['users'] as const,
    lists: () => [...queryKeys.users.all, 'list'] as const,
    list: (filters?: Record<string, string>) =>
      [...queryKeys.users.lists(), filters] as const,
    details: () => [...queryKeys.users.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.users.details(), id] as const,
  },
  auth: {
    all: ['auth'] as const,
    user: () => [...queryKeys.auth.all, 'user'] as const,
  },
  sections: {
    all: ['sections'] as const,
    lists: () => [...queryKeys.sections.all, 'list'] as const,
    list: () => [...queryKeys.sections.lists()] as const,
  },
  terminals: {
    all: ['terminals'] as const,
    lists: () => [...queryKeys.terminals.all, 'list'] as const,
    list: (params?: Record<string, unknown>) =>
      [...queryKeys.terminals.lists(), params] as const,
    details: () => [...queryKeys.terminals.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.terminals.details(), id] as const,
  },
  kits: {
    all: ['kits'] as const,
    lists: () => [...queryKeys.kits.all, 'list'] as const,
    list: (params?: Record<string, unknown>) =>
      [...queryKeys.kits.lists(), params] as const,
    details: () => [...queryKeys.kits.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.kits.details(), id] as const,
  },
  audit: {
    all: ['audit'] as const,
    lists: () => [...queryKeys.audit.all, 'list'] as const,
    list: (params?: Record<string, unknown>) =>
      [...queryKeys.audit.lists(), params] as const,
  },
  tags: {
    all: ['tags'] as const,
    list: () => [...queryKeys.tags.all, 'list'] as const,
  },
  contracts: {
    all: ['contracts'] as const,
    lists: () => [...queryKeys.contracts.all, 'list'] as const,
    list: (params?: Record<string, unknown>) =>
      [...queryKeys.contracts.lists(), params] as const,
    details: () => [...queryKeys.contracts.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.contracts.details(), id] as const,
    fiscalYears: () => [...queryKeys.contracts.all, 'fiscal-years'] as const,
  },
  equipment: {
    all: ['equipment'] as const,
    lists: () => [...queryKeys.equipment.all, 'list'] as const,
    list: (params?: Record<string, unknown>) =>
      [...queryKeys.equipment.lists(), params] as const,
    details: () => [...queryKeys.equipment.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.equipment.details(), id] as const,
  },
  waveforms: {
    all: ['waveforms'] as const,
    list: () => [...queryKeys.waveforms.all, 'list'] as const,
    // Nested under `all` so the library's own mutations invalidate it for free -
    // a rename cascades to the carriers, so the usage readout must follow it.
    // Equipment and platform writes change usage WITHOUT touching this key, so
    // those mutations invalidate it explicitly. Usage is derived from those
    // tables; a write to them invalidating it is what the derivation means.
    usage: () => [...queryKeys.waveforms.all, 'usage'] as const,
  },
  services: {
    all: ['services'] as const,
    list: () => [...queryKeys.services.all, 'list'] as const,
    usage: () => [...queryKeys.services.all, 'usage'] as const,
  },
  transports: {
    all: ['transports'] as const,
    list: () => [...queryKeys.transports.all, 'list'] as const,
  },
  platforms: {
    all: ['platforms'] as const,
    list: () => [...queryKeys.platforms.all, 'list'] as const,
  },
  nets: {
    all: ['nets'] as const,
    list: (section: string) => [...queryKeys.nets.all, 'list', section] as const,
  },
  pace: {
    all: ['pace'] as const,
    card: (section: string) => [...queryKeys.pace.all, 'card', section] as const,
  },
} as const;
