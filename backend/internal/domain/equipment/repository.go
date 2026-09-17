package equipment

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository interface {
	Create(ctx context.Context, e *Equipment) error
	FindByID(ctx context.Context, id string) (*Equipment, error)
	FindAll(ctx context.Context, terminalType, search string) ([]*Equipment, error)
	Update(ctx context.Context, e *Equipment) error
	Delete(ctx context.Context, id string) error
	ExistsID(ctx context.Context, id string) (bool, error)
	WaveformUsage(ctx context.Context) (map[string][]string, error)
	RenameWaveform(ctx context.Context, from, to string) (int, error)
	ServiceUsage(ctx context.Context) (map[string][]string, error)
}

type PostgresRepository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{db: db}
}

const selectCols = `id, nomenclature, nickname, one_liner, doc_number, photo_url, make,
	terminal_type, operational_mode, data, created_by, updated_by, created_at, updated_at`

func (r *PostgresRepository) scan(row pgx.Row) (*Equipment, error) {
	e := &Equipment{}
	var dataBytes []byte
	err := row.Scan(
		&e.ID, &e.Nomenclature, &e.Nickname, &e.OneLiner, &e.DocNumber,
		&e.PhotoURL, &e.Make, &e.TerminalType, &e.OperationalMode,
		&dataBytes, &e.CreatedBy, &e.UpdatedBy, &e.CreatedAt, &e.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	if len(dataBytes) > 0 {
		e.Data = json.RawMessage(dataBytes)
	} else {
		e.Data = json.RawMessage("{}")
	}
	return e, nil
}

func (r *PostgresRepository) Create(ctx context.Context, e *Equipment) error {
	dataBytes, err := json.Marshal(e.Data)
	if err != nil {
		return err
	}
	_, err = r.db.Exec(ctx,
		`INSERT INTO equipment
		  (id, nomenclature, nickname, one_liner, doc_number, photo_url, make,
		   terminal_type, operational_mode, data, created_by, updated_by, created_at, updated_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
		e.ID, e.Nomenclature, e.Nickname, e.OneLiner, e.DocNumber,
		e.PhotoURL, e.Make, e.TerminalType, e.OperationalMode,
		dataBytes, e.CreatedBy, e.UpdatedBy, e.CreatedAt, e.UpdatedAt,
	)
	return err
}

func (r *PostgresRepository) FindByID(ctx context.Context, id string) (*Equipment, error) {
	row := r.db.QueryRow(ctx, `SELECT `+selectCols+` FROM equipment WHERE id = $1`, id)
	e, err := r.scan(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrEquipmentNotFound
	}
	return e, err
}

func (r *PostgresRepository) FindAll(ctx context.Context, terminalType, search string) ([]*Equipment, error) {
	var conditions []string
	var args []any
	argIdx := 1

	if terminalType != "" {
		conditions = append(conditions, fmt.Sprintf("terminal_type = $%d", argIdx))
		args = append(args, terminalType)
		argIdx++
	}

	if search != "" {
		conditions = append(conditions, fmt.Sprintf(
			"(nomenclature ILIKE $%d OR make ILIKE $%d)",
			argIdx, argIdx,
		))
		args = append(args, "%"+search+"%")
	}

	where := ""
	if len(conditions) > 0 {
		where = "WHERE " + strings.Join(conditions, " AND ")
	}

	query := fmt.Sprintf(
		`SELECT %s FROM equipment %s ORDER BY lower(nomenclature) COLLATE natural_sort ASC`,
		selectCols, where,
	)

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []*Equipment
	for rows.Next() {
		e, err := r.scan(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, e)
	}
	return items, rows.Err()
}

func (r *PostgresRepository) Update(ctx context.Context, e *Equipment) error {
	dataBytes, err := json.Marshal(e.Data)
	if err != nil {
		return err
	}
	_, err = r.db.Exec(ctx,
		`UPDATE equipment SET
		  nomenclature=$1, nickname=$2, one_liner=$3, doc_number=$4, photo_url=$5,
		  make=$6, terminal_type=$7, operational_mode=$8, data=$9,
		  updated_by=$10, updated_at=$11
		 WHERE id=$12`,
		e.Nomenclature, e.Nickname, e.OneLiner, e.DocNumber, e.PhotoURL,
		e.Make, e.TerminalType, e.OperationalMode, dataBytes,
		e.UpdatedBy, e.UpdatedAt,
		e.ID,
	)
	return err
}

func (r *PostgresRepository) Delete(ctx context.Context, id string) error {
	tag, err := r.db.Exec(ctx, `DELETE FROM equipment WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrEquipmentNotFound
	}
	return nil
}

func (r *PostgresRepository) ExistsID(ctx context.Context, id string) (bool, error) {
	var exists bool
	err := r.db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM equipment WHERE id = $1)`, id).Scan(&exists)
	return exists, err
}

// waveformElems unnests data->'waveforms' safely.
//
// The jsonb_typeof guard is not defensive noise: jsonb_array_elements raises at
// runtime when handed an object or a scalar, and `data` is a free-form JSONB
// column that CSV import fills from a spec sheet, so a hand-edited or
// malformed row would take the whole query down rather than contributing
// nothing. Migration 026 guards its services unnest the same way; the copy in
// pace/repository.go omits it and is the outlier, not the model.
const waveformElems = `
	CROSS JOIN LATERAL jsonb_array_elements(
		CASE WHEN jsonb_typeof(e.data->'waveforms') = 'array'
		     THEN e.data->'waveforms' ELSE '[]'::jsonb END
	) AS w`

// WaveformUsage maps a normalised abbrev to the nomenclature of every catalog
// record carrying it. See contracts.WaveformAssets for why this is one map
// rather than a per-abbrev lookup.
func (r *PostgresRepository) WaveformUsage(ctx context.Context) (map[string][]string, error) {
	rows, err := r.db.Query(ctx, `
		SELECT lower(trim(w->>'abbrev')) AS abbrev, e.nomenclature
		FROM equipment e`+waveformElems+`
		WHERE trim(COALESCE(w->>'abbrev', '')) <> ''
		ORDER BY 1, 2`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	usage := map[string][]string{}
	for rows.Next() {
		var abbrev, nomenclature string
		if err := rows.Scan(&abbrev, &nomenclature); err != nil {
			return nil, err
		}
		usage[abbrev] = append(usage[abbrev], nomenclature)
	}
	return usage, rows.Err()
}

// RenameWaveform rewrites every carried copy of `from` to `to`.
//
// jsonb_set per element rather than a whole-document replace, so the other
// fields of each waveform entry - name, description - and every unrelated key
// in `data` survive untouched. Only rows that actually carry the abbrev are
// written, which is what makes the returned count meaningful.
func (r *PostgresRepository) RenameWaveform(ctx context.Context, from, to string) (int, error) {
	tag, err := r.db.Exec(ctx, `
		UPDATE equipment e
		SET data = jsonb_set(
			e.data,
			'{waveforms}',
			(
				SELECT jsonb_agg(
					CASE WHEN lower(trim(elem->>'abbrev')) = lower(trim($1))
					     THEN jsonb_set(elem, '{abbrev}', to_jsonb($2::text))
					     ELSE elem END
				)
				FROM jsonb_array_elements(e.data->'waveforms') AS elem
			)
		),
		updated_at = NOW()
		WHERE jsonb_typeof(e.data->'waveforms') = 'array'
		  AND EXISTS (
			SELECT 1 FROM jsonb_array_elements(e.data->'waveforms') AS elem
			WHERE lower(trim(elem->>'abbrev')) = lower(trim($1))
		  )`, from, to)
	if err != nil {
		return 0, err
	}
	return int(tag.RowsAffected()), nil
}

// serviceElems is waveformElems' twin, and carries the same jsonb_typeof guard
// for the same reason. The copy of this unnest in pace/repository.go guards
// only a missing key with COALESCE, which does not protect a `data->'services'`
// that is an object or a scalar; migration 026 guards it this way too.
const serviceElems = `
	CROSS JOIN LATERAL jsonb_array_elements(
		CASE WHEN jsonb_typeof(e.data->'services') = 'array'
		     THEN e.data->'services' ELSE '[]'::jsonb END
	) AS sv`

// ServiceUsage maps a normalised abbrev to the nomenclature of every catalog
// record offering it. Equipment is the only carrier of services - platforms
// carry waveforms and radios and nothing service-shaped - so unlike the
// waveform side there is no second provider to merge.
func (r *PostgresRepository) ServiceUsage(ctx context.Context) (map[string][]string, error) {
	rows, err := r.db.Query(ctx, `
		SELECT lower(trim(sv->>'abbrev')) AS abbrev, e.nomenclature
		FROM equipment e`+serviceElems+`
		WHERE trim(COALESCE(sv->>'abbrev', '')) <> ''
		ORDER BY 1, 2`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	usage := map[string][]string{}
	for rows.Next() {
		var abbrev, nomenclature string
		if err := rows.Scan(&abbrev, &nomenclature); err != nil {
			return nil, err
		}
		usage[abbrev] = append(usage[abbrev], nomenclature)
	}
	return usage, rows.Err()
}
