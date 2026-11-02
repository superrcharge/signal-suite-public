package operation

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"backend/internal/domain/operation/dto"
	"backend/internal/shared/contracts"
)

func toRFIResponse(f *RFI) dto.RFIResponse {
	comments := make([]dto.RFICommentResponse, 0, len(f.Comments))
	for _, c := range f.Comments {
		comments = append(comments, dto.RFICommentResponse{
			ID: c.ID, RFIID: c.RFIID, Body: c.Body, CreatedBy: c.CreatedBy,
			CreatedByID: c.CreatedByID, CreatedAt: fmtTime(c.CreatedAt),
		})
	}
	var resolvedAt *string
	if f.ResolvedAt != nil {
		s := fmtTime(*f.ResolvedAt)
		resolvedAt = &s
	}
	return dto.RFIResponse{
		ID:            f.ID,
		OperationID:   f.OperationID,
		ParticipantID: f.ParticipantID,
		Question:      f.Question,
		Status:        f.Status,
		CreatedBy:     f.CreatedBy,
		CreatedByID:   f.CreatedByID,
		ResolvedBy:    f.ResolvedBy,
		ResolvedAt:    resolvedAt,
		CreatedAt:     fmtTime(f.CreatedAt),
		UpdatedAt:     fmtTime(f.UpdatedAt),
		Comments:      comments,
	}
}

// rfiSnippet is the first 60 characters of the question, for the audit log's
// resource name.
func rfiSnippet(question string) string {
	r := []rune(question)
	if len(r) > 60 {
		return string(r[:60])
	}
	return question
}

// rfiLabel is the audit log's resource name: the operation, the unit the RFI
// was raised as and the start of the question. A removed unit reads as such.
func (s *Service) rfiLabel(ctx context.Context, op *Operation, f *RFI) (string, error) {
	unit := op.Name + " - unit removed"
	if f.ParticipantID != nil {
		p, err := s.repo.FindParticipantByID(ctx, op.ID, *f.ParticipantID)
		switch {
		case err == nil && p != nil:
			unit = participantLabel(op, p)
		case err == nil || errors.Is(err, ErrParticipantNotFound):
		default:
			return "", err
		}
	}
	return unit + " - " + rfiSnippet(f.Question), nil
}

// ListRFIs returns the operation's RFIs in the order the repository gives them:
// open ones newest first, then resolved ones, comments oldest first.
func (s *Service) ListRFIs(ctx context.Context, operationID string, resp *dto.ListRFIsResponse) (int, error) {
	if _, status, err := s.findOperation(ctx, operationID); err != nil {
		return status, err
	}
	items, err := s.repo.FindRFIs(ctx, operationID)
	if err != nil {
		return http.StatusInternalServerError, ErrOperationInternalError
	}
	resp.RFIs = make([]dto.RFIResponse, 0, len(items))
	for _, f := range items {
		resp.RFIs = append(resp.RFIs, toRFIResponse(f))
	}
	return http.StatusOK, nil
}

// CreateRFI posts a question as one of the operation's units: 201.
func (s *Service) CreateRFI(ctx context.Context, req *dto.CreateRFIRequest, resp *dto.RFIResponse) (int, error) {
	op, status, err := s.findOperation(ctx, req.OperationID)
	if err != nil {
		return status, err
	}
	question := strings.TrimSpace(req.Question)
	if n := utf8.RuneCountInString(question); n == 0 || n > MaxRFIQuestionLength {
		return errStatus(ErrRFIQuestionInvalid), ErrRFIQuestionInvalid
	}

	// The unit must be this operation's, which the foreign key cannot say.
	pid := strings.TrimSpace(req.ParticipantID)
	p, err := s.repo.FindParticipantByID(ctx, req.OperationID, pid)
	if err != nil {
		if errors.Is(err, ErrParticipantNotFound) {
			return http.StatusNotFound, ErrParticipantNotFound
		}
		return http.StatusInternalServerError, ErrOperationInternalError
	}
	if p == nil {
		return http.StatusNotFound, ErrParticipantNotFound
	}

	f := &RFI{
		OperationID:   req.OperationID,
		ParticipantID: &pid,
		Question:      question,
		Status:        "open",
		CreatedBy:     req.CreatedBy,
		CreatedByID:   req.ActorID,
		CreatedAt:     time.Now().UTC(),
		Comments:      []*RFIComment{},
	}
	f.UpdatedAt = f.CreatedAt
	if err := s.repo.CreateRFI(ctx, f); err != nil {
		return writeErr(err)
	}

	s.recordAudit(ctx, contracts.AuditEventInput{
		ActorID:      req.ActorID,
		ActorName:    req.CreatedBy,
		ResourceType: "operation_rfi",
		ResourceID:   f.ID,
		ResourceName: participantLabel(op, p) + " - " + rfiSnippet(question),
		Action:       "create",
	})

	*resp = toRFIResponse(f)
	return http.StatusCreated, nil
}

