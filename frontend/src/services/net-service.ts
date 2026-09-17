import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './api-client';
import { queryKeys } from './query-client';
import type { CreateNetRequest, ListNetsResponse, Net, UpdateNetRequest } from '@/types';

// Every call is scoped to a squadron: nets are a per-squadron library, so there
// is no "all nets" to fetch.
async function fetchNets(section: string): Promise<ListNetsResponse> {
  return apiClient.get<ListNetsResponse>(`/nets/${section}`);
}

async function createNet(section: string, data: CreateNetRequest): Promise<Net> {
  const r = await apiClient.post<{ net: Net }>(`/nets/${section}`, data);
  return r.net;
}

async function updateNet(id: string, data: UpdateNetRequest): Promise<Net> {
  const r = await apiClient.patch<{ net: Net }>(`/nets/id/${id}`, data);
  return r.net;
}

async function deleteNet(id: string): Promise<void> {
  return apiClient.delete<void>(`/nets/id/${id}`);
}

/**
 * A net mutation changes the PACE card too, not just the library. The card
 * endpoint JOINs `nets` and returns the resolved name/tx_freq/rx_freq, so with
 * the app's 5-minute staleTime a corrected frequency would keep printing at the
 * old value for minutes with nothing on screen to say so. Invalidated by the
 * `pace` root rather than one section: a net belongs to a squadron, but nothing
 * client-side guarantees which cards reference it.
 */
function invalidateNetsAndPace(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: queryKeys.nets.all });
  void qc.invalidateQueries({ queryKey: queryKeys.pace.all });
}

export function useNets(section: string | undefined) {
  return useQuery({
    queryKey: queryKeys.nets.list(section ?? ''),
    queryFn: () => fetchNets(section ?? ''),
    enabled: Boolean(section),
  });
}

export function useCreateNet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ section, data }: { section: string; data: CreateNetRequest }) =>
      createNet(section, data),
    onSuccess: () => {
      invalidateNetsAndPace(qc);
    },
  });
}

export function useUpdateNet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateNetRequest }) => updateNet(id, data),
    onSuccess: () => {
      invalidateNetsAndPace(qc);
    },
  });
}

export function useDeleteNet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteNet,
    onSuccess: () => {
      invalidateNetsAndPace(qc);
    },
  });
}
