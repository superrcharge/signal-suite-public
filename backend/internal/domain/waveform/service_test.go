package waveform

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"testing"

	"backend/internal/domain/waveform/dto"
	"backend/internal/shared/response"
)

// Every domain error must carry a code. A plain errors.New falls through to
// INTERNAL_ERROR, which is how a duplicate abbrev used to report itself as
// "internal server error" while correctly returning 409.
func TestErrorsAreCoded(t *testing.T) {
	tests := []struct {
		err        *Error
		wantCode   string
		wantStatus int
	}{
		{ErrWaveformNotFound, "WAVEFORM_NOT_FOUND", http.StatusNotFound},
		{ErrWaveformAbbrevExists, "WAVEFORM_ABBREV_EXISTS", http.StatusConflict},
		{ErrWaveformInternalError, "WAVEFORM_INTERNAL_ERROR", http.StatusInternalServerError},
		// A constructor rather than a var, because the message names the assets.
		{ErrWaveformInUse(nil), "WAVEFORM_IN_USE", http.StatusConflict},
	}
	for _, tt := range tests {
		var coded response.CodedError = tt.err
		if coded.GetCode() != tt.wantCode {
			t.Errorf("code = %q, want %q", coded.GetCode(), tt.wantCode)
		}
		if coded.GetStatus() != tt.wantStatus {
			t.Errorf("%s status = %d, want %d", tt.wantCode, coded.GetStatus(), tt.wantStatus)
		}
		if coded.Error() == "" {
			t.Errorf("%s has an empty message", tt.wantCode)
		}
	}

	// The envelope must surface the real code, not the INTERNAL_ERROR fallback.
	got := response.Err(ErrWaveformAbbrevExists)
	if got.Error == nil || got.Error.Code != "WAVEFORM_ABBREV_EXISTS" {
		t.Errorf("envelope code = %+v, want WAVEFORM_ABBREV_EXISTS", got.Error)
	}
}

