package organization

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository interface {
	FindAll(ctx context.Context) ([]*Organization, error)
	FindByKey(ctx context.Context, key string) (*Organization, error)
	FindByKeys(ctx context.Context, keys []string) ([]*Organization, error)
	KeyExists(ctx context.Context, key string) (bool, error)
	NameExists(ctx context.Context, name string) (bool, error)
	NameExistsExcluding(ctx context.Context, name, excludeKey string) (bool, error)
	Create(ctx context.Context, o *Organization) error
	Update(ctx context.Context, o *Organization) error
	Delete(ctx context.Context, key string) error
}

type PostgresRepository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) Repository {
	return &PostgresRepository{db: db}
}

// selectCols ends with operation_count, a correlated count of the distinct
// operations that have this organization checked in. It is served on every
// read so a client can disable Delete on an organization in use instead of
// meeting ORGANIZATION_IN_USE after the click, and so an update's response
// (built from FindByKey) carries the real count rather than a zero. The
// subquery is an index lookup on operation_participants_org_idx (047). A NULL
// organization_key, an ad hoc participant (048), never equals a key, so it
// counts for nothing. DISTINCT states the contract even though the UNIQUE
// (operation_id, organization_key) already makes every row a separate operation.
const selectCols = `key, name, short_label, branch, color, section_key, notes, created_by, updated_by, created_at, updated_at,
	(SELECT count(DISTINCT p.operation_id) FROM operation_participants p WHERE p.organization_key = organizations.key) AS operation_count`

// scan reads the two nullable columns through pointers and maps NULL to the
// empty string, the way the rest of the domain treats "unset".
func (r *PostgresRepository) scan(row pgx.Row) (*Organization, error) {
	o := &Organization{}
	var branch, sectionKey *string
	err := row.Scan(
		&o.Key, &o.Name, &o.ShortLabel, &branch, &o.Color, &sectionKey, &o.Notes,
		&o.CreatedBy, &o.UpdatedBy, &o.CreatedAt, &o.UpdatedAt, &o.OperationCount,
	)
	if err != nil {
		return nil, err
	}
	if branch != nil {
		o.Branch = *branch
	}
	if sectionKey != nil {
		o.SectionKey = *sectionKey
	}
	return o, nil
}

// nullable turns the empty string back into SQL NULL.
func nullable(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func (r *PostgresRepository) collect(rows pgx.Rows) ([]*Organization, error) {
	defer rows.Close()
	var items []*Organization
	for rows.Next() {
		o, err := r.scan(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, o)
	}
	return items, rows.Err()
}

func (r *PostgresRepository) FindAll(ctx context.Context) ([]*Organization, error) {
	rows, err := r.db.Query(ctx,
		`SELECT `+selectCols+` FROM organizations ORDER BY lower(name) COLLATE natural_sort ASC`,
	)
	if err != nil {
		return nil, err
	}
	return r.collect(rows)
}

func (r *PostgresRepository) FindByKey(ctx context.Context, key string) (*Organization, error) {
	row := r.db.QueryRow(ctx, `SELECT `+selectCols+` FROM organizations WHERE key = $1`, key)
	o, err := r.scan(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrOrganizationNotFound
		}
		return nil, err
	}
	return o, nil
}

func (r *PostgresRepository) FindByKeys(ctx context.Context, keys []string) ([]*Organization, error) {
	if len(keys) == 0 {
		return nil, nil
	}
	rows, err := r.db.Query(ctx,
		`SELECT `+selectCols+` FROM organizations WHERE key = ANY($1)`, keys,
	)
	if err != nil {
		return nil, err
	}
	return r.collect(rows)
}

func (r *PostgresRepository) KeyExists(ctx context.Context, key string) (bool, error) {
	var exists bool
	err := r.db.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM organizations WHERE key = $1)`, key,
	).Scan(&exists)
	return exists, err
}

func (r *PostgresRepository) NameExists(ctx context.Context, name string) (bool, error) {
	var exists bool
	err := r.db.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM organizations WHERE lower(name) = lower($1))`, name,
	).Scan(&exists)
	return exists, err
}

func (r *PostgresRepository) NameExistsExcluding(ctx context.Context, name, excludeKey string) (bool, error) {
	var exists bool
	err := r.db.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM organizations WHERE lower(name) = lower($1) AND key != $2)`,
		name, excludeKey,
	).Scan(&exists)
	return exists, err
}

// mapWriteError turns the unique violations a pre-check cannot fully close (two
// requests racing) into the same coded errors the pre-checks return.
func mapWriteError(err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		switch pgErr.ConstraintName {
		case "organizations_pkey":
			return ErrOrganizationKeyExists
		case "organizations_name_lower_idx":
			return ErrOrganizationNameExists
		case "organizations_section_key_unique":
			return ErrOrganizationSectionTaken
		}
	}
	return err
}

func (r *PostgresRepository) Create(ctx context.Context, o *Organization) error {
	_, err := r.db.Exec(ctx,
		`INSERT INTO organizations (key, name, short_label, branch, color, section_key, notes, created_by, updated_by, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
		o.Key, o.Name, o.ShortLabel, nullable(o.Branch), o.Color, nullable(o.SectionKey), o.Notes,
		o.CreatedBy, o.UpdatedBy, o.CreatedAt, o.UpdatedAt,
	)
	return mapWriteError(err)
}

func (r *PostgresRepository) Update(ctx context.Context, o *Organization) error {
	_, err := r.db.Exec(ctx,
		`UPDATE organizations SET name=$1, short_label=$2, branch=$3, color=$4, section_key=$5,
		        notes=$6, updated_by=$7, updated_at=$8
		 WHERE key=$9`,
		o.Name, o.ShortLabel, nullable(o.Branch), o.Color, nullable(o.SectionKey),
		o.Notes, o.UpdatedBy, o.UpdatedAt, o.Key,
	)
	return mapWriteError(err)
}

// Delete maps a foreign-key violation to ErrOrganizationInUse. The service asks
// the usage lookup first and names the operations; this is the backstop for a
// service built without it, or a check-in added between the ask and the delete.
func (r *PostgresRepository) Delete(ctx context.Context, key string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM organizations WHERE key = $1`, key)
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23503" {
		return ErrOrganizationInUse(nil)
	}
	return err
}
