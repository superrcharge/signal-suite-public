package operation

import (
	"context"
	"errors"
	"sort"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository interface {
	FindAll(ctx context.Context) ([]*Operation, error)
	FindByID(ctx context.Context, id string) (*Operation, error)
	NameExists(ctx context.Context, name string) (bool, error)
	NameExistsExcluding(ctx context.Context, name, excludeID string) (bool, error)
	// Create stores o and sets o.ID to the generated id.
	Create(ctx context.Context, o *Operation) error
	Update(ctx context.Context, o *Operation) error
	Delete(ctx context.Context, id string) error

	FindParticipants(ctx context.Context, operationID string) ([]*Participant, error)
	// FindParticipant returns ErrParticipantNotFound when the organization is
	// not checked in.
	FindParticipant(ctx context.Context, operationID, orgKey string) (*Participant, error)
	// CreateParticipant stores p and sets p.ID to the generated id.
	CreateParticipant(ctx context.Context, p *Participant) error
	UpdateParticipant(ctx context.Context, p *Participant) error
	DeleteParticipant(ctx context.Context, operationID, orgKey string) error
	// FindParticipantByID and DeleteParticipantByID address a row by its own id,
	// the only way to reach an ad hoc participant, which has no organization key.
	// FindParticipantByID returns ErrParticipantNotFound when there is no such row.
	FindParticipantByID(ctx context.Context, operationID, participantID string) (*Participant, error)
	DeleteParticipantByID(ctx context.Context, operationID, participantID string) error

	OperationsUsingOrganization(ctx context.Context, key string) ([]string, error)

	// FindPhases returns the operation's phases in order, empty when it has none.
	FindPhases(ctx context.Context, operationID string) ([]*Phase, error)
	// ReplacePhases makes phases the operation's whole ordered list in one
	// transaction: a phase of the operation absent from the list is deleted
	// (its asset rows cascade), one present is renamed and repositioned, one
	// the operation does not have is inserted under the id it carries. carried
	// are the asset rows to insert for the new phases, computed by the
	// service. It also bumps the operation's updated_at and updated_by.
	ReplacePhases(ctx context.Context, operationID string, phases []*Phase, carried []AssetPhaseRow, updatedBy string, now time.Time) error

	// FindSites returns the operation's sites in order, empty when it has none.
	FindSites(ctx context.Context, operationID string) ([]*Site, error)
	// ReplaceSites makes sites the operation's whole ordered list in one
	// transaction, as ReplacePhases does for phases: a site absent from the list
	// is deleted (its placements cascade), one present is renamed and
	// repositioned, one the operation does not have is inserted under the id it
	// carries. It also bumps the operation's updated_at and updated_by.
	ReplaceSites(ctx context.Context, operationID string, sites []*Site, updatedBy string, now time.Time) error

	// FindPhasePlans returns the placements and requirements of every phase of
	// the operation, keyed by phase id, in a fixed number of queries however
	// many phases there are. A phase with neither has no entry.
	FindPhasePlans(ctx context.Context, operationID string) (map[string]PhasePlan, error)
	// ReplacePhasePlan makes plan the whole plan of one phase in one
	// transaction: the supported participant, then every placement and
	// requirement. It returns ErrOperationUnknownPhase when the phase is not the
	// operation's, and bumps the operation's updated_at and updated_by.
	ReplacePhasePlan(ctx context.Context, operationID, phaseID string, plan PhasePlan, updatedBy string, now time.Time) error

	// FindRFIs returns every RFI of the operation with its comments, in two
	// queries however many there are: open ones first, newest first, then
	// resolved ones, most recently resolved first. Comments are oldest first.
	// Empty when there are none.
	FindRFIs(ctx context.Context, operationID string) ([]*RFI, error)
	// FindRFI returns one RFI with its comments, or ErrRFINotFound when it is
	// not this operation's.
	FindRFI(ctx context.Context, operationID, rfiID string) (*RFI, error)
	// CreateRFI stores r and sets r.ID, r.Status and r.CreatedAt. It locks the
	// operation row and bumps the operation's updated_at.
	CreateRFI(ctx context.Context, r *RFI) error
	// AddRFIComment stores c under the RFI and sets c.ID and c.CreatedAt. It
	// returns ErrRFINotFound for an RFI that is not the operation's and
	// ErrRFIResolved for one that is no longer open, decided under the same
	// lock as the insert.
	AddRFIComment(ctx context.Context, operationID string, c *RFIComment) error
	// ResolveRFI marks an open RFI resolved. It returns ErrRFINotFound or
	// ErrRFIResolved as AddRFIComment does.
	ResolveRFI(ctx context.Context, operationID, rfiID, by string, at time.Time) error
}

type PostgresRepository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) Repository {
	return &PostgresRepository{db: db}
}

