export interface Waveform {
  id: string;
  abbrev: string;
  name: string;
  description: string;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export interface ListWaveformsResponse {
  waveforms: Waveform[];
  total: number;
}

export interface CreateWaveformRequest {
  abbrev: string;
  name?: string;
  description?: string;
}

export interface UpdateWaveformRequest {
  abbrev?: string;
  name?: string;
  description?: string;
}
