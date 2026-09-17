import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './api-client';
import { queryKeys } from './query-client';
import type { Waveform, ListWaveformsResponse, CreateWaveformRequest, UpdateWaveformRequest, UsageResponse } from '@/types';

async function fetchWaveforms(): Promise<ListWaveformsResponse> {
  return apiClient.get<ListWaveformsResponse>('/waveforms');
}

/**
 * Which catalog assets carry each waveform, keyed by NORMALISED abbrev -
 * lowercased and trimmed, matching the library's uniqueness index.
 *
 * An abbrev nothing carries is absent from the map, never present with an empty
 * list, so a caller reads a missing key as zero rather than as "not loaded".
 */
async function fetchWaveformUsage(): Promise<UsageResponse> {
  return apiClient.get<UsageResponse>('/waveforms/usage');
}

async function createWaveform(data: CreateWaveformRequest): Promise<Waveform> {
  const r = await apiClient.post<{ waveform: Waveform }>('/waveforms', data);
  return r.waveform;
}

async function updateWaveform(id: string, data: UpdateWaveformRequest): Promise<Waveform> {
  const r = await apiClient.patch<{ waveform: Waveform }>(`/waveforms/${id}`, data);
  return r.waveform;
}

async function deleteWaveform(id: string): Promise<void> {
  return apiClient.delete<void>(`/waveforms/${id}`);
}

export function useWaveforms() {
  return useQuery({
    queryKey: queryKeys.waveforms.list(),
    queryFn: fetchWaveforms,
  });
}

export function useWaveformUsage() {
  return useQuery({
    queryKey: queryKeys.waveforms.usage(),
    queryFn: fetchWaveformUsage,
  });
}

export function useCreateWaveform() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createWaveform,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.waveforms.all });
    },
  });
}

export function useUpdateWaveform() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateWaveformRequest }) =>
      updateWaveform(id, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.waveforms.all });
    },
  });
}

export function useDeleteWaveform() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteWaveform,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.waveforms.all });
    },
  });
}
