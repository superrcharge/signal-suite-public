package platform

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository interface {
	FindAll(ctx context.Context) ([]*Platform, error)
	FindByID(ctx context.Context, id string) (*Platform, error)
	DesignationExists(ctx context.Context, designation string) (bool, error)
	DesignationExistsExcluding(ctx context.Context, designation, excludeID string) (bool, error)
	Create(ctx context.Context, p *Platform) error
	Update(ctx context.Context, p *Platform) error
	Delete(ctx context.Context, id string) error
	WaveformUsage(ctx context.Context) (map[string][]string, error)
	RenameWaveform(ctx context.Context, from, to string) (int, error)
}

type PostgresRepository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) Repository {
	return &PostgresRepository{db: db}
}

const selectCols = `id, designation, popular_name, category, kind, operator, waveform_abbrevs, equipment_ids, notes, created_by, updated_by, created_at, updated_at`

func (r *PostgresRepository) scan(row pgx.Row) (*Platform, error) {
	p := &Platform{}
	err := row.Scan(
		&p.ID, &p.Designation, &p.PopularName, &p.Category, &p.Kind, &p.Operator,
		&p.WaveformAbbrevs, &p.EquipmentIDs, &p.Notes,
		&p.CreatedBy, &p.UpdatedBy, &p.CreatedAt, &p.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return p, nil
}

func (r *PostgresRepository) FindAll(ctx context.Context) ([]*Platform, error) {
	rows, err := r.db.Query(ctx,
		`SELECT `+selectCols+` FROM platforms ORDER BY lower(designation) COLLATE natural_sort ASC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []*Platform
	for rows.Next() {
		p, err := r.scan(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, p)
	}
	return items, rows.Err()
}

func (r *PostgresRepository) FindByID(ctx context.Context, id string) (*Platform, error) {
	row := r.db.QueryRow(ctx,
		`SELECT `+selectCols+` FROM platforms WHERE id = $1`, id,
	)
	p, err := r.scan(row)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrPlatformNotFound
		}
		return nil, err
	}
	return p, nil
}

func (r *PostgresRepository) DesignationExists(ctx context.Context, designation string) (bool, error) {
	var exists bool
	err := r.db.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM platforms WHERE lower(designation) = lower($1))`, designation,
	).Scan(&exists)
	return exists, err
}

func (r *PostgresRepository) DesignationExistsExcluding(ctx context.Context, designation, excludeID string) (bool, error) {
	var exists bool
	err := r.db.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM platforms WHERE lower(designation) = lower($1) AND id != $2)`,
		designation, excludeID,
	).Scan(&exists)
	return exists, err
}

// nonNil keeps a nil slice from reaching a NOT NULL array column. pgx encodes
// a nil []string as SQL NULL, not as '{}'.
func nonNil(s []string) []string {
	if s == nil {
		return []string{}
	}
	return s
}

func (r *PostgresRepository) Create(ctx context.Context, p *Platform) error {
	_, err := r.db.Exec(ctx,
		`INSERT INTO platforms (id, designation, popular_name, category, kind, operator, waveform_abbrevs, equipment_ids, notes, created_by, updated_by, created_at, updated_at)
		 VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
		p.Designation, p.PopularName, p.Category, p.Kind, p.Operator,
		nonNil(p.WaveformAbbrevs), nonNil(p.EquipmentIDs), p.Notes,
		p.CreatedBy, p.UpdatedBy, p.CreatedAt, p.UpdatedAt,
	)
	return err
}

func (r *PostgresRepository) Update(ctx context.Context, p *Platform) error {
	_, err := r.db.Exec(ctx,
		`UPDATE platforms SET designation=$1, popular_name=$2, category=$3, kind=$4, operator=$5,
		        waveform_abbrevs=$6, equipment_ids=$7, notes=$8, updated_by=$9, updated_at=$10
		 WHERE id=$11`,
		p.Designation, p.PopularName, p.Category, p.Kind, p.Operator,
		nonNil(p.WaveformAbbrevs), nonNil(p.EquipmentIDs), p.Notes,
		p.UpdatedBy, p.UpdatedAt, p.ID,
	)
	return err
}

func (r *PostgresRepository) Delete(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM platforms WHERE id = $1`, id)
	return err
}

// WaveformUsage maps a normalised abbrev to the designation of every platform
// carrying it. See contracts.WaveformAssets for why this is one map rather than
// a per-abbrev lookup.
//
// unnest rather than the JSONB dance the equipment side needs: waveform_abbrevs
// is a TEXT[] column, so there is no document to walk and no type to guard.
func (r *PostgresRepository) WaveformUsage(ctx context.Context) (map[string][]string, error) {
	rows, err := r.db.Query(ctx, `
		SELECT lower(trim(a)) AS abbrev, p.designation
		FROM platforms p
		CROSS JOIN LATERAL unnest(p.waveform_abbrevs) AS a
		WHERE trim(a) <> ''
		ORDER BY 1, 2`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	usage := map[string][]string{}
	for rows.Next() {
		var abbrev, designation string
		if err := rows.Scan(&abbrev, &designation); err != nil {
			return nil, err
		}
		usage[abbrev] = append(usage[abbrev], designation)
	}
	return usage, rows.Err()
}

// RenameWaveform rewrites every carried copy of `from` to `to`, preserving each
// platform's array order so a renamed abbrev does not jump position on the
// matrix or in the CSV.
func (r *PostgresRepository) RenameWaveform(ctx context.Context, from, to string) (int, error) {
	tag, err := r.db.Exec(ctx, `
		UPDATE platforms p
		SET waveform_abbrevs = (
			SELECT COALESCE(array_agg(
				CASE WHEN lower(trim(a)) = lower(trim($1)) THEN $2 ELSE a END
				ORDER BY ord
			), '{}')
			FROM unnest(p.waveform_abbrevs) WITH ORDINALITY AS t(a, ord)
		),
		updated_at = NOW()
		WHERE EXISTS (
			SELECT 1 FROM unnest(p.waveform_abbrevs) AS a
			WHERE lower(trim(a)) = lower(trim($1))
		)`, from, to)
	if err != nil {
		return 0, err
	}
	return int(tag.RowsAffected()), nil
}
