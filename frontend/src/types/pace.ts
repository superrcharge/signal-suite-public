/** The radios a channel plan describes. A net may be carried by 'both'. */
export const PACE_RADIOS = ['jem', 'mpu5'] as const;
export type PaceRadio = (typeof PACE_RADIOS)[number];

export const PACE_RADIO_LABELS: Record<PaceRadio, string> = {
  jem: 'JEM',
  mpu5: 'MPU5',
};

/** The slice of a net a channel needs in order to render. */
export interface PaceNetSummary {
  id: string;
  name: string;
  net_id: string;
  radio_type: string;
  /**
   * Carried over IP rather than RF alone; draws the ICE mark on the card.
   *
   * Optional because a card saved before the API carried this field will not
   * have it. Absent reads as "not ROIP", which is the safe direction: a net
   * shown without the mark is merely undecorated, whereas defaulting the other
   * way would label every net on an old payload as ICE.
   */
  roip?: boolean;
}

/**
 * One assigned channel. tx_freq/rx_freq arrive already resolved by the API --
 * the per-channel override where one is set, the net's own values otherwise --
 * so no consumer re-implements that precedence.
 */
export interface PaceChannel {
  channel_number: number;
  net: PaceNetSummary;
  tx_freq: string;
  rx_freq: string;
  freq_unit: string;
  label_override: string;
  is_overridden: boolean;
  /**
   * Which of this row's printed values are marked as changed, and so print
   * red: here 'net', 'tx', 'rx'. Every `highlights` on the card names fields
   * of its own row; the allowed names are in `pace/model.go`.
   *
   * Optional, like `roip`, so a payload from before the marks existed reads
   * as nothing marked rather than failing to type.
   */
  highlights?: string[];
}

export interface PacePlan {
  id: string;
  radio_type: string;
  label: string;
  channel_count: number;
  notes: string;
  updated_by: string;
  updated_at: string;
  /** 'label': the wheel caption prints red. */
  highlights?: string[];
  channels: PaceChannel[];
}

/**
 * One printed line of the LTAC or TACSAT table. Every field is free-form text
 * the squadron types: these are printed values, not references to a net.
 *
 * `up` and `down` are the sheet's column headings; the columns behind them are
 * `up_freq` and `down_freq`.
 */
export interface PaceFreqRow {
  name: string;
  /** Printed by the TACSAT table only. Free-form, like every other field here:
   *  a channel is as often "1-16" or "A" as it is a single number. */
  channel: string;
  up: string;
  down: string;
  sat: string;
  crypto: string;
  /** Any of the six column keys above. */
  highlights?: string[];
}

/** One line of the TACTICAL MISSION NETWORK box. */
export interface PaceTmnRow {
  label: string;
  value: string;
  /** 'label' and/or 'value'. */
  highlights?: string[];
}

/** What a tier points at. */
export type PaceTierSource = 'equipment' | 'transport' | 'custom' | 'none';

/** One PACE tile, with its references already resolved by the server.
 *
 *  The nomenclature, photo and rates are joined in server-side so the sheet
 *  renders from one payload; resolving them here would cost the print route a
 *  second round trip, and it calls window.print() as soon as it has what it
 *  needs. */
export interface PaceTier {
  tier: string;
  source: PaceTierSource;
  equipment_id: string;
  transport_id: string;
  service_abbrev: string;
  custom_label: string;
  /** Printed under the name whatever the source is. */
  detail: string;
  /** 'name' (the tile title, whatever its source), 'service', 'detail'. */
  highlights?: string[];

  equipment_nomenclature: string;
  /** The catalog nickname ("Falcon"), which is what the tile titles itself
   *  with. Empty for a record that has none, so the tile falls back to
   *  equipment_nomenclature rather than printing a blank title. */
  equipment_nickname: string;
  equipment_photo_url: string;
  transport_name: string;
  /** Already formatted as "dl/ul Mbps", or empty when the tier has no
   *  equipment or no service matching service_abbrev on that record. Always
   *  empty for a radio, whose capability is a waveform and has no rates. */
  service_cir: string;
  service_mir: string;
}

/**
 * A squadron's whole card. Both radios are always present: a squadron with
 * nothing saved gets an empty plan rather than a missing one, so the UI never
 * special-cases "not set up yet".
 */
export interface PaceCard {
  section: string;
  /** Centred on the sheet; names the exercise or operation. */
  title: string;
  /** YYYY-MM-DD, or empty. Empty means the sheet shows no date subtext -- the
   *  nullable value is the flag, so there is no separate boolean to contradict. */
  effective_date: string;
  /** The squadron's emblem, drawn in both wheel hubs. Empty means none stored,
   *  which is the sheet's signal to draw its generated placeholder instead. */
  emblem_url: string;
  /** Free text printed after the date ("v2"). Empty or absent prints nothing. */
  version?: string;
  /** 'title', 'date', 'version'. */
  highlights?: string[];
  plans: PacePlan[];
  /** The sheet's middle band. Always arrays, never null. */
  ltac_rows: PaceFreqRow[];
  tacsat_rows: PaceFreqRow[];
  tmn_rows: PaceTmnRow[];
  /** The four PACE tiles, always exactly four in P A C E order, even for a
   *  squadron that has configured none. The server pads on read so the shape is
   *  constant and no consumer handles a partially configured card. */
  tiers: PaceTier[];
}

export interface GetPaceCardResponse {
  card: PaceCard;
}

export interface SavePaceChannelInput {
  channel_number: number;
  net_id: string;
  tx_freq_override?: string;
  rx_freq_override?: string;
  freq_unit_override?: string;
  label_override?: string;
  highlights?: string[];
}

export interface SavePacePlanInput {
  radio_type: string;
  label?: string;
  channel_count?: number;
  notes?: string;
  highlights?: string[];
  channels: SavePaceChannelInput[];
}

export interface SavePaceCardRequest {
  title?: string;
  /** Empty clears the date, which is what unticking "Include date" does. */
  effective_date?: string;
  version?: string;
  highlights?: string[];
  plans: SavePacePlanInput[];
  /** A whole-band replace: what is sent is what the squadron ends up with. */
  ltac_rows?: PaceFreqRow[];
  tacsat_rows?: PaceFreqRow[];
  tmn_rows?: PaceTmnRow[];
  /** Omitted entirely means "leave the stored tiers alone"; present means
   *  replace all four. That is what lets a save that only touches channels
   *  avoid wiping tiers it never read. */
  tiers?: SavePaceTierInput[];
}

export interface SavePaceTierInput {
  tier: string;
  source: PaceTierSource;
  equipment_id?: string;
  transport_id?: string;
  service_abbrev?: string;
  custom_label?: string;
  detail?: string;
  highlights?: string[];
}
