import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './api-client';
import { queryKeys } from './query-client';
import type { Tag } from '@/types';

async function fetchTags(): Promise<Tag[]> {
  const r = await apiClient.get<{ tags: Tag[] }>('/tags');
  return r.tags;
}

async function createTag(name: string): Promise<Tag> {
  const r = await apiClient.post<Tag>('/tags', { name });
  return r;
}

async function deleteTag(name: string): Promise<void> {
  return apiClient.delete<void>(`/tags/${encodeURIComponent(name)}`);
}

export function useTags() {
  return useQuery({
    queryKey: queryKeys.tags.list(),
    queryFn: fetchTags,
    staleTime: 0,
  });
}

export function useCreateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createTag,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.tags.all });
    },
  });
}

export function useDeleteTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteTag,
    onSuccess: () => {
      // Invalidate both the tag catalog and the terminals tags list
      // (delete clears the tag from all terminals, so filter chips update too).
      void qc.invalidateQueries({ queryKey: queryKeys.tags.all });
      void qc.invalidateQueries({ queryKey: queryKeys.terminals.all });
    },
  });
}
