import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './api-client';
import { queryKeys } from './query-client';
import type {
  Contract,
  ListContractsResponse,
  ListContractsParams,
  CreateContractRequest,
  UpdateContractRequest,
} from '@/types';

async function fetchContracts(params: ListContractsParams): Promise<ListContractsResponse> {
  const sp = new URLSearchParams();
  if (params.fy) sp.set('fy', params.fy);
  if (params.search) sp.set('search', params.search);
  if (params.page) sp.set('page', String(params.page));
  if (params.limit) sp.set('limit', String(params.limit));
  if (params.sort_by) sp.set('sort_by', params.sort_by);
  if (params.sort_dir) sp.set('sort_dir', params.sort_dir);
  const qs = sp.toString();
  return apiClient.get<ListContractsResponse>(`/contracts${qs ? `?${qs}` : ''}`);
}

async function fetchFiscalYears(): Promise<string[]> {
  const r = await apiClient.get<{ fiscal_years: string[] }>('/contracts/fiscal-years');
  return r.fiscal_years;
}

async function createContract(data: CreateContractRequest): Promise<Contract> {
  return apiClient.post<Contract>('/contracts', data);
}

async function updateContract(id: string, data: UpdateContractRequest): Promise<Contract> {
  return apiClient.patch<Contract>(`/contracts/${id}`, data);
}

async function deleteContract(id: string): Promise<void> {
  return apiClient.delete<void>(`/contracts/${id}`);
}

/**
 * `enabled` exists for the Dashboard, whose Contracts panel is rendered only
 * for the roles that see contracts at all; the count behind a panel nobody is
 * shown is a request that costs a round trip and answers nothing.
 */
export function useContracts(params: ListContractsParams = {}, enabled: boolean = true) {
  return useQuery({
    queryKey: queryKeys.contracts.list(params as Record<string, unknown>),
    queryFn: () => fetchContracts(params),
    enabled,
  });
}

/**
 * Fiscal years for the contracts sidebar filter.
 *
 * `enabled` mirrors useCurrentUser's: the sidebar renders the Contracts group
 * only for the roles that see contracts, and a query for a group nobody is
 * going to see is a request that costs a round trip and answers nothing.
 */
export function useContractFiscalYears(enabled: boolean = true) {
  return useQuery({
    queryKey: queryKeys.contracts.fiscalYears(),
    queryFn: fetchFiscalYears,
    enabled,
  });
}

export function useCreateContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createContract,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.contracts.all });
    },
  });
}

export function useUpdateContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateContractRequest }) =>
      updateContract(id, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.contracts.all });
    },
  });
}

export function useDeleteContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteContract,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.contracts.all });
    },
  });
}
