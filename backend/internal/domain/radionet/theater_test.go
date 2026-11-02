package radionet

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"testing"

	"backend/internal/domain/radionet/dto"
)

// Theater is a closed tri-state with CONUS as the default, the same shape as
// radio type but with a different default: a caller that sends none is
// describing the only theater there used to be.
func TestTheater(t *testing.T) {
	t.Run("create defaults to CONUS and accepts each value", func(t *testing.T) {
		for _, c := range []struct{ in, want string }{
			{"", TheaterCONUS}, {"conus", TheaterCONUS}, {"oconus", TheaterOCONUS}, {"both", TheaterBoth},
		} {
			var created *Net
			repo := &MockRepository{CreateFunc: func(_ context.Context, n *Net) error { created = n; return nil }}
			svc, _ := newTestService(repo)
			req := &dto.CreateNetRequest{Section: "asqd", Name: "NET", Theater: c.in}
			if status, err := svc.CreateNet(context.Background(), req, &dto.CreateNetResponse{}); err != nil {
				t.Fatalf("%q: status = %d, err = %v", c.in, status, err)
			}
			if created.Theater != c.want {
				t.Errorf("%q: theater = %q, want %q", c.in, created.Theater, c.want)
			}
		}
	})

	t.Run("an unknown theater is refused on create and on update", func(t *testing.T) {
		for _, bad := range []string{"CONUS", "europe"} {
			svc, _ := newTestService(&MockRepository{})
			req := &dto.CreateNetRequest{Section: "asqd", Name: "NET", Theater: bad}
			if status, err := svc.CreateNet(context.Background(), req, &dto.CreateNetResponse{}); status != http.StatusBadRequest || !errors.Is(err, ErrInvalidTheater) {
				t.Errorf("create %q: status = %d, err = %v", bad, status, err)
			}

			repo := &MockRepository{FindByIDFunc: func(_ context.Context, _ string) (*Net, error) { return sampleNet(), nil }}
			svc, _ = newTestService(repo)
			up := &dto.UpdateNetRequest{ID: sampleNet().ID, Theater: strPtr(bad)}
			if status, err := svc.UpdateNet(context.Background(), up, &dto.UpdateNetResponse{}); status != http.StatusBadRequest || !errors.Is(err, ErrInvalidTheater) {
				t.Errorf("update %q: status = %d, err = %v", bad, status, err)
			}
		}
	})

	t.Run("the name check is asked for the theater the net is going into", func(t *testing.T) {
		var askedTheater string
		repo := &MockRepository{
			NameExistsFunc: func(_ context.Context, _, theater, _ string) (bool, error) {
				askedTheater = theater
				return false, nil
			},
		}
		svc, _ := newTestService(repo)
		req := &dto.CreateNetRequest{Section: "asqd", Name: "FIRES", Theater: TheaterOCONUS}
		if _, err := svc.CreateNet(context.Background(), req, &dto.CreateNetResponse{}); err != nil {
			t.Fatal(err)
		}
		if askedTheater != TheaterOCONUS {
			t.Errorf("NameExists asked for %q, want oconus", askedTheater)
		}
	})

	t.Run("moving a net into another theater re-checks its name there", func(t *testing.T) {
		var asked []string
		repo := &MockRepository{
			FindByIDFunc: func(_ context.Context, _ string) (*Net, error) {
				n := sampleNet()
				n.Theater = TheaterCONUS
				return n, nil
			},
			NameExistsExcludingFunc: func(_ context.Context, _, theater, name, _ string) (bool, error) {
				asked = append(asked, theater+"/"+name)
				return theater == TheaterOCONUS, nil
			},
		}
		svc, _ := newTestService(repo)

		up := &dto.UpdateNetRequest{ID: sampleNet().ID, Theater: strPtr(TheaterOCONUS)}
		status, err := svc.UpdateNet(context.Background(), up, &dto.UpdateNetResponse{})
		if status != http.StatusConflict || !errors.Is(err, ErrNetNameExists) {
			t.Errorf("status = %d, err = %v, want 409 NET_NAME_EXISTS", status, err)
		}
		if strings.Join(asked, ",") != "oconus/NET 1" {
			t.Errorf("checked %v, want the target theater with the unchanged name", asked)
		}
	})

	t.Run("a theater change is audited", func(t *testing.T) {
		repo := &MockRepository{
			FindByIDFunc: func(_ context.Context, _ string) (*Net, error) {
				n := sampleNet()
				n.Theater = TheaterCONUS
				return n, nil
			},
		}
		svc, audit := newTestService(repo)
		up := &dto.UpdateNetRequest{ID: sampleNet().ID, Theater: strPtr(TheaterBoth)}
		if status, err := svc.UpdateNet(context.Background(), up, &dto.UpdateNetResponse{}); err != nil {
			t.Fatalf("status = %d, err = %v", status, err)
		}
		if len(audit.events) != 1 {
			t.Fatalf("audit events = %d", len(audit.events))
		}
		if _, ok := audit.events[0].Changes["theater"]; !ok {
			t.Errorf("audit changes = %v, want a theater entry", audit.events[0].Changes)
		}
	})
}

