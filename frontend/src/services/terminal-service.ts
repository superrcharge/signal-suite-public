import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './api-client';
import { queryKeys } from './query-client';
import type {
  Terminal,
  ListTerminalsResponse,
  ListTerminalsParams,
  CreateTerminalRequest,
  UpdateTerminalRequest,
} from '@/types';

async function fetchTerminals(params: ListTerminalsParams): Promise<ListTerminalsResponse> {
  const searchParams = new URLSearchParams();
  if (params.sections) searchParams.set('sections', params.sections);
  if (params.model) searchParams.set('model', params.model);
  if (params.search) searchParams.set('search', params.search);
  if (params.tag) searchParams.set('tag', params.tag);
  if (params.page) searchParams.set('page', String(params.page));
  if (params.limit != null) searchParams.set('limit', String(params.limit));

  const qs = searchParams.toString();
  return apiClient.get<ListTerminalsResponse>(`/terminals${qs ? `?${qs}` : ''}`);
}

async function fetchTerminal(id: string): Promise<Terminal> {
  return apiClient.get<Terminal>(`/terminals/${id}`);
}

async function fetchTerminalTags(): Promise<string[]> {
  const r = await apiClient.get<{ tags: string[] }>('/terminals/tags');
  return r.tags;
}

async function createTerminal(data: CreateTerminalRequest): Promise<Terminal> {
  return apiClient.post<Terminal>('/terminals', data);
}

async function updateTerminal(id: string, data: UpdateTerminalRequest): Promise<Terminal> {
  return apiClient.patch<Terminal>(`/terminals/${id}`, data);
}

async function deleteTerminal(id: string): Promise<void> {
  return apiClient.delete<void>(`/terminals/${id}`);
}


export function useTerminals(params: ListTerminalsParams = {}) {
  return useQuery({
    queryKey: queryKeys.terminals.list(params as Record<string, unknown>),
    queryFn: () => fetchTerminals(params),
  });
}

/**
 * One terminal by id, for an edit deep-link the current page cannot resolve.
 *
 * The list is paginated, so `?drawer=edit&id=` for a terminal on another page
 * used to find nothing - and a drawer handed no terminal renders as an Add
 * form. Pass undefined to stay idle; the mutations invalidate
 * `queryKeys.terminals.all`, which is a prefix of this key.
 */
export function useTerminal(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.terminals.detail(id ?? ''),
    queryFn: () => fetchTerminal(id!),
    enabled: Boolean(id),
  });
}

/**
 * Distinct tags currently assigned to any terminal. Powers the tag
 * filter chip set above the terminals table; rebuilds whenever the
 * terminals list invalidates.
 */
export function useTerminalTags() {
  return useQuery({
    queryKey: [...queryKeys.terminals.all, 'tags'] as const,
    queryFn: fetchTerminalTags,
    staleTime: 0,
  });
}

export function useCreateTerminal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createTerminal,
    onSuccess: () => {
      // Broad prefix invalidate covers list + tags + detail - tag set
      // can shift on every mutation, so cover the whole namespace.
      void qc.invalidateQueries({ queryKey: queryKeys.terminals.all });
      // A terminal write can register a new tag in the catalog and always moves
      // a usage count, so the Settings list and the drawer's option list are
      // stale the moment this resolves.
      void qc.invalidateQueries({ queryKey: queryKeys.tags.all });
    },
  });
}

export function useUpdateTerminal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTerminalRequest }) =>
      updateTerminal(id, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.terminals.all });
      // A terminal write can register a new tag in the catalog and always moves
      // a usage count, so the Settings list and the drawer's option list are
      // stale the moment this resolves.
      void qc.invalidateQueries({ queryKey: queryKeys.tags.all });
    },
  });
}

export function useDeleteTerminal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteTerminal,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.terminals.all });
      // A terminal write can register a new tag in the catalog and always moves
      // a usage count, so the Settings list and the drawer's option list are
      // stale the moment this resolves.
      void qc.invalidateQueries({ queryKey: queryKeys.tags.all });
    },
  });
}

