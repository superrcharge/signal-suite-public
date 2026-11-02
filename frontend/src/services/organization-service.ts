import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './api-client';
import { queryKeys } from './query-client';
import type {
  Organization,
  ListOrganizationsResponse,
  CreateOrganizationRequest,
  UpdateOrganizationRequest,
} from '@/types';

async function fetchOrganizations(): Promise<ListOrganizationsResponse> {
  return apiClient.get<ListOrganizationsResponse>('/organizations');
}

async function createOrganization(data: CreateOrganizationRequest): Promise<Organization> {
  const r = await apiClient.post<{ organization: Organization }>('/organizations', data);
  return r.organization;
}

async function updateOrganization(key: string, data: UpdateOrganizationRequest): Promise<Organization> {
  const r = await apiClient.patch<{ organization: Organization }>(`/organizations/${key}`, data);
  return r.organization;
}

async function deleteOrganization(key: string): Promise<void> {
  return apiClient.delete<void>(`/organizations/${key}`);
}

export function useOrganizations() {
  return useQuery({
    queryKey: queryKeys.organizations.list(),
    queryFn: fetchOrganizations,
  });
}

/**
 * A participant row embeds its organization's name, label and colour, so a
 * write here changes what an operation shows and invalidates both.
 */
function invalidateOrganizationReaders(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: queryKeys.organizations.all });
  void qc.invalidateQueries({ queryKey: queryKeys.operations.all });
}

export function useCreateOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createOrganization,
    onSuccess: () => invalidateOrganizationReaders(qc),
  });
}

export function useUpdateOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, data }: { key: string; data: UpdateOrganizationRequest }) =>
      updateOrganization(key, data),
    onSuccess: () => invalidateOrganizationReaders(qc),
  });
}

export function useDeleteOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteOrganization,
    onSuccess: () => invalidateOrganizationReaders(qc),
  });
}
