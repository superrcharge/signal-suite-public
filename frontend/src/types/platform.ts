/**
 * An external comms platform: an airframe, ship, vehicle or site that is not
 * a piece of equipment we hold. Both `category` (see `Branch`) and `type`
 * (see `PlatformType`) are closed lists, enforced server-side.
 */
/**
 * The closed category vocabulary, in order of precedence: the six armed
 * services, then OGA for an agency inside the government but outside the
 * military. Mirrors `Branches` in the platform domain and the CHECK in
 * migration 044.
 */
export const BRANCHES = ['USA', 'USMC', 'USN', 'USAF', 'USSF', 'USCG', 'OGA'] as const;
export type Branch = (typeof BRANCHES)[number];

/** What each abbreviation stands for, for tooltips and the picker. */
export const BRANCH_NAMES: Record<Branch, string> = {
  USA: 'US Army',
  USMC: 'US Marine Corps',
  USN: 'US Navy',
  USAF: 'US Air Force',
  USSF: 'US Space Force',
  USCG: 'US Coast Guard',
  OGA: 'Other government agency',
};

/**
 * The closed platform type list, in display order - migration 045, widened by
 * 050 with `uav`: an aircraft nobody talks to from inside it, kept apart from
 * aircraft so an operation's matrix can tell the two apart.
 */
export const PLATFORM_TYPES = ['aircraft', 'uav', 'ship', 'ground vehicle', 'ground station'] as const;
export type PlatformType = (typeof PLATFORM_TYPES)[number];

/** "ground vehicle" -> "Ground vehicle", for labels; "uav" is the initialism "UAV". */
export function platformTypeLabel(t: string): string {
  if (t === 'uav') return 'UAV';
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

export interface Platform {
  id: string;
  designation: string;
  popular_name: string;
  /** The branches operating it, in `BRANCHES` order. Empty means none set. */
  category: Branch[];
  type: PlatformType;
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
  category?: Branch[];
  type?: PlatformType;
  waveform_abbrevs?: string[];
  equipment_ids?: string[];
  notes?: string;
}

export interface UpdatePlatformRequest {
  designation?: string;
  popular_name?: string;
  category?: Branch[];
  type?: PlatformType;
  waveform_abbrevs?: string[];
  equipment_ids?: string[];
  notes?: string;
}
