package waveform

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository interface {
	FindAll(ctx context.Context) ([]*Waveform, error)
	FindByID(ctx context.Context, id string) (*Waveform, error)
	AbbrevExists(ctx context.Context, abbrev string) (bool, error)
	AbbrevExistsExcluding(ctx context.Context, abbrev, excludeID string) (bool, error)
	Create(ctx context.Context, w *Waveform) error
	Update(ctx context.Context, w *Waveform) error
	Delete(ctx context.Context, id string) error
}

type PostgresRepository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) Repository {
	return &PostgresRepository{db: db}
}

const selectCols = `id, abbrev, name, description, created_by, updated_by, created_at, updated_at`

func (r *PostgresRepository) scan(row pgx.Row) (*Waveform, error) {
	w := &Waveform{}
	err := row.Scan(
		&w.ID, &w.Abbrev, &w.Name, &w.Description,
		&w.CreatedBy, &w.UpdatedBy, &w.CreatedAt, &w.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return w, nil
}

func (r *PostgresRepository) FindAll(ctx context.Context) ([]*Waveform, error) {
	rows, err := r.db.Query(ctx,
		`SELECT `+selectCols+` FROM waveforms ORDER BY lower(abbrev) COLLATE natural_sort ASC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []*Waveform
	for rows.Next() {
		w, err := r.scan(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, w)
	}
	return items, rows.Err()
}

func (r *PostgresRepository) FindByID(ctx context.Context, id string) (*Waveform, error) {
	row := r.db.QueryRow(ctx,
		`SELECT `+selectCols+` FROM waveforms WHERE id = $1`, id,
	)
	w, err := r.scan(row)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrWaveformNotFound
		}
		return nil, err
	}
	return w, nil
}

func (r *PostgresRepository) AbbrevExists(ctx context.Context, abbrev string) (bool, error) {
	var exists bool
	err := r.db.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM waveforms WHERE lower(abbrev) = lower($1))`, abbrev,
	).Scan(&exists)
	return exists, err
}

func (r *PostgresRepository) AbbrevExistsExcluding(ctx context.Context, abbrev, excludeID string) (bool, error) {
	var exists bool
	err := r.db.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM waveforms WHERE lower(abbrev) = lower($1) AND id != $2)`,
		abbrev, excludeID,
	).Scan(&exists)
	return exists, err
}

func (r *PostgresRepository) Create(ctx context.Context, w *Waveform) error {
	_, err := r.db.Exec(ctx,
		`INSERT INTO waveforms (id, abbrev, name, description, created_by, updated_by, created_at, updated_at)
		 VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7)`,
		w.Abbrev, w.Name, w.Description,
		w.CreatedBy, w.UpdatedBy, w.CreatedAt, w.UpdatedAt,
	)
	return err
}

func (r *PostgresRepository) Update(ctx context.Context, w *Waveform) error {
	_, err := r.db.Exec(ctx,
		`UPDATE waveforms SET abbrev=$1, name=$2, description=$3, updated_by=$4, updated_at=$5
		 WHERE id=$6`,
		w.Abbrev, w.Name, w.Description, w.UpdatedBy, w.UpdatedAt, w.ID,
	)
	return err
}

func (r *PostgresRepository) Delete(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM waveforms WHERE id = $1`, id)
	return err
}
