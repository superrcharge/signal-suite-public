import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './api-client';
import { queryKeys } from './query-client';
import type {
  Kit,
  ListKitsResponse,
  ListKitsParams,
  CreateKitRequest,
  UpdateKitRequest,
} from '@/types';

async function fetchKits(params: ListKitsParams): Promise<ListKitsResponse> {
  const searchParams = new URLSearchParams();
  if (params.sections) searchParams.set('sections', params.sections);
  if (params.type) searchParams.set('type', params.type);
  if (params.search) searchParams.set('search', params.search);
  if (params.page) searchParams.set('page', String(params.page));
  if (params.limit != null) searchParams.set('limit', String(params.limit));

  const qs = searchParams.toString();
  return apiClient.get<ListKitsResponse>(`/kits${qs ? `?${qs}` : ''}`);
}

async function fetchKit(id: string): Promise<Kit> {
  return apiClient.get<Kit>(`/kits/${id}`);
}

async function createKit(data: CreateKitRequest): Promise<Kit> {
  return apiClient.post<Kit>('/kits', data);
}

async function updateKit(id: string, data: UpdateKitRequest): Promise<Kit> {
  return apiClient.patch<Kit>(`/kits/${id}`, data);
}

async function deleteKit(id: string): Promise<void> {
  return apiClient.delete<void>(`/kits/${id}`);
}


export function useKits(params: ListKitsParams = {}) {
  return useQuery({
    queryKey: queryKeys.kits.list(params as Record<string, unknown>),
    queryFn: () => fetchKits(params),
  });
}

/**
 * One kit by id, for an edit deep-link the current page cannot resolve.
 *
 * The list is paginated, so `?drawer=edit&id=` for a kit on another page used
 * to find nothing - and a drawer handed no kit renders as an Add form. Pass
 * undefined to stay idle; the mutations invalidate `queryKeys.kits.all`, which
 * is a prefix of this key.
 */
export function useKit(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.kits.detail(id ?? ''),
    queryFn: () => fetchKit(id!),
    enabled: Boolean(id),
  });
}

export function useCreateKit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createKit,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.kits.all });
    },
  });
}

export function useUpdateKit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateKitRequest }) =>
      updateKit(id, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.kits.all });
    },
  });
}

export function useDeleteKit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteKit,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.kits.all });
    },
  });
}

