package operation

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"testing"
	"time"

	"backend/internal/domain/operation/dto"
)

type rfiFixture struct {
	repo    *MockRepository
	svc     *Service
	rec     *recorder
	created *RFI
	comment *RFIComment
	resolve int
	by      string
}

// rfiRepoFor builds a repository holding one participant ("pt-1", Alpha) and
// the given RFI, which FindRFI returns.
func rfiRepoFor(existing *RFI) *rfiFixture {
	fx := &rfiFixture{rec: &recorder{}}
	fx.repo = &MockRepository{
		FindByIDFunc: func(_ context.Context, id string) (*Operation, error) {
			return &Operation{ID: id, Name: "Exercise One"}, nil
		},
		FindParticipantByIDFunc: func(_ context.Context, opID, pid string) (*Participant, error) {
			if opID == "op-1" && pid == "pt-1" {
				return &Participant{ID: "pt-1", OperationID: "op-1", AdhocName: "Alpha"}, nil
			}
			return nil, ErrParticipantNotFound
		},
		FindRFIsFunc: func(context.Context, string) ([]*RFI, error) {
			if existing == nil {
				return nil, nil
			}
			return []*RFI{existing}, nil
		},
		FindRFIFunc: func(_ context.Context, _, id string) (*RFI, error) {
			if existing != nil && existing.ID == id {
				return existing, nil
			}
			return nil, ErrRFINotFound
		},
		CreateRFIFunc: func(_ context.Context, r *RFI) error {
			r.ID = "rfi-new"
			fx.created = r
			return nil
		},
		AddRFICommentFunc: func(_ context.Context, _ string, c *RFIComment) error {
			c.ID = "cm-new"
			fx.comment = c
			return nil
		},
		ResolveRFIFunc: func(_ context.Context, _, _, by string, _ time.Time) error {
			fx.resolve++
			fx.by = by
			return nil
		},
	}
	fx.svc = NewService(fx.repo)
	fx.svc.SetAudit(fx.rec)
	return fx
}

func openRFI() *RFI {
	pid := "pt-1"
	return &RFI{
		ID: "rfi-1", OperationID: "op-1", ParticipantID: &pid, Question: "Where is the fuel point?",
		Status: "open", CreatedBy: "Mike", CreatedByID: "u-poster", Comments: []*RFIComment{},
	}
}

func TestCreateRFI(t *testing.T) {
	create := func(fx *rfiFixture, pid, q string) (*dto.RFIResponse, int, error) {
		resp := &dto.RFIResponse{}
		status, err := fx.svc.CreateRFI(context.Background(), &dto.CreateRFIRequest{
			OperationID: "op-1", ParticipantID: pid, Question: q, CreatedBy: "Mike", ActorID: "u-poster",
		}, resp)
		return resp, status, err
	}

	t.Run("stores the question under both the name and the id, and audits it", func(t *testing.T) {
		fx := rfiRepoFor(nil)
		resp, status, err := create(fx, "pt-1", "  Where is the fuel point?  ")
		if status != http.StatusCreated || err != nil {
			t.Fatalf("status = %d, err = %v", status, err)
		}
		if fx.created == nil || fx.created.Question != "Where is the fuel point?" || fx.created.CreatedBy != "Mike" || fx.created.CreatedByID != "u-poster" {
			t.Errorf("stored %+v; want the trimmed question by Mike under id u-poster", fx.created)
		}
		if resp.ID != "rfi-new" || resp.Status != "open" || resp.Comments == nil || len(resp.Comments) != 0 {
			t.Errorf("response = %+v; want an open RFI with an empty, non-nil comments list", resp)
		}
		if len(fx.rec.events) != 1 {
			t.Fatalf("events = %d; want 1", len(fx.rec.events))
		}
		ev := fx.rec.events[0]
		if ev.ResourceType != "operation_rfi" || ev.Action != "create" || ev.ResourceID != "rfi-new" ||
			ev.ResourceName != "Exercise One - Alpha - Where is the fuel point?" || ev.ActorID != "u-poster" {
			t.Errorf("event = %+v", ev)
		}
	})

	t.Run("a blank question is refused", func(t *testing.T) {
		fx := rfiRepoFor(nil)
		_, status, err := create(fx, "pt-1", "   ")
		if !errors.Is(err, ErrRFIQuestionInvalid) || status != http.StatusBadRequest || fx.created != nil {
			t.Errorf("status = %d, err = %v, stored = %v; want 400 RFI_QUESTION_INVALID and nothing stored", status, err, fx.created)
		}
	})

	t.Run("a question over 2000 characters is refused, 2000 is not", func(t *testing.T) {
		fx := rfiRepoFor(nil)
		if _, _, err := create(fx, "pt-1", strings.Repeat("a", MaxRFIQuestionLength)); err != nil {
			t.Errorf("2000 characters: %v", err)
		}
		_, status, err := create(fx, "pt-1", strings.Repeat("a", MaxRFIQuestionLength+1))
		if !errors.Is(err, ErrRFIQuestionInvalid) || status != http.StatusBadRequest {
			t.Errorf("2001 characters: status = %d, err = %v", status, err)
		}
	})

	t.Run("a participant of another operation is refused", func(t *testing.T) {
		fx := rfiRepoFor(nil)
		_, status, err := create(fx, "pt-elsewhere", "Anyone there?")
		if !errors.Is(err, ErrParticipantNotFound) || status != http.StatusNotFound || fx.created != nil || len(fx.rec.events) != 0 {
			t.Errorf("status = %d, err = %v, stored = %v, events = %d; want 404 PARTICIPANT_NOT_FOUND and nothing written", status, err, fx.created, len(fx.rec.events))
		}
	})

	t.Run("an unknown operation is a 404", func(t *testing.T) {
		fx := rfiRepoFor(nil)
		fx.repo.FindByIDFunc = func(context.Context, string) (*Operation, error) { return nil, ErrOperationNotFound }
		_, status, err := create(fx, "pt-1", "Hello?")
		if !errors.Is(err, ErrOperationNotFound) || status != http.StatusNotFound {
			t.Errorf("status = %d, err = %v", status, err)
		}
	})
}

