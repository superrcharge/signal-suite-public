package assetstatus_test

import (
	"reflect"
	"slices"
	"strings"
	"testing"

	"backend/internal/shared/assetstatus"

	kitdto "backend/internal/domain/kit/dto"
	terminaldto "backend/internal/domain/terminal/dto"
)

// TestStatusOneOfTagsMatchValid is the guard that the rest of the package
// cannot provide for itself.
//
// Every other consumer of the status set derives from assetstatus.Valid, so it
// cannot disagree with it. The `validate:"oneof=..."` struct tags are the one
// exception: Go struct tags are compile-time literals, so they are hand-typed
// copies of the same list. They are also the actual runtime gate for the JSON
// API - a value missing from a tag is rejected by the API however valid the
// rest of the system considers it, and a value present in a tag but absent from
// Valid is accepted by the API and then rejected by CSV import. Either way the
// two halves of the same domain answer differently for the same input, with
// nothing to announce it.
func TestStatusOneOfTagsMatchValid(t *testing.T) {
	cases := []struct {
		name string
		typ  reflect.Type
	}{
		{"kit create", reflect.TypeOf(kitdto.CreateKitRequest{})},
		{"kit update", reflect.TypeOf(kitdto.UpdateKitRequest{})},
		{"terminal create", reflect.TypeOf(terminaldto.CreateTerminalRequest{})},
		{"terminal update", reflect.TypeOf(terminaldto.UpdateTerminalRequest{})},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			field, ok := tc.typ.FieldByName("Status")
			if !ok {
				t.Fatalf("%s has no Status field", tc.typ.Name())
			}

			got, ok := oneOfValues(field.Tag.Get("validate"))
			if !ok {
				t.Fatalf("%s Status has no oneof= in its validate tag: %q",
					tc.typ.Name(), field.Tag.Get("validate"))
			}

			if !slices.Equal(got, assetstatus.Valid) {
				t.Errorf("%s Status oneof tag has drifted from assetstatus.Valid\n got: %v\nwant: %v",
					tc.typ.Name(), got, assetstatus.Valid)
			}
		})
	}
}

// oneOfValues pulls the space-separated values out of the `oneof=` rule of a
// go-playground/validator tag, e.g. "omitempty,oneof=a b c" -> ["a","b","c"].
func oneOfValues(tag string) ([]string, bool) {
	for _, rule := range strings.Split(tag, ",") {
		if after, found := strings.CutPrefix(rule, "oneof="); found {
			return strings.Fields(after), true
		}
	}
	return nil, false
}

// TestMessage pins the validation error wording. kit/validation_test.go asserts
// the full string independently; this is here so a change to Message() names
// this package as the cause rather than surfacing only as a kit test failure.
func TestMessage(t *testing.T) {
	want := "status must be one of: available, alert, alert-blue, alert-green, on-mission, reserved, inop"
	if got := assetstatus.Message(); got != want {
		t.Errorf("Message()\n got: %q\nwant: %q", got, want)
	}
}

// TestCSVNote pins the CSV template help text. It is copied into the generated
// frontend column metadata, so a change here requires regenerating
// frontend/src/generated/csv-columns.ts.
func TestCSVNote(t *testing.T) {
	want := "Status: available | alert | alert-blue | alert-green | on-mission | reserved | inop"
	if got := assetstatus.CSVNote(); got != want {
		t.Errorf("CSVNote()\n got: %q\nwant: %q", got, want)
	}
}

// TestOneOfTag checks the space-separated form the struct tags are written
// from, so the value the tag test compares against is itself pinned.
func TestOneOfTag(t *testing.T) {
	want := "available alert alert-blue alert-green on-mission reserved inop"
	if assetstatus.OneOfTag != want {
		t.Errorf("OneOfTag\n got: %q\nwant: %q", assetstatus.OneOfTag, want)
	}
}
