package pace

import (
	"context"
	"errors"
	"net/http"
	"slices"
	"testing"

	"backend/internal/domain/pace/dto"
	"backend/internal/shared/contracts"
)

type mockAuditRecorder struct {
	events []contracts.AuditEventInput
}

func (m *mockAuditRecorder) Record(_ context.Context, in contracts.AuditEventInput) {
	m.events = append(m.events, in)
}

type mockNetLookup struct {
	nets map[string]contracts.NetInfo
	err  error
}

func (m *mockNetLookup) NetsByIDs(_ context.Context, _ []string) (map[string]contracts.NetInfo, error) {
	return m.nets, m.err
}

func newSvc(repo Repository, nets contracts.NetLookup) (*Service, *mockAuditRecorder) {
	s := NewService(repo)
	a := &mockAuditRecorder{}
	s.SetAudit(a)
	if nets != nil {
		s.SetNetLookup(nets)
	}
	return s, a
}

func saveReq(radio string, channels ...dto.SaveChannelInput) *dto.SaveCardRequest {
	return &dto.SaveCardRequest{
		Section: "asqd",
		Plans:   []dto.SavePlanInput{{RadioType: radio, Channels: channels}},
	}
}

func TestGetCard(t *testing.T) {
	t.Run("scaffolds both wheels for a squadron with nothing saved", func(t *testing.T) {
		svc, _ := newSvc(&MockRepository{}, nil)

		resp := &dto.GetCardResponse{}
		status, err := svc.GetCard(context.Background(), &dto.GetCardRequest{Section: "asqd"}, resp)
		if status != http.StatusOK || err != nil {
			t.Fatalf("status = %d, err = %v", status, err)
		}
		// An unconfigured squadron is an empty wheel, not a 404 -- there is no
		// "create plan" step in the UI.
		if len(resp.Card.Plans) != 2 {
			t.Fatalf("plans = %d, want 2", len(resp.Card.Plans))
		}
		for i, radio := range ValidRadios {
			if resp.Card.Plans[i].RadioType != radio {
				t.Errorf("plan %d radio = %q, want %q", i, resp.Card.Plans[i].RadioType, radio)
			}
			if resp.Card.Plans[i].ChannelCount != DefaultChannelCount {
				t.Errorf("plan %d channel count = %d, want %d",
					i, resp.Card.Plans[i].ChannelCount, DefaultChannelCount)
			}
			if resp.Card.Plans[i].Channels == nil {
				t.Errorf("plan %d channels is nil; want an empty slice so it marshals as []", i)
			}
		}
	})

	t.Run("404s an unknown section", func(t *testing.T) {
		repo := &MockRepository{
			SectionExistsFunc: func(_ context.Context, _ string) (bool, error) { return false, nil },
		}
		svc, _ := newSvc(repo, nil)

		status, err := svc.GetCard(context.Background(),
			&dto.GetCardRequest{Section: "nope"}, &dto.GetCardResponse{})
		if status != http.StatusNotFound || !errors.Is(err, ErrSectionNotFound) {
			t.Errorf("status = %d, err = %v; want 404", status, err)
		}
	})

	t.Run("resolves an override over the net's own frequency", func(t *testing.T) {
		repo := &MockRepository{
			FindCardFunc: func(_ context.Context, section string) (*CommsCard, error) {
				return &CommsCard{Section: section, Plans: []*ChannelPlan{{
					RadioType:    RadioJEM,
					ChannelCount: 16,
					Assignments: []*ChannelAssignment{{
						ChannelNumber:  4,
						NetID:          "n1",
						TxFreqOverride: "99.0000",
						Net: &NetRef{
							ID: "n1", Name: "NET 1", TxFreq: "30.0000", RxFreq: "40.0000", FreqUnit: "MHz",
						},
					}},
				}}}, nil
			},
		}
		svc, _ := newSvc(repo, nil)

		resp := &dto.GetCardResponse{}
		if _, err := svc.GetCard(context.Background(), &dto.GetCardRequest{Section: "asqd"}, resp); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		ch := resp.Card.Plans[0].Channels[0]
		if ch.TxFreq != "99.0000" {
			t.Errorf("tx = %q, want the override 99.0000", ch.TxFreq)
		}
		// Only TX was overridden, so RX still comes from the net.
		if ch.RxFreq != "40.0000" {
			t.Errorf("rx = %q, want the net's 40.0000", ch.RxFreq)
		}
		if !ch.IsOverridden {
			t.Error("is_overridden = false, want true")
		}
	})
}

