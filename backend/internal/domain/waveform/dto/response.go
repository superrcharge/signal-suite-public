package dto

type WaveformResponse struct {
	ID          string `json:"id"`
	Abbrev      string `json:"abbrev"`
	Name        string `json:"name"`
	Description string `json:"description"`
	CreatedBy   string `json:"created_by"`
	UpdatedBy   string `json:"updated_by"`
	CreatedAt   string `json:"created_at"`
	UpdatedAt   string `json:"updated_at"`
}

type CreateWaveformResponse struct {
	Waveform WaveformResponse `json:"waveform"`
}

type UpdateWaveformResponse struct {
	Waveform WaveformResponse `json:"waveform"`
}

type ListWaveformsResponse struct {
	Waveforms []WaveformResponse `json:"waveforms"`
	Total     int                `json:"total"`
}

// UsageResponse maps a normalised abbrev to the assets carrying it.
//
// Keys are lowercased and trimmed, matching the library's uniqueness index and
// the compatibility matrix's own normalisation. An abbrev nothing carries is
// ABSENT rather than present-and-empty, which is the contract's rule - a reader
// must treat a missing key as zero, never as "not loaded yet".
type UsageResponse struct {
	Usage map[string][]string `json:"usage"`
	// Entries carried by at least one asset. Not the library size, which the
	// list endpoint already reports.
	Total int `json:"total"`
}
