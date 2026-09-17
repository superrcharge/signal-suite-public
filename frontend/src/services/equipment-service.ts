import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './api-client';
import { queryKeys } from './query-client';
import type {
  Equipment,
  ListEquipmentResponse,
  CreateEquipmentRequest,
  UpdateEquipmentRequest,
} from '@/types';

export interface ListEquipmentParams {
  type?: 'satcom' | 'radio';
  search?: string;
}

async function fetchEquipment(params: ListEquipmentParams): Promise<ListEquipmentResponse> {
  const sp = new URLSearchParams();
  if (params.type) sp.set('type', params.type);
  if (params.search) sp.set('search', params.search);
  const qs = sp.toString();
  return apiClient.get<ListEquipmentResponse>(`/equipment${qs ? `?${qs}` : ''}`);
}

async function fetchEquipmentItem(id: string): Promise<Equipment> {
  const r = await apiClient.get<{ equipment: Equipment }>(`/equipment/${id}`);
  return r.equipment;
}

async function createEquipment(data: CreateEquipmentRequest): Promise<Equipment> {
  const r = await apiClient.post<{ equipment: Equipment }>('/equipment', data);
  return r.equipment;
}

async function updateEquipment(id: string, data: UpdateEquipmentRequest): Promise<Equipment> {
  const r = await apiClient.patch<{ equipment: Equipment }>(`/equipment/${id}`, data);
  return r.equipment;
}

async function deleteEquipment(id: string): Promise<void> {
  return apiClient.delete<void>(`/equipment/${id}`);
}

async function uploadEquipmentPhoto(id: string, file: File): Promise<string> {
  const form = new FormData();
  form.append('photo', file);
  const r = await apiClient.postForm<{ url: string }>(`/equipment/${id}/photo`, form);
  return r.url;
}

export function useEquipment(params: ListEquipmentParams = {}) {
  return useQuery({
    queryKey: queryKeys.equipment.list(params as Record<string, unknown>),
    queryFn: () => fetchEquipment(params),
  });
}

export function useEquipmentItem(id: string) {
  return useQuery({
    queryKey: queryKeys.equipment.detail(id),
    queryFn: () => fetchEquipmentItem(id),
    enabled: Boolean(id),
  });
}

/**
 * The library usage readouts are DERIVED from this table, so a write here
 * invalidates them.
 *
 * Not incidental coupling: `/waveforms/usage` and `/services/usage` answer
 * "which catalog records carry this", and editing a record's Section 03
 * waveforms or its SATCOM services changes that answer while leaving
 * `queryKeys.waveforms.all` untouched. Without this the Comms Library shows a
 * count that was true a moment ago, and a staleTime would only shorten the
 * window rather than close it.
 */
function invalidateLibraryUsage(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: queryKeys.waveforms.usage() });
  void qc.invalidateQueries({ queryKey: queryKeys.services.usage() });
}

export function useCreateEquipment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createEquipment,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.equipment.all });
      invalidateLibraryUsage(qc);
    },
  });
}

export function useUpdateEquipment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateEquipmentRequest }) =>
      updateEquipment(id, data),
    onSuccess: (_data, { id }) => {
      void qc.invalidateQueries({ queryKey: queryKeys.equipment.all });
      invalidateLibraryUsage(qc);
      void qc.invalidateQueries({ queryKey: queryKeys.equipment.detail(id) });
    },
  });
}

export function useDeleteEquipment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteEquipment,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.equipment.all });
      invalidateLibraryUsage(qc);
    },
  });
}

export function useUploadEquipmentPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => uploadEquipmentPhoto(id, file),
    onSuccess: (_url, { id }) => {
      void qc.invalidateQueries({ queryKey: queryKeys.equipment.all });
      invalidateLibraryUsage(qc);
      void qc.invalidateQueries({ queryKey: queryKeys.equipment.detail(id) });
    },
  });
}
