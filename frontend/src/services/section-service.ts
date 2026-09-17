import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './api-client';
import { queryKeys } from './query-client';
import type { Section } from '@/types';

interface CreateSectionRequest {
  key: string;
  label: string;
  color: string;
  pace_enabled?: boolean;
}

export interface UpdateSectionRequest {
  label?: string;
  color?: string;
  /** Omitted means "leave it alone"; false means "take the card away". */
  pace_enabled?: boolean;
}

interface ListSectionsResponse {
  sections: Section[];
}

/**
 * Sentinel value sent as `reassign_to` to clear terminals' section
 * (sets terminals.section = NULL) as part of a section delete.
 * Matches backend: section.ReassignToNone.
 */
export const REASSIGN_TO_NONE = '__none__';

export interface DeleteSectionResponse {
  reassigned: number;
  to?: string;
}

async function fetchSections(): Promise<Section[]> {
  const response = await apiClient.get<ListSectionsResponse>('/sections');
  return response.sections;
}

export function useSections() {
  return useQuery({
    queryKey: queryKeys.sections.list(),
    queryFn: fetchSections,
  });
}

export function useCreateSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateSectionRequest) =>
      apiClient.post<{ section: Section }>('/sections', data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.sections.lists() });
    },
  });
}

export function useUpdateSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, data }: { key: string; data: UpdateSectionRequest }) =>
      apiClient.patch<{ section: Section }>(`/sections/${key}`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.sections.lists() });
      // A rename can also affect how terminal rows render the section
      // badge label, so refresh the terminals list too.
      void qc.invalidateQueries({ queryKey: queryKeys.terminals.lists() });
    },
  });
}

/**
 * Delete a section, optionally reassigning terminals first.
 *
 *   reassignTo === undefined  -> no reassignment; server returns 409
 *                                if terminals still reference the section
 *   reassignTo === '__none__' -> clears terminals' section to NULL
 *   reassignTo === '<key>'    -> moves terminals to that section first
 */
export function useDeleteSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, reassignTo }: { key: string; reassignTo?: string }) => {
      const qs = reassignTo ? `?reassign_to=${encodeURIComponent(reassignTo)}` : '';
      return apiClient.delete<DeleteSectionResponse>(`/sections/${key}${qs}`);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.sections.lists() });
      void qc.invalidateQueries({ queryKey: queryKeys.terminals.lists() });
    },
  });
}
