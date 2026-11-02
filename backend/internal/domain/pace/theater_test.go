package pace

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"testing"

	"backend/internal/domain/pace/dto"
	"backend/internal/shared/contracts"
)

// The theater is a dimension of the whole card: the read asks the repository
// for one theater, the save stamps it on the header and every plan, and the
// net check refuses a net that does not serve it.
func TestTheater(t *testing.T) {
	nets := &mockNetLookup{nets: map[string]contracts.NetInfo{
		"conusNet":  {Section: "asqd", RadioType: "jem", Theater: "conus"},
		"oconusNet": {Section: "asqd", RadioType: "jem", Theater: "oconus"},
		"bothNet":   {Section: "asqd", RadioType: "jem", Theater: "both"},
	}}
	channel := dto.SaveChannelInput{ChannelNumber: 1, NetID: "conusNet"}

	t.Run("an empty theater reads and saves CONUS", func(t *testing.T) {
		var asked []string
		repo := &MockRepository{
			FindCardFunc: func(_ context.Context, section, theater string) (*CommsCard, error) {
				asked = append(asked, theater)
				return &CommsCard{Section: section, Theater: theater, Plans: []*ChannelPlan{}}, nil
			},
		}
		svc, _ := newSvc(repo, nets)

		status, err := svc.GetCard(context.Background(), &dto.GetCardRequest{Section: "asqd"}, &dto.GetCardResponse{})
		if status != http.StatusOK || err != nil {
			t.Fatalf("get: status = %d, err = %v", status, err)
		}
		status, err = svc.SaveCard(context.Background(), saveReq(RadioJEM, channel), &dto.SaveCardResponse{})
		if status != http.StatusOK || err != nil {
			t.Fatalf("save: status = %d, err = %v", status, err)
		}
		for _, th := range asked {
			if th != TheaterCONUS {
				t.Errorf("repository asked for %q, want conus", th)
			}
		}
		if repo.SavedCard.Theater != TheaterCONUS || repo.SavedCard.Header.Theater != TheaterCONUS {
			t.Errorf("saved card theater = %q / %q, want conus", repo.SavedCard.Theater, repo.SavedCard.Header.Theater)
		}
	})

	t.Run("the theater reaches the card, the header, every plan and the audit entry", func(t *testing.T) {
		repo := &MockRepository{}
		svc, audit := newSvc(repo, nets)

		req := saveReq(RadioJEM, dto.SaveChannelInput{ChannelNumber: 1, NetID: "oconusNet"})
		req.Theater = TheaterOCONUS
		req.Plans = append(req.Plans, dto.SavePlanInput{RadioType: RadioMPU5})
		resp := &dto.SaveCardResponse{}
		if status, err := svc.SaveCard(context.Background(), req, resp); err != nil {
			t.Fatalf("status = %d, err = %v", status, err)
		}

		saved := repo.SavedCard
		if saved.Theater != TheaterOCONUS || saved.Header.Theater != TheaterOCONUS {
			t.Errorf("card theater = %q, header = %q", saved.Theater, saved.Header.Theater)
		}
		for _, p := range saved.Plans {
			if p.Theater != TheaterOCONUS {
				t.Errorf("plan %s theater = %q, want oconus", p.RadioType, p.Theater)
			}
		}
		if resp.Card.Theater != TheaterOCONUS {
			t.Errorf("response theater = %q, want oconus", resp.Card.Theater)
		}
		if len(audit.events) != 1 {
			t.Fatalf("audit events = %d, want 1", len(audit.events))
		}
		// The id stays the section so the log still groups by squadron; the
		// name is what says which card moved.
		if ev := audit.events[0]; ev.ResourceID != "asqd" || ev.ResourceName != "asqd OCONUS" {
			t.Errorf("audit id = %q, name = %q", ev.ResourceID, ev.ResourceName)
		}
	})

	t.Run("an unknown theater is a coded 400 and nothing is written", func(t *testing.T) {
		repo := &MockRepository{}
		svc, _ := newSvc(repo, nets)

		for _, bad := range []string{"europe", "CONUS", "both"} {
			req := saveReq(RadioJEM, channel)
			req.Theater = bad
			status, err := svc.SaveCard(context.Background(), req, &dto.SaveCardResponse{})
			if status != http.StatusBadRequest || !errors.Is(err, ErrInvalidTheater) {
				t.Errorf("%q: status = %d, err = %v, want 400 PACE_INVALID_THEATER", bad, status, err)
			}
			get := &dto.GetCardRequest{Section: "asqd", Theater: bad}
			if status, err := svc.GetCard(context.Background(), get, &dto.GetCardResponse{}); status != http.StatusBadRequest || !errors.Is(err, ErrInvalidTheater) {
				t.Errorf("get %q: status = %d, err = %v", bad, status, err)
			}
		}
		if repo.SavedCard != nil {
			t.Error("a refused save must not reach the repository")
		}
	})

	t.Run("a net outside the card's theater is refused, and a both net is not", func(t *testing.T) {
		cases := []struct {
			theater, net string
			want         error
		}{
			{TheaterCONUS, "oconusNet", ErrNetWrongTheater},
			{TheaterOCONUS, "conusNet", ErrNetWrongTheater},
			{TheaterCONUS, "conusNet", nil},
			{TheaterOCONUS, "oconusNet", nil},
			{TheaterCONUS, "bothNet", nil},
			{TheaterOCONUS, "bothNet", nil},
		}
		for _, c := range cases {
			svc, _ := newSvc(&MockRepository{}, nets)
			req := saveReq(RadioJEM, dto.SaveChannelInput{ChannelNumber: 1, NetID: c.net})
			req.Theater = c.theater
			status, err := svc.SaveCard(context.Background(), req, &dto.SaveCardResponse{})
			switch {
			case c.want == nil && err != nil:
				t.Errorf("%s card + %s: unexpected %v", c.theater, c.net, err)
			case c.want != nil && (status != http.StatusBadRequest || !errors.Is(err, c.want)):
				t.Errorf("%s card + %s: status = %d, err = %v, want %v", c.theater, c.net, status, err, c.want)
			}
		}
	})

	t.Run("the emblem write stays theater-free", func(t *testing.T) {
		var gotSection, gotURL string
		repo := &MockRepository{
			SetEmblemURLFunc: func(_ context.Context, section, url string) error {
				gotSection, gotURL = section, url
				return nil
			},
		}
		svc, _ := newSvc(repo, nil)
		if status, err := svc.SetEmblem(context.Background(), "asqd", "https://blob/x.png"); err != nil {
			t.Fatalf("status = %d, err = %v", status, err)
		}
		if gotSection != "asqd" || gotURL != "https://blob/x.png" {
			t.Errorf("emblem written as (%q, %q)", gotSection, gotURL)
		}
	})
}

