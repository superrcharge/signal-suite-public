/**
 * A Services Library entry - the global, shared definition of a SATCOM service.
 *
 * The per-terminal copy is `EquipmentService` in ./equipment, which carries the
 * same abbrev/name/description plus the rates that differ terminal to terminal.
 * Same split as Waveform / EquipmentWaveform.
 */
export interface Service {
  id: string;
  abbrev: string;
  name: string;
  description: string;
  /** Ultimate controlling parent of the operator. The operator itself stays the prefix of `name`. */
  owned_by: string;
  /** Country the owner is headquartered in. */
  owner_country: string;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export interface ListServicesResponse {
  services: Service[];
  total: number;
}

export interface CreateServiceRequest {
  abbrev: string;
  name?: string;
  description?: string;
  owned_by?: string;
  owner_country?: string;
}

export interface UpdateServiceRequest {
  abbrev?: string;
  name?: string;
  description?: string;
  owned_by?: string;
  owner_country?: string;
}
