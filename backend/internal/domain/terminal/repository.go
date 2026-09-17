package terminal

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
	Create(ctx context.Context, t *Terminal) error
	FindByID(ctx context.Context, id string) (*Terminal, error)
	FindAll(ctx context.Context, sections, models []string, search, tag string, page, limit int) ([]*Terminal, int, map[string]int, error)
	FindAllNames(ctx context.Context) ([]string, error)
	FindAllTags(ctx context.Context) ([]string, error)
	FindForExport(ctx context.Context, f ExportFilter) ([]*Terminal, error)
	CountBySection(ctx context.Context, section string) (int, error)
	ReassignSection(ctx context.Context, from, to string) (int, error)
	Update(ctx context.Context, t *Terminal) error
	Delete(ctx context.Context, id string) error
	BulkCreate(ctx context.Context, terminals []*Terminal) error
	// Tag catalog (tags table). The catalog holds the canonical spelling of
	// every tag; terminals.tag stores that spelling rather than what was typed.
	ListTagCatalog(ctx context.Context) ([]*TagEntry, error)
	CreateTagEntry(ctx context.Context, name string) (*TagEntry, error)
	DeleteTagEntry(ctx context.Context, name string) error
	ClearTagFromTerminals(ctx context.Context, name string) ([]ClearedTerminal, error)
	CanonicalizeTags(ctx context.Context, names []string) (map[string]string, error)
}

type PostgresRepository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{db: db}
}

const selectCols = `id, name, model, kit, pim, serial, COALESCE(section, ''), status, owner, owner_email, owner_phone, pop_pin, notes, tag, updated_by, created_at, updated_at`

func (r *PostgresRepository) scan(row pgx.Row) (*Terminal, error) {
	t := &Terminal{}
	err := row.Scan(
		&t.ID, &t.Name, &t.Model, &t.Kit, &t.Pim, &t.Serial, &t.Section,
		&t.Status, &t.Owner, &t.OwnerEmail, &t.OwnerPhone, &t.PopPin,
		&t.Notes, &t.Tag, &t.UpdatedBy, &t.CreatedAt, &t.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrTerminalNotFound
	}
	return t, err
}

func (r *PostgresRepository) Create(ctx context.Context, t *Terminal) error {
	query := `
		INSERT INTO terminals (id, name, model, kit, pim, serial, section, status, owner, owner_email, owner_phone, pop_pin, notes, tag, updated_by, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
	`
	_, err := r.db.Exec(ctx, query,
		t.ID, t.Name, t.Model, t.Kit, t.Pim, t.Serial, nullableSection(t.Section), t.Status,
		t.Owner, t.OwnerEmail, t.OwnerPhone, t.PopPin, t.Notes, t.Tag, t.UpdatedBy, t.CreatedAt, t.UpdatedAt,
	)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return ErrTerminalNameExists
		}
	}
	return err
}

func (r *PostgresRepository) FindByID(ctx context.Context, id string) (*Terminal, error) {
	query := `SELECT ` + selectCols + ` FROM terminals WHERE id = $1`
	return r.scan(r.db.QueryRow(ctx, query, id))
}

func (r *PostgresRepository) FindAll(ctx context.Context, sections, models []string, search, tag string, page, limit int) ([]*Terminal, int, map[string]int, error) {
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

	if len(models) > 0 {
		conditions = append(conditions, fmt.Sprintf("model = ANY($%d)", argIdx))
		args = append(args, models)
		argIdx++
	}

	if search != "" {
		conditions = append(conditions, fmt.Sprintf(
			"(name ILIKE '%%' || $%d || '%%' OR kit ILIKE '%%' || $%d || '%%' OR serial ILIKE '%%' || $%d || '%%' OR COALESCE(owner, '') ILIKE '%%' || $%d || '%%' OR COALESCE(notes, '') ILIKE '%%' || $%d || '%%')",
			argIdx, argIdx, argIdx, argIdx, argIdx,
		))
		args = append(args, search)
		argIdx++
	}

	if tag != "" {
		// Case-insensitive match against the indexed LOWER(tag).
		conditions = append(conditions, fmt.Sprintf("LOWER(tag) = LOWER($%d)", argIdx))
		args = append(args, tag)
		argIdx++
	}

	where := ""
	if len(conditions) > 0 {
		where = "WHERE " + strings.Join(conditions, " AND ")
	}

	var total int
	if err := r.db.QueryRow(ctx, fmt.Sprintf("SELECT COUNT(*) FROM terminals %s", where), args...).Scan(&total); err != nil {
		return nil, 0, nil, err
	}

	// Per-status counts across the full filtered set (independent of pagination).
	statusCounts := map[string]int{}
	scRows, err := r.db.Query(ctx, fmt.Sprintf("SELECT status, COUNT(*) FROM terminals %s GROUP BY status", where), args...)
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
		query = fmt.Sprintf(`SELECT %s FROM terminals %s ORDER BY name COLLATE natural_sort, id`, selectCols, where)
	} else {
		offset := (page - 1) * limit
		query = fmt.Sprintf(
			`SELECT %s FROM terminals %s ORDER BY name COLLATE natural_sort, id LIMIT $%d OFFSET $%d`,
			selectCols, where, argIdx, argIdx+1,
		)
		args = append(args, limit, offset)
	}

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, nil, err
	}
	defer rows.Close()

	var terminals []*Terminal
	for rows.Next() {
		t := &Terminal{}
		if err := rows.Scan(
			&t.ID, &t.Name, &t.Model, &t.Kit, &t.Pim, &t.Serial, &t.Section,
			&t.Status, &t.Owner, &t.OwnerEmail, &t.OwnerPhone, &t.PopPin,
			&t.Notes, &t.Tag, &t.UpdatedBy, &t.CreatedAt, &t.UpdatedAt,
		); err != nil {
			return nil, 0, nil, err
		}
		terminals = append(terminals, t)
	}
	return terminals, total, statusCounts, rows.Err()
}