// findOpenRFI reads an RFI of the operation and refuses a resolved one.
func (s *Service) findOpenRFI(ctx context.Context, operationID, rfiID string) (*RFI, int, error) {
	f, err := s.repo.FindRFI(ctx, operationID, rfiID)
	if err != nil {
		if errors.Is(err, ErrRFINotFound) {
			return nil, http.StatusNotFound, ErrRFINotFound
		}
		return nil, http.StatusInternalServerError, ErrOperationInternalError
	}
	if f == nil {
		return nil, http.StatusNotFound, ErrRFINotFound
	}
	if f.Status != "open" {
		return nil, http.StatusConflict, ErrRFIResolved
	}
	return f, http.StatusOK, nil
}

// AddRFIComment appends a reply to an open RFI: 201 with the whole RFI.
func (s *Service) AddRFIComment(ctx context.Context, req *dto.AddRFICommentRequest, resp *dto.RFIResponse) (int, error) {
	op, status, err := s.findOperation(ctx, req.OperationID)
	if err != nil {
		return status, err
	}
	f, status, err := s.findOpenRFI(ctx, req.OperationID, req.RFIID)
	if err != nil {
		return status, err
	}
	body := strings.TrimSpace(req.Body)
	if n := utf8.RuneCountInString(body); n == 0 || n > MaxRFICommentLength {
		return errStatus(ErrRFICommentInvalid), ErrRFICommentInvalid
	}

	c := &RFIComment{
		RFIID:       f.ID,
		Body:        body,
		CreatedBy:   req.CreatedBy,
		CreatedByID: req.ActorID,
		CreatedAt:   time.Now().UTC(),
	}
	if err := s.repo.AddRFIComment(ctx, req.OperationID, c); err != nil {
		return writeErr(err)
	}
	f.Comments = append(f.Comments, c)

	label, err := s.rfiLabel(ctx, op, f)
	if err != nil {
		return http.StatusInternalServerError, ErrOperationInternalError
	}
	s.recordAudit(ctx, contracts.AuditEventInput{
		ActorID:      req.ActorID,
		ActorName:    req.CreatedBy,
		ResourceType: "operation_rfi",
		ResourceID:   f.ID,
		ResourceName: label,
		Action:       "update",
		Changes: map[string]any{
			"comment": map[string]any{"old": "", "new": body},
		},
	})

	*resp = toRFIResponse(f)
	return http.StatusCreated, nil
}

// ResolveRFI closes an open RFI. Only the user who posted it may: the check is
// on the local user id, because created_by is a display name and not an identity.
func (s *Service) ResolveRFI(ctx context.Context, req *dto.ResolveRFIRequest, resp *dto.RFIResponse) (int, error) {
	op, status, err := s.findOperation(ctx, req.OperationID)
	if err != nil {
		return status, err
	}
	f, status, err := s.findOpenRFI(ctx, req.OperationID, req.RFIID)
	if err != nil {
		return status, err
	}
	if req.ActorID == "" || req.ActorID != f.CreatedByID {
		return errStatus(ErrRFINotPoster), ErrRFINotPoster
	}

	now := time.Now().UTC()
	if err := s.repo.ResolveRFI(ctx, req.OperationID, f.ID, req.ResolvedBy, now); err != nil {
		return writeErr(err)
	}
	f.Status = "resolved"
	f.ResolvedBy = req.ResolvedBy
	f.ResolvedAt = &now
	f.UpdatedAt = now

	label, err := s.rfiLabel(ctx, op, f)
	if err != nil {
		return http.StatusInternalServerError, ErrOperationInternalError
	}
	s.recordAudit(ctx, contracts.AuditEventInput{
		ActorID:      req.ActorID,
		ActorName:    req.ResolvedBy,
		ResourceType: "operation_rfi",
		ResourceID:   f.ID,
		ResourceName: label,
		Action:       "update",
		Changes: map[string]any{
			"status": map[string]any{"old": "open", "new": "resolved"},
		},
	})

	*resp = toRFIResponse(f)
	return http.StatusOK, nil
}