// The export walks both theaters, CONUS first, and says which each row is from.
func TestExportChannelsCoversBothTheaters(t *testing.T) {
	svc := NewService(&MockRepository{
		SectionExistsFunc: func(_ context.Context, s string) (bool, error) { return s == "asqd", nil },
		FindCardFunc: func(_ context.Context, s, theater string) (*CommsCard, error) {
			return &CommsCard{Section: s, Theater: theater, Plans: []*ChannelPlan{{
				Section: s, Theater: theater, RadioType: RadioJEM, Label: strings.ToUpper(theater) + " WHEEL",
				Assignments: []*ChannelAssignment{{
					ChannelNumber: 1, NetID: "n1",
					Net: &NetRef{Name: "NET " + theater, NetID: "N01", RadioType: "jem", TxFreq: "30.5", RxFreq: "30.5", FreqUnit: "MHz"},
				}},
			}}}, nil
		},
	})

	out, err := svc.ExportChannels(context.Background(), "asqd", []string{"section", "theater", "net_name"})
	if err != nil {
		t.Fatalf("export: %v", err)
	}
	lines := strings.Split(strings.TrimSpace(out), "\n")
	want := []string{"section,theater,net_name", "asqd,conus,NET conus", "asqd,oconus,NET oconus"}
	if len(lines) != len(want) {
		t.Fatalf("got %d lines:\n%s", len(lines), out)
	}
	for i := range want {
		if lines[i] != want[i] {
			t.Errorf("line %d = %q, want %q", i, lines[i], want[i])
		}
	}
}
