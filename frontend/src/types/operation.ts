import type { Branch } from './platform';

/** The closed status vocabulary, in lifecycle order. Mirrors `ValidStatuses` in the operation domain. */
export const OPERATION_STATUSES = ['planning', 'active', 'complete'] as const;
export type OperationStatus = (typeof OPERATION_STATUSES)[number];

export const OPERATION_STATUS_LABELS: Record<OperationStatus, string> = {
  planning: 'Planning',
  active: 'Active',
  complete: 'Complete',
};

export interface Operation {
  id: string;
  name: string;
  /**
   * Short form, upper-cased by the server, max 20, "" when unset. When set
   * it labels the picker tile, with the name beneath; see `operationTitle`.
   * Every other surface names the operation by `name`.
   */
  acronym: string;
  status: OperationStatus;
  /** YYYY-MM-DD, or "" when not set, never null. */
  start_date: string;
  end_date: string;
  notes: string;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  participant_count: number;
  /** Open RFIs on the operation; the banner reads it. Absent is the same as 0. */
  open_rfi_count?: number;
}

/** The organization fields a participant row carries, so a list needs no second fetch. */
export interface ParticipantOrganization {
  /** "" for an ad hoc ("Other") organization, which has no library row. */
  key: string;
  name: string;
  short_label: string;
  branch: Branch | '';
  color: string;
  /**
   * True when the organization lives only on this participant row: an
   * "Other" named inside the operation, with no library row behind it. The
   * server always sends it, and this summary is the only place the ad hoc
   * identity is carried.
   */
  adhoc: boolean;
}

/**
 * An "Other" organization named inside one operation. It is never added to
 * the Organization Library; the server stores it on the participant row.
 */
export interface AdhocOrganization {
  name: string;
  short_label: string;
  branch: Branch | '';
  color: string;
}

/** One requirement of a phase: these two participants must be able to talk. `a` sorts before `b`. */
export interface PhaseRequirement {
  id: string;
  a: string;
  b: string;
}

/**
 * One stage of an operation. The server keeps them ordered by `position`.
 * The plan fields are what this phase asks of the units in it: who the
 * others support, where each unit sits, and who must talk to whom.
 */
export interface Phase {
  id: string;
  operation_id: string;
  position: number;
  name: string;
  /** The participant everything in this phase supports, or null when none is named. */
  supported_participant_id: string | null;
  /** Participant id to the id of the site it sits at in this phase. A unit with no key has no location. */
  placements: Record<string, string>;
  requirements: PhaseRequirement[];
}

/** A physical location of the operation (ISB, FSB, MSS, the X). The server keeps them ordered by `position`. */
export interface Site {
  id: string;
  operation_id: string;
  position: number;
  name: string;
}

