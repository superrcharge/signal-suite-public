package section

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository interface {
	Create(ctx context.Context, sec *Section) error
	FindByKey(ctx context.Context, key string) (*Section, error)
	FindAll(ctx context.Context) ([]*Section, error)
	Update(ctx context.Context, sec *Section) error
	Delete(ctx context.Context, key string) error
}

type PostgresRepository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{db: db}
}

func (r *PostgresRepository) Create(ctx context.Context, sec *Section) error {
	query := `INSERT INTO sections (key, label, color, pace_enabled) VALUES ($1, $2, $3, $4)`
	_, err := r.db.Exec(ctx, query, sec.Key, sec.Label, sec.Color, sec.PaceEnabled)
	return err
}

func (r *PostgresRepository) FindByKey(ctx context.Context, key string) (*Section, error) {
	query := `SELECT key, label, color, pace_enabled FROM sections WHERE key = $1`
	sec := &Section{}
	err := r.db.QueryRow(ctx, query, key).Scan(&sec.Key, &sec.Label, &sec.Color, &sec.PaceEnabled)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrSectionNotFound
	}
	if err != nil {
		return nil, err
	}
	return sec, nil
}

func (r *PostgresRepository) FindAll(ctx context.Context) ([]*Section, error) {
	query := `SELECT key, label, color, pace_enabled FROM sections ORDER BY label COLLATE natural_sort`
	rows, err := r.db.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sections []*Section
	for rows.Next() {
		sec := &Section{}
		if err := rows.Scan(&sec.Key, &sec.Label, &sec.Color, &sec.PaceEnabled); err != nil {
			return nil, err
		}
		sections = append(sections, sec)
	}
	return sections, rows.Err()
}

func (r *PostgresRepository) Update(ctx context.Context, sec *Section) error {
	query := `UPDATE sections SET label = $2, color = $3, pace_enabled = $4 WHERE key = $1`
	result, err := r.db.Exec(ctx, query, sec.Key, sec.Label, sec.Color, sec.PaceEnabled)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return ErrSectionNotFound
	}
	return nil
}

func (r *PostgresRepository) Delete(ctx context.Context, key string) error {
	query := `DELETE FROM sections WHERE key = $1`
	result, err := r.db.Exec(ctx, query, key)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return ErrSectionNotFound
	}
	return nil
}
