/** Frequency units a net can be expressed in, matching the backend's closed set. */
export const NET_FREQ_UNITS = ['MHz', 'GHz'] as const;
export type NetFreqUnit = (typeof NET_FREQ_UNITS)[number];

/**
 * Which radio carries a net. 'both' is a first-class answer, not a fallback: a
 * genuinely shared net must not have to be entered twice.
 */
export const NET_RADIO_TYPES = ['jem', 'mpu5', 'both'] as const;
export type NetRadioType = (typeof NET_RADIO_TYPES)[number];

/** Human labels for the radio types, used by the tabs and the drawer. */
export const NET_RADIO_TYPE_LABELS: Record<NetRadioType, string> = {
  jem: 'JEM',
  mpu5: 'MPU5',
  both: 'Both',
};

/** A "both" net belongs on either wheel. */
export function carriedBy(netRadioType: string, radio: 'jem' | 'mpu5'): boolean {
  return netRadioType === 'both' || netRadioType === radio;
}

/**
 * A net in the global Nets library.
 *
 * tx_freq and rx_freq are freeform strings, not numbers: a net is recorded as a
 * range or a placeholder word as readily as a single figure.
 */
export interface Net {
  id: string;
  /** Owning squadron. A net belongs to one squadron's library. */
  section: string;
  name: string;
  net_id: string;
  radio_type: string;
  tx_freq: string;
  rx_freq: string;
  freq_unit: string;
  /** Carried over IP rather than RF alone. */
  roip: boolean;
  description: string;
  notes: string;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export interface ListNetsResponse {
  nets: Net[];
  total: number;
}

export interface CreateNetRequest {
  name: string;
  net_id?: string;
  radio_type?: string;
  tx_freq?: string;
  rx_freq?: string;
  freq_unit?: string;
  roip?: boolean;
  description?: string;
  notes?: string;
}

export type UpdateNetRequest = Partial<CreateNetRequest>;
