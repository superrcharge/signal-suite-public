import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './api-client';
import { queryKeys } from './query-client';
import type { Platform, ListPlatformsResponse, CreatePlatformRequest, UpdatePlatformRequest } from '@/types';

async function fetchPlatforms(): Promise<ListPlatformsResponse> {
  return apiClient.get<ListPlatformsResponse>('/platforms');
}

async function createPlatform(data: CreatePlatformRequest): Promise<Platform> {
  const r = await apiClient.post<{ platform: Platform }>('/platforms', data);
  return r.platform;
}

async function updatePlatform(id: string, data: UpdatePlatformRequest): Promise<Platform> {
  const r = await apiClient.patch<{ platform: Platform }>(`/platforms/${id}`, data);
  return r.platform;
}

async function deletePlatform(id: string): Promise<void> {
  return apiClient.delete<void>(`/platforms/${id}`);
}

export function usePlatforms() {
  return useQuery({
    queryKey: queryKeys.platforms.list(),
    queryFn: fetchPlatforms,
  });
}

/**
 * Waveform usage is derived from this table too - a platform carries waveform
 * abbrevs - so a write here invalidates it. Only the waveform half: platforms
 * carry no services.
 */
function invalidateWaveformUsage(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: queryKeys.waveforms.usage() });
}

export function useCreatePlatform() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createPlatform,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.platforms.all });
      invalidateWaveformUsage(qc);
    },
  });
}

export function useUpdatePlatform() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdatePlatformRequest }) =>
      updatePlatform(id, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.platforms.all });
      invalidateWaveformUsage(qc);
    },
  });
}

export function useDeletePlatform() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deletePlatform,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.platforms.all });
      invalidateWaveformUsage(qc);
    },
  });
}