func TestCreateWaveformRejectsDuplicateAbbrev(t *testing.T) {
	repo := &MockRepository{
		AbbrevExistsFunc: func(_ context.Context, _ string) (bool, error) { return true, nil },
	}
	svc := NewService(repo)

	status, err := svc.CreateWaveform(context.Background(),
		&dto.CreateWaveformRequest{Abbrev: "anw2"}, &dto.CreateWaveformResponse{})

	if status != http.StatusConflict || !errors.Is(err, ErrWaveformAbbrevExists) {
		t.Errorf("status = %d, err = %v; want 409 / %v", status, err, ErrWaveformAbbrevExists)
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Assets store a waveform's abbrev as text rather than as a foreign key,
// so nothing in the database refuses a delete or follows a rename. Both guards
// live in the service, and both have to fail closed: a usage lookup that errored
// has not established that the waveform is unused.
// ─────────────────────────────────────────────────────────────────────────────

type mockAssets struct {
	usage       map[string][]string
	usageErr    error
	renameErr   error
	renamedFrom string
	renamedTo   string
	renames     int
}

func (m *mockAssets) WaveformUsage(_ context.Context) (map[string][]string, error) {
	return m.usage, m.usageErr
}

func (m *mockAssets) RenameWaveform(_ context.Context, from, to string) (int, error) {
	m.renames++
	m.renamedFrom, m.renamedTo = from, to
	return 1, m.renameErr
}

func waveformSvc(t *testing.T, existing *Waveform, assets ...*mockAssets) (*Service, *bool, *Waveform) {
	t.Helper()
	deleted := false
	saved := &Waveform{}
	repo := &MockRepository{
		FindByIDFunc:              func(_ context.Context, _ string) (*Waveform, error) { return existing, nil },
		DeleteFunc:                func(_ context.Context, _ string) error { deleted = true; return nil },
		UpdateFunc:                func(_ context.Context, w *Waveform) error { *saved = *w; return nil },
		AbbrevExistsExcludingFunc: func(_ context.Context, _, _ string) (bool, error) { return false, nil },
	}
	svc := NewService(repo)
	for _, a := range assets {
		svc.AddWaveformAssets(a)
	}
	return svc, &deleted, saved
}

func TestDeleteWaveformInUseGuard(t *testing.T) {
	t.Run("refuses a waveform an asset carries, and names the assets", func(t *testing.T) {
		svc, deleted, _ := waveformSvc(t, &Waveform{ID: "w1", Abbrev: "SINCGARS"},
			&mockAssets{usage: map[string][]string{"sincgars": {"AN/PRC-158", "AN/PRC-163"}}})

		status, err := svc.DeleteWaveform(context.Background(), &dto.DeleteWaveformRequest{ID: "w1"})

		if status != http.StatusConflict {
			t.Errorf("status = %d, want 409", status)
		}
		if *deleted {
			t.Error("the row was deleted despite the refusal")
		}
		// The message must say where, not merely refuse. Guarded on nil because a
		// missing error IS the failure this subtest is looking for, and calling
		// Error() on it would panic and take every later subtest with it.
		if err == nil {
			t.Fatal("no error returned; the delete was allowed")
		}
		if !strings.Contains(err.Error(), "AN/PRC-158") || !strings.Contains(err.Error(), "AN/PRC-163") {
			t.Errorf("message does not name the assets: %q", err.Error())
		}
	})

	t.Run("consults every wired domain, not just the first", func(t *testing.T) {
		// The wiring bug this guards: waveforms are carried by equipment AND by
		// platforms, so asking only one lets a carried waveform delete cleanly.
		svc, deleted, _ := waveformSvc(t, &Waveform{ID: "w1", Abbrev: "L16"},
			&mockAssets{usage: map[string][]string{}},
			&mockAssets{usage: map[string][]string{"l16": {"F-35A"}}})

		status, err := svc.DeleteWaveform(context.Background(), &dto.DeleteWaveformRequest{ID: "w1"})

		if status != http.StatusConflict || *deleted {
			t.Errorf("status = %d, deleted = %v; want 409 and no delete", status, *deleted)
		}
		if err == nil {
			t.Fatal("no error returned; the platform's use of it was not seen")
		}
		if !strings.Contains(err.Error(), "F-35A") {
			t.Errorf("message does not name the platform: %q", err.Error())
		}
	})

	t.Run("matches case-insensitively, the way the library is unique", func(t *testing.T) {
		svc, deleted, _ := waveformSvc(t, &Waveform{ID: "w1", Abbrev: "  AnW2 "},
			&mockAssets{usage: map[string][]string{"anw2": {"MPU5"}}})

		status, _ := svc.DeleteWaveform(context.Background(), &dto.DeleteWaveformRequest{ID: "w1"})
		if status != http.StatusConflict || *deleted {
			t.Errorf("status = %d, deleted = %v; want 409 and no delete", status, *deleted)
		}
	})

	t.Run("deletes a waveform nothing carries", func(t *testing.T) {
		svc, deleted, _ := waveformSvc(t, &Waveform{ID: "w1", Abbrev: "UNUSED"},
			&mockAssets{usage: map[string][]string{"sincgars": {"AN/PRC-158"}}})

		status, err := svc.DeleteWaveform(context.Background(), &dto.DeleteWaveformRequest{ID: "w1"})
		if status != http.StatusNoContent || err != nil {
			t.Errorf("status = %d, err = %v; want 204", status, err)
		}
		if !*deleted {
			t.Error("an unused waveform was not deleted")
		}
	})

	t.Run("a usage-lookup failure blocks the delete rather than allowing it", func(t *testing.T) {
		svc, deleted, _ := waveformSvc(t, &Waveform{ID: "w1", Abbrev: "SINCGARS"},
			&mockAssets{usageErr: errors.New("db down")})

		status, _ := svc.DeleteWaveform(context.Background(), &dto.DeleteWaveformRequest{ID: "w1"})
		if status != http.StatusInternalServerError {
			t.Errorf("status = %d, want 500", status)
		}
		if *deleted {
			t.Error("a failed lookup let the delete through; it has not established the waveform is unused")
		}
	})

	t.Run("stays deletable with no asset domain wired", func(t *testing.T) {
		// Every unit test in this package builds a Service without injection.
		svc, deleted, _ := waveformSvc(t, &Waveform{ID: "w1", Abbrev: "SINCGARS"})

		status, _ := svc.DeleteWaveform(context.Background(), &dto.DeleteWaveformRequest{ID: "w1"})
		if status != http.StatusNoContent || !*deleted {
			t.Errorf("status = %d, deleted = %v; want 204 and a delete", status, *deleted)
		}
	})
}

func TestUpdateWaveformCascadesRename(t *testing.T) {
	ptr := func(s string) *string { return &s }

	t.Run("carries the rename to every asset domain", func(t *testing.T) {
		eq := &mockAssets{}
		pf := &mockAssets{}
		svc, _, saved := waveformSvc(t, &Waveform{ID: "w1", Abbrev: "SINCGARS"}, eq, pf)

		status, err := svc.UpdateWaveform(context.Background(),
			&dto.UpdateWaveformRequest{ID: "w1", Abbrev: ptr("SINCGARS-V2")},
			&dto.UpdateWaveformResponse{})

		if status != http.StatusOK || err != nil {
			t.Fatalf("status = %d, err = %v; want 200", status, err)
		}
		for name, a := range map[string]*mockAssets{"equipment": eq, "platform": pf} {
			if a.renames != 1 || a.renamedFrom != "SINCGARS" || a.renamedTo != "SINCGARS-V2" {
				t.Errorf("%s: renames = %d, %q -> %q", name, a.renames, a.renamedFrom, a.renamedTo)
			}
		}
		if saved.Abbrev != "SINCGARS-V2" {
			t.Errorf("library row abbrev = %q, want SINCGARS-V2", saved.Abbrev)
		}
	})

	t.Run("does not cascade a pure case change", func(t *testing.T) {
		// AbbrevExistsExcluding compares on lower(), so a recasing gets this far.
		// Cascading it would rewrite every carrying asset to say what it already says.
		eq := &mockAssets{}
		svc, _, saved := waveformSvc(t, &Waveform{ID: "w1", Abbrev: "sincgars"}, eq)

		status, _ := svc.UpdateWaveform(context.Background(),
			&dto.UpdateWaveformRequest{ID: "w1", Abbrev: ptr("SINCGARS")},
			&dto.UpdateWaveformResponse{})

		if status != http.StatusOK {
			t.Fatalf("status = %d, want 200", status)
		}
		if eq.renames != 0 {
			t.Errorf("renames = %d, want 0 for a case-only change", eq.renames)
		}
		if saved.Abbrev != "SINCGARS" {
			t.Errorf("library row abbrev = %q, want the new casing", saved.Abbrev)
		}
	})

	t.Run("does not rename the library row when a cascade fails", func(t *testing.T) {
		// Carriers first, library row second, precisely so this direction is the
		// recoverable one: the assets still point at a name that exists.
		eq := &mockAssets{renameErr: errors.New("db down")}
		svc, _, saved := waveformSvc(t, &Waveform{ID: "w1", Abbrev: "SINCGARS"}, eq)

		status, _ := svc.UpdateWaveform(context.Background(),
			&dto.UpdateWaveformRequest{ID: "w1", Abbrev: ptr("SINCGARS-V2")},
			&dto.UpdateWaveformResponse{})

		if status != http.StatusInternalServerError {
			t.Errorf("status = %d, want 500", status)
		}
		if saved.Abbrev != "" {
			t.Errorf("the library row was written despite the cascade failing: %q", saved.Abbrev)
		}
	})

	t.Run("leaves a name-only edit alone", func(t *testing.T) {
		eq := &mockAssets{}
		svc, _, _ := waveformSvc(t, &Waveform{ID: "w1", Abbrev: "SINCGARS"}, eq)

		svc.UpdateWaveform(context.Background(),
			&dto.UpdateWaveformRequest{ID: "w1", Name: ptr("Single Channel")},
			&dto.UpdateWaveformResponse{})

		if eq.renames != 0 {
			t.Errorf("renames = %d, want 0 when the abbrev was not touched", eq.renames)
		}
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// The usage readout and the earlier delete guard answer the same question,
// so they read the same merge. Two code paths for one question is the drift
// contracts.WaveformAssets names by hand.
// ─────────────────────────────────────────────────────────────────────────────

func TestWaveformUsageEndpoint(t *testing.T) {
	svc := func(assets ...*mockAssets) *Service {
		s := NewService(&MockRepository{})
		for _, a := range assets {
			s.AddWaveformAssets(a)
		}
		return s
	}

	t.Run("merges every wired provider", func(t *testing.T) {
		s := svc(
			&mockAssets{usage: map[string][]string{"sincgars": {"AN/PRC-158"}, "l16": {"AN/ARC-210"}}},
			&mockAssets{usage: map[string][]string{"l16": {"F-35A"}}},
		)
		resp := &dto.UsageResponse{}

		status, err := s.WaveformUsage(context.Background(), resp)

		if status != http.StatusOK || err != nil {
			t.Fatalf("status = %d, err = %v; want 200", status, err)
		}
		if len(resp.Usage["l16"]) != 2 {
			t.Errorf("l16 = %v; want both the radio and the platform", resp.Usage["l16"])
		}
		if resp.Total != 2 {
			t.Errorf("total = %d, want 2 - entries carried, not library size", resp.Total)
		}
	})

	// The contract's rule. A reader must be able to treat a missing key as zero,
	// which it cannot if "unused" is sometimes an empty list and sometimes absent.
	t.Run("omits an abbrev nothing carries rather than mapping it to empty", func(t *testing.T) {
		s := svc(&mockAssets{usage: map[string][]string{"sincgars": {"AN/PRC-158"}}})
		resp := &dto.UsageResponse{}

		if _, err := s.WaveformUsage(context.Background(), resp); err != nil {
			t.Fatal(err)
		}
		if _, present := resp.Usage["unused"]; present {
			t.Error("an uncarried abbrev is present in the map")
		}
	})

	/**
	 * The reason usageFor was refactored onto usageMap. If these two ever
	 * disagree, the pane shows one answer and the delete guard enforces another.
	 */
	t.Run("agrees with the delete guard, key for key", func(t *testing.T) {
		assets := &mockAssets{usage: map[string][]string{
			"sincgars": {"AN/PRC-158", "AN/PRC-163"},
			"wr":       {"MPU5"},
		}}
		s := svc(assets)
		resp := &dto.UsageResponse{}
		if _, err := s.WaveformUsage(context.Background(), resp); err != nil {
			t.Fatal(err)
		}

		for _, abbrev := range []string{"SINCGARS", " wr ", "unused"} {
			guard, err := s.usageFor(context.Background(), abbrev)
			if err != nil {
				t.Fatal(err)
			}
			endpoint := resp.Usage[strings.ToLower(strings.TrimSpace(abbrev))]
			if len(guard) != len(endpoint) {
				t.Errorf("%q: guard saw %v, endpoint saw %v", abbrev, guard, endpoint)
			}
		}
	})

	t.Run("reports a lookup failure rather than an empty library", func(t *testing.T) {
		s := svc(&mockAssets{usageErr: errors.New("db down")})
		status, _ := s.WaveformUsage(context.Background(), &dto.UsageResponse{})
		if status != http.StatusInternalServerError {
			t.Errorf("status = %d, want 500 - an empty map would read as 'nothing uses anything'", status)
		}
	})

	t.Run("reports an empty map with no provider wired", func(t *testing.T) {
		resp := &dto.UsageResponse{}
		status, err := svc().WaveformUsage(context.Background(), resp)
		if status != http.StatusOK || err != nil || resp.Total != 0 {
			t.Errorf("status = %d, err = %v, total = %d; want 200 and an empty map", status, err, resp.Total)
		}
	})
}
