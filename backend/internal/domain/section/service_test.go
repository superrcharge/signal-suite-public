package section

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"testing"

	"backend/internal/domain/section/dto"
)

// TestSlugifyKey pins the backend half of a rule that is stated in two
// languages and has to agree in both: labelToKey in terminal-drawer.tsx, copied
// verbatim into kit-drawer.tsx, is
//
//	label.trim().toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '')
//
// The Go used to stop after the whitespace collapse while its comment already
// claimed parity, so "R&D" slugified to "rd" in the browser and "r&d" through
// the API. Every case below is written so it would have failed against that.
func TestSlugifyKey(t *testing.T) {
	tests := []struct {
		name string
		raw  string
		want string
	}{
		{"seed shape", "H SQD", "hsqd"},
		{"already a key", "hq", "hq"},
		{"ampersand is dropped, not kept", "R&D", "rd"},
		{"lowercase ampersand too", "r&d", "rd"},
		{"slash cannot reach a URL path", "A/B", "ab"},
		{"hash cannot truncate a URL", "C#D", "cd"},
		{"hyphen goes, matching migration 012", "a-sqd", "asqd"},
		{"leading and trailing space", "  HQ  ", "hq"},
		{"runs of whitespace collapse away", "A\t\n SQD", "asqd"},
		{"digits survive", "1ST SQD", "1stsqd"},
		{"non-ascii is dropped", "SÉCTION", "sction"},
		{"nothing alphanumeric", "&&&", ""},
		{"whitespace only", "   ", ""},
		{"empty", "", ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := slugifyKey(tt.raw); got != tt.want {
				t.Errorf("slugifyKey(%q) = %q, want %q", tt.raw, got, tt.want)
			}
		})
	}
}