// The overlap rule, as the import applies it through the same repository call
// create uses: a name is taken when a net a reader of that theater's list would
// see already carries it.
func TestImportTheater(t *testing.T) {
	t.Run("a blank theater imports as CONUS, and a missing column too", func(t *testing.T) {
		for _, body := range []string{
			"name,radio_type,theater\nALPHA,jem,\n",
			"name,radio_type\nALPHA,jem\n",
		} {
			var created []*Net
			svc := newImportService("asqd", nil, &created)
			if _, parsed, err := svc.ImportNets(context.Background(), "asqd", body, "tester"); err != nil || len(parsed.Errors) != 0 {
				t.Fatalf("import: err = %v, errors = %+v", err, parsed.Errors)
			}
			if len(created) != 1 || created[0].Theater != TheaterCONUS {
				t.Errorf("created = %+v, want one CONUS net", created)
			}
		}
	})

	t.Run("an OCONUS twin of a CONUS name is allowed, a both twin is not", func(t *testing.T) {
		existing := []*Net{{Name: "FIRES", Section: "asqd", Theater: TheaterCONUS}}

		var created []*Net
		svc := newImportService("asqd", existing, &created)
		_, parsed, err := svc.ImportNets(context.Background(), "asqd", "name,radio_type,theater\nFIRES,jem,oconus\n", "tester")
		if err != nil || len(parsed.Errors) != 0 {
			t.Fatalf("oconus twin: err = %v, errors = %+v", err, parsed.Errors)
		}
		if len(created) != 1 || created[0].Theater != TheaterOCONUS {
			t.Errorf("created = %+v, want the OCONUS twin", created)
		}

		created = nil
		svc = newImportService("asqd", existing, &created)
		_, parsed, err = svc.ImportNets(context.Background(), "asqd", "name,radio_type,theater\nfires,jem,both\n", "tester")
		if err != nil {
			t.Fatalf("both twin: %v", err)
		}
		if len(created) != 0 {
			t.Errorf("created = %+v, want nothing", created)
		}
		if len(parsed.Errors) != 1 || !strings.Contains(parsed.Errors[0].Errors[0], "already exists") {
			t.Errorf("errors = %+v, want the both twin refused", parsed.Errors)
		}
	})

	t.Run("the enum folds case", func(t *testing.T) {
		var created []*Net
		svc := newImportService("asqd", nil, &created)
		if _, parsed, err := svc.ImportNets(context.Background(), "asqd", "name,radio_type,theater\nX,jem,OCONUS\n", "tester"); err != nil || len(parsed.Errors) != 0 {
			t.Fatalf("import: err = %v, errors = %+v", err, parsed.Errors)
		}
		if len(created) != 1 || created[0].Theater != TheaterOCONUS {
			t.Errorf("created = %+v", created)
		}
	})
}
