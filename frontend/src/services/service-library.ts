/**
 * API layer for the Services Library.
 *
 * Named service-library rather than following the <domain>-service.ts
 * convention: service-service.ts inside src/services/ reads as nothing.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './api-client';
import { queryKeys } from './query-client';
import type { Service, ListServicesResponse, CreateServiceRequest, UpdateServiceRequest, UsageResponse } from '@/types';

async function fetchServices(): Promise<ListServicesResponse> {
  return apiClient.get<ListServicesResponse>('/services');
}

/** Which catalog terminals offer each service. See fetchWaveformUsage. */
async function fetchServiceUsage(): Promise<UsageResponse> {
  return apiClient.get<UsageResponse>('/services/usage');
}

async function createService(data: CreateServiceRequest): Promise<Service> {
  const r = await apiClient.post<{ service: Service }>('/services', data);
  return r.service;
}

async function updateService(id: string, data: UpdateServiceRequest): Promise<Service> {
  const r = await apiClient.patch<{ service: Service }>(`/services/${id}`, data);
  return r.service;
}

async function deleteService(id: string): Promise<void> {
  return apiClient.delete<void>(`/services/${id}`);
}

export function useServices() {
  return useQuery({
    queryKey: queryKeys.services.list(),
    queryFn: fetchServices,
  });
}

export function useServiceUsage() {
  return useQuery({
    queryKey: queryKeys.services.usage(),
    queryFn: fetchServiceUsage,
  });
}

export function useCreateService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createService,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.services.all });
    },
  });
}

export function useUpdateService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateServiceRequest }) =>
      updateService(id, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.services.all });
    },
  });
}

export function useDeleteService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteService,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.services.all });
    },
  });
}
