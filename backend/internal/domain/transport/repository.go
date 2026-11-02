package transport

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository interface {
	FindAll(ctx context.Context) ([]*Transport, error)
	FindByID(ctx context.Context, id string) (*Transport, error)
	NameExists(ctx context.Context, name string) (bool, error)
	NameExistsExcluding(ctx context.Context, name, excludeID string) (bool, error)
	Create(ctx context.Context, t *Transport) error
	Update(ctx context.Context, t *Transport) error
	Delete(ctx context.Context, id string) error
}

type PostgresRepository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) Repository {
	return &PostgresRepository{db: db}
}

const selectCols = `id, name, kind, provider, description, owned_by, owner_country, created_by, updated_by, created_at, updated_at`

func (r *PostgresRepository) scan(row pgx.Row) (*Transport, error) {
	t := &Transport{}
	err := row.Scan(
		&t.ID, &t.Name, &t.Kind, &t.Provider, &t.Description, &t.OwnedBy, &t.OwnerCountry,
		&t.CreatedBy, &t.UpdatedBy, &t.CreatedAt, &t.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return t, nil
}

func (r *PostgresRepository) FindAll(ctx context.Context) ([]*Transport, error) {
	rows, err := r.db.Query(ctx,
		`SELECT `+selectCols+` FROM transports ORDER BY lower(name) COLLATE natural_sort ASC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []*Transport
	for rows.Next() {
		t, err := r.scan(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, t)
	}
	return items, rows.Err()
}

func (r *PostgresRepository) FindByID(ctx context.Context, id string) (*Transport, error) {
	row := r.db.QueryRow(ctx,
		`SELECT `+selectCols+` FROM transports WHERE id = $1`, id,
	)
	t, err := r.scan(row)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrTransportNotFound
		}
		return nil, err
	}
	return t, nil
}

func (r *PostgresRepository) NameExists(ctx context.Context, name string) (bool, error) {
	var exists bool
	err := r.db.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM transports WHERE lower(name) = lower($1))`, name,
	).Scan(&exists)
	return exists, err
}

func (r *PostgresRepository) NameExistsExcluding(ctx context.Context, name, excludeID string) (bool, error) {
	var exists bool
	err := r.db.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM transports WHERE lower(name) = lower($1) AND id != $2)`,
		name, excludeID,
	).Scan(&exists)
	return exists, err
}

func (r *PostgresRepository) Create(ctx context.Context, t *Transport) error {
	_, err := r.db.Exec(ctx,
		`INSERT INTO transports (id, name, kind, provider, description, owned_by, owner_country, created_by, updated_by, created_at, updated_at)
		 VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
		t.Name, t.Kind, t.Provider, t.Description, t.OwnedBy, t.OwnerCountry,
		t.CreatedBy, t.UpdatedBy, t.CreatedAt, t.UpdatedAt,
	)
	return err
}

func (r *PostgresRepository) Update(ctx context.Context, t *Transport) error {
	_, err := r.db.Exec(ctx,
		`UPDATE transports SET name=$1, kind=$2, provider=$3, description=$4, owned_by=$5, owner_country=$6, updated_by=$7, updated_at=$8
		 WHERE id=$9`,
		t.Name, t.Kind, t.Provider, t.Description, t.OwnedBy, t.OwnerCountry, t.UpdatedBy, t.UpdatedAt, t.ID,
	)
	return err
}

func (r *PostgresRepository) Delete(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM transports WHERE id = $1`, id)
	return err
}