// A key is a primary key. An input that slugifies to nothing has to be refused
// at the door rather than written as a blank row, which is what the guard in
// CreateSection uses this for.
func TestSlugifyKeyEmptyIsRejectable(t *testing.T) {
	for _, raw := range []string{"", "   ", "&&&", "---", "!@#$%"} {
		if got := slugifyKey(raw); got != "" {
			t.Errorf("slugifyKey(%q) = %q, want %q so CreateSection can reject it", raw, got, "")
		}
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// DeleteSection and a squadron's planning data.
//
// Nets and the five PACE tables foreign-key sections with no ON DELETE rule,
// and the delete used to reassign terminals and kits first and only then hit
// those keys: a 500, with the terminals and kits already moved and the section
// still standing. The refusal now comes first, and these pin both halves -
// that it refuses, and that it refuses before moving anything.
// ─────────────────────────────────────────────────────────────────────────────

type fakeRepo struct{ deleted []string }

func (f *fakeRepo) Create(context.Context, *Section) error { return nil }
func (f *fakeRepo) FindByKey(_ context.Context, key string) (*Section, error) {
	return &Section{Key: key, Label: strings.ToUpper(key)}, nil
}
func (f *fakeRepo) FindAll(context.Context) ([]*Section, error) { return nil, nil }
func (f *fakeRepo) Update(context.Context, *Section) error      { return nil }
func (f *fakeRepo) Delete(_ context.Context, key string) error {
	f.deleted = append(f.deleted, key)
	return nil
}

type fakeTerminals struct {
	count int
	moved []string
}

func (f *fakeTerminals) CountTerminalsInSection(context.Context, string) (int, error) {
	return f.count, nil
}
func (f *fakeTerminals) ReassignTerminalsToSection(_ context.Context, from, to string) (int, error) {
	f.moved = append(f.moved, from+"->"+to)
	return f.count, nil
}

type fakeNets struct {
	count int
	err   error
}

func (f fakeNets) CountNetsInSection(context.Context, string) (int, error) { return f.count, f.err }

type fakePace struct {
	has bool
	err error
}

func (f fakePace) SectionHasPaceData(context.Context, string) (bool, error) { return f.has, f.err }

func deleteHarness(nets fakeNets, pace fakePace) (*Service, *fakeRepo, *fakeTerminals) {
	repo := &fakeRepo{}
	terms := &fakeTerminals{count: 2}
	s := NewService(repo)
	s.SetReassigner(terms)
	s.SetNetCounter(nets)
	s.SetPaceChecker(pace)
	return s, repo, terms
}

// A reassign target is given in every case, and the delete is still refused:
// planning data is not something a delete can move.
func deleteToBSqd(s *Service) (int, error) {
	req := &dto.DeleteSectionRequest{Key: "asqd", ReassignTo: "bsqd"}
	return s.DeleteSection(context.Background(), req, &dto.DeleteSectionResponse{})
}

func TestDeleteSectionRefusesPlanningData(t *testing.T) {
	cases := []struct {
		name          string
		nets          fakeNets
		pace          fakePace
		wantInMessage string
	}{
		{"nets", fakeNets{count: 3}, fakePace{}, "still has 3 nets;"},
		{"one net reads as singular", fakeNets{count: 1}, fakePace{}, "still has 1 net;"},
		{"a saved PACE card", fakeNets{}, fakePace{has: true}, "still has a saved PACE card;"},
		{"both", fakeNets{count: 2}, fakePace{has: true}, "still has 2 nets and a saved PACE card;"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s, repo, terms := deleteHarness(tc.nets, tc.pace)

			status, err := deleteToBSqd(s)

			if status != http.StatusConflict {
				t.Fatalf("status = %d, want 409", status)
			}
			var coded *Error
			if !errors.As(err, &coded) || coded.Code != ErrSectionHasPlanning.Code {
				t.Fatalf("err = %v, want code %s", err, ErrSectionHasPlanning.Code)
			}
			if !strings.Contains(coded.Message, tc.wantInMessage) {
				t.Errorf("message = %q, want it to contain %q", coded.Message, tc.wantInMessage)
			}
			// The property the old code lacked.
			if len(terms.moved) != 0 {
				t.Errorf("terminals were moved before the refusal: %v", terms.moved)
			}
			if len(repo.deleted) != 0 {
				t.Errorf("section was deleted: %v", repo.deleted)
			}
		})
	}
}

// A lookup that failed has not established that the section is empty, so it
// must not be read as permission. Same choice as the waveform and net guards.
func TestDeleteSectionPlanningLookupFailureMovesNothing(t *testing.T) {
	cases := map[string]struct {
		nets fakeNets
		pace fakePace
	}{
		"nets lookup fails": {nets: fakeNets{err: errors.New("db down")}},
		"PACE lookup fails": {pace: fakePace{err: errors.New("db down")}},
	}

	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			s, repo, terms := deleteHarness(tc.nets, tc.pace)

			status, _ := deleteToBSqd(s)

			if status != http.StatusInternalServerError {
				t.Errorf("status = %d, want 500", status)
			}
			if len(terms.moved) != 0 || len(repo.deleted) != 0 {
				t.Errorf("moved %v, deleted %v; want nothing touched", terms.moved, repo.deleted)
			}
		})
	}
}

// The control: with no planning data the delete still reassigns and deletes
// exactly as before, so the new check refuses only what it should.
func TestDeleteSectionWithoutPlanningDataStillReassigns(t *testing.T) {
	s, repo, terms := deleteHarness(fakeNets{}, fakePace{})

	status, err := deleteToBSqd(s)

	if status != http.StatusOK || err != nil {
		t.Fatalf("status = %d, err = %v; want 200", status, err)
	}
	if len(terms.moved) != 1 || terms.moved[0] != "asqd->bsqd" {
		t.Errorf("moved = %v, want [asqd->bsqd]", terms.moved)
	}
	if len(repo.deleted) != 1 || repo.deleted[0] != "asqd" {
		t.Errorf("deleted = %v, want [asqd]", repo.deleted)
	}
}
