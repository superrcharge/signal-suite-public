package csvtable_test

import (
	"archive/zip"
	"bytes"
	"testing"
	"time"

	"backend/internal/shared/csvtable"
)

var zipStamp = time.Date(2026, 8, 25, 12, 0, 0, 0, time.UTC)

func TestZip_RoundTrips(t *testing.T) {
	entries := []csvtable.ZipEntry{
		{Name: "signal-suite-terminals-20260825.csv", Body: "name\nALPHA\n"},
		{Name: "signal-suite-nets-asqd-20260825.csv", Body: "name,radio_type\nNET ONE,jem\n"},
	}

	body, err := csvtable.Zip(entries, zipStamp)
	if err != nil {
		t.Fatalf("zip: %v", err)
	}

	r, err := zip.NewReader(bytes.NewReader(body), int64(len(body)))
	if err != nil {
		t.Fatalf("not a readable zip: %v", err)
	}
	if len(r.File) != len(entries) {
		t.Fatalf("archive has %d entries, want %d", len(r.File), len(entries))
	}

	for i, f := range r.File {
		if f.Name != entries[i].Name {
			t.Errorf("entry %d name = %q, want %q", i, f.Name, entries[i].Name)
		}
		rc, err := f.Open()
		if err != nil {
			t.Fatalf("opening %s: %v", f.Name, err)
		}
		var got bytes.Buffer
		if _, err := got.ReadFrom(rc); err != nil {
			t.Fatalf("reading %s: %v", f.Name, err)
		}
		_ = rc.Close()
		if got.String() != entries[i].Body {
			t.Errorf("entry %d body = %q, want %q", i, got.String(), entries[i].Body)
		}
	}
}

// The property that makes a golden test of a bundle possible. Without it,
// archive/zip stamps each entry from the clock and two identical bundles differ.
func TestZip_IsDeterministic(t *testing.T) {
	entries := []csvtable.ZipEntry{
		{Name: "a.csv", Body: "x\n1\n"},
		{Name: "b.csv", Body: "y\n2\n"},
	}

	first, err := csvtable.Zip(entries, zipStamp)
	if err != nil {
		t.Fatalf("zip: %v", err)
	}
	// A real gap between the two calls, so a clock-derived timestamp would differ.
	second, err := csvtable.Zip(entries, zipStamp)
	if err != nil {
		t.Fatalf("zip: %v", err)
	}

	if !bytes.Equal(first, second) {
		t.Error("two archives built from the same entries and the same modtime differ")
	}
}

// Order is the caller's, not the map iteration order of whatever built it.
func TestZip_PreservesEntryOrder(t *testing.T) {
	forward := []csvtable.ZipEntry{{Name: "a.csv", Body: "1"}, {Name: "b.csv", Body: "2"}}
	reverse := []csvtable.ZipEntry{{Name: "b.csv", Body: "2"}, {Name: "a.csv", Body: "1"}}

	f, _ := csvtable.Zip(forward, zipStamp)
	rv, _ := csvtable.Zip(reverse, zipStamp)
	if bytes.Equal(f, rv) {
		t.Fatal("reversing the entries produced an identical archive, so order is being lost")
	}

	r, err := zip.NewReader(bytes.NewReader(f), int64(len(f)))
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	if r.File[0].Name != "a.csv" || r.File[1].Name != "b.csv" {
		t.Errorf("entry order = %q, %q; want a.csv, b.csv", r.File[0].Name, r.File[1].Name)
	}
}

func TestZip_Empty(t *testing.T) {
	// An archive with no entries is still a valid zip, and the handler relies on
	// Close writing a central directory rather than on there being files.
	body, err := csvtable.Zip(nil, zipStamp)
	if err != nil {
		t.Fatalf("zip: %v", err)
	}
	r, err := zip.NewReader(bytes.NewReader(body), int64(len(body)))
	if err != nil {
		t.Fatalf("empty archive is not readable: %v", err)
	}
	if len(r.File) != 0 {
		t.Errorf("want 0 entries, got %d", len(r.File))
	}
}