func TestSaveCard(t *testing.T) {
	// All owned by asqd, the section saveReq targets.
	nets := &mockNetLookup{nets: map[string]contracts.NetInfo{
		"jemNet":    {Section: "asqd", RadioType: "jem"},
		"mpu5Net":   {Section: "asqd", RadioType: "mpu5"},
		"sharedNet": {Section: "asqd", RadioType: "both"},
		// Another squadron's net, which this card must not be able to use.
		"otherNet": {Section: "bsqd", RadioType: "jem"},
	}}

	t.Run("saves a channel and records an audit diff", func(t *testing.T) {
		var saved *CommsCard
		repo := &MockRepository{
			SaveCardFunc: func(_ context.Context, c *CommsCard) error { saved = c; return nil },
		}
		svc, audit := newSvc(repo, nets)

		status, err := svc.SaveCard(context.Background(),
			saveReq(RadioJEM, dto.SaveChannelInput{ChannelNumber: 4, NetID: "jemNet"}),
			&dto.SaveCardResponse{})

		if status != http.StatusOK || err != nil {
			t.Fatalf("status = %d, err = %v", status, err)
		}
		if saved == nil || len(saved.Plans) != 1 || len(saved.Plans[0].Assignments) != 1 {
			t.Fatalf("unexpected saved card: %+v", saved)
		}
		if len(audit.events) != 1 || audit.events[0].ResourceType != "pace_section" {
			t.Fatalf("audit = %+v, want one pace_section event", audit.events)
		}
		if _, ok := audit.events[0].Changes["jem_assigned_channels"]; !ok {
			t.Errorf("diff missing jem_assigned_channels: %+v", audit.events[0].Changes)
		}
	})

	t.Run("a shared net may go on either wheel", func(t *testing.T) {
		for _, radio := range ValidRadios {
			svc, _ := newSvc(&MockRepository{}, nets)
			status, err := svc.SaveCard(context.Background(),
				saveReq(radio, dto.SaveChannelInput{ChannelNumber: 1, NetID: "sharedNet"}),
				&dto.SaveCardResponse{})
			if status != http.StatusOK || err != nil {
				t.Errorf("%s: status = %d, err = %v; want 200", radio, status, err)
			}
		}
	})

	t.Run("refuses a net the radio does not carry", func(t *testing.T) {
		// The whole point of the nets library's radio_type: an MPU5-only net
		// cannot land on a JEM channel.
		svc, _ := newSvc(&MockRepository{}, nets)
		status, err := svc.SaveCard(context.Background(),
			saveReq(RadioJEM, dto.SaveChannelInput{ChannelNumber: 1, NetID: "mpu5Net"}),
			&dto.SaveCardResponse{})

		if status != http.StatusBadRequest || !errors.Is(err, ErrNetWrongRadio) {
			t.Errorf("status = %d, err = %v; want 400 / %v", status, err, ErrNetWrongRadio)
		}
	})

	t.Run("refuses another squadron's net", func(t *testing.T) {
		// Nets are a per-squadron library; one squadron editing FIRES must never
		// be able to reach another squadron's card.
		svc, _ := newSvc(&MockRepository{}, nets)
		status, err := svc.SaveCard(context.Background(),
			saveReq(RadioJEM, dto.SaveChannelInput{ChannelNumber: 1, NetID: "otherNet"}),
			&dto.SaveCardResponse{})

		if status != http.StatusBadRequest || !errors.Is(err, ErrNetWrongSection) {
			t.Errorf("status = %d, err = %v; want 400 / %v", status, err, ErrNetWrongSection)
		}
	})

	t.Run("refuses a net that does not exist", func(t *testing.T) {
		svc, _ := newSvc(&MockRepository{}, nets)
		status, err := svc.SaveCard(context.Background(),
			saveReq(RadioJEM, dto.SaveChannelInput{ChannelNumber: 1, NetID: "ghost"}),
			&dto.SaveCardResponse{})

		if status != http.StatusBadRequest || !errors.Is(err, ErrUnknownNet) {
			t.Errorf("status = %d, err = %v; want 400 / %v", status, err, ErrUnknownNet)
		}
	})

	t.Run("refuses a channel outside the plan's count", func(t *testing.T) {
		svc, _ := newSvc(&MockRepository{}, nets)
		status, err := svc.SaveCard(context.Background(),
			saveReq(RadioJEM, dto.SaveChannelInput{ChannelNumber: 17, NetID: "jemNet"}),
			&dto.SaveCardResponse{})

		if status != http.StatusBadRequest || !errors.Is(err, ErrChannelOutOfRange) {
			t.Errorf("status = %d, err = %v; want 400 / %v", status, err, ErrChannelOutOfRange)
		}
	})

	t.Run("refuses the same channel twice", func(t *testing.T) {
		svc, _ := newSvc(&MockRepository{}, nets)
		status, err := svc.SaveCard(context.Background(),
			saveReq(RadioJEM,
				dto.SaveChannelInput{ChannelNumber: 3, NetID: "jemNet"},
				dto.SaveChannelInput{ChannelNumber: 3, NetID: "sharedNet"},
			), &dto.SaveCardResponse{})

		if status != http.StatusBadRequest || !errors.Is(err, ErrDuplicateChannel) {
			t.Errorf("status = %d, err = %v; want 400 / %v", status, err, ErrDuplicateChannel)
		}
	})

	t.Run("refuses the same radio twice", func(t *testing.T) {
		// Both plans resolve to the same row, so the second one's write clears the
		// first one's channels. Silently keeping the last wheel sent is the bug
		// this refuses.
		written := false
		repo := &MockRepository{
			SaveCardFunc: func(_ context.Context, _ *CommsCard) error { written = true; return nil },
		}
		svc, _ := newSvc(repo, nets)

		status, err := svc.SaveCard(context.Background(), &dto.SaveCardRequest{
			Section: "asqd",
			Plans: []dto.SavePlanInput{
				{RadioType: RadioJEM, Channels: []dto.SaveChannelInput{{ChannelNumber: 1, NetID: "jemNet"}}},
				{RadioType: RadioJEM, Channels: []dto.SaveChannelInput{{ChannelNumber: 2, NetID: "jemNet"}}},
			},
		}, &dto.SaveCardResponse{})

		if status != http.StatusBadRequest || !errors.Is(err, ErrDuplicateRadio) {
			t.Errorf("status = %d, err = %v; want 400 / %v", status, err, ErrDuplicateRadio)
		}
		if written {
			t.Error("a card was saved despite two plans for one wheel")
		}
	})

	t.Run("refuses an unknown radio", func(t *testing.T) {
		svc, _ := newSvc(&MockRepository{}, nets)
		status, err := svc.SaveCard(context.Background(),
			saveReq("harris"), &dto.SaveCardResponse{})

		if status != http.StatusBadRequest || !errors.Is(err, ErrInvalidRadio) {
			t.Errorf("status = %d, err = %v; want 400 / %v", status, err, ErrInvalidRadio)
		}
	})

	t.Run("nothing is written when validation fails", func(t *testing.T) {
		written := false
		repo := &MockRepository{
			SaveCardFunc: func(_ context.Context, _ *CommsCard) error { written = true; return nil },
		}
		svc, audit := newSvc(repo, nets)

		_, _ = svc.SaveCard(context.Background(),
			saveReq(RadioJEM, dto.SaveChannelInput{ChannelNumber: 1, NetID: "ghost"}),
			&dto.SaveCardResponse{})

		if written {
			t.Error("card was saved despite a validation failure")
		}
		if len(audit.events) != 0 {
			t.Error("audit recorded an event for a failed save")
		}
	})

	t.Run("an empty channel list clears a wheel", func(t *testing.T) {
		var saved *CommsCard
		repo := &MockRepository{
			SaveCardFunc: func(_ context.Context, c *CommsCard) error { saved = c; return nil },
		}
		svc, _ := newSvc(repo, nets)

		status, err := svc.SaveCard(context.Background(), saveReq(RadioJEM), &dto.SaveCardResponse{})
		if status != http.StatusOK || err != nil {
			t.Fatalf("status = %d, err = %v", status, err)
		}
		if len(saved.Plans[0].Assignments) != 0 {
			t.Errorf("assignments = %d, want 0", len(saved.Plans[0].Assignments))
		}
	})
}

