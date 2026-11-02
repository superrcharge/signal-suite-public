import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiClientError } from './api-client';
import { queryKeys } from './query-client';
import type {
  Operation,
  Participant,
  ListOperationsResponse,
  GetOperationResponse,
  CreateOperationRequest,
  UpdateOperationRequest,
  SaveParticipantRequest,
  CreateParticipantRequest,
  UpdateParticipantRequest,
  Phase,
  Site,
  SaveOperationPhasesRequest,
  SaveOperationSitesRequest,
  SavePhasePlanRequest,
  RFI,
  ListRFIsResponse,
  CreateRFIRequest,
  AddRFICommentRequest,
} from '@/types';

async function fetchOperations(): Promise<ListOperationsResponse> {
  return apiClient.get<ListOperationsResponse>('/operations');
}

async function fetchOperation(id: string): Promise<GetOperationResponse> {
  return apiClient.get<GetOperationResponse>(`/operations/${id}`);
}

async function createOperation(data: CreateOperationRequest): Promise<Operation> {
  const r = await apiClient.post<{ operation: Operation }>('/operations', data);
  return r.operation;
}

async function updateOperation(id: string, data: UpdateOperationRequest): Promise<Operation> {
  const r = await apiClient.patch<{ operation: Operation }>(`/operations/${id}`, data);
  return r.operation;
}

async function deleteOperation(id: string): Promise<void> {
  return apiClient.delete<void>(`/operations/${id}`);
}

async function saveParticipant(
  operationId: string,
  orgKey: string,
  data: SaveParticipantRequest,
): Promise<Participant> {
  const r = await apiClient.put<{ participant: Participant }>(
    `/operations/${operationId}/participants/${orgKey}`,
    data,
  );
  return r.participant;
}

async function deleteParticipant(operationId: string, orgKey: string): Promise<void> {
  return apiClient.delete<void>(`/operations/${operationId}/participants/${orgKey}`);
}

// The by-id routes. A participant keyed by organization cannot name an
// "Other" organization, which has no key, so the Join wizard creates by POST
// and addresses the row by its own id from then on. The keyed PUT and DELETE
// above stay for the participants pane until it is retired.
async function createParticipant(
  operationId: string,
  data: CreateParticipantRequest,
): Promise<Participant> {
  const r = await apiClient.post<{ participant: Participant }>(
    `/operations/${operationId}/participants`,
    data,
  );
  return r.participant;
}

async function updateParticipantById(
  operationId: string,
  participantId: string,
  data: UpdateParticipantRequest,
): Promise<Participant> {
  const r = await apiClient.patch<{ participant: Participant }>(
    `/operations/${operationId}/participants/id/${participantId}`,
    data,
  );
  return r.participant;
}

async function deleteParticipantById(operationId: string, participantId: string): Promise<void> {
  return apiClient.delete<void>(`/operations/${operationId}/participants/id/${participantId}`);
}

async function saveOperationPhases(
  operationId: string,
  data: SaveOperationPhasesRequest,
): Promise<Phase[]> {
  const r = await apiClient.put<{ phases: Phase[] }>(`/operations/${operationId}/phases`, data);
  return r.phases;
}

async function saveOperationSites(
  operationId: string,
  data: SaveOperationSitesRequest,
): Promise<Site[]> {
  const r = await apiClient.put<{ sites: Site[] }>(`/operations/${operationId}/sites`, data);
  return r.sites;
}

async function savePhasePlan(
  operationId: string,
  phaseId: string,
  data: SavePhasePlanRequest,
): Promise<void> {
  // The response is the phase as GET sends it; the invalidation below
  // refetches the whole operation, so nothing here reads it.
  await apiClient.put<unknown>(`/operations/${operationId}/phases/${phaseId}/plan`, data);
}

export function useOperations() {
  return useQuery({
    queryKey: queryKeys.operations.list(),
    queryFn: fetchOperations,
  });
}

/** One operation plus its participants. */
export function useOperation(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.operations.detail(id ?? ''),
    queryFn: () => fetchOperation(id as string),
    enabled: Boolean(id),
    // A second person's join shows up without a refresh; the optimistic lock still catches conflicting saves.
    refetchInterval: 10_000,
  });
}

