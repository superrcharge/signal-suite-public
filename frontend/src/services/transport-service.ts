import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './api-client';
import { queryKeys } from './query-client';
import type { Transport, ListTransportsResponse, CreateTransportRequest, UpdateTransportRequest } from '@/types';

async function fetchTransports(): Promise<ListTransportsResponse> {
  return apiClient.get<ListTransportsResponse>('/transports');
}

async function createTransport(data: CreateTransportRequest): Promise<Transport> {
  const r = await apiClient.post<{ transport: Transport }>('/transports', data);
  return r.transport;
}

async function updateTransport(id: string, data: UpdateTransportRequest): Promise<Transport> {
  const r = await apiClient.patch<{ transport: Transport }>(`/transports/${id}`, data);
  return r.transport;
}

async function deleteTransport(id: string): Promise<void> {
  return apiClient.delete<void>(`/transports/${id}`);
}

export function useTransports() {
  return useQuery({
    queryKey: queryKeys.transports.list(),
    queryFn: fetchTransports,
  });
}

export function useCreateTransport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createTransport,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.transports.all });
    },
  });
}

export function useUpdateTransport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTransportRequest }) =>
      updateTransport(id, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.transports.all });
    },
  });
}

export function useDeleteTransport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteTransport,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.transports.all });
    },
  });
}