// The audit diff must describe the save that happened, not the whole card. A
// save is a partial replace: a radio the payload omits is left alone by the
// write, so reporting it would record a wheel being emptied that nobody touched.
func TestSaveCardAuditDiffCoversOnlyTheRadiosSent(t *testing.T) {
	nets := &mockNetLookup{nets: map[string]contracts.NetInfo{
		"jemNet": {Section: "asqd", RadioType: "jem"},
	}}

	// Both wheels already carry channels, which is the state a partial save has
	// to leave the untouched one in.
	populated := func(_ context.Context, section string) (*CommsCard, error) {
		return &CommsCard{Section: section, Plans: []*ChannelPlan{
			{
				RadioType: RadioJEM, Label: "JEM WHEEL", ChannelCount: 16,
				Assignments: []*ChannelAssignment{
					{ChannelNumber: 1, NetID: "jemNet"},
					{ChannelNumber: 2, NetID: "jemNet"},
				},
			},
			{
				RadioType: RadioMPU5, Label: "MPU5 WHEEL", ChannelCount: 16,
				Assignments: []*ChannelAssignment{
					{ChannelNumber: 1, NetID: "mpu5Net"},
					{ChannelNumber: 5, NetID: "mpu5Net"},
					{ChannelNumber: 9, NetID: "mpu5Net"},
				},
			},
		}}, nil
	}

	t.Run("says nothing about a radio the payload omitted", func(t *testing.T) {
		svc, audit := newSvc(&MockRepository{FindCardFunc: populated}, nets)

		status, err := svc.SaveCard(context.Background(),
			saveReq(RadioJEM, dto.SaveChannelInput{ChannelNumber: 3, NetID: "jemNet"}),
			&dto.SaveCardResponse{})
		if status != http.StatusOK || err != nil {
			t.Fatalf("status = %d, err = %v", status, err)
		}

		changes := audit.events[0].Changes
		for _, key := range []string{"mpu5_assigned_channels", "mpu5_label"} {
			if _, ok := changes[key]; ok {
				t.Errorf("diff reports %s for a wheel the save never touched: %+v", key, changes)
			}
		}
		// The wheel that WAS sent is still reported, 2 channels down to 1.
		got, ok := changes["jem_assigned_channels"].(map[string]any)
		if !ok {
			t.Fatalf("diff missing jem_assigned_channels: %+v", changes)
		}
		if got["old"] != 2 || got["new"] != 1 {
			t.Errorf("jem_assigned_channels = %+v, want old 2 / new 1", got)
		}
	})

	t.Run("still reports a wheel deliberately cleared", func(t *testing.T) {
		// A radio present with an empty Channels list is a real clear, not an
		// omission, and the log has to show it.
		svc, audit := newSvc(&MockRepository{FindCardFunc: populated}, nets)

		if _, err := svc.SaveCard(context.Background(),
			saveReq(RadioJEM), &dto.SaveCardResponse{}); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		changes := audit.events[0].Changes
		got, ok := changes["jem_assigned_channels"].(map[string]any)
		if !ok {
			t.Fatalf("diff missing jem_assigned_channels: %+v", changes)
		}
		if got["old"] != 2 || got["new"] != 0 {
			t.Errorf("jem_assigned_channels = %+v, want old 2 / new 0", got)
		}
		if _, ok := changes["mpu5_assigned_channels"]; ok {
			t.Errorf("diff reports mpu5 for a save that only cleared jem: %+v", changes)
		}
	})
}

func TestIsValidRadio(t *testing.T) {
	for _, r := range ValidRadios {
		if !IsValidRadio(r) {
			t.Errorf("IsValidRadio(%q) = false", r)
		}
	}
	for _, r := range []string{"JEM", "mpu-5", "both", ""} {
		if IsValidRadio(r) {
			t.Errorf("IsValidRadio(%q) = true, want false", r)
		}
	}
}