const opCols = `o.id, o.name, o.acronym, o.status, o.start_date, o.end_date, o.notes, o.created_by, o.updated_by, o.created_at, o.updated_at,
	(SELECT count(*) FROM operation_participants p WHERE p.operation_id = o.id),
	(SELECT count(*) FROM operation_rfis r WHERE r.operation_id = o.id AND r.status = 'open')`

func (r *PostgresRepository) scanOperation(row pgx.Row) (*Operation, error) {
	o := &Operation{}
	err := row.Scan(
		&o.ID, &o.Name, &o.Acronym, &o.Status, &o.StartDate, &o.EndDate, &o.Notes,
		&o.CreatedBy, &o.UpdatedBy, &o.CreatedAt, &o.UpdatedAt, &o.ParticipantCount,
		&o.OpenRFICount,
	)
	if err != nil {
		return nil, err
	}
	return o, nil
}

// FindAll lists the newest-created operation first and the oldest last, so
// the picker reads left to right from what was just added. It ordered by
// start_date until 2026-10-14, but no screen shows start_date, so that order
// looked arbitrary to the people using it; created_at is the order they see
// the operations appear in.
func (r *PostgresRepository) FindAll(ctx context.Context) ([]*Operation, error) {
	rows, err := r.db.Query(ctx,
		`SELECT `+opCols+` FROM operations o
		 ORDER BY o.created_at DESC, lower(o.name) COLLATE natural_sort ASC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []*Operation
	for rows.Next() {
		o, err := r.scanOperation(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, o)
	}
	return items, rows.Err()
}

func (r *PostgresRepository) FindByID(ctx context.Context, id string) (*Operation, error) {
	row := r.db.QueryRow(ctx, `SELECT `+opCols+` FROM operations o WHERE o.id = $1`, id)
	o, err := r.scanOperation(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrOperationNotFound
		}
		return nil, err
	}
	return o, nil
}

func (r *PostgresRepository) NameExists(ctx context.Context, name string) (bool, error) {
	var exists bool
	err := r.db.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM operations WHERE lower(name) = lower($1))`, name,
	).Scan(&exists)
	return exists, err
}

func (r *PostgresRepository) NameExistsExcluding(ctx context.Context, name, excludeID string) (bool, error) {
	var exists bool
	err := r.db.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM operations WHERE lower(name) = lower($1) AND id != $2)`,
		name, excludeID,
	).Scan(&exists)
	return exists, err
}

// pgCode extracts the SQLSTATE and constraint name from a pg error, if it is one.
func pgCode(err error) (code, constraint string) {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code, pgErr.ConstraintName
	}
	return "", ""
}

// mapOperationError turns the unique violation a pre-check cannot fully close
// (two requests racing) into the coded error the pre-check returns.
func mapOperationError(err error) error {
	if code, constraint := pgCode(err); code == "23505" && constraint == "operations_name_lower_idx" {
		return ErrOperationNameExists
	}
	return err
}

// Create inserts the operation and its o.PhaseNames in one transaction, so an
// operation can never exist without the phases the service seeded it with.
func (r *PostgresRepository) Create(ctx context.Context, o *Operation) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	// A no-op once Commit has succeeded, so it is safe on every path.
	defer func() { _ = tx.Rollback(ctx) }()

	err = tx.QueryRow(ctx,
		`INSERT INTO operations (name, acronym, status, start_date, end_date, notes, created_by, updated_by, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		 RETURNING id`,
		o.Name, o.Acronym, o.Status, o.StartDate, o.EndDate, o.Notes,
		o.CreatedBy, o.UpdatedBy, o.CreatedAt, o.UpdatedAt,
	).Scan(&o.ID)
	if err != nil {
		return mapOperationError(err)
	}
	for i, name := range o.PhaseNames {
		if _, err := tx.Exec(ctx,
			`INSERT INTO operation_phases (operation_id, position, name) VALUES ($1, $2, $3)`,
			o.ID, i, name,
		); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func (r *PostgresRepository) Update(ctx context.Context, o *Operation) error {
	_, err := r.db.Exec(ctx,
		`UPDATE operations SET name=$1, acronym=$2, status=$3, start_date=$4, end_date=$5, notes=$6, updated_by=$7, updated_at=$8
		 WHERE id=$9`,
		o.Name, o.Acronym, o.Status, o.StartDate, o.EndDate, o.Notes, o.UpdatedBy, o.UpdatedAt, o.ID,
	)
	return mapOperationError(err)
}

// Delete removes the operation; its check-ins go with it (ON DELETE CASCADE).
func (r *PostgresRepository) Delete(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM operations WHERE id = $1`, id)
	return err
}

