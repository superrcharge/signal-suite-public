package contract

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository interface {
	Create(ctx context.Context, c *Contract) error
	FindByID(ctx context.Context, id string) (*Contract, error)
	FindAll(ctx context.Context, fy, search string, page, limit int, sortBy, sortDir string) ([]*Contract, int, ContractCounts, error)
	FindForExport(ctx context.Context, fiscalYears []string) ([]*Contract, error)
	FindFiscalYears(ctx context.Context) ([]string, error)
	Update(ctx context.Context, c *Contract) error
	Delete(ctx context.Context, id string) error
}

type PostgresRepository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{db: db}
}

const selectCols = `id, title, company, poc_name, poc_email, poc_phone, pop_start, pop_end, execution_quarter, fiscal_year, notes, logform_number, logform_url, updated_by, created_at, updated_at`

func (r *PostgresRepository) scan(row pgx.Row) (*Contract, error) {
	c := &Contract{}
	err := row.Scan(
		&c.ID, &c.Title, &c.Company,
		&c.POCName, &c.POCEmail, &c.POCPhone,
		&c.POPStart, &c.POPEnd, &c.ExecutionQuarter,
		&c.FiscalYear, &c.Notes, &c.LogformNumber, &c.LogformURL, &c.UpdatedBy,
		&c.CreatedAt, &c.UpdatedAt,
	)
	return c, err
}