export function useCreateOperation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createOperation,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.operations.all });
    },
  });
}

export function useUpdateOperation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateOperationRequest }) =>
      updateOperation(id, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.operations.all });
    },
  });
}

export function useDeleteOperation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteOperation,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.operations.all });
    },
  });
}

export function useSaveParticipant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      operationId,
      orgKey,
      data,
    }: {
      operationId: string;
      orgKey: string;
      data: SaveParticipantRequest;
    }) => saveParticipant(operationId, orgKey, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.operations.all });
    },
  });
}

export function useDeleteParticipant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ operationId, orgKey }: { operationId: string; orgKey: string }) =>
      deleteParticipant(operationId, orgKey),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.operations.all });
    },
  });
}

export function useCreateParticipant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ operationId, data }: { operationId: string; data: CreateParticipantRequest }) =>
      createParticipant(operationId, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.operations.all });
    },
  });
}

export function useUpdateParticipantById() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      operationId,
      participantId,
      data,
    }: {
      operationId: string;
      participantId: string;
      data: UpdateParticipantRequest;
    }) => updateParticipantById(operationId, participantId, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.operations.all });
    },
    // PARTICIPANT_STALE means the cached row's updated_at is behind the
    // server's. Refetch on it, or the next Edit reads the same cached row,
    // resends the same timestamp and is refused again until a page reload.
    onError: (err) => {
      if (err instanceof ApiClientError && err.code === 'PARTICIPANT_STALE') {
        void qc.invalidateQueries({ queryKey: queryKeys.operations.all });
      }
    },
  });
}

export function useDeleteParticipantById() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ operationId, participantId }: { operationId: string; participantId: string }) =>
      deleteParticipantById(operationId, participantId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.operations.all });
    },
  });
}

export function useSaveOperationPhases() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ operationId, data }: { operationId: string; data: SaveOperationPhasesRequest }) =>
      saveOperationPhases(operationId, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.operations.all });
    },
  });
}

export function useSaveOperationSites() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ operationId, data }: { operationId: string; data: SaveOperationSitesRequest }) =>
      saveOperationSites(operationId, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.operations.all });
    },
  });
}

export function useSavePhasePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ operationId, phaseId, data }: { operationId: string; phaseId: string; data: SavePhasePlanRequest }) =>
      savePhasePlan(operationId, phaseId, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.operations.all });
    },
  });
}

async function fetchRfis(operationId: string): Promise<ListRFIsResponse> {
  return apiClient.get<ListRFIsResponse>(`/operations/${operationId}/rfis`);
}

async function createRfi(operationId: string, data: CreateRFIRequest): Promise<RFI> {
  return apiClient.post<RFI>(`/operations/${operationId}/rfis`, data);
}

async function addRfiComment(operationId: string, rfiId: string, data: AddRFICommentRequest): Promise<RFI> {
  return apiClient.post<RFI>(`/operations/${operationId}/rfis/${rfiId}/comments`, data);
}

async function resolveRfi(operationId: string, rfiId: string): Promise<RFI> {
  return apiClient.post<RFI>(`/operations/${operationId}/rfis/${rfiId}/resolve`);
}

/** The RFI board of one operation. Polled so a reply shows while the popup is open. */
export function useOperationRfis(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.operations.rfis(id ?? ''),
    queryFn: () => fetchRfis(id as string),
    enabled: Boolean(id) && enabled,
    refetchInterval: 10_000,
  });
}

export function useCreateRfi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ operationId, data }: { operationId: string; data: CreateRFIRequest }) =>
      createRfi(operationId, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.operations.all });
    },
  });
}

export function useAddRfiComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ operationId, rfiId, data }: { operationId: string; rfiId: string; data: AddRFICommentRequest }) =>
      addRfiComment(operationId, rfiId, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.operations.all });
    },
  });
}

export function useResolveRfi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ operationId, rfiId }: { operationId: string; rfiId: string }) =>
      resolveRfi(operationId, rfiId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.operations.all });
    },
  });
}
