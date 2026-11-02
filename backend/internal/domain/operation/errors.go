package operation

import (
	"net/http"
	"strings"
)

// Error is the domain's coded error, satisfying response.CodedError so the
// shared envelope renders a real code and message rather than INTERNAL_ERROR.
type Error struct {
	Code    string
	Message string
	Status  int
}

func (e *Error) Error() string   { return e.Message }
func (e *Error) GetCode() string { return e.Code }
func (e *Error) GetStatus() int  { return e.Status }

var (
	ErrOperationNotFound = &Error{
		Code:    "OPERATION_NOT_FOUND",
		Message: "operation not found",
		Status:  http.StatusNotFound,
	}
	ErrOperationNameExists = &Error{
		Code:    "OPERATION_NAME_EXISTS",
		Message: "an operation with that name already exists",
		Status:  http.StatusConflict,
	}
	ErrOperationInvalidStatus = &Error{
		Code:    "OPERATION_INVALID_STATUS",
		Message: "status must be one of planning, active, complete",
		Status:  http.StatusBadRequest,
	}
	ErrOperationInvalidDates = &Error{
		Code:    "OPERATION_INVALID_DATES",
		Message: "dates must be YYYY-MM-DD, and the end date must not be before the start date",
		Status:  http.StatusBadRequest,
	}
	ErrParticipantNotFound = &Error{
		Code:    "PARTICIPANT_NOT_FOUND",
		Message: "that organization is not checked in to this operation",
		Status:  http.StatusNotFound,
	}
	ErrParticipantUnknownOrganization = &Error{
		Code:    "PARTICIPANT_UNKNOWN_ORGANIZATION",
		Message: "organization does not exist",
		Status:  http.StatusBadRequest,
	}
	// The row changed under the editor, or was removed, between the read the
	// client is working from and this write. Refusing is the only safe answer:
	// a PUT replaces all four lists, so saving over a newer row would silently
	// discard whoever got there first.
	ErrParticipantStale = &Error{
		Code:    "PARTICIPANT_STALE",
		Message: "this check-in was changed by someone else; reload it and try again",
		Status:  http.StatusConflict,
	}
	ErrParticipantIdentityRequired = &Error{
		Code:    "PARTICIPANT_IDENTITY_REQUIRED",
		Message: "name a library organization or an ad hoc one, not both and not neither",
		Status:  http.StatusBadRequest,
	}
	ErrParticipantAdhocNameExists = &Error{
		Code:    "PARTICIPANT_ADHOC_NAME_EXISTS",
		Message: "an ad hoc organization with that name is already checked in to this operation",
		Status:  http.StatusConflict,
	}
	ErrParticipantInvalidBranch = &Error{
		Code:    "PARTICIPANT_INVALID_BRANCH",
		Message: "branch must be one of USA, USMC, USN, USAF, USSF, USCG, OGA",
		Status:  http.StatusBadRequest,
	}
	ErrOperationPhasesRequired = &Error{
		Code:    "OPERATION_PHASES_REQUIRED",
		Message: "an operation needs at least one phase",
		Status:  http.StatusBadRequest,
	}
	ErrOperationPhaseNameInvalid = &Error{
		Code:    "OPERATION_PHASE_NAME_INVALID",
		Message: "a phase name must be 1 to 60 characters",
		Status:  http.StatusBadRequest,
	}
	ErrOperationPhaseNameExists = &Error{
		Code:    "OPERATION_PHASE_NAME_EXISTS",
		Message: "two phases have the same name",
		Status:  http.StatusConflict,
	}
	ErrOperationSiteNameInvalid = &Error{
		Code:    "OPERATION_SITE_NAME_INVALID",
		Message: "a site name must be 1 to 60 characters",
		Status:  http.StatusBadRequest,
	}
	ErrOperationSiteNameExists = &Error{
		Code:    "OPERATION_SITE_NAME_EXISTS",
		Message: "two sites have the same name",
		Status:  http.StatusConflict,
	}
	ErrOperationRequirementSelf = &Error{
		Code:    "OPERATION_REQUIREMENT_SELF",
		Message: "a requirement needs two different participants",
		Status:  http.StatusBadRequest,
	}
	ErrOperationInternalError = &Error{
		Code:    "OPERATION_INTERNAL_ERROR",
		Message: "internal server error",
		Status:  http.StatusInternalServerError,
	}
)

// ErrParticipantUnknownWaveform names the abbrevs the library does not declare,
// in platform.ErrPlatformUnknownWaveform's shape: refusing without saying which
// name was wrong is useless on a check-in carrying eight of them. 400 rather
// than 409 - a malformed request, not a conflict with existing state.
func ErrParticipantUnknownWaveform(abbrevs []string) *Error {
	return &Error{
		Code:    "PARTICIPANT_UNKNOWN_WAVEFORM",
		Message: "not in the waveform library: " + strings.Join(abbrevs, ", "),
		Status:  http.StatusBadRequest,
	}
}

// ErrOperationUnknownPhase names the phase ids that are not phases of this
// operation. 400 rather than 404: the operation exists, the request is wrong.
func ErrOperationUnknownPhase(ids []string) *Error {
	return &Error{
		Code:    "OPERATION_UNKNOWN_PHASE",
		Message: "not a phase of this operation: " + strings.Join(ids, ", "),
		Status:  http.StatusBadRequest,
	}
}

// ErrParticipantUnknownAsset names the asset ids in asset_phases that the
// check-in does not bring. An asset can only be placed in a phase if it is in
// one of the participant's platform, equipment or transport lists.
func ErrParticipantUnknownAsset(ids []string) *Error {
	return &Error{
		Code:    "PARTICIPANT_UNKNOWN_ASSET",
		Message: "not brought by this check-in: " + strings.Join(ids, ", "),
		Status:  http.StatusBadRequest,
	}
}

// ErrOperationUnknownSite names the site ids that are not sites of this
// operation. 400 for the reason ErrOperationUnknownPhase is.
func ErrOperationUnknownSite(ids []string) *Error {
	return &Error{
		Code:    "OPERATION_UNKNOWN_SITE",
		Message: "not a site of this operation: " + strings.Join(ids, ", "),
		Status:  http.StatusBadRequest,
	}
}

// The RFI board's errors. See rfis.go.
var (
	ErrRFINotFound = &Error{
		Code:    "RFI_NOT_FOUND",
		Message: "RFI not found",
		Status:  http.StatusNotFound,
	}
	ErrRFIQuestionInvalid = &Error{
		Code:    "RFI_QUESTION_INVALID",
		Message: "an RFI question must be 1 to 2000 characters",
		Status:  http.StatusBadRequest,
	}
	ErrRFICommentInvalid = &Error{
		Code:    "RFI_COMMENT_INVALID",
		Message: "a reply must be 1 to 2000 characters",
		Status:  http.StatusBadRequest,
	}
	ErrRFIResolved = &Error{
		Code:    "RFI_RESOLVED",
		Message: "this RFI is already resolved",
		Status:  http.StatusConflict,
	}
	ErrRFINotPoster = &Error{
		Code:    "RFI_NOT_POSTER",
		Message: "only the person who posted an RFI can resolve it",
		Status:  http.StatusForbidden,
	}
)