func TestCardHeader(t *testing.T) {
	t.Run("saves the title and date", func(t *testing.T) {
		var saved *CommsCard
		repo := &MockRepository{
			SaveCardFunc: func(_ context.Context, c *CommsCard) error { saved = c; return nil },
		}
		svc, audit := newSvc(repo, nil)

		req := saveReq(RadioJEM)
		req.Title = "EXERCISE ONE"
		req.EffectiveDate = "2026-08-20"

		status, err := svc.SaveCard(context.Background(), req, &dto.SaveCardResponse{})
		if status != http.StatusOK || err != nil {
			t.Fatalf("status = %d, err = %v", status, err)
		}
		if saved.Header.Title != "EXERCISE ONE" {
			t.Errorf("title = %q", saved.Header.Title)
		}
		if saved.Header.EffectiveDate == nil ||
			saved.Header.EffectiveDate.Format("2006-01-02") != "2026-08-20" {
			t.Errorf("date = %v, want 2026-08-20", saved.Header.EffectiveDate)
		}
		if _, ok := audit.events[0].Changes["title"]; !ok {
			t.Errorf("diff missing title: %+v", audit.events[0].Changes)
		}
	})

	t.Run("an empty date clears it - the nullable column is the flag", func(t *testing.T) {
		// This is what the editor's "Include date" checkbox does when unticked.
		// There is deliberately no show_date boolean to contradict.
		var saved *CommsCard
		repo := &MockRepository{
			SaveCardFunc: func(_ context.Context, c *CommsCard) error { saved = c; return nil },
		}
		svc, _ := newSvc(repo, nil)

		req := saveReq(RadioJEM)
		req.Title = "NO DATE"
		req.EffectiveDate = ""

		if _, err := svc.SaveCard(context.Background(), req, &dto.SaveCardResponse{}); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if saved.Header.EffectiveDate != nil {
			t.Errorf("date = %v, want nil", saved.Header.EffectiveDate)
		}
	})

	t.Run("rejects a malformed date rather than silently dropping it", func(t *testing.T) {
		written := false
		repo := &MockRepository{
			SaveCardFunc: func(_ context.Context, _ *CommsCard) error { written = true; return nil },
		}
		svc, _ := newSvc(repo, nil)

		for _, bad := range []string{"20/08/2026", "2026-8-20", "Aug 20 2026", "tomorrow"} {
			req := saveReq(RadioJEM)
			req.EffectiveDate = bad
			status, err := svc.SaveCard(context.Background(), req, &dto.SaveCardResponse{})
			if status != http.StatusBadRequest || !errors.Is(err, ErrInvalidDate) {
				t.Errorf("%q: status = %d, err = %v; want 400", bad, status, err)
			}
		}
		if written {
			t.Error("a card was saved despite a malformed date")
		}
	})

	t.Run("a squadron with no header yet reads as empty, not an error", func(t *testing.T) {
		svc, _ := newSvc(&MockRepository{}, nil)
		resp := &dto.GetCardResponse{}
		status, err := svc.GetCard(context.Background(), &dto.GetCardRequest{Section: "asqd"}, resp)
		if status != http.StatusOK || err != nil {
			t.Fatalf("status = %d, err = %v", status, err)
		}
		if resp.Card.Title != "" || resp.Card.EffectiveDate != "" {
			t.Errorf("expected empty header, got title=%q date=%q", resp.Card.Title, resp.Card.EffectiveDate)
		}
	})
}

func TestEmblem(t *testing.T) {
	t.Run("stores the uploaded URL on the squadron's header", func(t *testing.T) {
		var gotSection, gotURL string
		repo := &MockRepository{
			SetEmblemURLFunc: func(_ context.Context, section, url string) error {
				gotSection, gotURL = section, url
				return nil
			},
		}
		svc, _ := newSvc(repo, nil)

		status, err := svc.SetEmblem(context.Background(), "asqd", "https://blob/pace/asqd/e.png")
		if status != http.StatusOK || err != nil {
			t.Fatalf("status = %d, err = %v", status, err)
		}
		if gotSection != "asqd" || gotURL != "https://blob/pace/asqd/e.png" {
			t.Errorf("wrote section=%q url=%q", gotSection, gotURL)
		}
	})

	t.Run("clears by writing the empty string, not by deleting a row", func(t *testing.T) {
		called := false
		gotURL := "unset"
		repo := &MockRepository{
			SetEmblemURLFunc: func(_ context.Context, _, url string) error {
				called, gotURL = true, url
				return nil
			},
		}
		svc, _ := newSvc(repo, nil)

		status, err := svc.ClearEmblem(context.Background(), "asqd")
		if status != http.StatusOK || err != nil {
			t.Fatalf("status = %d, err = %v", status, err)
		}
		// The empty string is the "no emblem" value everywhere, so clearing is
		// a write rather than a delete.
		if !called || gotURL != "" {
			t.Errorf("called = %v, url = %q; want a write of the empty string", called, gotURL)
		}
	})

	t.Run("refuses a section that does not exist", func(t *testing.T) {
		written := false
		repo := &MockRepository{
			SectionExistsFunc: func(_ context.Context, _ string) (bool, error) { return false, nil },
			SetEmblemURLFunc: func(_ context.Context, _, _ string) error {
				written = true
				return nil
			},
		}
		svc, _ := newSvc(repo, nil)

		status, err := svc.SetEmblem(context.Background(), "nope", "https://blob/x.png")
		if status != http.StatusNotFound || !errors.Is(err, ErrSectionNotFound) {
			t.Errorf("status = %d, err = %v; want 404", status, err)
		}
		if written {
			t.Error("an emblem was written for a section that does not exist")
		}
	})

	t.Run("reports a failed write rather than claiming the emblem landed", func(t *testing.T) {
		repo := &MockRepository{
			SetEmblemURLFunc: func(_ context.Context, _, _ string) error { return errors.New("db down") },
		}
		svc, _ := newSvc(repo, nil)

		status, err := svc.SetEmblem(context.Background(), "asqd", "https://blob/x.png")
		if status != http.StatusInternalServerError || !errors.Is(err, ErrPaceInternalError) {
			t.Errorf("status = %d, err = %v; want 500", status, err)
		}
	})

	t.Run("a stored emblem reaches the card response", func(t *testing.T) {
		repo := &MockRepository{
			FindCardFunc: func(_ context.Context, section string) (*CommsCard, error) {
				return &CommsCard{
					Section: section,
					Header:  &CardHeader{Section: section, EmblemURL: "https://blob/pace/asqd/e.png"},
					Plans:   []*ChannelPlan{},
				}, nil
			},
		}
		svc, _ := newSvc(repo, nil)

		resp := &dto.GetCardResponse{}
		if _, err := svc.GetCard(context.Background(), &dto.GetCardRequest{Section: "asqd"}, resp); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if resp.Card.EmblemURL != "https://blob/pace/asqd/e.png" {
			t.Errorf("emblem_url = %q", resp.Card.EmblemURL)
		}
	})

	t.Run("a squadron with no emblem reads as the empty string", func(t *testing.T) {
		svc, _ := newSvc(&MockRepository{}, nil)

		resp := &dto.GetCardResponse{}
		if _, err := svc.GetCard(context.Background(), &dto.GetCardRequest{Section: "asqd"}, resp); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if resp.Card.EmblemURL != "" {
			t.Errorf("emblem_url = %q, want empty", resp.Card.EmblemURL)
		}
	})
}

