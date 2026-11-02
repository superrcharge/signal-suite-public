package equipment

import "net/http"

type Error struct {
	Code    string
	Message string
	Status  int
}

func (e *Error) Error() string   { return e.Message }
func (e *Error) GetCode() string { return e.Code }
func (e *Error) GetStatus() int  { return e.Status }

var (
	ErrEquipmentNotFound      = &Error{Code: "EQUIPMENT_NOT_FOUND", Message: "equipment not found", Status: http.StatusNotFound}
	ErrEquipmentIDExists      = &Error{Code: "EQUIPMENT_ID_EXISTS", Message: "equipment with this ID already exists", Status: http.StatusConflict}
	ErrEquipmentInternalError = &Error{Code: "EQUIPMENT_INTERNAL_ERROR", Message: "internal server error", Status: http.StatusInternalServerError}

	// ErrRadioScopeOnly is returned to a scoped radio writer (the rto role)
	// that targets a satcom record, or tries to move a record across the
	// satcom/radio boundary. RequireRole cannot express this because
	// terminal_type is a column, not a route.
	ErrRadioScopeOnly = &Error{Code: "EQUIPMENT_RADIO_SCOPE_ONLY", Message: "your role can only modify radio equipment", Status: http.StatusForbidden}

	// The photo errors are coded so each reaches the user as its own message.
	// A bare errors.New renders as "internal server error" through the shared
	// envelope whatever status it is sent with, which is how a dev box with no
	// storage showed a 501 as a server fault.
	ErrPhotoStorageNotConfigured = &Error{Code: "EQUIPMENT_PHOTO_STORAGE_NOT_CONFIGURED", Message: "photo storage is not configured on this server", Status: http.StatusNotImplemented}
	ErrNoPhoto                   = &Error{Code: "EQUIPMENT_NO_PHOTO", Message: "this equipment record has no photo", Status: http.StatusNotFound}
	ErrPhotoFieldRequired        = &Error{Code: "EQUIPMENT_PHOTO_REQUIRED", Message: "no photo file was sent", Status: http.StatusBadRequest}
	ErrPhotoUnsupportedType      = &Error{Code: "EQUIPMENT_PHOTO_UNSUPPORTED_TYPE", Message: "unsupported image type; use JPEG, PNG, or WebP", Status: http.StatusBadRequest}
)