const partCols = `p.id, p.operation_id, COALESCE(p.organization_key, ''),
	COALESCE(o.name, ''), COALESCE(o.short_label, ''), COALESCE(o.branch, ''), COALESCE(o.color, ''),
	p.adhoc_name, p.adhoc_short_label, COALESCE(p.adhoc_branch, ''), p.adhoc_color,
	p.equipment_ids, p.platform_ids, p.waveform_abbrevs, p.service_abbrevs, p.transport_ids,
	p.poc_name, p.poc_phone, p.poc_email, p.notes,
	p.created_by, p.updated_by, p.created_at, p.updated_at`

const partFrom = `FROM operation_participants p LEFT JOIN organizations o ON o.key = p.organization_key`

func (r *PostgresRepository) scanParticipant(row pgx.Row) (*Participant, error) {
	p := &Participant{}
	err := row.Scan(
		&p.ID, &p.OperationID, &p.OrganizationKey,
		&p.Organization.Name, &p.Organization.ShortLabel, &p.Organization.Branch, &p.Organization.Color,
		&p.AdhocName, &p.AdhocShortLabel, &p.AdhocBranch, &p.AdhocColor,
		&p.EquipmentIDs, &p.PlatformIDs, &p.WaveformAbbrevs, &p.ServiceAbbrevs, &p.TransportIDs,
		&p.POCName, &p.POCPhone, &p.POCEmail, &p.Notes,
		&p.CreatedBy, &p.UpdatedBy, &p.CreatedAt, &p.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	if p.OrganizationKey == "" {
		p.Organization = OrgSummary{
			Name: p.AdhocName, ShortLabel: p.AdhocShortLabel,
			Branch: p.AdhocBranch, Color: p.AdhocColor, Adhoc: true,
		}
	} else {
		p.Organization.Key = p.OrganizationKey
	}
	return p, nil
}

func (r *PostgresRepository) FindParticipants(ctx context.Context, operationID string) ([]*Participant, error) {
	rows, err := r.db.Query(ctx,
		`SELECT `+partCols+` `+partFrom+` WHERE p.operation_id = $1
		 ORDER BY lower(COALESCE(NULLIF(o.name, ''), p.adhoc_name)) COLLATE natural_sort ASC`,
		operationID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []*Participant
	for rows.Next() {
		p, err := r.scanParticipant(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, p)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if err := r.attachAssetPhases(ctx, items...); err != nil {
		return nil, err
	}
	return items, nil
}

func (r *PostgresRepository) FindParticipant(ctx context.Context, operationID, orgKey string) (*Participant, error) {
	row := r.db.QueryRow(ctx,
		`SELECT `+partCols+` `+partFrom+` WHERE p.operation_id = $1 AND p.organization_key = $2`,
		operationID, orgKey,
	)
	p, err := r.scanParticipant(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrParticipantNotFound
		}
		return nil, err
	}
	if err := r.attachAssetPhases(ctx, p); err != nil {
		return nil, err
	}
	return p, nil
}

// mapParticipantError maps the constraint failures a participant write can hit.
// A foreign-key violation here can only be the organization (the service reads
// the operation first), and it is what refuses an unknown key when the service
// was built without an organization lookup.
func mapParticipantError(err error) error {
	switch code, constraint := pgCode(err); {
	case code == "23503" && constraint == "operation_participants_organization_key_fkey":
		return ErrParticipantUnknownOrganization
	case code == "23503" && constraint == "operation_participants_operation_id_fkey":
		return ErrOperationNotFound
	case code == "23503" && constraint == "operation_participant_asset_phases_phase_id_fkey":
		// A phase deleted between the service's read and this write.
		return ErrOperationUnknownPhase(nil)
	case code == "23505" && constraint == "operation_participants_adhoc_unique":
		return ErrParticipantAdhocNameExists
	case code == "23505" && constraint == "operation_participants_unique":
		// Two first saves racing: the loser would overwrite the winner, which is
		// the same situation a stale update refuses.
		return ErrParticipantStale
	}
	return err
}

// CreateParticipant stores the check-in and, when p.AssetPhases is non-nil, its
// asset rows, in one transaction.
func (r *PostgresRepository) CreateParticipant(ctx context.Context, p *Participant) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	err = tx.QueryRow(ctx,
		`INSERT INTO operation_participants
		   (operation_id, organization_key, adhoc_name, adhoc_short_label, adhoc_branch, adhoc_color,
		    equipment_ids, platform_ids, waveform_abbrevs, service_abbrevs, transport_ids,
		    poc_name, poc_phone, poc_email, notes, created_by, updated_by, created_at, updated_at)
		 VALUES ($1, NULLIF($2, ''), $3, $4, NULLIF($5, ''), $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
		 RETURNING id`,
		p.OperationID, p.OrganizationKey, p.AdhocName, p.AdhocShortLabel, p.AdhocBranch, p.AdhocColor,
		nonNil(p.EquipmentIDs), nonNil(p.PlatformIDs), nonNil(p.WaveformAbbrevs), nonNil(p.ServiceAbbrevs), nonNil(p.TransportIDs),
		p.POCName, p.POCPhone, p.POCEmail, p.Notes,
		p.CreatedBy, p.UpdatedBy, p.CreatedAt, p.UpdatedAt,
	).Scan(&p.ID)
	if err != nil {
		return mapParticipantError(err)
	}
	if p.AssetPhases != nil {
		if err := replaceAssetPhases(ctx, tx, p.ID, p.AssetPhases); err != nil {
			return mapParticipantError(err)
		}
	}
	return tx.Commit(ctx)
}

// UpdateParticipant writes the check-in and, when p.AssetPhases is non-nil,
// replaces its asset rows, in one transaction.
func (r *PostgresRepository) UpdateParticipant(ctx context.Context, p *Participant) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx,
		`UPDATE operation_participants
		 SET equipment_ids=$1, platform_ids=$2, waveform_abbrevs=$3, service_abbrevs=$4, transport_ids=$5,
		     poc_name=$6, poc_phone=$7, poc_email=$8, notes=$9, updated_by=$10, updated_at=$11
		 WHERE id=$12`,
		nonNil(p.EquipmentIDs), nonNil(p.PlatformIDs), nonNil(p.WaveformAbbrevs), nonNil(p.ServiceAbbrevs), nonNil(p.TransportIDs),
		p.POCName, p.POCPhone, p.POCEmail, p.Notes, p.UpdatedBy, p.UpdatedAt, p.ID,
	); err != nil {
		return mapParticipantError(err)
	}
	if p.AssetPhases != nil {
		if err := replaceAssetPhases(ctx, tx, p.ID, p.AssetPhases); err != nil {
			return mapParticipantError(err)
		}
	}
	return tx.Commit(ctx)
}