func TestSheetRows(t *testing.T) {
	t.Run("a shorter list replaces the stored rows rather than merging over them", func(t *testing.T) {
		// The band is a whole-band replace. The repository deletes before it
		// inserts; what the service has to get right is passing exactly the
		// submitted list, so three stored rows really do become one.
		repo := &MockRepository{
			FindCardFunc: func(_ context.Context, section string) (*CommsCard, error) {
				return &CommsCard{
					Section: section,
					Header:  &CardHeader{Section: section},
					Plans:   []*ChannelPlan{},
					LTACRows: []*FreqRow{
						{Position: 0, Name: "ALPHA NET"},
						{Position: 1, Name: "BRAVO NET"},
						{Position: 2, Name: "CHARLIE NET"},
					},
				}, nil
			},
		}
		svc, _ := newSvc(repo, nil)

		req := saveReq(RadioJEM)
		req.LTACRows = []dto.SaveFreqRowInput{{Name: "ALPHA NET", Up: "225.000"}}

		status, err := svc.SaveCard(context.Background(), req, &dto.SaveCardResponse{})
		if status != http.StatusOK || err != nil {
			t.Fatalf("status = %d, err = %v", status, err)
		}
		if repo.SavedCard == nil {
			t.Fatal("no card was saved")
		}
		if len(repo.SavedCard.LTACRows) != 1 {
			t.Fatalf("ltac rows = %d, want 1", len(repo.SavedCard.LTACRows))
		}
		if got := repo.SavedCard.LTACRows[0]; got.Name != "ALPHA NET" || got.Up != "225.000" {
			t.Errorf("row = %+v", got)
		}
	})

	t.Run("assigns position from list order, not from the client", func(t *testing.T) {
		repo := &MockRepository{}
		svc, _ := newSvc(repo, nil)

		req := saveReq(RadioJEM)
		req.TACSATRows = []dto.SaveFreqRowInput{{Name: "ONE"}, {Name: "TWO"}, {Name: "THREE"}}
		req.TmnRows = []dto.SaveTmnRowInput{{Label: "DATA SYNC", Value: "ON"}}

		if _, err := svc.SaveCard(context.Background(), req, &dto.SaveCardResponse{}); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		for i, row := range repo.SavedCard.TACSATRows {
			if row.Position != i {
				t.Errorf("row %d has position %d", i, row.Position)
			}
		}
		if len(repo.SavedCard.TmnRows) != 1 || repo.SavedCard.TmnRows[0].Position != 0 {
			t.Errorf("tmn rows = %+v", repo.SavedCard.TmnRows)
		}
	})

	t.Run("trims what it stores rather than keeping the typing", func(t *testing.T) {
		repo := &MockRepository{}
		svc, _ := newSvc(repo, nil)

		req := saveReq(RadioJEM)
		req.LTACRows = []dto.SaveFreqRowInput{{Name: "  ALPHA NET  ", Crypto: " KY-58 "}}
		req.TmnRows = []dto.SaveTmnRowInput{{Label: " CHAT ", Value: "  ROOM 1 "}}

		if _, err := svc.SaveCard(context.Background(), req, &dto.SaveCardResponse{}); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got := repo.SavedCard.LTACRows[0]; got.Name != "ALPHA NET" || got.Crypto != "KY-58" {
			t.Errorf("freq row = %+v", got)
		}
		if got := repo.SavedCard.TmnRows[0]; got.Label != "CHAT" || got.Value != "ROOM 1" {
			t.Errorf("tmn row = %+v", got)
		}
	})

	t.Run("a squadron with no rows reads as empty arrays, not nil", func(t *testing.T) {
		svc, _ := newSvc(&MockRepository{}, nil)

		resp := &dto.GetCardResponse{}
		if _, err := svc.GetCard(context.Background(), &dto.GetCardRequest{Section: "asqd"}, resp); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		// Non-nil is the assertion: a nil slice marshals to null, and every
		// consumer would then have to guard for it.
		if resp.Card.LTACRows == nil || resp.Card.TACSATRows == nil || resp.Card.TmnRows == nil {
			t.Errorf("rows = %v / %v / %v; want empty arrays",
				resp.Card.LTACRows, resp.Card.TACSATRows, resp.Card.TmnRows)
		}
	})

	t.Run("carries the stored rows through to the card response", func(t *testing.T) {
		repo := &MockRepository{
			FindCardFunc: func(_ context.Context, section string) (*CommsCard, error) {
				return &CommsCard{
					Section:    section,
					Header:     &CardHeader{Section: section},
					Plans:      []*ChannelPlan{},
					LTACRows:   []*FreqRow{{Name: "ALPHA NET", Up: "225.000", Down: "243.000"}},
					TmnRows: []*TmnRow{{Label: "DATA SYNC", Value: "ON"}},
				}, nil
			},
		}
		svc, _ := newSvc(repo, nil)

		resp := &dto.GetCardResponse{}
		if _, err := svc.GetCard(context.Background(), &dto.GetCardRequest{Section: "asqd"}, resp); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(resp.Card.LTACRows) != 1 || resp.Card.LTACRows[0].Name != "ALPHA NET" {
			t.Errorf("ltac rows = %+v", resp.Card.LTACRows)
		}
		if resp.Card.LTACRows[0].Up != "225.000" || resp.Card.LTACRows[0].Down != "243.000" {
			t.Errorf("up/down = %+v", resp.Card.LTACRows[0])
		}
		if len(resp.Card.TmnRows) != 1 || resp.Card.TmnRows[0].Label != "DATA SYNC" {
			t.Errorf("tmn rows = %+v", resp.Card.TmnRows)
		}
	})
}