func TestListRFIs(t *testing.T) {
	existing := openRFI()
	existing.Comments = []*RFIComment{{ID: "cm-1", RFIID: "rfi-1", Body: "Grid 123", CreatedBy: "Sam", CreatedByID: "u-2"}}
	fx := rfiRepoFor(existing)

	resp := &dto.ListRFIsResponse{}
	status, err := fx.svc.ListRFIs(context.Background(), "op-1", resp)
	if status != http.StatusOK || err != nil {
		t.Fatalf("status = %d, err = %v", status, err)
	}
	if len(resp.RFIs) != 1 || resp.RFIs[0].ID != "rfi-1" || len(resp.RFIs[0].Comments) != 1 || resp.RFIs[0].Comments[0].Body != "Grid 123" {
		t.Errorf("response = %+v; want the repository's RFI and thread passed through", resp.RFIs)
	}

	empty := rfiRepoFor(nil)
	resp = &dto.ListRFIsResponse{}
	if status, err := empty.svc.ListRFIs(context.Background(), "op-1", resp); status != http.StatusOK || err != nil || resp.RFIs == nil || len(resp.RFIs) != 0 {
		t.Errorf("empty: status = %d, err = %v, rfis = %v; want 200 and []", status, err, resp.RFIs)
	}
}

func TestAddRFIComment(t *testing.T) {
	add := func(fx *rfiFixture, rfiID, body string) (*dto.RFIResponse, int, error) {
		resp := &dto.RFIResponse{}
		status, err := fx.svc.AddRFIComment(context.Background(), &dto.AddRFICommentRequest{
			OperationID: "op-1", RFIID: rfiID, Body: body, CreatedBy: "Sam", ActorID: "u-2",
		}, resp)
		return resp, status, err
	}

	t.Run("appends a reply and audits it with a diff", func(t *testing.T) {
		fx := rfiRepoFor(openRFI())
		resp, status, err := add(fx, "rfi-1", " Grid 123 ")
		if status != http.StatusCreated || err != nil {
			t.Fatalf("status = %d, err = %v", status, err)
		}
		if fx.comment == nil || fx.comment.Body != "Grid 123" || fx.comment.CreatedBy != "Sam" || fx.comment.CreatedByID != "u-2" || fx.comment.RFIID != "rfi-1" {
			t.Errorf("stored %+v", fx.comment)
		}
		if len(resp.Comments) != 1 || resp.Comments[0].ID != "cm-new" {
			t.Errorf("response comments = %+v", resp.Comments)
		}
		if len(fx.rec.events) != 1 {
			t.Fatalf("events = %d; want 1", len(fx.rec.events))
		}
		ev := fx.rec.events[0]
		if ev.ResourceType != "operation_rfi" || ev.Action != "update" || ev.ResourceName != "Exercise One - Alpha - Where is the fuel point?" {
			t.Errorf("event = %+v", ev)
		}
		if ch, ok := ev.Changes["comment"].(map[string]any); !ok || ch["new"] != "Grid 123" {
			t.Errorf("changes = %+v; want the comment as the new value", ev.Changes)
		}
	})

	t.Run("a resolved RFI takes no reply", func(t *testing.T) {
		done := openRFI()
		done.Status = "resolved"
		fx := rfiRepoFor(done)
		_, status, err := add(fx, "rfi-1", "Too late")
		if !errors.Is(err, ErrRFIResolved) || status != http.StatusConflict || fx.comment != nil {
			t.Errorf("status = %d, err = %v, stored = %v; want 409 RFI_RESOLVED", status, err, fx.comment)
		}
	})

	t.Run("an unknown RFI is a 404", func(t *testing.T) {
		fx := rfiRepoFor(openRFI())
		_, status, err := add(fx, "rfi-ghost", "Hello")
		if !errors.Is(err, ErrRFINotFound) || status != http.StatusNotFound {
			t.Errorf("status = %d, err = %v", status, err)
		}
	})

	t.Run("a blank reply is refused", func(t *testing.T) {
		fx := rfiRepoFor(openRFI())
		_, status, err := add(fx, "rfi-1", "  \n ")
		if !errors.Is(err, ErrRFICommentInvalid) || status != http.StatusBadRequest || fx.comment != nil {
			t.Errorf("status = %d, err = %v, stored = %v; want 400 RFI_COMMENT_INVALID", status, err, fx.comment)
		}
	})

	t.Run("a race to resolution surfaces the repository's 409", func(t *testing.T) {
		fx := rfiRepoFor(openRFI())
		fx.repo.AddRFICommentFunc = func(context.Context, string, *RFIComment) error { return ErrRFIResolved }
		_, status, err := add(fx, "rfi-1", "Hello")
		if !errors.Is(err, ErrRFIResolved) || status != http.StatusConflict {
			t.Errorf("status = %d, err = %v", status, err)
		}
	})
}