export interface Participant {
  id: string;
  operation_id: string;
  /** "" for an ad hoc row; `organization` then carries the name, label, branch and colour with `adhoc: true`. */
  organization_key: string;
  organization: ParticipantOrganization;
  /**
   * Platform Library rows this organization brings: airframes, vessels,
   * vehicles or ground stations. Empty means dismounted. Each platform's own
   * waveforms and radios count toward what the organization carries.
   */
  platform_ids: string[];
  equipment_ids: string[];
  waveform_abbrevs: string[];
  service_abbrevs: string[];
  transport_ids: string[];
  /**
   * Asset id (a platform, equipment or transport id this row brings) to the
   * ids of the phases it is in, ordered by position. An empty list is
   * brought but in no phase. An asset id with no key is present in every
   * phase: the server writes every phase for an asset the request omitted,
   * and the reader treats a missing key the same way.
   */
  asset_phases: Record<string, string[]>;
  poc_name: string;
  poc_phone: string;
  poc_email: string;
  notes: string;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export interface ListOperationsResponse {
  operations: Operation[];
  total: number;
}

export interface GetOperationResponse {
  operation: Operation;
  participants: Participant[];
  /** Ordered by position; empty when the operation has no phases. */
  phases: Phase[];
  /** Ordered by position; empty when the operation has no locations. */
  sites: Site[];
}

export interface CreateOperationRequest {
  name: string;
  acronym?: string;
  /** Blank means planning. */
  status?: OperationStatus;
  start_date?: string;
  end_date?: string;
  notes?: string;
}

export interface UpdateOperationRequest {
  name?: string;
  /** A present blank acronym clears it. */
  acronym?: string;
  status?: OperationStatus;
  /** A present blank date clears it. */
  start_date?: string;
  end_date?: string;
  notes?: string;
}

/** Replaces the whole check-in; see `expected_updated_at`. */
export interface SaveParticipantRequest {
  platform_ids: string[];
  equipment_ids: string[];
  waveform_abbrevs: string[];
  service_abbrevs: string[];
  transport_ids: string[];
  /** Absent or null leaves the stored phases unchanged. */
  asset_phases?: Record<string, string[]> | null;
  poc_name?: string;
  poc_phone?: string;
  poc_email?: string;
  notes?: string;
  /** The updated_at last read; a mismatch is refused with PARTICIPANT_STALE. Omit on a first save. */
  expected_updated_at?: string;
}

/**
 * POST /operations/:id/participants. Exactly one of `organization_key` and
 * `adhoc` names who is joining; neither is PARTICIPANT_IDENTITY_REQUIRED, and
 * an ad hoc name already on the operation is PARTICIPANT_ADHOC_NAME_EXISTS.
 */
export interface CreateParticipantRequest {
  organization_key?: string;
  adhoc?: AdhocOrganization;
  platform_ids: string[];
  equipment_ids: string[];
  waveform_abbrevs: string[];
  service_abbrevs: string[];
  transport_ids: string[];
  /** Absent or null: every asset is in every phase. */
  asset_phases?: Record<string, string[]> | null;
  poc_name: string;
  poc_phone: string;
  poc_email: string;
  notes: string;
}

/**
 * PATCH /operations/:id/participants/id/:pid. Replaces the five lists and the
 * contact fields as sent; the identity cannot change.
 */
export interface UpdateParticipantRequest {
  platform_ids: string[];
  equipment_ids: string[];
  waveform_abbrevs: string[];
  service_abbrevs: string[];
  transport_ids: string[];
  /** Absent or null leaves the stored phases unchanged. */
  asset_phases?: Record<string, string[]> | null;
  poc_name: string;
  poc_phone: string;
  poc_email: string;
  notes: string;
  /** The updated_at last read; a mismatch is refused with PARTICIPANT_STALE. */
  expected_updated_at?: string;
}

/**
 * PUT /operations/:id/phases. Replaces the whole list in the order sent. A
 * phase with an `id` is renamed and kept; one without is new; a stored phase
 * left out is removed. Writer roles only.
 */
export interface SaveOperationPhasesRequest {
  phases: { id?: string; name: string }[];
}

export interface SaveOperationPhasesResponse {
  phases: Phase[];
}

/**
 * PUT /operations/:id/sites. Replaces the whole list in the order sent, as
 * the phases do: a site with an `id` is renamed and kept, one without is
 * new, a stored site left out is removed along with the placements at it.
 * An empty list is allowed. Writer roles only.
 */
export interface SaveOperationSitesRequest {
  sites: { id?: string; name: string }[];
}

export interface SaveOperationSitesResponse {
  sites: Site[];
}

/**
 * PUT /operations/:id/phases/:phase_id/plan. Replaces the phase's plan
 * whole: what is not sent is cleared. A pair is normalised to a < b and
 * deduped by the server; a == b is OPERATION_REQUIREMENT_SELF.
 */
export interface SavePhasePlanRequest {
  supported_participant_id: string | null;
  placements: Record<string, string>;
  requirements: { a: string; b: string }[];
}

export const RFI_STATUSES = ['open', 'resolved'] as const;
export type RFIStatus = (typeof RFI_STATUSES)[number];

/** One reply on an RFI thread. Flat, oldest first. */
export interface RFIComment {
  id: string;
  rfi_id: string;
  body: string;
  /** Display name. */
  created_by: string;
  /** The local user id: the identity, where `created_by` is only a name. */
  created_by_id: string;
  created_at: string;
}

/**
 * A request for information raised inside an operation. `participant_id` is
 * the unit it was raised as, null once that unit has left the operation.
 * Only the user whose id is `created_by_id` can resolve it.
 */
export interface RFI {
  id: string;
  operation_id: string;
  participant_id: string | null;
  question: string;
  status: RFIStatus;
  created_by: string;
  created_by_id: string;
  resolved_by: string;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  comments: RFIComment[];
}

export interface ListRFIsResponse {
  rfis: RFI[];
}

export interface CreateRFIRequest {
  participant_id: string;
  question: string;
}

export interface AddRFICommentRequest {
  body: string;
}
