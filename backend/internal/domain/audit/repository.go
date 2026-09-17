package audit

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository interface {
	Insert(ctx context.Context, e *Event) error
	FindAll(ctx context.Context, f Filters, page, limit int) ([]*Event, int, error)
}

// Filters describes the optional narrowing params on FindAll. Zero
// values mean "no filter on that dimension".
type Filters struct {
	ResourceType string
	ResourceID   string
	ActorID      string
	Action       string
	Since        time.Time // IsZero() = no lower bound
	Until        time.Time // IsZero() = no upper bound
}

type PostgresRepository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{db: db}
}

func (r *PostgresRepository) Insert(ctx context.Context, e *Event) error {
	var changesJSON []byte
	if e.Changes != nil {
		j, err := json.Marshal(e.Changes)
		if err != nil {
			return err
		}
		changesJSON = j
	}

	_, err := r.db.Exec(ctx, `
		INSERT INTO audit_log (
			id, actor_id, actor_name, actor_email,
			resource_type, resource_id, resource_name,
			action, changes, created_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
	`,
		e.ID, e.ActorID, e.ActorName, e.ActorEmail,
		e.ResourceType, e.ResourceID, e.ResourceName,
		e.Action, changesJSON, e.CreatedAt,
	)
	return err
}

const selectCols = `id, actor_id, actor_name, actor_email,
	resource_type, resource_id, resource_name,
	action, changes, created_at`

func (r *PostgresRepository) FindAll(ctx context.Context, f Filters, page, limit int) ([]*Event, int, error) {
	var conditions []string
	var args []any
	argIdx := 1

	if f.ResourceType != "" {
		conditions = append(conditions, fmt.Sprintf("resource_type = $%d", argIdx))
		args = append(args, f.ResourceType)
		argIdx++
	}
	if f.ResourceID != "" {
		conditions = append(conditions, fmt.Sprintf("resource_id = $%d", argIdx))
		args = append(args, f.ResourceID)
		argIdx++
	}
	if f.ActorID != "" {
		conditions = append(conditions, fmt.Sprintf("actor_id = $%d", argIdx))
		args = append(args, f.ActorID)
		argIdx++
	}
	if f.Action != "" {
		conditions = append(conditions, fmt.Sprintf("action = $%d", argIdx))
		args = append(args, f.Action)
		argIdx++
	}
	if !f.Since.IsZero() {
		conditions = append(conditions, fmt.Sprintf("created_at >= $%d", argIdx))
		args = append(args, f.Since)
		argIdx++
	}
	if !f.Until.IsZero() {
		conditions = append(conditions, fmt.Sprintf("created_at < $%d", argIdx))
		args = append(args, f.Until)
		argIdx++
	}

	where := ""
	if len(conditions) > 0 {
		where = "WHERE " + strings.Join(conditions, " AND ")
	}

	var total int
	if err := r.db.QueryRow(ctx,
		fmt.Sprintf("SELECT COUNT(*) FROM audit_log %s", where),
		args...,
	).Scan(&total); err != nil {
		return nil, 0, err
	}

	offset := (page - 1) * limit
	query := fmt.Sprintf(
		`SELECT %s FROM audit_log %s ORDER BY created_at DESC LIMIT $%d OFFSET $%d`,
		selectCols, where, argIdx, argIdx+1,
	)
	args = append(args, limit, offset)

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var events []*Event
	for rows.Next() {
		e := &Event{}
		var changesJSON []byte
		if err := rows.Scan(
			&e.ID, &e.ActorID, &e.ActorName, &e.ActorEmail,
			&e.ResourceType, &e.ResourceID, &e.ResourceName,
			&e.Action, &changesJSON, &e.CreatedAt,
		); err != nil {
			return nil, 0, err
		}
		if len(changesJSON) > 0 {
			if err := json.Unmarshal(changesJSON, &e.Changes); err != nil {
				// Non-fatal: leave Changes nil if the stored JSON is
				// malformed for some reason. The row is still useful.
				e.Changes = nil
			}
		}
		events = append(events, e)
	}
	return events, total, rows.Err()
}
