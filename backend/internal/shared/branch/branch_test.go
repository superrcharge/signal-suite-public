package branch

import (
	"reflect"
	"testing"
)

func TestValid(t *testing.T) {
	want := []string{"USA", "USMC", "USN", "USAF", "USSF", "USCG", "OGA"}
	if !reflect.DeepEqual(Valid, want) {
		t.Fatalf("Valid = %v, want %v", Valid, want)
	}
}

func TestNormalise(t *testing.T) {
	tests := []struct {
		name        string
		in          []string
		wantBr      []string
		wantUnknown []string
	}{
		{"aliases to USA", []string{"ARMY", "arng"}, []string{"USA"}, nil},
		{"ANG to USAF", []string{"ANG"}, []string{"USAF"}, nil},
		{"marine corps", []string{"marine corps"}, []string{"USMC"}, nil},
		{"dedupe", []string{"USN", "navy", "us navy", "usn"}, []string{"USN"}, nil},
		{"precedence order", []string{"OGA", "USAF", "USA", "USMC"}, []string{"USA", "USMC", "USAF", "OGA"}, nil},
		{"unknown in input order", []string{"USA", "socom", " Foo ", "bar"}, []string{"USA"}, []string{"socom", "Foo", "bar"}},
		{"blanks ignored", []string{"", "  ", "USCG"}, []string{"USCG"}, nil},
		{"empty", nil, []string{}, nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			br, unk := Normalise(tt.in)
			if !reflect.DeepEqual(br, tt.wantBr) {
				t.Errorf("branches = %v, want %v", br, tt.wantBr)
			}
			if !reflect.DeepEqual(unk, tt.wantUnknown) {
				t.Errorf("unknown = %v, want %v", unk, tt.wantUnknown)
			}
		})
	}
}

func TestNormaliseOne(t *testing.T) {
	tests := []struct {
		in     string
		want   string
		wantOK bool
	}{
		{"USN", "USN", true},
		{" usaf ", "USAF", true},
		{"coast guard", "USCG", true},
		{"SOCOM", "SOCOM", false},
		{"", "", false},
		{"   ", "", false},
	}
	for _, tt := range tests {
		got, ok := NormaliseOne(tt.in)
		if got != tt.want || ok != tt.wantOK {
			t.Errorf("NormaliseOne(%q) = %q, %v; want %q, %v", tt.in, got, ok, tt.want, tt.wantOK)
		}
	}
}
