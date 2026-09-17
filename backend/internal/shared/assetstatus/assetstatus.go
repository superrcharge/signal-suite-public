// Package assetstatus owns the operational status vocabulary that the terminal
// and kit domains share.
//
// The two domains used to declare these seven values independently, with a
// comment in each saying the duplication was deliberate so that kit-specific
// statuses could be introduced later. An earlier issue settled that question the other
// way: kits and terminals carry the same statuses, permanently. Once divergence
// was ruled out the duplication had no remaining justification, and it was
// pure drift risk - nothing compared the two lists, so they matched only for
// as long as everyone remembered to edit both.
//
// Everything here derives from Valid, so a value is added or removed in exactly
// one place. The one thing that cannot derive from it is the `validate:"oneof=..."`
// struct tag on the request DTOs, because Go struct tags are compile-time
// literals; assetstatus_test.go reflects over those tags and fails if they drift
// from Valid.
//
// A future domain that genuinely needs a different set declares its own rather
// than editing this one. This package is the shared vocabulary, not a registry
// of every status in the system.
package assetstatus

import "strings"

// The seven operational statuses, in display order: the three plain states
// first, then the three ALERT variants, then INOP.
const (
	Available  = "available"
	Alert      = "alert"
	AlertBlue  = "alert-blue"
	AlertGreen = "alert-green"
	OnMission  = "on-mission"
	Reserved   = "reserved"
	Inop       = "inop"
)

// Valid is the closed set, in the order the CSV template and the API
// documentation list them. It is the single source every other value in this
// package is built from.
var Valid = []string{
	Available,
	Alert,
	AlertBlue,
	AlertGreen,
	OnMission,
	Reserved,
	Inop,
}

// Default is the status a record takes when none is supplied.
const Default = Available

// OneOfTag is the space-separated form that go-playground/validator expects
// after `oneof=`. It exists so the DTO struct-tag test has something to compare
// against; the tags themselves must stay literals.
var OneOfTag = strings.Join(Valid, " ")

// Message is the validation error returned when a status falls outside Valid.
// Both domains register it for the "oneof" rule on their Status field.
func Message() string {
	return "status must be one of: " + strings.Join(Valid, ", ")
}

// CSVNote is the help text shown in the CSV import template header and in the
// generated frontend column metadata.
func CSVNote() string {
	return "Status: " + strings.Join(Valid, " | ")
}