func TestTiers(t *testing.T) {
	t.Run("switching a tier from equipment to custom clears the stale equipment_id", func(t *testing.T) {
		// The failure this guards is a tier that still points at a terminal it
		// no longer names. Cleared on write rather than on read, so the stale
		// reference cannot resurface if the tier is switched back.
		repo := &MockRepository{
			FindCardFunc: func(_ context.Context, section string) (*CommsCard, error) {
				return &CommsCard{
					Section: section,
					Header:  &CardHeader{Section: section},
					Plans:   []*ChannelPlan{},
					Tiers: []*Tier{
						{Letter: "P", Source: TierSourceEquipment, EquipmentID: "gatr", ServiceAbbrev: "WGS"},
					},
				}, nil
			},
		}
		svc, _ := newSvc(repo, nil)

		req := saveReq(RadioJEM)
		req.Tiers = []dto.SaveTierInput{
			{Tier: "P", Source: TierSourceCustom, CustomLabel: "Runway fibre drop", EquipmentID: "gatr"},
		}

		status, err := svc.SaveCard(context.Background(), req, &dto.SaveCardResponse{})
		if status != http.StatusOK || err != nil {
			t.Fatalf("status = %d, err = %v", status, err)
		}
		if len(repo.SavedCard.Tiers) != 1 {
			t.Fatalf("tiers = %d, want 1", len(repo.SavedCard.Tiers))
		}
		got := repo.SavedCard.Tiers[0]
		if got.Source != TierSourceCustom || got.CustomLabel != "Runway fibre drop" {
			t.Errorf("tier = %+v", got)
		}
		if got.EquipmentID != "" {
			t.Errorf("equipment_id = %q, want it cleared by the source change", got.EquipmentID)
		}
		if got.ServiceAbbrev != "" {
			t.Errorf("service_abbrev = %q, want it cleared with the equipment", got.ServiceAbbrev)
		}
	})

	t.Run("an omitted tiers array leaves the stored tiers alone", func(t *testing.T) {
		// A client predating this feature saves channel edits without a tiers
		// key. Treating absent as "clear" would wipe tiers it never knew about.
		repo := &MockRepository{}
		svc, _ := newSvc(repo, nil)

		if _, err := svc.SaveCard(context.Background(), saveReq(RadioJEM), &dto.SaveCardResponse{}); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if repo.SavedCard.Tiers != nil {
			t.Errorf("tiers = %+v, want nil so the repository skips the write", repo.SavedCard.Tiers)
		}
	})

	t.Run("a source naming a reference must carry it", func(t *testing.T) {
		cases := []struct {
			name string
			in   dto.SaveTierInput
		}{
			{"equipment with no id", dto.SaveTierInput{Tier: "P", Source: TierSourceEquipment}},
			{"transport with no id", dto.SaveTierInput{Tier: "A", Source: TierSourceTransport}},
			{"custom with no label", dto.SaveTierInput{Tier: "C", Source: TierSourceCustom}},
		}
		for _, tc := range cases {
			svc, _ := newSvc(&MockRepository{}, nil)
			req := saveReq(RadioJEM)
			req.Tiers = []dto.SaveTierInput{tc.in}

			status, err := svc.SaveCard(context.Background(), req, &dto.SaveCardResponse{})
			if status != http.StatusBadRequest || !errors.Is(err, ErrTierMissingRef) {
				t.Errorf("%s: status = %d, err = %v; want 400 / %v", tc.name, status, err, ErrTierMissingRef)
			}
		}
	})

	t.Run("the refusal names the tier and the field", func(t *testing.T) {
		// "a tier names a source but carries no matching reference" is true and
		// unusable: four tiers and three sources that need one, so acting on it
		// means opening all four and checking each by hand. Reported from the
		// editor, where a tier had a Detail typed and a Label left empty and the
		// message pointed at neither.
		//
		// The wording is Section 06's own field and source labels, so it names
		// what is on screen rather than the column behind it.
		cases := []struct {
			in   dto.SaveTierInput
			want string
		}{
			{dto.SaveTierInput{Tier: "P", Source: TierSourceEquipment}, `tier P: source is "Catalog equipment" but Equipment is empty`},
			{dto.SaveTierInput{Tier: "A", Source: TierSourceTransport}, `tier A: source is "Transport" but Transport is empty`},
			{dto.SaveTierInput{Tier: "C", Source: TierSourceCustom}, `tier C: source is "Custom" but Label is empty`},
		}
		for _, tc := range cases {
			svc, _ := newSvc(&MockRepository{}, nil)
			req := saveReq(RadioJEM)
			req.Tiers = []dto.SaveTierInput{tc.in}

			_, err := svc.SaveCard(context.Background(), req, &dto.SaveCardResponse{})
			if err == nil || err.Error() != tc.want {
				t.Errorf("tier %s: message = %q, want %q", tc.in.Tier, err, tc.want)
			}
			// Specialising the message must not cost the code, which is what
			// every client keys on.
			var coded *Error
			if !errors.As(err, &coded) || coded.GetCode() != "PACE_TIER_MISSING_REF" {
				t.Errorf("tier %s: code = %v, want PACE_TIER_MISSING_REF", tc.in.Tier, err)
			}
		}
	})

	t.Run("the same tier letter twice is refused", func(t *testing.T) {
		svc, _ := newSvc(&MockRepository{}, nil)
		req := saveReq(RadioJEM)
		req.Tiers = []dto.SaveTierInput{
			{Tier: "P", Source: TierSourceNone},
			{Tier: "P", Source: TierSourceNone},
		}

		status, err := svc.SaveCard(context.Background(), req, &dto.SaveCardResponse{})
		if status != http.StatusBadRequest || !errors.Is(err, ErrDuplicateTier) {
			t.Errorf("status = %d, err = %v; want 400 / %v", status, err, ErrDuplicateTier)
		}
	})

	t.Run("a letter or source outside the set is refused", func(t *testing.T) {
		for _, in := range []dto.SaveTierInput{
			{Tier: "X", Source: TierSourceNone},
			{Tier: "P", Source: "satellite"},
		} {
			svc, _ := newSvc(&MockRepository{}, nil)
			req := saveReq(RadioJEM)
			req.Tiers = []dto.SaveTierInput{in}

			status, err := svc.SaveCard(context.Background(), req, &dto.SaveCardResponse{})
			if status != http.StatusBadRequest || !errors.Is(err, ErrInvalidTierSource) {
				t.Errorf("%+v: status = %d, err = %v; want 400 / %v", in, status, err, ErrInvalidTierSource)
			}
		}
	})

	t.Run("tier errors are coded", func(t *testing.T) {
		for _, e := range []*Error{ErrInvalidTierSource, ErrDuplicateTier, ErrTierMissingRef} {
			if e.GetCode() == "" || e.GetStatus() != http.StatusBadRequest {
				t.Errorf("%+v is not a coded 400", e)
			}
		}
	})
}

