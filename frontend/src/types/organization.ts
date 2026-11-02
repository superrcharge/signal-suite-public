import type { Branch } from './platform';

/**
 * A participating organization: a squadron, a unit or an outside agency that
 * can check in to an operation. `key` is its identity and never changes.
 */
export interface Organization {
  key: string;
  name: string;
  short_label: string;
  /** "" when unset, never null. */
  branch: Branch | '';
  color: string;
  /** "" when unset, never null. */
  section_key: string;
  notes: string;
  /**
   * How many distinct operations have this organization checked in. Ad hoc
   * participants are not counted. Delete is refused while it is above zero.
   */
  operation_count: number;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export interface ListOrganizationsResponse {
  organizations: Organization[];
  total: number;
}

export interface CreateOrganizationRequest {
  key: string;
  name: string;
  short_label?: string;
  branch?: Branch | '';
  color?: string;
  section_key?: string;
  notes?: string;
}

/** No key: the key is the identity and travels in the URL. */
export interface UpdateOrganizationRequest {
  name?: string;
  short_label?: string;
  branch?: Branch | '';
  color?: string;
  section_key?: string;
  notes?: string;
}
