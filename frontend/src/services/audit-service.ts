import { useQuery } from '@tanstack/react-query';
import { apiClient } from './api-client';
import { queryKeys } from './query-client';

export interface AuditEvent {
  id: string;
  actor_id?: string;
  actor_name?: string;
  actor_email?: string;
  resource_type: string;
  resource_id: string;
  resource_name?: string;
  action: string;
  changes?: Record<string, unknown>;
  created_at: string;
}

export interface ListEventsResponse {
  events: AuditEvent[];
  total: number;
  page: number;
  total_pages: number;
}

export interface ListEventsParams {
  resource_type?: string;
  resource_id?: string;
  actor_id?: string;
  action?: string;
  since?: string;
  until?: string;
  page?: number;
  limit?: number;
}

async function fetchEvents(params: ListEventsParams = {}): Promise<ListEventsResponse> {
  const query: Record<string, string> = {};
  if (params.resource_type) query.resource_type = params.resource_type;
  if (params.resource_id) query.resource_id = params.resource_id;
  if (params.actor_id) query.actor_id = params.actor_id;
  if (params.action) query.action = params.action;
  if (params.since) query.since = params.since;
  if (params.until) query.until = params.until;
  if (params.page) query.page = String(params.page);
  if (params.limit) query.limit = String(params.limit);
  return apiClient.get<ListEventsResponse>('/audit', query);
}

/** Paginated, filtered audit event list. Admin-only on the backend. */
export function useAuditEvents(params: ListEventsParams = {}) {
  return useQuery({
    queryKey: queryKeys.audit.list(params as Record<string, unknown>),
    queryFn: () => fetchEvents(params),
    retry: false,
  });
}