func TestHighlights(t *testing.T) {
	t.Run("every row kind carries its marks to the save, once each, in a fixed order", func(t *testing.T) {
		repo := &MockRepository{}
		svc, _ := newSvc(repo, nil)

		req := saveReq(RadioJEM, dto.SaveChannelInput{
			ChannelNumber: 3,
			NetID:         "0b8a2c1e-7f7d-4c55-9a55-2f5b3c1d9e01",
			Highlights:    []string{"tx", "net", "tx"},
		})
		req.Plans[0].Highlights = []string{"label"}
		req.Version = "  v2 "
		req.Highlights = []string{" version ", "title"}
		req.LTACRows = []dto.SaveFreqRowInput{{Name: "ALPHA", Highlights: []string{"up"}}}
		req.TmnRows = []dto.SaveTmnRowInput{{Label: "ATAK", Highlights: []string{"value"}}}
		req.Tiers = []dto.SaveTierInput{
			{Tier: "P", Source: TierSourceCustom, CustomLabel: "Fibre", Highlights: []string{"detail", "name"}},
		}

		status, err := svc.SaveCard(context.Background(), req, &dto.SaveCardResponse{})
		if status != http.StatusOK || err != nil {
			t.Fatalf("status = %d, err = %v", status, err)
		}
		got := repo.SavedCard
		checks := []struct {
			what      string
			got, want []string
		}{
			{"header", got.Header.Highlights, []string{"title", "version"}},
			{"plan", got.Plans[0].Highlights, []string{"label"}},
			{"channel", got.Plans[0].Assignments[0].Highlights, []string{"net", "tx"}},
			{"ltac row", got.LTACRows[0].Highlights, []string{"up"}},
			{"tmn row", got.TmnRows[0].Highlights, []string{"value"}},
			{"tier", got.Tiers[0].Highlights, []string{"name", "detail"}},
		}
		for _, c := range checks {
			if !slices.Equal(c.got, c.want) {
				t.Errorf("%s highlights = %v, want %v", c.what, c.got, c.want)
			}
		}
		if got.Header.Version != "v2" {
			t.Errorf("version = %q, want it trimmed to v2", got.Header.Version)
		}
	})

	t.Run("a row with no marks is saved as an empty array, never nil", func(t *testing.T) {
		// Every highlights column is NOT NULL and pgx writes a nil slice as
		// NULL, so an unmarked row would fail the insert rather than save.
		repo := &MockRepository{}
		svc, _ := newSvc(repo, nil)

		req := saveReq(RadioJEM)
		req.LTACRows = []dto.SaveFreqRowInput{{Name: "ALPHA"}}
		if _, err := svc.SaveCard(context.Background(), req, &dto.SaveCardResponse{}); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if repo.SavedCard.Header.Highlights == nil || repo.SavedCard.Plans[0].Highlights == nil ||
			repo.SavedCard.LTACRows[0].Highlights == nil {
			t.Errorf("header %v / plan %v / row %v; want empty arrays",
				repo.SavedCard.Header.Highlights, repo.SavedCard.Plans[0].Highlights,
				repo.SavedCard.LTACRows[0].Highlights)
		}
	})

	t.Run("an unknown mark is refused, naming the row", func(t *testing.T) {
		// Refused rather than dropped: dropping it would print in black a value
		// the squadron asked to be red, which is the one change the recipient
		// was meant to notice.
		cases := []struct {
			name   string
			mutate func(*dto.SaveCardRequest)
			want   string
		}{
			{"header", func(r *dto.SaveCardRequest) { r.Highlights = []string{"colour"} },
				`card header: "colour" cannot be marked as changed`},
			{"channel", func(r *dto.SaveCardRequest) {
				r.Plans[0].Channels = []dto.SaveChannelInput{{ChannelNumber: 3, NetID: "n1", Highlights: []string{"freq"}}}
			}, `JEM channel 3: "freq" cannot be marked as changed`},
			// Valid on a TACTICAL MISSION NETWORK row, not on a frequency row.
			{"freq row", func(r *dto.SaveCardRequest) {
				r.TACSATRows = []dto.SaveFreqRowInput{{Name: "A"}, {Name: "B", Highlights: []string{"label"}}}
			}, `TACSAT row 2: "label" cannot be marked as changed`},
			{"tier", func(r *dto.SaveCardRequest) {
				r.Tiers = []dto.SaveTierInput{{Tier: "c", Source: TierSourceNone, Highlights: []string{"title"}}}
			}, `tier C: "title" cannot be marked as changed`},
		}
		for _, tc := range cases {
			repo := &MockRepository{}
			svc, _ := newSvc(repo, nil)
			req := saveReq(RadioJEM)
			tc.mutate(req)

			status, err := svc.SaveCard(context.Background(), req, &dto.SaveCardResponse{})
			if status != http.StatusBadRequest || !errors.Is(err, ErrInvalidHighlight) {
				t.Errorf("%s: status = %d, err = %v; want 400 / %v", tc.name, status, err, ErrInvalidHighlight)
				continue
			}
			if err.Error() != tc.want {
				t.Errorf("%s: message = %q, want %q", tc.name, err, tc.want)
			}
			if repo.SavedCard != nil {
				t.Errorf("%s: a refused card was saved", tc.name)
			}
		}
	})

	t.Run("marks read back as arrays, never null", func(t *testing.T) {
		repo := &MockRepository{
			FindCardFunc: func(_ context.Context, section string) (*CommsCard, error) {
				return &CommsCard{
					Section: section,
					Header:  &CardHeader{Section: section, Version: "v3"},
					Plans: []*ChannelPlan{{
						RadioType: RadioJEM, ChannelCount: 16,
						Assignments: []*ChannelAssignment{{ChannelNumber: 1, NetID: "n1", Net: &NetRef{ID: "n1"}}},
					}},
					LTACRows:   []*FreqRow{{Name: "ALPHA", Highlights: []string{"down"}}},
					TmnRows: []*TmnRow{{Label: "ATAK"}},
					Tiers:      []*Tier{{Letter: "P", Source: TierSourceNone}},
				}, nil
			},
		}
		svc, _ := newSvc(repo, nil)

		resp := &dto.GetCardResponse{}
		if _, err := svc.GetCard(context.Background(), &dto.GetCardRequest{Section: "asqd"}, resp); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		c := resp.Card
		if c.Version != "v3" {
			t.Errorf("version = %q, want v3", c.Version)
		}
		if c.Highlights == nil || c.Plans[0].Highlights == nil || c.Plans[1].Highlights == nil ||
			c.Plans[0].Channels[0].Highlights == nil || c.TmnRows[0].Highlights == nil ||
			c.Tiers[0].Highlights == nil {
			t.Errorf("a highlights list serialised as null: %+v", c)
		}
		if !slices.Equal(c.LTACRows[0].Highlights, []string{"down"}) {
			t.Errorf("ltac highlights = %v, want [down]", c.LTACRows[0].Highlights)
		}
	})

	t.Run("the audit diff records a version change and not the marks", func(t *testing.T) {
		before := &CommsCard{Header: &CardHeader{Version: "v1"}}
		after := &CommsCard{Header: &CardHeader{Version: "v2", Highlights: []string{"title"}}}

		changes := diffCard(before, after, map[string]bool{})
		v, ok := changes["version"].(map[string]any)
		if !ok || v["old"] != "v1" || v["new"] != "v2" {
			t.Errorf("version change = %v, want v1 -> v2", changes["version"])
		}
		if _, logged := changes["highlights"]; logged {
			t.Error("marks were logged; they are presentation and would bury the edits")
		}
	})
}