// replaceAssetPhases deletes the participant's asset rows and inserts one per
// (asset, phase) in the map, in one statement each. An asset mapped to no
// phases writes nothing, which is how "brought, in no phase" is stored.
func replaceAssetPhases(ctx context.Context, tx pgx.Tx, participantID string, m map[string][]string) error {
	if _, err := tx.Exec(ctx,
		`DELETE FROM operation_participant_asset_phases WHERE participant_id = $1`, participantID); err != nil {
		return err
	}
	var assets, phases []string
	for asset, ids := range m {
		for _, id := range ids {
			assets = append(assets, asset)
			phases = append(phases, id)
		}
	}
	if len(assets) == 0 {
		return nil
	}
	_, err := tx.Exec(ctx,
		`INSERT INTO operation_participant_asset_phases (participant_id, asset_id, phase_id)
		 SELECT $1, x.asset_id, x.phase_id FROM unnest($2::text[], $3::text[]) AS x(asset_id, phase_id)`,
		participantID, assets, phases,
	)
	return err
}

// attachAssetPhases fills AssetPhases on every participant given, with one
// query for all of them. Each participant ends up with a non-nil map holding
// only the assets that have at least one row, its phase ids in phase order.
func (r *PostgresRepository) attachAssetPhases(ctx context.Context, ps ...*Participant) error {
	if len(ps) == 0 {
		return nil
	}
	ids := make([]string, len(ps))
	byID := make(map[string]*Participant, len(ps))
	for i, p := range ps {
		p.AssetPhases = map[string][]string{}
		ids[i] = p.ID
		byID[p.ID] = p
	}
	rows, err := r.db.Query(ctx,
		`SELECT a.participant_id, a.asset_id, a.phase_id
		 FROM operation_participant_asset_phases a
		 JOIN operation_phases ph ON ph.id = a.phase_id
		 WHERE a.participant_id = ANY($1)
		 ORDER BY ph.position`, ids,
	)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var pid, asset, phase string
		if err := rows.Scan(&pid, &asset, &phase); err != nil {
			return err
		}
		if p, ok := byID[pid]; ok {
			p.AssetPhases[asset] = append(p.AssetPhases[asset], phase)
		}
	}
	return rows.Err()
}

func (r *PostgresRepository) DeleteParticipant(ctx context.Context, operationID, orgKey string) error {
	_, err := r.db.Exec(ctx,
		`DELETE FROM operation_participants WHERE operation_id = $1 AND organization_key = $2`,
		operationID, orgKey,
	)
	return err
}

func (r *PostgresRepository) FindParticipantByID(ctx context.Context, operationID, participantID string) (*Participant, error) {
	row := r.db.QueryRow(ctx,
		`SELECT `+partCols+` `+partFrom+` WHERE p.operation_id = $1 AND p.id = $2`,
		operationID, participantID,
	)
	p, err := r.scanParticipant(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrParticipantNotFound
		}
		return nil, err
	}
	if err := r.attachAssetPhases(ctx, p); err != nil {
		return nil, err
	}
	return p, nil
}

