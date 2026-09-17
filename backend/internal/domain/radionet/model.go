// Package radionet owns the Nets library -- the reusable catalogue of radio
// nets (name, net ID, TX/RX frequencies) that channel plans assign to wheel
// positions.
//
// The package is named radionet rather than net so it does not shadow the
// standard library's net package. The table, API path, and UI all say "nets".
package radionet

import "time"

// Frequency units a net can be expressed in. This mirrors the MHz/GHz toggle
// used by equipment.data.bands[].freq_unit so both read the same on a sheet.
const (
	FreqUnitMHz = "MHz"
	FreqUnitGHz = "GHz"
)

// ValidFreqUnits is the closed set accepted by create and update.
var ValidFreqUnits = []string{FreqUnitMHz, FreqUnitGHz}

// IsValidFreqUnit reports whether u is one of ValidFreqUnits. The comparison is
// case-sensitive: "mhz" is rejected so the stored value renders consistently on
// a printed wheel.
func IsValidFreqUnit(u string) bool {
	for _, v := range ValidFreqUnits {
		if v == u {
			return true
		}
	}
	return false
}

// Which radio carries a net. RadioTypeBoth is a real answer, not a default of
// last resort -- a net that genuinely runs on both radios must not have to exist
// twice in the library.
const (
	RadioTypeJEM  = "jem"
	RadioTypeMPU5 = "mpu5"
	RadioTypeBoth = "both"
)

// ValidRadioTypes is the closed set accepted by create and update.
var ValidRadioTypes = []string{RadioTypeJEM, RadioTypeMPU5, RadioTypeBoth}

func IsValidRadioType(t string) bool {
	for _, v := range ValidRadioTypes {
		if v == t {
			return true
		}
	}
	return false
}

// CarriedBy reports whether a net of this radio type belongs on the given
// radio's wheel. A "both" net belongs on either.
func CarriedBy(netRadioType, radio string) bool {
	return netRadioType == RadioTypeBoth || netRadioType == radio
}

// Net is a single entry in the Nets library.
//
// TxFreq and RxFreq are freeform strings rather than numerics. A net is recorded
// as a range or a placeholder word at least as often as a single figure, and a
// numeric column would reject the majority of real entries. Both share one
// FreqUnit -- a net does not transmit in MHz and receive in GHz.
type Net struct {
	ID string
	// Owning squadron. Nets are a per-squadron library, not a global pool:
	// several squadrons commonly run a net of the same name on different
	// frequencies, and one editing it must not change another's.
	Section   string
	Name      string
	NetID     string
	RadioType string
	TxFreq    string
	RxFreq    string
	FreqUnit  string
	// Carried over IP rather than RF alone.
	ROIP        bool
	Description string
	Notes       string
	CreatedBy   string
	UpdatedBy   string
	CreatedAt   time.Time
	UpdatedAt   time.Time
}
