import { compareNatural } from '@/utils';

/** A transport's category. Deliberately a plain string, not a union: the
 *  vocabulary is open, so a squadron running a path nobody anticipated adds its
 *  own kind rather than filing it under "other" and losing the distinction. */
export type TransportKind = string;

/** The starting vocabulary the picker offers before anyone has added their own.
 *  Kept in step with DefaultKinds in backend/internal/domain/transport/model.go. */
export const DEFAULT_TRANSPORT_KINDS: TransportKind[] = ['fiber', 'cellular', 'manet', 'other'];

/** Display strings for the built-in kinds. Anything outside this map is a kind
 *  someone added, and is title-cased instead. */
const BUILT_IN_KIND_LABELS: Record<string, string> = {
  fiber: 'Fiber',
  cellular: 'Cellular',
  manet: 'MANET',
  other: 'Other',
};

/** Without this a kind prints as its raw stored value, so a custom "line of
 *  sight" reads lowercase on a sheet a squadron hands to aircrew. */
export function transportKindLabel(kind: TransportKind): string {
  if (!kind) return '';
  const known = BUILT_IN_KIND_LABELS[kind];
  if (known) return known;
  return kind.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/** Every kind the picker should offer: the built-in four, plus every kind
 *  already in use, so a kind one person adds becomes a suggestion for everyone
 *  after them. Sorted, with the defaults kept first so the common cases stay at
 *  the top of the list. */
export function transportKindOptions(inUse: TransportKind[]): TransportKind[] {
  const extra = Array.from(new Set(inUse.filter((k) => k && !DEFAULT_TRANSPORT_KINDS.includes(k))));
  extra.sort(compareNatural);
  return [...DEFAULT_TRANSPORT_KINDS, ...extra];
}

export interface Transport {
  id: string;
  name: string;
  kind: TransportKind;
  provider: string;
  description: string;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export interface ListTransportsResponse {
  transports: Transport[];
  total: number;
}

export interface CreateTransportRequest {
  name: string;
  kind?: TransportKind;
  provider?: string;
  description?: string;
}

export interface UpdateTransportRequest {
  name?: string;
  kind?: TransportKind;
  provider?: string;
  description?: string;
}
