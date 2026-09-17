// API response types matching backend patterns

/**
 * Standard API response wrapper
 * Matches backend response pattern from /backend/internal/shared/response/
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, string>;
}

/**
 * Pagination types
 */
export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Request state machine types
 * Use discriminated unions to prevent impossible states
 */
export type RequestState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: ApiError };

/**
 * User types matching backend User domain (snake_case matches JSON over the wire)
 */
export interface User {
  id: string;
  email: string;
  name: string;
  roles: string[];
  preferences: UserPreferences;
  last_login_at?: string;
  created_at: string;
  updated_at: string;
}

export interface UserPreferences {
  theme?: string;
  notifications?: boolean;
}

export interface UpdateUserPreferencesRequest {
  theme?: 'light' | 'dark' | 'system';
  notifications?: boolean;
}

/**
 * Section types matching backend Section domain
 */
export interface Section {
  key: string;
  label: string;
  color: string;
  /**
   * Whether this squadron runs a JEM/MPU5 comms card.
   *
   * Gates both the card and the per-squadron Nets library, so one flag delivers
   * both surfaces. Optional in the type only so a cached response from before
   * migration 036 does not read as `undefined` where a boolean is expected;
   * treat absence as false, which is what `hasPaceCard` does.
   */
  pace_enabled?: boolean;
}

export interface Tag {
  name: string;
  created_at: string;
  /**
   * Terminals currently carrying this tag, matched case-insensitively.
   * Required, not optional: 0 is a real answer (a tag pre-created in Settings
   * for an upcoming operation sits at 0 until it is applied), and an optional
   * field would make "no terminals" indistinguishable from "not supplied".
   */
  terminal_count: number;
}

/**
 * Terminal types matching backend Terminal domain
 */
export interface Terminal {
  id: string;
  name: string;
  model: string | null;
  kit: string;
  pim: string;
  serial: string;
  section: string;
  status: string;
  owner: string | null;
  owner_email: string | null;
  owner_phone: string | null;
  /** PoP pin slug (Starshield mini/hp only); null = not pinned. */
  pop_pin: string | null;
  notes: string;
  /** Free-form grouping label spanning sections; null when unset. */
  tag: string | null;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export interface ListTerminalsResponse {
  terminals: Terminal[];
  total: number;
  page: number;
  total_pages: number;
  status_counts: Record<string, number>;
}

export interface CreateTerminalRequest {
  name: string;
  model?: string | null;
  kit?: string;
  pim?: string;
  serial?: string;
  section?: string;
  status?: string;
  owner?: string;
  owner_email?: string;
  owner_phone?: string;
  pop_pin?: string | null;
  notes?: string;
  tag?: string | null;
}

export interface UpdateTerminalRequest {
  name?: string;
  model?: string | null;
  kit?: string;
  pim?: string;
  serial?: string;
  section?: string;
  status?: string;
  owner?: string | null;
  owner_email?: string | null;
  owner_phone?: string | null;
  /** Send "" to clear the pin (backend normalizes to NULL, same as tag). */
  pop_pin?: string | null;
  notes?: string;
  tag?: string | null;
}

export interface ListTerminalsParams {
  sections?: string;
  model?: string;
  search?: string;
  tag?: string;
  page?: number;
  limit?: number;
}

// Contract types matching backend Contract domain
export interface Contract {
  id: string;
  title: string;
  company: string;
  poc_name: string | null;
  poc_email: string | null;
  poc_phone: string | null;
  pop_start: string | null; // "YYYY-MM-DD"
  pop_end: string | null;   // "YYYY-MM-DD"
  execution_quarter: string | null; // Q1|Q2|Q3|Q4
  fiscal_year: string;
  notes: string;
  logform_number: string | null;
  logform_url: string | null;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export interface ContractCounts {
  total: number;
  expiring_30: number;
  expiring_60: number;
  expiring_90: number;
}

export interface ListContractsResponse {
  contracts: Contract[];
  total: number;
  page: number;
  total_pages: number;
  counts: ContractCounts;
}

export interface ListContractsParams {
  fy?: string;
  search?: string;
  page?: number;
  limit?: number;
  sort_by?: string;
  sort_dir?: 'asc' | 'desc';
}

export interface CreateContractRequest {
  title: string;
  company: string;
  poc_name?: string | null;
  poc_email?: string | null;
  poc_phone?: string | null;
  pop_start?: string | null;
  pop_end?: string | null;
  execution_quarter?: string | null;
  fiscal_year: string;
  notes?: string;
  logform_number?: string | null;
  logform_url?: string | null;
}

export interface UpdateContractRequest {
  title?: string;
  company?: string;
  poc_name?: string | null;
  poc_email?: string | null;
  poc_phone?: string | null;
  pop_start?: string | null;
  pop_end?: string | null;
  execution_quarter?: string | null;
  fiscal_year?: string;
  notes?: string;
  logform_number?: string | null;
  logform_url?: string | null;
}

export interface ImportRowError {
  row: number;
  name: string;
  errors: string[];
}

export interface ImportTerminalsResponse {
  imported: number;
  errors: ImportRowError[];
  message: string;
}

/**
 * Kit types matching backend Kit domain. Parallel to Terminal: a
 * top-level asset grouped by `type`, with three independent network
 * classification booleans (black / secret / topsecret).
 */
export interface Kit {
  id: string;
  name: string;
  /** remote | ifk | atk */
  type: string;
  status: string;
  black: boolean;
  secret: boolean;
  topsecret: boolean;
  section: string;
  owner: string | null;
  owner_email: string | null;
  owner_phone: string | null;
  location: string;
  notes: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export interface ListKitsResponse {
  kits: Kit[];
  total: number;
  page: number;
  total_pages: number;
  status_counts: Record<string, number>;
}

export interface CreateKitRequest {
  name: string;
  type: string;
  status?: string;
  black?: boolean;
  secret?: boolean;
  topsecret?: boolean;
  section?: string;
  owner?: string | null;
  owner_email?: string | null;
  owner_phone?: string | null;
  location?: string;
  notes?: string;
}

export interface UpdateKitRequest {
  name?: string;
  type?: string;
  status?: string;
  black?: boolean;
  secret?: boolean;
  topsecret?: boolean;
  section?: string;
  owner?: string | null;
  owner_email?: string | null;
  owner_phone?: string | null;
  location?: string;
  notes?: string;
}

export interface ListKitsParams {
  sections?: string;
  type?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface ImportKitsResponse {
  imported: number;
  errors: ImportRowError[];
  message: string;
}


/**
 * Which catalog assets use each entry of a reference library.
 *
 * Keyed by NORMALISED abbrev - lowercased and trimmed, matching the library's
 * uniqueness index and the compatibility matrix's own normalisation.
 *
 * An abbrev nothing uses is **absent from the map**, never present with an
 * empty array. That is the backend contract, and it is what lets a reader treat
 * a missing key as zero rather than as "not loaded yet".
 */
export interface UsageResponse {
  usage: Record<string, string[]>;
  /** Entries used by at least one asset - not the size of the library. */
  total: number;
}
