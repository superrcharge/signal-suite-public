import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './api-client';
import { queryKeys } from './query-client';
import type {
  User,
  UpdateUserPreferencesRequest,
} from '@/types';

interface ListUsersResponse {
  users: User[];
  total: number;
  /**
   * Count per role across the whole table, not just the returned page - the
   * stat strip cannot derive these from `users`, which is paginated and capped
   * at 100 server-side. Every known role is present, zero included.
   */
  role_counts: Record<string, number>;
}

export interface ListUsersParams {
  page?: number;
  limit?: number;
}

/**
 * Fetch users (paginated). The backend supports ?limit and ?offset; page
 * is translated to offset = (page - 1) * limit.
 */
async function fetchUsers(params: ListUsersParams = {}): Promise<ListUsersResponse> {
  const limit = params.limit ?? 30;
  const page = params.page ?? 1;
  const offset = (page - 1) * limit;
  const query: Record<string, string> = {
    limit: String(limit),
    offset: String(offset),
  };
  return apiClient.get<ListUsersResponse>('/users', query);
}

async function updateUserPreferences(
  userId: string,
  data: UpdateUserPreferencesRequest,
): Promise<User> {
  return apiClient.patch<User>(`/users/${userId}/preferences`, data);
}

/**
 * Admin-only: change a user's role. Server enforces the self-demote
 * and last-admin guardrails; this client just surfaces the errors.
 */
async function updateUserRole(userId: string, role: string): Promise<User> {
  return apiClient.patch<User>(`/users/${userId}/role`, { role });
}

/**
 * Hook to fetch users (paginated). Pass { page, limit } to page; defaults
 * to page 1, limit 30 (matches the terminals page convention).
 */
export function useUsers(params: ListUsersParams = {}) {
  return useQuery({
    queryKey: queryKeys.users.list(params as Record<string, string>),
    queryFn: () => fetchUsers(params),
    retry: false,
  });
}

export function useUpdateUserPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      userId,
      data,
    }: {
      userId: string;
      data: UpdateUserPreferencesRequest;
    }) => updateUserPreferences(userId, data),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.users.detail(variables.userId),
      });
    },
  });
}

/**
 * Hook to change a user's role (admin-only).
 */
export function useUpdateUserRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      updateUserRole(userId, role),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.users.lists() });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.users.detail(variables.userId),
      });
    },
  });
}
