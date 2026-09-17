import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './api-client';
import { authConfig, msalInstance } from '@/auth/msal-config';
import type { User } from '@/types';

/**
 * Fetch current user from backend
 */
async function fetchCurrentUser(): Promise<User> {
  const response = await apiClient.get<{ user: User }>('/users/me');
  return response.user;
}

/**
 * Hook to get current user
 */
export function useCurrentUser(enabled: boolean = true) {
  return useQuery({
    queryKey: ['currentUser'],
    queryFn: fetchCurrentUser,
    retry: false,
    staleTime: 5 * 60 * 1000,
    enabled,
  });
}

/**
 * Hook for logout. In Entra mode, MSAL clears its localStorage account
 * cache and redirects to the post-logout endpoint (which bounces back
 * to the app, where bootstrap will trigger a fresh loginRedirect). In
 * disabled-auth mode (compose dev) there's no IdP session to end -
 * just clear react-query cache and reload the root.
 */
export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      queryClient.clear();
      if (authConfig.enabled) {
        await msalInstance.logoutRedirect();
      } else {
        window.location.href = '/';
      }
    },
  });
}
