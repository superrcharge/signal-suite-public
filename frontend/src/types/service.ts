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
}

export interface UpdateServiceRequest {
  abbrev?: string;
  name?: string;
  description?: string;
}
