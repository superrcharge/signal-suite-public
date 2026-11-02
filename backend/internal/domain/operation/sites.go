package operation

import (
	"context"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"backend/internal/domain/operation/dto"
	"backend/internal/shared/contracts"

	"github.com/google/uuid"
)

func toSiteResponses(sites []*Site) []dto.SiteResponse {
	out := make([]dto.SiteResponse, 0, len(sites))
	for _, st := range sites {
		out = append(out, dto.SiteResponse{
			ID: st.ID, OperationID: st.OperationID, Position: st.Position, Name: st.Name,
		})
	}
	return out
}

// normaliseSiteNames trims every name and checks the request as a whole: each
// name 1 to 60 characters, none repeated apart from case. Unlike phases an
// empty list is fine, because an operation need not use sites. 409 for the
// repeat, as with phases.
func normaliseSiteNames(in []dto.SiteInput) ([]string, error) {
	names := make([]string, len(in))
	seen := make(map[string]bool, len(in))
	for i, st := range in {
		n := strings.TrimSpace(st.Name)
		if n == "" || utf8.RuneCountInString(n) > MaxSiteNameLength {
			return nil, ErrOperationSiteNameInvalid
		}
		if seen[strings.ToLower(n)] {
			return nil, ErrOperationSiteNameExists
		}
		seen[strings.ToLower(n)] = true
		names[i] = n
	}
	return names, nil
}

func siteNameList(sites []*Site) string {
	names := make([]string, len(sites))
	for i, st := range sites {
		names[i] = st.Name
	}
	return strings.Join(names, ", ")
}

// sameSites reports whether the request would change nothing: the same ids, in
// the same order, with the same names.
func sameSites(old, next []*Site) bool {
	if len(old) != len(next) {
		return false
	}
	for i := range old {
		if old[i].ID != next[i].ID || old[i].Name != next[i].Name {
			return false
		}
	}
	return true
}

// SaveSites replaces the operation's whole ordered site list. An entry with an
// id keeps that site (renamed, repositioned), one without is inserted, and one
// the list leaves out is deleted along with the placements at it. There is no
// carry-forward: a new site starts empty.
func (s *Service) SaveSites(ctx context.Context, req *dto.SaveSitesRequest, resp *dto.SaveSitesResponse) (int, error) {
	op, status, err := s.findOperation(ctx, req.OperationID)
	if err != nil {
		return status, err
	}
	names, err := normaliseSiteNames(req.Sites)
	if err != nil {
		return errStatus(err), err
	}

	existing, err := s.repo.FindSites(ctx, req.OperationID)
	if err != nil {
		return http.StatusInternalServerError, ErrOperationInternalError
	}
	have := make(map[string]bool, len(existing))
	for _, st := range existing {
		have[st.ID] = true
	}

	// An id that is not this operation's, or that appears twice, cannot be
	// placed, as with phases.
	var unknown []string
	order := make([]*Site, len(req.Sites))
	used := map[string]bool{}
	for i, in := range req.Sites {
		id := strings.TrimSpace(in.ID)
		switch {
		case id == "":
			id = uuid.NewString()
		case !have[id] || used[id]:
			unknown = append(unknown, id)
		}
		used[id] = true
		order[i] = &Site{ID: id, OperationID: req.OperationID, Position: i, Name: names[i]}
	}
	if len(unknown) > 0 {
		err := ErrOperationUnknownSite(unknown)
		return err.Status, err
	}

	if sameSites(existing, order) {
		resp.Sites = toSiteResponses(existing)
		return http.StatusOK, nil
	}

	if err := s.repo.ReplaceSites(ctx, req.OperationID, order, req.UpdatedBy, time.Now().UTC()); err != nil {
		return writeErr(err)
	}

	s.recordAudit(ctx, contracts.AuditEventInput{
		ActorID:      req.ActorID,
		ActorName:    req.UpdatedBy,
		ResourceType: "operation",
		ResourceID:   op.ID,
		ResourceName: op.Name,
		Action:       "update",
		Changes: map[string]any{
			"sites": map[string]any{"old": siteNameList(existing), "new": siteNameList(order)},
		},
	})

	resp.Sites = toSiteResponses(order)
	return http.StatusOK, nil
}