// FindAllTags returns the tags currently in use across terminals, one entry per
// tag, naturally sorted. Powers the tag filter UI on the terminals page - the
// button set rebuilds from this list.
func (r *PostgresRepository) FindAllTags(ctx context.Context) ([]string, error) {
	// GROUP BY rather than SELECT DISTINCT, and the difference is not stylistic.
	// Postgres rejects `SELECT DISTINCT ... ORDER BY <expr>` when the ordering
	// expression is not literally in the select list, and `tag COLLATE
	// natural_sort` is a different expression from `tag`:
	//
	//   ERROR: for SELECT DISTINCT, ORDER BY expressions must appear in select list
	//
	// So this endpoint answered 500 from the moment the collation was applied to
	// it. GROUP BY deduplicates identically and accepts the collated ordering.
	//
	// It groups on LOWER(tag), not tag, because tags are case-insensitive
	// everywhere else in this feature: filtering is LOWER(tag) = LOWER($n),
	// catalog uniqueness is a LOWER(name) index, and delete matches on LOWER.
	// This query was the sole case-sensitive one, so "Op Alpha" and "op alpha"
	// rendered as two filter buttons returning an identical result set.
	// MIN(tag) picks a representative; after migration 039 and canonicalization
	// on write there is only ever one casing to pick from, so this is the guard
	// rather than the mechanism.
	//
	// ORDER BY repeats MIN(tag) instead of naming the "name" alias: Postgres
	// accepts a bare output-column name in ORDER BY but not an expression built
	// on one, so ORDER BY name COLLATE natural_sort is rejected outright.
	rows, err := r.db.Query(ctx,
		`SELECT MIN(tag) AS name FROM terminals WHERE tag IS NOT NULL AND tag != '' GROUP BY LOWER(tag) ORDER BY MIN(tag) COLLATE natural_sort`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tags []string
	for rows.Next() {
		var t string
		if err := rows.Scan(&t); err != nil {
			return nil, err
		}
		tags = append(tags, t)
	}
	return tags, rows.Err()
}

func (r *PostgresRepository) FindAllNames(ctx context.Context) ([]string, error) {
	rows, err := r.db.Query(ctx, `SELECT name FROM terminals`)
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

// FindForExport returns every terminal matching the given filter, with no
// pagination. An empty field means "no filter on that dimension". Ordered by
// name for a stable, readable CSV.
func (r *PostgresRepository) FindForExport(ctx context.Context, f ExportFilter) ([]*Terminal, error) {
	var conditions []string
	var args []any

	// Each placeholder is numbered from what args already holds, so the index
	// is a fact about args rather than a counter every future edit has to
	// remember to advance. The counter this replaces stopped incrementing after
	// the last condition, on the reasoning that nothing followed it - so a third
	// condition appended here bound to $2, the statuses array. That compiles,
	// runs, and returns the wrong rows silently.
	addFilter := func(column string, values []string) {
		if len(values) == 0 {
			return
		}
		conditions = append(conditions, fmt.Sprintf("%s = ANY($%d)", column, len(args)+1))
		args = append(args, values)
	}

	addFilter("section", f.Sections)
	addFilter("status", f.Statuses)
	addFilter("model", f.Models)

	where := ""
	if len(conditions) > 0 {
		where = "WHERE " + strings.Join(conditions, " AND ")
	}

	query := fmt.Sprintf(`SELECT %s FROM terminals %s ORDER BY name COLLATE natural_sort, id`, selectCols, where)
	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var terminals []*Terminal
	for rows.Next() {
		t := &Terminal{}
		if err := rows.Scan(
			&t.ID, &t.Name, &t.Model, &t.Kit, &t.Pim, &t.Serial, &t.Section,
			&t.Status, &t.Owner, &t.OwnerEmail, &t.OwnerPhone, &t.PopPin,
			&t.Notes, &t.Tag, &t.UpdatedBy, &t.CreatedAt, &t.UpdatedAt,
		); err != nil {
			return nil, err
		}
		terminals = append(terminals, t)
	}
	return terminals, rows.Err()
}

// CountBySection returns the number of terminals currently assigned to
// the given section key. Used by section management to check whether a
// section can be safely deleted.
func (r *PostgresRepository) CountBySection(ctx context.Context, section string) (int, error) {
	var count int
	err := r.db.QueryRow(ctx,
		`SELECT COUNT(*) FROM terminals WHERE section = $1`,
		section,
	).Scan(&count)
	return count, err
}

// ReassignSection moves every terminal currently assigned to `from` to
// the given `to` section. An empty `to` string sets them to NULL
// (unassigned). Returns the number of rows updated.
func (r *PostgresRepository) ReassignSection(ctx context.Context, from, to string) (int, error) {
	var newSection any = to
	if to == "" {
		newSection = nil
	}
	result, err := r.db.Exec(ctx,
		`UPDATE terminals SET section = $1 WHERE section = $2`,
		newSection, from,
	)
	if err != nil {
		return 0, err
	}
	return int(result.RowsAffected()), nil
}

func (r *PostgresRepository) Update(ctx context.Context, t *Terminal) error {
	query := `
		UPDATE terminals
		SET name=$2, model=$3, kit=$4, pim=$5, serial=$6, section=$7, status=$8, owner=$9,
		    owner_email=$10, owner_phone=$11, pop_pin=$12, notes=$13, tag=$14, updated_by=$15, updated_at=$16
		WHERE id = $1
	`
	result, err := r.db.Exec(ctx, query,
		t.ID, t.Name, t.Model, t.Kit, t.Pim, t.Serial, nullableSection(t.Section), t.Status,
		t.Owner, t.OwnerEmail, t.OwnerPhone, t.PopPin, t.Notes, t.Tag, t.UpdatedBy, t.UpdatedAt,
	)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return ErrTerminalNotFound
	}
	return nil
}

func (r *PostgresRepository) Delete(ctx context.Context, id string) error {
	result, err := r.db.Exec(ctx, `DELETE FROM terminals WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return ErrTerminalNotFound
	}
	return nil
}

func (r *PostgresRepository) BulkCreate(ctx context.Context, terminals []*Terminal) error {
	rows := make([][]any, len(terminals))
	for i, t := range terminals {
		rows[i] = []any{
			t.ID, t.Name, t.Model, t.Kit, t.Pim, t.Serial, nullableSection(t.Section),
			t.Status, t.Owner, t.OwnerEmail, t.OwnerPhone, t.PopPin, t.Notes, t.Tag, t.UpdatedBy, t.CreatedAt, t.UpdatedAt,
		}
	}

	_, err := r.db.CopyFrom(
		ctx,
		pgx.Identifier{"terminals"},
		[]string{"id", "name", "model", "kit", "pim", "serial", "section", "status", "owner", "owner_email", "owner_phone", "pop_pin", "notes", "tag", "updated_by", "created_at", "updated_at"},
		pgx.CopyFromRows(rows),
	)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return ErrTerminalNameExists
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

// ListTagCatalog returns every entry in the tags catalog with the number of
// terminals carrying it, naturally sorted by name.
func (r *PostgresRepository) ListTagCatalog(ctx context.Context) ([]*TagEntry, error) {
	// The count is a correlated scalar subquery rather than a LEFT JOIN with a
	// GROUP BY, for two reasons worth stating because the join form looks more
	// idiomatic.
	//
	// First, it keeps this query in the shape that is known to work: no
	// DISTINCT, no grouping, so the collated ORDER BY has nothing to disagree
	// with. FindAllTags above answered 500 for eight releases because
	// SELECT DISTINCT with a collated ORDER BY is rejected, and every variation
	// on that theme is a chance to repeat it.
	//
	// Second, COUNT(*) over a LEFT JOIN reports 1 for a tag no terminal uses,
	// not 0 - and an unused tag reading "1 terminal" in Settings is exactly the
	// kind of wrong that looks right. The join form needs COUNT(te.id) to be
	// correct, which is a second trap in the same query.
	//
	// The subquery matches on LOWER(te.tag), so it uses idx_terminals_tag_lower
	// and counts case-insensitively, the same way delete clears.
	rows, err := r.db.Query(ctx, `
		SELECT t.name,
		       t.created_at,
		       (SELECT COUNT(*) FROM terminals te WHERE LOWER(te.tag) = LOWER(t.name)) AS terminal_count
		FROM tags t
		ORDER BY t.name COLLATE natural_sort`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []*TagEntry
	for rows.Next() {
		e := &TagEntry{}
		if err := rows.Scan(&e.Name, &e.CreatedAt, &e.TerminalCount); err != nil {
			return nil, err
		}
		entries = append(entries, e)
	}
	return entries, rows.Err()
}

// CanonicalizeTags registers each name in the catalog and reports the spelling
// the catalog uses, keyed by lowercase name. Existing casing always wins, so a
// terminal saved as "op alpha" stores whatever the catalog already calls it.
//
// This is what makes tags case-insensitive rather than merely matched
// case-insensitively: one spelling reaches the column, so the filter buttons,
// the Settings list and the CSV export agree without any of them having to
// collapse casing themselves.
func (r *PostgresRepository) CanonicalizeTags(ctx context.Context, names []string) (map[string]string, error) {
	if len(names) == 0 {
		return nil, nil
	}
	// Targetless ON CONFLICT DO NOTHING, for the reason migration 039 records:
	// the table has two arbiters and a targeted clause can name only one.
	// DISTINCT ON collapses casing variants inside the batch itself, so an
	// import carrying both "Op Alpha" and "op alpha" inserts a single row.
	if _, err := r.db.Exec(ctx,
		`INSERT INTO tags (name)
		 SELECT DISTINCT ON (LOWER(n)) n FROM unnest($1::text[]) AS n ORDER BY LOWER(n), n
		 ON CONFLICT DO NOTHING`,
		names,
	); err != nil {
		return nil, err
	}

	rows, err := r.db.Query(ctx,
		`SELECT name FROM tags WHERE LOWER(name) = ANY(SELECT LOWER(n) FROM unnest($1::text[]) AS n)`,
		names,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	canonical := make(map[string]string, len(names))
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		canonical[strings.ToLower(name)] = name
	}
	return canonical, rows.Err()
}

// CreateTagEntry inserts a new tag into the catalog. Returns the created entry.
// Conflicts on the case-insensitive unique index return ErrTagNameExists.
func (r *PostgresRepository) CreateTagEntry(ctx context.Context, name string) (*TagEntry, error) {
	entry := &TagEntry{}
	err := r.db.QueryRow(ctx,
		`INSERT INTO tags (name) VALUES ($1) RETURNING name, created_at`,
		name,
	).Scan(&entry.Name, &entry.CreatedAt)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return nil, ErrTagNameExists
		}
		return nil, err
	}
	return entry, nil
}

// DeleteTagEntry removes a tag from the catalog by name, matched
// case-insensitively via the index.
//
// It reports ErrTagNotFound when nothing was deleted. Discarding RowsAffected
// made this answer 204 for a name that never existed, while openapi.json
// documented a 404 the code could not produce - so a client had no way to tell
// a successful delete from a typo in the name.
func (r *PostgresRepository) DeleteTagEntry(ctx context.Context, name string) error {
	res, err := r.db.Exec(ctx, `DELETE FROM tags WHERE LOWER(name) = LOWER($1)`, name)
	if err != nil {
		return err
	}
	if res.RowsAffected() == 0 {
		return ErrTagNotFound
	}
	return nil
}

// ClearTagFromTerminals sets tag = NULL on every terminal whose tag matches the
// given name (case-insensitively) and returns what it changed.
//
// It returns the affected rows rather than a count because the service audits
// each one. Clearing a tag off thirty terminals from Settings used to write no
// audit events at all, while doing the same thing thirty times in the drawer
// wrote thirty - so the bulk path was the one way to change terminal data
// without leaving a trace.
func (r *PostgresRepository) ClearTagFromTerminals(ctx context.Context, name string) ([]ClearedTerminal, error) {
	// The self-join is what makes the audit record true. RETURNING hands back
	// post-update values, so `RETURNING tag` is NULL by definition and the
	// obvious alternative, RETURNING the $1 that was passed in, records the name
	// the caller typed rather than the value the column held - deleting
	// "operation verify" logged old: "operation verify" on terminals that
	// actually read "Operation Verify". An audit row naming a value that was
	// never stored is worse than no audit row. Joining the table to itself in
	// FROM reads the pre-update snapshot, so old.tag is the real prior value.
	rows, err := r.db.Query(ctx,
		`UPDATE terminals te SET tag = NULL
		 FROM terminals old
		 WHERE old.id = te.id AND LOWER(te.tag) = LOWER($1)
		 RETURNING te.id, te.name, old.tag`,
		name,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cleared []ClearedTerminal
	for rows.Next() {
		var c ClearedTerminal
		if err := rows.Scan(&c.ID, &c.Name, &c.Tag); err != nil {
			return nil, err
		}
		cleared = append(cleared, c)
	}
	return cleared, rows.Err()
}
