package pace

import "net/http"

// Error is the domain's coded error, satisfying response.CodedError so the
// shared envelope renders a real code rather than falling through to
// INTERNAL_ERROR.
type Error struct {
	Code    string
	Message string
	Status  int
}

func (e *Error) Error() string   { return e.Message }
func (e *Error) GetCode() string { return e.Code }
func (e *Error) GetStatus() int  { return e.Status }

// Is matches on Code rather than on identity, so a message specialised with the
// offending tier still satisfies errors.Is against the package-level sentinel.
// Without it, naming the tier would silently break every caller and test that
// compares to ErrTierMissingRef -- the specialised value is a different pointer.
func (e *Error) Is(target error) bool {
	t, ok := target.(*Error)
	return ok && t.Code == e.Code
}

var (
	ErrSectionNotFound = &Error{
		Code:    "PACE_SECTION_NOT_FOUND",
		Message: "section not found",
		Status:  http.StatusNotFound,
	}
	ErrInvalidRadio = &Error{
		Code:    "PACE_INVALID_RADIO",
		Message: "radio must be jem or mpu5",
		Status:  http.StatusBadRequest,
	}
	ErrChannelOutOfRange = &Error{
		Code:    "PACE_CHANNEL_OUT_OF_RANGE",
		Message: "channel number is outside the plan's channel count",
		Status:  http.StatusBadRequest,
	}
	ErrDuplicateChannel = &Error{
		Code:    "PACE_DUPLICATE_CHANNEL",
		Message: "the same channel was assigned more than once",
		Status:  http.StatusBadRequest,
	}
	// Two plans for one wheel resolve to the same row, and the second one's
	// write clears the first one's channels. Refusing is the only honest answer:
	// there is no way to tell which of the two the client meant to keep.
	ErrDuplicateRadio = &Error{
		Code:    "PACE_DUPLICATE_RADIO",
		Message: "the same radio was sent more than once",
		Status:  http.StatusBadRequest,
	}
	ErrUnknownNet = &Error{
		Code:    "PACE_UNKNOWN_NET",
		Message: "a channel references a net that does not exist",
		Status:  http.StatusBadRequest,
	}
	ErrNetWrongSection = &Error{
		Code:    "PACE_NET_WRONG_SECTION",
		Message: "a channel references a net belonging to another squadron",
		Status:  http.StatusBadRequest,
	}
	ErrNetWrongRadio = &Error{
		Code:    "PACE_NET_WRONG_RADIO",
		Message: "a net was assigned to a radio it is not carried by",
		Status:  http.StatusBadRequest,
	}
	// The tier checks. Every 400 in this domain is a coded error declared here;
	// a bare status renders as INTERNAL_ERROR through the shared envelope.
	ErrInvalidTierSource = &Error{
		Code:    "PACE_INVALID_TIER_SOURCE",
		Message: "tier must be P, A, C or E with a source of equipment, transport, custom or none",
		Status:  http.StatusBadRequest,
	}
	ErrDuplicateTier = &Error{
		Code:    "PACE_DUPLICATE_TIER",
		Message: "the same tier letter was sent more than once",
		Status:  http.StatusBadRequest,
	}
	ErrTierMissingRef = &Error{
		Code:    "PACE_TIER_MISSING_REF",
		Message: "a tier names a source but carries no matching reference",
		Status:  http.StatusBadRequest,
	}
	ErrInvalidHighlight = &Error{
		Code:    "PACE_INVALID_HIGHLIGHT",
		Message: "a changed-mark names a field that cannot carry one",
		Status:  http.StatusBadRequest,
	}
	ErrInvalidDate = &Error{
		Code:    "PACE_INVALID_DATE",
		Message: "effective date must be YYYY-MM-DD",
		Status:  http.StatusBadRequest,
	}
	ErrPaceInternalError = &Error{
		Code:    "PACE_INTERNAL_ERROR",
		Message: "internal server error",
		Status:  http.StatusInternalServerError,
	}
)

// invalidHighlight names the row and the key, for the same reason tierMissingRef
// names the tier: a card has dozens of markable fields, and a bare refusal would
// leave every one of them to be checked by hand.
func invalidHighlight(where, key string) *Error {
	return &Error{
		Code:    ErrInvalidHighlight.Code,
		Message: where + `: "` + key + `" cannot be marked as changed`,
		Status:  ErrInvalidHighlight.Status,
	}
}

// tierMissingRef names the tier and the field the editor is missing.
//
// The bare "a tier names a source but carries no matching reference" is true and
// unusable: there are four tiers and three sources that need a reference, so the
// only way to act on it is to open all four and check each by hand. The check
// already holds both facts at the point it fails; it just threw them away.
//
// The wording is the editor's own. "Label" and "Equipment" are the field labels
// in Section 06 and "Custom" and "Catalog equipment" are the source options, so
// the message names what is on screen rather than the column behind it.
func tierMissingRef(letter, source string) *Error {
	var sourceLabel, field string
	switch source {
	case TierSourceEquipment:
		sourceLabel, field = "Catalog equipment", "Equipment"
	case TierSourceTransport:
		sourceLabel, field = "Transport", "Transport"
	case TierSourceCustom:
		sourceLabel, field = "Custom", "Label"
	default:
		sourceLabel, field = source, "reference"
	}
	return &Error{
		Code:    ErrTierMissingRef.Code,
		Message: "tier " + letter + ": source is \"" + sourceLabel + "\" but " + field + " is empty",
		Status:  ErrTierMissingRef.Status,
	}
}
