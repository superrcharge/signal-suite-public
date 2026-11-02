import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './api-client';
import { queryKeys } from './query-client';
import type { GetPaceCardResponse, PaceCard, PaceTheater, SavePaceCardRequest } from '@/types';

// The theater is always sent, never left to the server's default, so a request
// says which card it means and the URL convention (default omitted) stays a
// concern of the page alone.
async function fetchPaceCard(section: string, theater: PaceTheater): Promise<PaceCard> {
  const r = await apiClient.get<GetPaceCardResponse>(`/pace/${section}?theater=${theater}`);
  return r.card;
}

// The emblem is its own endpoint, not part of the card save: the editor sends
// it the moment a file is chosen, so a card save can never clear it.
async function uploadPaceEmblem(section: string, file: File): Promise<string> {
  const form = new FormData();
  form.append('emblem', file);
  const r = await apiClient.postForm<{ url: string }>(`/pace/${section}/emblem`, form);
  return r.url;
}

async function deletePaceEmblem(section: string): Promise<void> {
  await apiClient.delete(`/pace/${section}/emblem`);
}

async function savePaceCard(
  section: string,
  theater: PaceTheater,
  data: SavePaceCardRequest,
): Promise<PaceCard> {
  const r = await apiClient.put<GetPaceCardResponse>(`/pace/${section}?theater=${theater}`, data);
  return r.card;
}

export function usePaceCard(section: string | undefined, theater: PaceTheater) {
  return useQuery({
    queryKey: queryKeys.pace.card(section ?? '', theater),
    queryFn: () => fetchPaceCard(section ?? '', theater),
    enabled: Boolean(section),
  });
}

export function useSavePaceCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      section,
      theater,
      data,
    }: {
      section: string;
      theater: PaceTheater;
      data: SavePaceCardRequest;
    }) => savePaceCard(section, theater, data),
    onSuccess: (_card, { section, theater }) => {
      void qc.invalidateQueries({ queryKey: queryKeys.pace.card(section, theater) });
    },
  });
}

export function useUploadPaceEmblem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ section, file }: { section: string; file: File }) =>
      uploadPaceEmblem(section, file),
    onSuccess: (_url, { section }) => {
      void qc.invalidateQueries({ queryKey: queryKeys.pace.section(section) });
    },
  });
}

export function useDeletePaceEmblem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ section }: { section: string }) => deletePaceEmblem(section),
    onSuccess: (_void, { section }) => {
      void qc.invalidateQueries({ queryKey: queryKeys.pace.section(section) });
    },
  });
}