func TestResolveRFI(t *testing.T) {
	resolve := func(fx *rfiFixture, actor string) (*dto.RFIResponse, int, error) {
		resp := &dto.RFIResponse{}
		status, err := fx.svc.ResolveRFI(context.Background(), &dto.ResolveRFIRequest{
			OperationID: "op-1", RFIID: "rfi-1", ResolvedBy: "Mike", ActorID: actor,
		}, resp)
		return resp, status, err
	}

	t.Run("the poster resolves it, and the audit carries the status diff", func(t *testing.T) {
		fx := rfiRepoFor(openRFI())
		resp, status, err := resolve(fx, "u-poster")
		if status != http.StatusOK || err != nil {
			t.Fatalf("status = %d, err = %v", status, err)
		}
		if fx.resolve != 1 || fx.by != "Mike" {
			t.Errorf("resolve calls = %d by %q; want 1 by Mike", fx.resolve, fx.by)
		}
		if resp.Status != "resolved" || resp.ResolvedBy != "Mike" || resp.ResolvedAt == nil {
			t.Errorf("response = %+v; want resolved by Mike with a time", resp)
		}
		if len(fx.rec.events) != 1 {
			t.Fatalf("events = %d; want 1", len(fx.rec.events))
		}
		ev := fx.rec.events[0]
		if ev.ResourceType != "operation_rfi" || ev.Action != "update" {
			t.Errorf("event = %+v", ev)
		}
		if ch, ok := ev.Changes["status"].(map[string]any); !ok || ch["old"] != "open" || ch["new"] != "resolved" {
			t.Errorf("changes = %+v; want status open -> resolved", ev.Changes)
		}
	})

	t.Run("anyone else is refused, however privileged", func(t *testing.T) {
		fx := rfiRepoFor(openRFI())
		_, status, err := resolve(fx, "u-someone-else")
		if !errors.Is(err, ErrRFINotPoster) || status != http.StatusForbidden || fx.resolve != 0 || len(fx.rec.events) != 0 {
			t.Errorf("status = %d, err = %v, writes = %d; want 403 RFI_NOT_POSTER and nothing written", status, err, fx.resolve)
		}
	})

	t.Run("a caller with no id never matches an RFI with none", func(t *testing.T) {
		legacy := openRFI()
		legacy.CreatedByID = ""
		fx := rfiRepoFor(legacy)
		_, status, err := resolve(fx, "")
		if !errors.Is(err, ErrRFINotPoster) || status != http.StatusForbidden {
			t.Errorf("status = %d, err = %v", status, err)
		}
	})

	t.Run("an already resolved RFI is a 409", func(t *testing.T) {
		done := openRFI()
		done.Status = "resolved"
		fx := rfiRepoFor(done)
		_, status, err := resolve(fx, "u-poster")
		if !errors.Is(err, ErrRFIResolved) || status != http.StatusConflict || fx.resolve != 0 {
			t.Errorf("status = %d, err = %v", status, err)
		}
	})

	t.Run("an unknown RFI is a 404", func(t *testing.T) {
		fx := rfiRepoFor(nil)
		_, status, err := resolve(fx, "u-poster")
		if !errors.Is(err, ErrRFINotFound) || status != http.StatusNotFound {
			t.Errorf("status = %d, err = %v", status, err)
		}
	})

	t.Run("an RFI whose unit was removed still audits", func(t *testing.T) {
		orphan := openRFI()
		orphan.ParticipantID = nil
		fx := rfiRepoFor(orphan)
		if _, status, err := resolve(fx, "u-poster"); status != http.StatusOK || err != nil {
			t.Fatalf("status = %d, err = %v", status, err)
		}
		if got := fx.rec.events[0].ResourceName; got != "Exercise One - unit removed - Where is the fuel point?" {
			t.Errorf("resource name = %q", got)
		}
	})
}
