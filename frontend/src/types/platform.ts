/**
 * An external comms platform: an airframe, ship, vehicle or site that is not
 * a piece of equipment we hold. `category` and `kind` are open vocabularies,
 * normalised server-side, not fixed unions - see migration 040.
 */
export interface Platform {
  id: string;
  designation: string;
  popular_name: string;
  category: string;
  kind: string;
  operator: string;
  /** Waveforms the platform carries, typed against it directly. */
  waveform_abbrevs: string[];
  /** Catalog radios it carries, where known. Their waveforms resolve live. */
  equipment_ids: string[];
  notes: string;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export interface ListPlatformsResponse {
  platforms: Platform[];
  total: number;
}

export interface CreatePlatformRequest {
  designation: string;
  popular_name?: string;
  category?: string;
  kind?: string;
  operator?: string;
  waveform_abbrevs?: string[];
  equipment_ids?: string[];
  notes?: string;
}

export interface UpdatePlatformRequest {
  designation?: string;
  popular_name?: string;
  category?: string;
  kind?: string;
  operator?: string;
  waveform_abbrevs?: string[];
  equipment_ids?: string[];
  notes?: string;
}
