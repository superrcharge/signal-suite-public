package kit

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository interface {
	Create(ctx context.Context, k *Kit) error
	FindByID(ctx context.Context, id string) (*Kit, error)
	FindAll(ctx context.Context, types, sections []string, search string, page, limit int) ([]*Kit, int, map[string]int, error)
	FindAllNames(ctx context.Context) ([]string, error)
	FindForExport(ctx context.Context, f ExportFilter) ([]*Kit, error)
	CountBySection(ctx context.Context, section string) (int, error)
	ReassignSection(ctx context.Context, from, to string) (int, error)
	Update(ctx context.Context, k *Kit) error
	Delete(ctx context.Context, id string) error
	BulkCreate(ctx context.Context, kits []*Kit) error
}

type PostgresRepository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{db: db}
}

const selectCols = `id, name, type, status, black, secret, topsecret, COALESCE(section, ''), owner, owner_email, owner_phone, location, notes, updated_by, created_at, updated_at`

func (r *PostgresRepository) scan(row pgx.Row) (*Kit, error) {
	k := &Kit{}
	err := row.Scan(
		&k.ID, &k.Name, &k.Type, &k.Status, &k.Black, &k.Secret, &k.TopSecret, &k.Section,
		&k.Owner, &k.OwnerEmail, &k.OwnerPhone, &k.Location,
		&k.Notes, &k.UpdatedBy, &k.CreatedAt, &k.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrKitNotFound
	}
	return k, err
}

func (r *PostgresRepository) Create(ctx context.Context, k *Kit) error {
	query := `
		INSERT INTO kits (id, name, type, status, black, secret, topsecret, section, owner, owner_email, owner_phone, location, notes, updated_by, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
	`
	_, err := r.db.Exec(ctx, query,
		k.ID, k.Name, k.Type, k.Status, k.Black, k.Secret, k.TopSecret, nullableSection(k.Section),
		k.Owner, k.OwnerEmail, k.OwnerPhone, k.Location, k.Notes, k.UpdatedBy, k.CreatedAt, k.UpdatedAt,
	)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return ErrKitNameExists
		}
	}
	return err
}

func (r *PostgresRepository) FindByID(ctx context.Context, id string) (*Kit, error) {
	query := `SELECT ` + selectCols + ` FROM kits WHERE id = $1`
	return r.scan(r.db.QueryRow(ctx, query, id))
}

func (r *PostgresRepository) FindAll(ctx context.Context, types, sections []string, search string, page, limit int) ([]*Kit, int, map[string]int, error) {
	var conditions []string
	var args []any
	argIdx := 1

	if len(sections) == 1 {
		conditions = append(conditions, fmt.Sprintf("section = $%d", argIdx))
		args = append(args, sections[0])
		argIdx++
	} else if len(sections) > 1 {
		placeholders := make([]string, len(sections))
		for i, s := range sections {
			placeholders[i] = fmt.Sprintf("$%d", argIdx)
			args = append(args, s)
			argIdx++
		}
		conditions = append(conditions, "section IN ("+strings.Join(placeholders, ",")+")")
	}

	if len(types) > 0 {
		conditions = append(conditions, fmt.Sprintf("type = ANY($%d)", argIdx))
		args = append(args, types)
		argIdx++
	}

	if search != "" {
		conditions = append(conditions, fmt.Sprintf(
			"(name ILIKE '%%' || $%d || '%%' OR COALESCE(owner, '') ILIKE '%%' || $%d || '%%' OR location ILIKE '%%' || $%d || '%%' OR COALESCE(notes, '') ILIKE '%%' || $%d || '%%')",
			argIdx, argIdx, argIdx, argIdx,
		))
		args = append(args, search)
		argIdx++
	}

	where := ""
	if len(conditions) > 0 {
		where = "WHERE " + strings.Join(conditions, " AND ")
	}

	var total int
	if err := r.db.QueryRow(ctx, fmt.Sprintf("SELECT COUNT(*) FROM kits %s", where), args...).Scan(&total); err != nil {
		return nil, 0, nil, err
	}

	// Per-status counts across the full filtered set (independent of pagination).
	statusCounts := map[string]int{}
	scRows, err := r.db.Query(ctx, fmt.Sprintf("SELECT status, COUNT(*) FROM kits %s GROUP BY status", where), args...)
	if err != nil {
		return nil, 0, nil, err
	}
	for scRows.Next() {
		var st string
		var cnt int
		if scanErr := scRows.Scan(&st, &cnt); scanErr != nil {
			scRows.Close()
			return nil, 0, nil, scanErr
		}
		statusCounts[st] = cnt
	}
	scRows.Close()
	if err := scRows.Err(); err != nil {
		return nil, 0, nil, err
	}

	var query string
	if limit == 0 {
		query = fmt.Sprintf(`SELECT %s FROM kits %s ORDER BY name COLLATE natural_sort, id`, selectCols, where)
	} else {
		offset := (page - 1) * limit
		query = fmt.Sprintf(
			`SELECT %s FROM kits %s ORDER BY name COLLATE natural_sort, id LIMIT $%d OFFSET $%d`,
			selectCols, where, argIdx, argIdx+1,
		)
		args = append(args, limit, offset)
	}

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, nil, err
	}
	defer rows.Close()

	var kits []*Kit
	for rows.Next() {
		k := &Kit{}
		if err := rows.Scan(
			&k.ID, &k.Name, &k.Type, &k.Status, &k.Black, &k.Secret, &k.TopSecret, &k.Section,
			&k.Owner, &k.OwnerEmail, &k.OwnerPhone, &k.Location,
			&k.Notes, &k.UpdatedBy, &k.CreatedAt, &k.UpdatedAt,
		); err != nil {
			return nil, 0, nil, err
		}
		kits = append(kits, k)
	}
	return kits, total, statusCounts, rows.Err()
}