func (r *PostgresRepository) DeleteParticipantByID(ctx context.Context, operationID, participantID string) error {
	_, err := r.db.Exec(ctx,
		`DELETE FROM operation_participants WHERE operation_id = $1 AND id = $2`,
		operationID, participantID,
	)
	return err
}

// OperationsUsingOrganization returns the names of the operations the
// organization is checked in to, for the organization library's delete guard.
func (r *PostgresRepository) OperationsUsingOrganization(ctx context.Context, key string) ([]string, error) {
	rows, err := r.db.Query(ctx,
		`SELECT o.name FROM operations o
		 JOIN operation_participants p ON p.operation_id = o.id
		 WHERE p.organization_key = $1
		 ORDER BY lower(o.name)`, key,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var names []string
	for rows.Next() {
		var n string
		if err := rows.Scan(&n); err != nil {
			return nil, err
		}
		names = append(names, n)
	}
	return names, rows.Err()
}

func (r *PostgresRepository) FindPhases(ctx context.Context, operationID string) ([]*Phase, error) {
	rows, err := r.db.Query(ctx,
		`SELECT id, operation_id, position, name, COALESCE(supported_participant_id, '') FROM operation_phases
		 WHERE operation_id = $1 ORDER BY position, id`, operationID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []*Phase
	for rows.Next() {
		ph := &Phase{}
		if err := rows.Scan(&ph.ID, &ph.OperationID, &ph.Position, &ph.Name, &ph.Plan.SupportedParticipantID); err != nil {
			return nil, err
		}
		items = append(items, ph)
	}
	return items, rows.Err()
}

func (r *PostgresRepository) ReplacePhases(ctx context.Context, operationID string, phases []*Phase, carried []AssetPhaseRow, updatedBy string, now time.Time) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// The operation row is the lock two concurrent replaces queue on, so the
	// delete and the renames below never interleave.
	var locked string
	if err := tx.QueryRow(ctx, `SELECT id FROM operations WHERE id = $1 FOR UPDATE`, operationID).Scan(&locked); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrOperationNotFound
		}
		return err
	}

	existing, err := tx.Query(ctx, `SELECT id FROM operation_phases WHERE operation_id = $1`, operationID)
	if err != nil {
		return err
	}
	have := map[string]bool{}
	for existing.Next() {
		var id string
		if err := existing.Scan(&id); err != nil {
			existing.Close()
			return err
		}
		have[id] = true
	}
	existing.Close()
	if err := existing.Err(); err != nil {
		return err
	}

	keep := map[string]bool{}
	for _, ph := range phases {
		if have[ph.ID] {
			keep[ph.ID] = true
		}
	}
	for id := range have {
		if keep[id] {
			continue
		}
		if _, err := tx.Exec(ctx, `DELETE FROM operation_phases WHERE id = $1`, id); err != nil {
			return err
		}
	}

	// Names are unique per operation, so renaming one phase to another's old
	// name (or swapping two) would collide mid-way. Parking every kept phase
	// on its own id, which nothing else can equal, clears the index first.
	if _, err := tx.Exec(ctx,
		`UPDATE operation_phases SET name = id WHERE operation_id = $1`, operationID); err != nil {
		return err
	}
	for _, ph := range phases {
		if keep[ph.ID] {
			if _, err := tx.Exec(ctx,
				`UPDATE operation_phases SET name = $1, position = $2 WHERE id = $3 AND operation_id = $4`,
				ph.Name, ph.Position, ph.ID, operationID); err != nil {
				return mapPhaseError(err)
			}
			continue
		}
		if _, err := tx.Exec(ctx,
			`INSERT INTO operation_phases (id, operation_id, position, name) VALUES ($1, $2, $3, $4)`,
			ph.ID, operationID, ph.Position, ph.Name); err != nil {
			return mapPhaseError(err)
		}
	}

	if len(carried) > 0 {
		participants := make([]string, len(carried))
		assets := make([]string, len(carried))
		ids := make([]string, len(carried))
		for i, c := range carried {
			participants[i], assets[i], ids[i] = c.ParticipantID, c.AssetID, c.PhaseID
		}
		if _, err := tx.Exec(ctx,
			`INSERT INTO operation_participant_asset_phases (participant_id, asset_id, phase_id)
			 SELECT x.participant_id, x.asset_id, x.phase_id
			 FROM unnest($1::text[], $2::text[], $3::text[]) AS x(participant_id, asset_id, phase_id)
			 ON CONFLICT DO NOTHING`,
			participants, assets, ids); err != nil {
			return err
		}
	}

	if _, err := tx.Exec(ctx,
		`UPDATE operations SET updated_by = $1, updated_at = $2 WHERE id = $3`,
		updatedBy, now, operationID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// mapPhaseError turns the unique violation a pre-check cannot fully close into
// the coded error the pre-check returns.
func mapPhaseError(err error) error {
	if code, constraint := pgCode(err); code == "23505" && constraint == "operation_phases_name_lower_idx" {
		return ErrOperationPhaseNameExists
	}
	return err
}

func (r *PostgresRepository) FindSites(ctx context.Context, operationID string) ([]*Site, error) {
	rows, err := r.db.Query(ctx,
		`SELECT id, operation_id, position, name FROM operation_sites
		 WHERE operation_id = $1 ORDER BY position, id`, operationID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []*Site
	for rows.Next() {
		st := &Site{}
		if err := rows.Scan(&st.ID, &st.OperationID, &st.Position, &st.Name); err != nil {
			return nil, err
		}
		items = append(items, st)
	}
	return items, rows.Err()
}

func (r *PostgresRepository) ReplaceSites(ctx context.Context, operationID string, sites []*Site, updatedBy string, now time.Time) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// The operation row is the lock two concurrent replaces queue on.
	var locked string
	if err := tx.QueryRow(ctx, `SELECT id FROM operations WHERE id = $1 FOR UPDATE`, operationID).Scan(&locked); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrOperationNotFound
		}
		return err
	}

	existing, err := tx.Query(ctx, `SELECT id FROM operation_sites WHERE operation_id = $1`, operationID)
	if err != nil {
		return err
	}
	have := map[string]bool{}
	for existing.Next() {
		var id string
		if err := existing.Scan(&id); err != nil {
			existing.Close()
			return err
		}
		have[id] = true
	}
	existing.Close()
	if err := existing.Err(); err != nil {
		return err
	}

	keep := map[string]bool{}
	for _, st := range sites {
		if have[st.ID] {
			keep[st.ID] = true
		}
	}
	for id := range have {
		if keep[id] {
			continue
		}
		if _, err := tx.Exec(ctx, `DELETE FROM operation_sites WHERE id = $1`, id); err != nil {
			return err
		}
	}

	// Parked on the id for the reason ReplacePhases parks phases: a swap of two
	// names would otherwise collide on the unique index halfway.
	if _, err := tx.Exec(ctx,
		`UPDATE operation_sites SET name = id WHERE operation_id = $1`, operationID); err != nil {
		return err
	}
	for _, st := range sites {
		if keep[st.ID] {
			if _, err := tx.Exec(ctx,
				`UPDATE operation_sites SET name = $1, position = $2 WHERE id = $3 AND operation_id = $4`,
				st.Name, st.Position, st.ID, operationID); err != nil {
				return mapSiteError(err)
			}
			continue
		}
		if _, err := tx.Exec(ctx,
			`INSERT INTO operation_sites (id, operation_id, position, name) VALUES ($1, $2, $3, $4)`,
			st.ID, operationID, st.Position, st.Name); err != nil {
			return mapSiteError(err)
		}
	}

	if _, err := tx.Exec(ctx,
		`UPDATE operations SET updated_by = $1, updated_at = $2 WHERE id = $3`,
		updatedBy, now, operationID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// mapSiteError turns the unique violation a pre-check cannot fully close into
// the coded error the pre-check returns.
func mapSiteError(err error) error {
	if code, constraint := pgCode(err); code == "23505" && constraint == "operation_sites_name_lower_idx" {
		return ErrOperationSiteNameExists
	}
	return err
}

// FindPhasePlans reads every placement and requirement of the operation's
// phases in two queries, so the page load costs the same for four phases and
// for forty.
func (r *PostgresRepository) FindPhasePlans(ctx context.Context, operationID string) (map[string]PhasePlan, error) {
	out := map[string]PhasePlan{}

	placed, err := r.db.Query(ctx,
		`SELECT pl.phase_id, pl.participant_id, pl.site_id
		 FROM operation_phase_placements pl
		 JOIN operation_phases ph ON ph.id = pl.phase_id
		 WHERE ph.operation_id = $1`, operationID,
	)
	if err != nil {
		return nil, err
	}
	defer placed.Close()
	for placed.Next() {
		var phase, participant, site string
		if err := placed.Scan(&phase, &participant, &site); err != nil {
			return nil, err
		}
		plan := out[phase]
		if plan.Placements == nil {
			plan.Placements = map[string]string{}
		}
		plan.Placements[participant] = site
		out[phase] = plan
	}
	if err := placed.Err(); err != nil {
		return nil, err
	}
	placed.Close()

	reqs, err := r.db.Query(ctx,
		`SELECT rq.phase_id, rq.id, rq.participant_a, rq.participant_b
		 FROM operation_requirements rq
		 JOIN operation_phases ph ON ph.id = rq.phase_id
		 WHERE ph.operation_id = $1
		 ORDER BY rq.phase_id, rq.participant_a, rq.participant_b`, operationID,
	)
	if err != nil {
		return nil, err
	}
	defer reqs.Close()
	for reqs.Next() {
		var phase string
		var rq Requirement
		if err := reqs.Scan(&phase, &rq.ID, &rq.A, &rq.B); err != nil {
			return nil, err
		}
		plan := out[phase]
		plan.Requirements = append(plan.Requirements, rq)
		out[phase] = plan
	}
	return out, reqs.Err()
}

func (r *PostgresRepository) ReplacePhasePlan(ctx context.Context, operationID, phaseID string, plan PhasePlan, updatedBy string, now time.Time) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// The operation row is the lock, as in ReplacePhases, so a plan write cannot
	// interleave with a phase or site replace.
	var locked string
	if err := tx.QueryRow(ctx, `SELECT id FROM operations WHERE id = $1 FOR UPDATE`, operationID).Scan(&locked); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrOperationNotFound
		}
		return err
	}

	tag, err := tx.Exec(ctx,
		`UPDATE operation_phases SET supported_participant_id = NULLIF($1, '') WHERE id = $2 AND operation_id = $3`,
		plan.SupportedParticipantID, phaseID, operationID)
	if err != nil {
		return mapPlanError(err)
	}
	if tag.RowsAffected() == 0 {
		return ErrOperationUnknownPhase([]string{phaseID})
	}

	if _, err := tx.Exec(ctx, `DELETE FROM operation_phase_placements WHERE phase_id = $1`, phaseID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM operation_requirements WHERE phase_id = $1`, phaseID); err != nil {
		return err
	}

	if len(plan.Placements) > 0 {
		participants := make([]string, 0, len(plan.Placements))
		for p := range plan.Placements {
			participants = append(participants, p)
		}
		sort.Strings(participants)
		sites := make([]string, len(participants))
		for i, p := range participants {
			sites[i] = plan.Placements[p]
		}
		if _, err := tx.Exec(ctx,
			`INSERT INTO operation_phase_placements (phase_id, participant_id, site_id)
			 SELECT $1, x.participant_id, x.site_id FROM unnest($2::text[], $3::text[]) AS x(participant_id, site_id)`,
			phaseID, participants, sites); err != nil {
			return mapPlanError(err)
		}
	}

	if len(plan.Requirements) > 0 {
		ids := make([]string, len(plan.Requirements))
		as := make([]string, len(plan.Requirements))
		bs := make([]string, len(plan.Requirements))
		for i, rq := range plan.Requirements {
			ids[i], as[i], bs[i] = rq.ID, rq.A, rq.B
		}
		if _, err := tx.Exec(ctx,
			`INSERT INTO operation_requirements (id, phase_id, participant_a, participant_b)
			 SELECT x.id, $1, x.a, x.b FROM unnest($2::text[], $3::text[], $4::text[]) AS x(id, a, b)`,
			phaseID, ids, as, bs); err != nil {
			return mapPlanError(err)
		}
	}

	if _, err := tx.Exec(ctx,
		`UPDATE operations SET updated_by = $1, updated_at = $2 WHERE id = $3`,
		updatedBy, now, operationID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// mapPlanError maps the foreign-key failures a plan write can hit after the
// service's pre-checks: a participant or site removed between its read and this
// write.
func mapPlanError(err error) error {
	switch code, constraint := pgCode(err); {
	case code == "23503" && constraint == "operation_phase_placements_site_id_fkey":
		return ErrOperationUnknownSite(nil)
	case code == "23503" && (constraint == "operation_phase_placements_participant_id_fkey" ||
		constraint == "operation_requirements_participant_a_fkey" ||
		constraint == "operation_requirements_participant_b_fkey" ||
		constraint == "operation_phases_supported_participant_id_fkey"):
		return ErrParticipantNotFound
	}
	return err
}

const rfiCols = `id, operation_id, participant_id, question, status, created_by, created_by_id, resolved_by, resolved_at, created_at, updated_at`

func scanRFI(row pgx.Row) (*RFI, error) {
	f := &RFI{Comments: []*RFIComment{}}
	err := row.Scan(
		&f.ID, &f.OperationID, &f.ParticipantID, &f.Question, &f.Status, &f.CreatedBy,
		&f.CreatedByID, &f.ResolvedBy, &f.ResolvedAt, &f.CreatedAt, &f.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return f, nil
}

func (r *PostgresRepository) FindRFIs(ctx context.Context, operationID string) ([]*RFI, error) {
	rows, err := r.db.Query(ctx,
		`SELECT `+rfiCols+` FROM operation_rfis WHERE operation_id = $1
		 ORDER BY (status = 'open') DESC,
		          CASE WHEN status = 'open' THEN created_at ELSE resolved_at END DESC, id`,
		operationID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []*RFI{}
	byID := map[string]*RFI{}
	for rows.Next() {
		f, err := scanRFI(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, f)
		byID[f.ID] = f
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(items) == 0 {
		return items, nil
	}

	// One query for every thread, never one per RFI.
	cs, err := r.db.Query(ctx,
		`SELECT c.id, c.rfi_id, c.body, c.created_by, c.created_by_id, c.created_at
		 FROM operation_rfi_comments c JOIN operation_rfis f ON f.id = c.rfi_id
		 WHERE f.operation_id = $1 ORDER BY c.created_at, c.id`, operationID,
	)
	if err != nil {
		return nil, err
	}
	defer cs.Close()
	for cs.Next() {
		c := &RFIComment{}
		if err := cs.Scan(&c.ID, &c.RFIID, &c.Body, &c.CreatedBy, &c.CreatedByID, &c.CreatedAt); err != nil {
			return nil, err
		}
		if f := byID[c.RFIID]; f != nil {
			f.Comments = append(f.Comments, c)
		}
	}
	return items, cs.Err()
}

func (r *PostgresRepository) FindRFI(ctx context.Context, operationID, rfiID string) (*RFI, error) {
	f, err := scanRFI(r.db.QueryRow(ctx,
		`SELECT `+rfiCols+` FROM operation_rfis WHERE id = $1 AND operation_id = $2`, rfiID, operationID))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrRFINotFound
		}
		return nil, err
	}
	cs, err := r.db.Query(ctx,
		`SELECT id, rfi_id, body, created_by, created_by_id, created_at
		 FROM operation_rfi_comments WHERE rfi_id = $1 ORDER BY created_at, id`, rfiID)
	if err != nil {
		return nil, err
	}
	defer cs.Close()
	for cs.Next() {
		c := &RFIComment{}
		if err := cs.Scan(&c.ID, &c.RFIID, &c.Body, &c.CreatedBy, &c.CreatedByID, &c.CreatedAt); err != nil {
			return nil, err
		}
		f.Comments = append(f.Comments, c)
	}
	return f, cs.Err()
}

// lockOperation takes the operation row's lock, the one two concurrent writes
// to its RFIs queue on, as ReplaceSites does.
func lockOperation(ctx context.Context, tx pgx.Tx, operationID string) error {
	var locked string
	if err := tx.QueryRow(ctx, `SELECT id FROM operations WHERE id = $1 FOR UPDATE`, operationID).Scan(&locked); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrOperationNotFound
		}
		return err
	}
	return nil
}

func (r *PostgresRepository) CreateRFI(ctx context.Context, f *RFI) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if err := lockOperation(ctx, tx, f.OperationID); err != nil {
		return err
	}
	if err := tx.QueryRow(ctx,
		`INSERT INTO operation_rfis (operation_id, participant_id, question, created_by, created_by_id)
		 VALUES ($1, $2, $3, $4, $5) RETURNING id, status, created_at, updated_at`,
		f.OperationID, f.ParticipantID, f.Question, f.CreatedBy, f.CreatedByID,
	).Scan(&f.ID, &f.Status, &f.CreatedAt, &f.UpdatedAt); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx,
		`UPDATE operations SET updated_by = $1, updated_at = $2 WHERE id = $3`,
		f.CreatedBy, f.CreatedAt, f.OperationID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// openRFIStatus reads the RFI's status under the operation lock, so a comment
// or a resolve decides "still open" at the moment it writes.
func openRFIStatus(ctx context.Context, tx pgx.Tx, operationID, rfiID string) error {
	var status string
	if err := tx.QueryRow(ctx,
		`SELECT status FROM operation_rfis WHERE id = $1 AND operation_id = $2`, rfiID, operationID,
	).Scan(&status); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrRFINotFound
		}
		return err
	}
	if status != "open" {
		return ErrRFIResolved
	}
	return nil
}

func (r *PostgresRepository) AddRFIComment(ctx context.Context, operationID string, c *RFIComment) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if err := lockOperation(ctx, tx, operationID); err != nil {
		return err
	}
	if err := openRFIStatus(ctx, tx, operationID, c.RFIID); err != nil {
		return err
	}
	if err := tx.QueryRow(ctx,
		`INSERT INTO operation_rfi_comments (rfi_id, body, created_by, created_by_id)
		 VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
		c.RFIID, c.Body, c.CreatedBy, c.CreatedByID,
	).Scan(&c.ID, &c.CreatedAt); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx,
		`UPDATE operations SET updated_by = $1, updated_at = $2 WHERE id = $3`,
		c.CreatedBy, c.CreatedAt, operationID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (r *PostgresRepository) ResolveRFI(ctx context.Context, operationID, rfiID, by string, at time.Time) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if err := lockOperation(ctx, tx, operationID); err != nil {
		return err
	}
	if err := openRFIStatus(ctx, tx, operationID, rfiID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx,
		`UPDATE operation_rfis SET status = 'resolved', resolved_by = $1, resolved_at = $2, updated_at = $2
		 WHERE id = $3 AND operation_id = $4`,
		by, at, rfiID, operationID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx,
		`UPDATE operations SET updated_by = $1, updated_at = $2 WHERE id = $3`,
		by, at, operationID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
