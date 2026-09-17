export type TerminalType = 'satcom' | 'radio';

export interface EquipmentRates {
  dl?: number;
  ul?: number;
}

export interface EquipmentService {
  abbrev: string;
  name: string;
  description?: string;
  cir?: EquipmentRates;
  mir?: EquipmentRates;
  best_effort?: boolean;   // no committed rate; CIR/MIR are not applicable
}

export interface EquipmentWaveform {
  abbrev: string;
  name: string;
  description?: string;
}

export interface CompatibilityComparison {
  equipment_id?: string;   // links to Equipment.id in the inventory
  nomenclature: string;
  nickname?: string;
  waveforms: string[];
}

export interface EquipmentCompatibility {
  comparisons: CompatibilityComparison[];
}

export interface EquipmentBand {
  band: string;
  downlink?: string;         // SATCOM RX; legacy radio fallback
  uplink?: string;           // SATCOM TX; legacy radio fallback
  freq_min?: number;         // radio: range minimum
  freq_max?: number;         // radio: range maximum
  freq_unit?: 'MHz' | 'GHz'; // radio: unit for freq_min/freq_max (default 'MHz')
  eirp?: number;
  gt?: number;
  tx_power?: number;
}

export interface SpecRow {
  label: string;
  value: string;
}

export interface SwapSize {
  length?: number;
  width?: number;
  height?: number;
}

export interface EquipmentSwap {
  size?: SwapSize;
  weight?: number;                        // pounds (lbs-only value / lbs component)
  weight_oz?: number;                     // ounces (oz-only value / oz component)
  weight_unit?: 'lbs' | 'oz' | 'lbs_oz';  // entry/display mode; absent = 'lbs' (legacy)
  power?: string;
}

export interface EquipmentFeature {
  title: string;
  description?: string;
}

export interface AccessoryItem {
  name: string;
  note: string;
}

export interface SATCOMStandardSpecs {
  antennaType?: string;
  reflector?: string;
  modem?: string;
  orbit?: string;
  bucTransmitPower?: number;
  windTolerance?: number;
  altPntAvailable?: boolean;
}

export interface RadioStandardSpecs {
  antennaType?: string;
  transmitPower?: number;
  crypto?: string;
  range?: number;
  range_unit?: 'mi' | 'km';
}

export interface EquipmentData {
  services: EquipmentService[];
  waveforms: EquipmentWaveform[];
  compatibility?: EquipmentCompatibility;
  bands: EquipmentBand[];
  standard_specs: SATCOMStandardSpecs | RadioStandardSpecs;
  physical_specs: SpecRow[];
  rf_specs: SpecRow[];
  swap: EquipmentSwap;
  features: EquipmentFeature[];
  accessories?: AccessoryItem[] | string;
  use_cases?: string;
}

export interface Equipment {
  id: string;
  nomenclature: string;
  nickname?: string;
  one_liner?: string;
  doc_number?: string;
  photo_url?: string;
  make?: string;
  terminal_type: TerminalType;
  operational_mode: string[];
  data?: EquipmentData;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export interface ListEquipmentResponse {
  equipment: Equipment[];
  total: number;
}

export interface CreateEquipmentRequest {
  id: string;
  nomenclature: string;
  nickname?: string;
  one_liner?: string;
  doc_number?: string;
  photo_url?: string;
  make?: string;
  terminal_type: TerminalType;
  operational_mode?: string[];
  data?: Partial<EquipmentData>;
}

export interface UpdateEquipmentRequest {
  nomenclature?: string;
  nickname?: string;
  one_liner?: string;
  doc_number?: string;
  photo_url?: string;
  make?: string;
  terminal_type?: TerminalType;
  operational_mode?: string[];
  data?: Partial<EquipmentData>;
}
