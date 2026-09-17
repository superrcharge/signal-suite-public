package radionet

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository interface {
	FindBySection(ctx context.Context, section string) ([]*Net, error)
	FindByID(ctx context.Context, id string) (*Net, error)
	NameExists(ctx context.Context, section, name string) (bool, error)
	NameExistsExcluding(ctx context.Context, section, name, excludeID string) (bool, error)
	SectionExists(ctx context.Context, section string) (bool, error)
	Create(ctx context.Context, n *Net) error
	Update(ctx context.Context, n *Net) error
	Delete(ctx context.Context, id string) error
	InfoByIDs(ctx context.Context, ids []string) (map[string]NetInfo, error)
	// CountBySection is what a section delete asks before touching anything.
	CountBySection(ctx context.Context, section string) (int, error)
}

type PostgresRepository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{db: db}
}

const selectCols = `id, section, name, net_id, radio_type, tx_freq, rx_freq, freq_unit, roip, ` +
	`description, notes, created_by, updated_by, created_at, updated_at`

func (r *PostgresRepository) scan(row pgx.Row) (*Net, error) {
	n := &Net{}
	err := row.Scan(
		&n.ID, &n.Section, &n.Name, &n.NetID, &n.RadioType, &n.TxFreq, &n.RxFreq, &n.FreqUnit, &n.ROIP,
		&n.Description, &n.Notes, &n.CreatedBy, &n.UpdatedBy, &n.CreatedAt, &n.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNetNotFound
	}
	return n, err
}

func (r *PostgresRepository) FindBySection(ctx context.Context, section string) ([]*Net, error) {
	rows, err := r.db.Query(ctx,
		`SELECT `+selectCols+` FROM nets WHERE section = $1 ORDER BY lower(name) COLLATE natural_sort ASC`, section)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]*Net, 0)
	for rows.Next() {
		n, err := r.scan(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, n)
	}
	return items, rows.Err()
}

func (r *PostgresRepository) FindByID(ctx context.Context, id string) (*Net, error) {
	return r.scan(r.db.QueryRow(ctx, `SELECT `+selectCols+` FROM nets WHERE id = $1`, id))
}

func (r *PostgresRepository) NameExists(ctx context.Context, section, name string) (bool, error) {
	var exists bool
	err := r.db.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM nets WHERE section = $1 AND lower(name) = lower($2))`,
		section, name,
	).Scan(&exists)
	return exists, err
}

func (r *PostgresRepository) SectionExists(ctx context.Context, section string) (bool, error) {
	var exists bool
	err := r.db.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM sections WHERE key = $1)`, section,
	).Scan(&exists)
	return exists, err
}

func (r *PostgresRepository) NameExistsExcluding(ctx context.Context, section, name, excludeID string) (bool, error) {
	var exists bool
	err := r.db.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM nets WHERE section = $1 AND lower(name) = lower($2) AND id != $3)`,
		section, name, excludeID,
	).Scan(&exists)
	return exists, err
}

func (r *PostgresRepository) Create(ctx context.Context, n *Net) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO nets (id, section, name, net_id, radio_type, tx_freq, rx_freq, freq_unit, roip,
		                  description, notes, created_by, updated_by, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
		n.ID, n.Section, n.Name, n.NetID, n.RadioType, n.TxFreq, n.RxFreq, n.FreqUnit, n.ROIP,
		n.Description, n.Notes, n.CreatedBy, n.UpdatedBy, n.CreatedAt, n.UpdatedAt,
	)
	return mapUniqueViolation(err)
}

func (r *PostgresRepository) Update(ctx context.Context, n *Net) error {
	_, err := r.db.Exec(ctx, `
		UPDATE nets SET name=$1, net_id=$2, radio_type=$3, tx_freq=$4, rx_freq=$5, freq_unit=$6,
		                roip=$7, description=$8, notes=$9, updated_by=$10, updated_at=$11
		WHERE id=$12`,
		n.Name, n.NetID, n.RadioType, n.TxFreq, n.RxFreq, n.FreqUnit, n.ROIP,
		n.Description, n.Notes, n.UpdatedBy, n.UpdatedAt, n.ID,
	)
	return mapUniqueViolation(err)
}

func (r *PostgresRepository) Delete(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM nets WHERE id = $1`, id)
	return err
}

// CountBySection counts a squadron's nets. nets.section is a foreign key to
// sections with no ON DELETE rule, so any row here would make a section delete
// fail at the database; counting first is what turns that into a clear refusal
// before the delete has moved anything else.
func (r *PostgresRepository) CountBySection(ctx context.Context, section string) (int, error) {
	var n int
	err := r.db.QueryRow(ctx, `SELECT COUNT(*) FROM nets WHERE section = $1`, section).Scan(&n)
	return n, err
}

// mapUniqueViolation turns the nets_name_unique constraint into a domain error.
// The service checks for a duplicate name first; this closes the race where two
// concurrent creates both pass that check.
func mapUniqueViolation(err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return ErrNetNameExists
	}
	return err
}

// NetInfo mirrors contracts.NetInfo without importing it, keeping the
// dependency pointing one way.
type NetInfo struct {
	Section   string
	RadioType string
}

// InfoByIDs returns section and radio type keyed by net id. An id absent from
// the result does not exist, which the caller treats as an unknown net.
func (r *PostgresRepository) InfoByIDs(ctx context.Context, ids []string) (map[string]NetInfo, error) {
	out := map[string]NetInfo{}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := r.db.Query(ctx, `SELECT id, section, radio_type FROM nets WHERE id = ANY($1)`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id, section, rt string
		if err := rows.Scan(&id, &section, &rt); err != nil {
			return nil, err
		}
		out[id] = NetInfo{Section: section, RadioType: rt}
	}
	return out, rows.Err()
}