func (r *PostgresRepository) Create(ctx context.Context, c *Contract) error {
	_, err := r.db.Exec(ctx,
		`INSERT INTO contracts
		  (id, title, company, poc_name, poc_email, poc_phone, pop_start, pop_end, execution_quarter, fiscal_year, notes, logform_number, logform_url, updated_by, created_at, updated_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
		c.ID, c.Title, c.Company,
		c.POCName, c.POCEmail, c.POCPhone,
		c.POPStart, c.POPEnd, c.ExecutionQuarter,
		c.FiscalYear, c.Notes, c.LogformNumber, c.LogformURL, c.UpdatedBy,
		c.CreatedAt, c.UpdatedAt,
	)
	return err
}

func (r *PostgresRepository) FindByID(ctx context.Context, id string) (*Contract, error) {
	row := r.db.QueryRow(ctx, `SELECT `+selectCols+` FROM contracts WHERE id = $1`, id)
	c, err := r.scan(row)
	if err == pgx.ErrNoRows {
		return nil, ErrContractNotFound
	}
	return c, err
}

func safeOrderBy(sortBy, sortDir string) string {
	col := ""
	switch sortBy {
	case "pop_end":
		col = "pop_end"
	case "execution_quarter":
		col = "execution_quarter"
	}
	if col == "" {
		return "fiscal_year DESC, pop_end ASC NULLS LAST"
	}
	dir := "ASC"
	if sortDir == "desc" {
		dir = "DESC"
	}
	return fmt.Sprintf("%s %s NULLS LAST, fiscal_year DESC", col, dir)
}

func (r *PostgresRepository) FindAll(ctx context.Context, fy, search string, page, limit int, sortBy, sortDir string) ([]*Contract, int, ContractCounts, error) {
	var conditions []string
	var args []any
	argIdx := 1

	if fy != "" {
		conditions = append(conditions, fmt.Sprintf("fiscal_year = $%d", argIdx))
		args = append(args, fy)
		argIdx++
	}

	if search != "" {
		conditions = append(conditions, fmt.Sprintf(
			"(title ILIKE $%d OR company ILIKE $%d OR poc_name ILIKE $%d OR notes ILIKE $%d)",
			argIdx, argIdx, argIdx, argIdx,
		))
		args = append(args, "%"+search+"%")
		argIdx++
	}

	where := ""
	if len(conditions) > 0 {
		where = "WHERE " + strings.Join(conditions, " AND ")
	}

	// Total count + deadline bucket counts in one query.
	var counts ContractCounts
	countSQL := fmt.Sprintf(`
		SELECT
		  COUNT(*) AS total,
		  COUNT(*) FILTER (WHERE pop_end IS NOT NULL AND pop_end - CURRENT_DATE <= 30) AS expiring_30,
		  COUNT(*) FILTER (WHERE pop_end IS NOT NULL AND pop_end - CURRENT_DATE > 30 AND pop_end - CURRENT_DATE <= 60) AS expiring_60,
		  COUNT(*) FILTER (WHERE pop_end IS NOT NULL AND pop_end - CURRENT_DATE > 60 AND pop_end - CURRENT_DATE <= 90) AS expiring_90
		FROM contracts %s`, where)
	if err := r.db.QueryRow(ctx, countSQL, args...).Scan(
		&counts.Total, &counts.Expiring30, &counts.Expiring60, &counts.Expiring90,
	); err != nil {
		return nil, 0, ContractCounts{}, err
	}

	offset := (page - 1) * limit
	query := fmt.Sprintf(
		`SELECT %s FROM contracts %s ORDER BY %s LIMIT $%d OFFSET $%d`,
		selectCols, where, safeOrderBy(sortBy, sortDir), argIdx, argIdx+1,
	)
	args = append(args, limit, offset)

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, ContractCounts{}, err
	}
	defer rows.Close()

	var contracts []*Contract
	for rows.Next() {
		c := &Contract{}
		if err := rows.Scan(
			&c.ID, &c.Title, &c.Company,
			&c.POCName, &c.POCEmail, &c.POCPhone,
			&c.POPStart, &c.POPEnd, &c.ExecutionQuarter,
			&c.FiscalYear, &c.Notes, &c.LogformNumber, &c.LogformURL, &c.UpdatedBy,
			&c.CreatedAt, &c.UpdatedAt,
		); err != nil {
			return nil, 0, ContractCounts{}, err
		}
		contracts = append(contracts, c)
	}
	return contracts, counts.Total, counts, rows.Err()
}

func (r *PostgresRepository) FindFiscalYears(ctx context.Context) ([]string, error) {
	rows, err := r.db.Query(ctx, `SELECT DISTINCT fiscal_year FROM contracts ORDER BY fiscal_year DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var years []string
	for rows.Next() {
		var y string
		if err := rows.Scan(&y); err != nil {
			return nil, err
		}
		years = append(years, y)
	}
	return years, rows.Err()
}

func (r *PostgresRepository) FindForExport(ctx context.Context, fiscalYears []string) ([]*Contract, error) {
	var conditions []string
	var args []any
	argIdx := 1

	if len(fiscalYears) > 0 {
		placeholders := make([]string, len(fiscalYears))
		for i, fy := range fiscalYears {
			placeholders[i] = fmt.Sprintf("$%d", argIdx)
			args = append(args, fy)
			argIdx++
		}
		conditions = append(conditions, "fiscal_year IN ("+strings.Join(placeholders, ",")+")")
	}

	where := ""
	if len(conditions) > 0 {
		where = "WHERE " + strings.Join(conditions, " AND ")
	}

	query := fmt.Sprintf(
		`SELECT %s FROM contracts %s ORDER BY fiscal_year DESC, pop_end ASC NULLS LAST`,
		selectCols, where,
	)

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cs []*Contract
	for rows.Next() {
		c := &Contract{}
		if err := rows.Scan(
			&c.ID, &c.Title, &c.Company,
			&c.POCName, &c.POCEmail, &c.POCPhone,
			&c.POPStart, &c.POPEnd, &c.ExecutionQuarter,
			&c.FiscalYear, &c.Notes, &c.LogformNumber, &c.LogformURL, &c.UpdatedBy,
			&c.CreatedAt, &c.UpdatedAt,
		); err != nil {
			return nil, err
		}
		cs = append(cs, c)
	}
	return cs, rows.Err()
}

func (r *PostgresRepository) Update(ctx context.Context, c *Contract) error {
	_, err := r.db.Exec(ctx,
		`UPDATE contracts SET
		  title=$1, company=$2, poc_name=$3, poc_email=$4, poc_phone=$5,
		  pop_start=$6, pop_end=$7, execution_quarter=$8, fiscal_year=$9,
		  notes=$10, logform_number=$11, logform_url=$12, updated_by=$13, updated_at=$14
		 WHERE id=$15`,
		c.Title, c.Company, c.POCName, c.POCEmail, c.POCPhone,
		c.POPStart, c.POPEnd, c.ExecutionQuarter, c.FiscalYear,
		c.Notes, c.LogformNumber, c.LogformURL, c.UpdatedBy, c.UpdatedAt,
		c.ID,
	)
	return err
}

func (r *PostgresRepository) Delete(ctx context.Context, id string) error {
	tag, err := r.db.Exec(ctx, `DELETE FROM contracts WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrContractNotFound
	}
	return nil
}

// parseDate parses a "2006-01-02" string into *time.Time. Returns nil for empty string.
func parseDate(s *string) (*time.Time, error) {
	if s == nil || *s == "" {
		return nil, nil
	}
	t, err := time.Parse("2006-01-02", *s)
	if err != nil {
		return nil, err
	}
	return &t, nil
}
