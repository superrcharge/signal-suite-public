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
)