func (r *PostgresRepository) FindAllNames(ctx context.Context) ([]string, error) {
	rows, err := r.db.Query(ctx, `SELECT name FROM kits`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var names []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		names = append(names, name)
	}
	return names, rows.Err()
}

// FindForExport returns every kit matching the given filter, with no
// pagination. An empty field means "no filter on that dimension". Ordered by
// name for a stable, readable CSV.
func (r *PostgresRepository) FindForExport(ctx context.Context, f ExportFilter) ([]*Kit, error) {
	var conditions []string
	var args []any

	// Numbered from args rather than from a counter - see the same helper in
	// terminal/repository.go for the failure that motivates it: the counter
	// stopped incrementing after the last condition, so a third one bound to
	// $2 and returned the wrong rows without erroring.
	addFilter := func(column string, values []string) {
		if len(values) == 0 {
			return
		}
		conditions = append(conditions, fmt.Sprintf("%s = ANY($%d)", column, len(args)+1))
		args = append(args, values)
	}

	addFilter("section", f.Sections)
	addFilter("status", f.Statuses)
	addFilter("type", f.Types)

	where := ""
	if len(conditions) > 0 {
		where = "WHERE " + strings.Join(conditions, " AND ")
	}

	query := fmt.Sprintf(`SELECT %s FROM kits %s ORDER BY name COLLATE natural_sort, id`, selectCols, where)
	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var kits []*Kit
	for rows.Next() {
		k := &Kit{}
		if err := rows.Scan(
			&k.ID, &k.Name, &k.Type, &k.Status, &k.Black, &k.Secret, &k.TopSecret, &k.Section,
			&k.Owner, &k.OwnerEmail, &k.OwnerPhone, &k.Location,
			&k.Notes, &k.UpdatedBy, &k.CreatedAt, &k.UpdatedAt,
		); err != nil {
			return nil, err
		}
		kits = append(kits, k)
	}
	return kits, rows.Err()
}

// CountBySection returns the number of kits currently assigned to the
// given section key. Used by section management to check whether a
// section can be safely deleted.
func (r *PostgresRepository) CountBySection(ctx context.Context, section string) (int, error) {
	var count int
	err := r.db.QueryRow(ctx,
		`SELECT COUNT(*) FROM kits WHERE section = $1`,
		section,
	).Scan(&count)
	return count, err
}

// ReassignSection moves every kit currently assigned to `from` to the
// given `to` section. An empty `to` string sets them to NULL
// (unassigned). Returns the number of rows updated.
func (r *PostgresRepository) ReassignSection(ctx context.Context, from, to string) (int, error) {
	var newSection any = to
	if to == "" {
		newSection = nil
	}
	result, err := r.db.Exec(ctx,
		`UPDATE kits SET section = $1 WHERE section = $2`,
		newSection, from,
	)
	if err != nil {
		return 0, err
	}
	return int(result.RowsAffected()), nil
}

func (r *PostgresRepository) Update(ctx context.Context, k *Kit) error {
	query := `
		UPDATE kits
		SET name=$2, type=$3, status=$4, black=$5, secret=$6, topsecret=$7, section=$8, owner=$9,
		    owner_email=$10, owner_phone=$11, location=$12, notes=$13, updated_by=$14, updated_at=$15
		WHERE id = $1
	`
	result, err := r.db.Exec(ctx, query,
		k.ID, k.Name, k.Type, k.Status, k.Black, k.Secret, k.TopSecret, nullableSection(k.Section), k.Owner,
		k.OwnerEmail, k.OwnerPhone, k.Location, k.Notes, k.UpdatedBy, k.UpdatedAt,
	)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return ErrKitNameExists
		}
		return err
	}
	if result.RowsAffected() == 0 {
		return ErrKitNotFound
	}
	return nil
}

func (r *PostgresRepository) Delete(ctx context.Context, id string) error {
	result, err := r.db.Exec(ctx, `DELETE FROM kits WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return ErrKitNotFound
	}
	return nil
}

func (r *PostgresRepository) BulkCreate(ctx context.Context, kits []*Kit) error {
	rows := make([][]any, len(kits))
	for i, k := range kits {
		rows[i] = []any{
			k.ID, k.Name, k.Type, k.Status, k.Black, k.Secret, k.TopSecret, nullableSection(k.Section),
			k.Owner, k.OwnerEmail, k.OwnerPhone, k.Location, k.Notes, k.UpdatedBy, k.CreatedAt, k.UpdatedAt,
		}
	}

	_, err := r.db.CopyFrom(
		ctx,
		pgx.Identifier{"kits"},
		[]string{"id", "name", "type", "status", "black", "secret", "topsecret", "section", "owner", "owner_email", "owner_phone", "location", "notes", "updated_by", "created_at", "updated_at"},
		pgx.CopyFromRows(rows),
	)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return ErrKitNameExists
		}
	}
	return err
}

func nullableSection(s string) any {
	if s == "" {
		return nil
	}
	return s
}
