package pace

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository interface {
	SectionExists(ctx context.Context, section string) (bool, error)
	FindCard(ctx context.Context, section string) (*CommsCard, error)
	SaveCard(ctx context.Context, card *CommsCard) error
	// SetEmblemURL writes only the emblem column. The card save is a whole-card
	// replace and never carries the emblem, so writing it through that path
	// would clear an emblem the editor was never holding.
	SetEmblemURL(ctx context.Context, section, url string) error
	// CountAssignmentsForNet answers "is this net on any wheel?", which is what
	// turns a blocked net delete into a message naming the wheels.
	CountAssignmentsForNet(ctx context.Context, netID string) (int, error)
	PlansUsingNet(ctx context.Context, netID string) ([]string, error)
	// SectionHasData is what a section delete asks before touching anything.
	SectionHasData(ctx context.Context, section string) (bool, error)
}

type PostgresRepository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{db: db}
}

func (r *PostgresRepository) SectionExists(ctx context.Context, section string) (bool, error) {
	var exists bool
	err := r.db.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM sections WHERE key = $1)`, section,
	).Scan(&exists)
	return exists, err
}

// SectionHasData reports whether a squadron has any saved PACE card data.
//
// These are the five PACE tables with a foreign key to sections, none with an
// ON DELETE rule, so a row in any of them would make a section delete fail at
// the database. channel_assignments is not listed: it has no section column
// and hangs off channel_plans, so it cannot exist without a row that is.
//
// A squadron with nothing saved has no rows at all - GetCard serves an empty
// scaffold rather than creating one - so this is true only once someone has
// actually saved a card or uploaded an emblem.
func (r *PostgresRepository) SectionHasData(ctx context.Context, section string) (bool, error) {
	var has bool
	err := r.db.QueryRow(ctx, `
		SELECT EXISTS (SELECT 1 FROM pace_plans       WHERE section = $1)
		    OR EXISTS (SELECT 1 FROM channel_plans    WHERE section = $1)
		    OR EXISTS (SELECT 1 FROM pace_freq_rows   WHERE section = $1)
		    OR EXISTS (SELECT 1 FROM pace_tmn_rows WHERE section = $1)
		    OR EXISTS (SELECT 1 FROM pace_tiers       WHERE section = $1)`,
		section,
	).Scan(&has)
	return has, err
}

// FindCard reads both wheels and every assignment in two queries, joining nets
// so the caller never has to resolve references itself.
func (r *PostgresRepository) FindCard(ctx context.Context, section string) (*CommsCard, error) {
	card := &CommsCard{
		Section:    section,
		Plans:      []*ChannelPlan{},
		LTACRows:   []*FreqRow{},
		TACSATRows: []*FreqRow{},
		TmnRows: []*TmnRow{},
	}

	// Header is optional: a squadron that has never saved has no row, and the
	// service scaffolds an empty one rather than treating that as an error.
	hdr := &CardHeader{Section: section}
	err := r.db.QueryRow(ctx, `
		SELECT id, title, effective_date, emblem_url, version, highlights, updated_by
		FROM pace_plans WHERE section = $1`, section,
	).Scan(&hdr.ID, &hdr.Title, &hdr.EffectiveDate, &hdr.EmblemURL, &hdr.Version, &hdr.Highlights, &hdr.UpdatedBy)
	switch {
	case err == nil:
		card.Header = hdr
	case errors.Is(err, pgx.ErrNoRows):
		card.Header = &CardHeader{Section: section}
	default:
		return nil, err
	}

	rows, err := r.db.Query(ctx, `
		SELECT id, section, radio_type, label, channel_count, notes, updated_by, created_at, updated_at, highlights
		FROM channel_plans WHERE section = $1`, section)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	byID := map[string]*ChannelPlan{}
	for rows.Next() {
		p := &ChannelPlan{Assignments: []*ChannelAssignment{}}
		if err := rows.Scan(&p.ID, &p.Section, &p.RadioType, &p.Label, &p.ChannelCount,
			&p.Notes, &p.UpdatedBy, &p.CreatedAt, &p.UpdatedAt, &p.Highlights); err != nil {
			return nil, err
		}
		card.Plans = append(card.Plans, p)
		byID[p.ID] = p
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(card.Plans) == 0 {
		// A squadron may have filled in the band without touching a wheel, so
		// the rows and tiles are still read before returning.
		if err := r.loadTiers(ctx, card); err != nil {
			return nil, err
		}
		if err := r.loadSheetRows(ctx, card); err != nil {
			return nil, err
		}
		return card, nil
	}

	aRows, err := r.db.Query(ctx, `
		SELECT ca.plan_id, ca.channel_number, ca.net_id,
		       ca.tx_freq_override, ca.rx_freq_override, ca.freq_unit_override, ca.label_override,
		       ca.highlights,
		       n.name, n.net_id, n.radio_type, n.tx_freq, n.rx_freq, n.freq_unit, n.roip
		FROM channel_assignments ca
		JOIN channel_plans cp ON cp.id = ca.plan_id
		JOIN nets n           ON n.id  = ca.net_id
		WHERE cp.section = $1
		ORDER BY ca.channel_number ASC`, section)
	if err != nil {
		return nil, err
	}
	defer aRows.Close()

	for aRows.Next() {
		a := &ChannelAssignment{Net: &NetRef{}}
		if err := aRows.Scan(&a.PlanID, &a.ChannelNumber, &a.NetID,
			&a.TxFreqOverride, &a.RxFreqOverride, &a.FreqUnitOverride, &a.LabelOverride,
			&a.Highlights,
			&a.Net.Name, &a.Net.NetID, &a.Net.RadioType, &a.Net.TxFreq, &a.Net.RxFreq,
			&a.Net.FreqUnit, &a.Net.ROIP); err != nil {
			return nil, err
		}
		a.Net.ID = a.NetID
		if p := byID[a.PlanID]; p != nil {
			p.Assignments = append(p.Assignments, a)
		}
	}
	if err := aRows.Err(); err != nil {
		return nil, err
	}

	if err := r.loadTiers(ctx, card); err != nil {
		return nil, err
	}
	if err := r.loadSheetRows(ctx, card); err != nil {
		return nil, err
	}
	return card, nil
}

// loadSheetRows fills the middle band: both frequency tables and the GLOBAL
// TMN box. Ordered by position, which is the order the sheet prints them in.
func (r *PostgresRepository) loadSheetRows(ctx context.Context, card *CommsCard) error {
	fRows, err := r.db.Query(ctx, `
		SELECT block, position, name, channel, up_freq, down_freq, sat, crypto, highlights
		FROM pace_freq_rows WHERE section = $1
		ORDER BY position ASC`, card.Section)
	if err != nil {
		return err
	}
	defer fRows.Close()

	for fRows.Next() {
		var block string
		row := &FreqRow{}
		if err := fRows.Scan(&block, &row.Position, &row.Name, &row.Channel,
			&row.Up, &row.Down, &row.Sat, &row.Crypto, &row.Highlights); err != nil {
			return err
		}
		switch block {
		case BlockLTAC:
			card.LTACRows = append(card.LTACRows, row)
		case BlockTACSAT:
			card.TACSATRows = append(card.TACSATRows, row)
		}
	}
	if err := fRows.Err(); err != nil {
		return err
	}

	hRows, err := r.db.Query(ctx, `
		SELECT position, label, value, highlights
		FROM pace_tmn_rows WHERE section = $1
		ORDER BY position ASC`, card.Section)
	if err != nil {
		return err
	}
	defer hRows.Close()

	for hRows.Next() {
		row := &TmnRow{}
		if err := hRows.Scan(&row.Position, &row.Label, &row.Value, &row.Highlights); err != nil {
			return err
		}
		card.TmnRows = append(card.TmnRows, row)
	}
	return hRows.Err()
}

// loadTiers fills the four PACE tiles, resolving each reference as it goes so
// the sheet renders from one payload and the print route needs no second trip.
//
// The service rates come from the selected equipment record's own services
// array, matched by abbreviation, not from the global Services Library: two
// terminals on the same service carry different committed rates, so the global
// list is the vocabulary and the per-equipment entry is the number.
//
// service_abbrev names a capability, which is a service or a radio's waveform,
// and it prints on the tile straight off the tier row. A radio is therefore a
// tier source without the LATERAL knowing anything about it -- the join exists
// only to find rates, and only a service carries cir/mir, so it reads
// data->'services' alone. Searching data->'waveforms' too could only ever match
// an entry whose four rate columns COALESCE to empty, which is what no match
// already produces. A radio tile prints no rate lines, and that is correct.
//
// The tile's title prefers the equipment nickname and falls back to the
// nomenclature, so both are projected; the fallback is applied on the client,
// where the same rule also has to hold for an unsaved draft in the editor's
// live preview.
//
// The result is padded to all four letters in TierLetters order, so a squadron
// that has configured none still gets four tiles and no consumer has to handle
// a partially configured card.
func (r *PostgresRepository) loadTiers(ctx context.Context, card *CommsCard) error {
	rows, err := r.db.Query(ctx, `
		SELECT t.tier, t.source,
		       COALESCE(t.equipment_id, ''), COALESCE(t.transport_id, ''),
		       t.service_abbrev, t.custom_label, t.detail, t.highlights,
		       COALESCE(e.nomenclature, ''), COALESCE(e.nickname, ''),
		       COALESCE(e.photo_url, ''),
		       COALESCE(tr.name, ''),
		       COALESCE(sv.s->'cir'->>'dl', ''), COALESCE(sv.s->'cir'->>'ul', ''),
		       COALESCE(sv.s->'mir'->>'dl', ''), COALESCE(sv.s->'mir'->>'ul', '')
		FROM pace_tiers t
		LEFT JOIN equipment  e  ON e.id  = t.equipment_id
		LEFT JOIN transports tr ON tr.id = t.transport_id
		LEFT JOIN LATERAL (
			SELECT s FROM jsonb_array_elements(
				COALESCE(e.data->'services', '[]'::jsonb)
			) s
			WHERE t.service_abbrev <> '' AND lower(s->>'abbrev') = lower(t.service_abbrev)
			LIMIT 1
		) sv ON TRUE
		WHERE t.section = $1`, card.Section)
	if err != nil {
		return err
	}
	defer rows.Close()

	stored := map[string]*Tier{}
	for rows.Next() {
		t := &Tier{}
		var cirDL, cirUL, mirDL, mirUL string
		if err := rows.Scan(
			&t.Letter, &t.Source,
			&t.EquipmentID, &t.TransportID,
			&t.ServiceAbbrev, &t.CustomLabel, &t.Detail, &t.Highlights,
			&t.EquipmentNomenclature, &t.EquipmentNickname,
			&t.EquipmentPhotoURL,
			&t.TransportName,
			&cirDL, &cirUL, &mirDL, &mirUL,
		); err != nil {
			return err
		}
		t.ServiceCIR = formatRate(cirDL, cirUL)
		t.ServiceMIR = formatRate(mirDL, mirUL)
		stored[t.Letter] = t
	}
	if err := rows.Err(); err != nil {
		return err
	}

	card.Tiers = make([]*Tier, 0, len(TierLetters))
	for _, letter := range TierLetters {
		if t, ok := stored[letter]; ok {
			card.Tiers = append(card.Tiers, t)
			continue
		}
		card.Tiers = append(card.Tiers, &Tier{Letter: letter, Source: TierSourceNone})
	}
	return nil
}

// formatRate renders a rate pair the way the catalog datasheet does, "dl/ul
// Mbps". Both halves absent gives an empty string, which the sheet prints as
// nothing rather than as a zero.
func formatRate(dl, ul string) string {
	if dl == "" && ul == "" {
		return ""
	}
	left, right := dl, ul
	if left == "" {
		left = "-"
	}
	if right == "" {
		right = "-"
	}
	return left + "/" + right + " Mbps"
}

// saveTiers replaces all four tiles for this squadron.
//
// A nil Tiers slice means the request omitted them, which is "leave the stored
// tiers alone" rather than "clear them". That is what lets a client predating
// this feature keep saving channel edits without wiping tiers it never knew
// about. An empty non-nil slice is a real clear.
func saveTiers(ctx context.Context, tx pgx.Tx, card *CommsCard) error {
	if card.Tiers == nil {
		return nil
	}
	if _, err := tx.Exec(ctx,
		`DELETE FROM pace_tiers WHERE section = $1`, card.Section); err != nil {
		return fmt.Errorf("clear tiers: %w", err)
	}
	updatedBy := ""
	if card.Header != nil {
		updatedBy = card.Header.UpdatedBy
	}
	for _, t := range card.Tiers {
		// NULL rather than empty string for the two references, so the foreign
		// keys hold and ON DELETE SET NULL has something to set.
		var equipmentID, transportID *string
		if t.EquipmentID != "" {
			id := t.EquipmentID
			equipmentID = &id
		}
		if t.TransportID != "" {
			id := t.TransportID
			transportID = &id
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO pace_tiers
				(id, section, tier, source, equipment_id, transport_id,
				 service_abbrev, custom_label, detail, highlights, updated_by, updated_at)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())`,
			uuid.New().String(), card.Section, t.Letter, t.Source,
			equipmentID, transportID, t.ServiceAbbrev, t.CustomLabel, t.Detail,
			orEmpty(t.Highlights), updatedBy,
		); err != nil {
			return fmt.Errorf("insert tier %s: %w", t.Letter, err)
		}
	}
	return nil
}

// SaveCard writes the whole card in one transaction.
//
// This is the repo's first use of a transaction (section/service.go carries a
// note wishing for one). It matters here: replacing a wheel's assignments is a
// delete followed by inserts, and a failure between the two would leave a
// squadron's wheel empty rather than unchanged.
func (r *PostgresRepository) SaveCard(ctx context.Context, card *CommsCard) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	// Rollback is a no-op once Commit has succeeded, so this is safe
	// unconditionally and guarantees no transaction is left open on any path.
	defer func() { _ = tx.Rollback(ctx) }()

	if h := card.Header; h != nil {
		if _, err := tx.Exec(ctx, `
			INSERT INTO pace_plans (id, section, title, effective_date, version, highlights, updated_by, created_at, updated_at)
			VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())
			ON CONFLICT (section) DO UPDATE
			SET title = EXCLUDED.title,
			    effective_date = EXCLUDED.effective_date,
			    version = EXCLUDED.version,
			    highlights = EXCLUDED.highlights,
			    updated_by = EXCLUDED.updated_by,
			    updated_at = NOW()`,
			h.ID, card.Section, h.Title, h.EffectiveDate, h.Version, orEmpty(h.Highlights), h.UpdatedBy,
		); err != nil {
			return fmt.Errorf("upsert card header: %w", err)
		}
	}

	for _, p := range card.Plans {
		// Lazily created: a squadron has no rows until its card is first saved,
		// so there is no "create plan" step in the UI.
		var planID string
		err := tx.QueryRow(ctx, `
			INSERT INTO channel_plans (id, section, radio_type, label, channel_count, notes, highlights, updated_by, created_at, updated_at)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())
			ON CONFLICT (section, radio_type) DO UPDATE
			SET label = EXCLUDED.label,
			    channel_count = EXCLUDED.channel_count,
			    notes = EXCLUDED.notes,
			    highlights = EXCLUDED.highlights,
			    updated_by = EXCLUDED.updated_by,
			    updated_at = NOW()
			RETURNING id`,
			p.ID, card.Section, p.RadioType, p.Label, p.ChannelCount, p.Notes, orEmpty(p.Highlights), p.UpdatedBy,
		).Scan(&planID)
		if err != nil {
			return fmt.Errorf("upsert plan %s: %w", p.RadioType, err)
		}
		p.ID = planID

		if _, err := tx.Exec(ctx,
			`DELETE FROM channel_assignments WHERE plan_id = $1`, planID); err != nil {
			return fmt.Errorf("clear assignments for %s: %w", p.RadioType, err)
		}

		for _, a := range p.Assignments {
			if _, err := tx.Exec(ctx, `
				INSERT INTO channel_assignments
					(plan_id, channel_number, net_id, tx_freq_override, rx_freq_override, freq_unit_override, label_override, highlights)
				VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
				planID, a.ChannelNumber, a.NetID,
				a.TxFreqOverride, a.RxFreqOverride, a.FreqUnitOverride, a.LabelOverride,
				orEmpty(a.Highlights),
			); err != nil {
				return fmt.Errorf("assign channel %d: %w", a.ChannelNumber, err)
			}
		}
	}

	if err := saveTiers(ctx, tx, card); err != nil {
		return err
	}
	if err := saveSheetRows(ctx, tx, card); err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// saveSheetRows replaces the whole middle band for this squadron.
//
// Delete-then-insert rather than an upsert per row: the submitted list is the
// band, so a shorter list has to actually shorten the stored set. An upsert
// would leave the rows past the end of the new list behind.
//
// It runs inside the card's transaction, so a failure here leaves the band as
// it was rather than emptied.
func saveSheetRows(ctx context.Context, tx pgx.Tx, card *CommsCard) error {
	if _, err := tx.Exec(ctx,
		`DELETE FROM pace_freq_rows WHERE section = $1`, card.Section); err != nil {
		return fmt.Errorf("clear frequency rows: %w", err)
	}
	if _, err := tx.Exec(ctx,
		`DELETE FROM pace_tmn_rows WHERE section = $1`, card.Section); err != nil {
		return fmt.Errorf("clear tmn rows: %w", err)
	}

	blocks := []struct {
		name string
		rows []*FreqRow
	}{
		{BlockLTAC, card.LTACRows},
		{BlockTACSAT, card.TACSATRows},
	}
	for _, b := range blocks {
		for i, row := range b.rows {
			// Position is the index in the submitted list, never a client
			// value, so the UNIQUE constraint cannot be tripped by a caller.
			if _, err := tx.Exec(ctx, `
				INSERT INTO pace_freq_rows
					(id, section, block, position, name, channel, up_freq, down_freq, sat, crypto, highlights)
				VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
				uuid.New().String(), card.Section, b.name, i,
				row.Name, row.Channel, row.Up, row.Down, row.Sat, row.Crypto,
				orEmpty(row.Highlights),
			); err != nil {
				return fmt.Errorf("insert %s row %d: %w", b.name, i, err)
			}
		}
	}

	for i, row := range card.TmnRows {
		if _, err := tx.Exec(ctx, `
			INSERT INTO pace_tmn_rows (id, section, position, label, value, highlights)
			VALUES ($1,$2,$3,$4,$5,$6)`,
			uuid.New().String(), card.Section, i, row.Label, row.Value, orEmpty(row.Highlights),
		); err != nil {
			return fmt.Errorf("insert tmn row %d: %w", i, err)
		}
	}

	return nil
}

// SetEmblemURL writes the emblem and nothing else.
//
// It upserts rather than updates because the header row is lazily created: a
// squadron that has never saved a card has no row, and a plain UPDATE would
// match nothing and drop the emblem on the floor while reporting success.
// Passing the empty string is how the emblem is cleared.
func (r *PostgresRepository) SetEmblemURL(ctx context.Context, section, url string) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO pace_plans (id, section, emblem_url, created_at, updated_at)
		VALUES ($1,$2,$3,NOW(),NOW())
		ON CONFLICT (section) DO UPDATE
		SET emblem_url = EXCLUDED.emblem_url,
		    updated_at = NOW()`,
		uuid.New().String(), section, url,
	)
	return err
}

func (r *PostgresRepository) CountAssignmentsForNet(ctx context.Context, netID string) (int, error) {
	var n int
	err := r.db.QueryRow(ctx,
		`SELECT COUNT(*) FROM channel_assignments WHERE net_id = $1`, netID,
	).Scan(&n)
	return n, err
}

// PlansUsingNet names the wheels a net sits on, so a refused delete can say
// which ones rather than just refusing.
func (r *PostgresRepository) PlansUsingNet(ctx context.Context, netID string) ([]string, error) {
	rows, err := r.db.Query(ctx, `
		SELECT DISTINCT COALESCE(s.label, cp.section) || ' ' || upper(cp.radio_type)
		FROM channel_assignments ca
		JOIN channel_plans cp ON cp.id = ca.plan_id
		LEFT JOIN sections s  ON s.key = cp.section
		WHERE ca.net_id = $1
		ORDER BY 1`, netID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	defer rows.Close()

	out := []string{}
	for rows.Next() {
		var label string
		if err := rows.Scan(&label); err != nil {
			return nil, err
		}
		out = append(out, label)
	}
	return out, rows.Err()
}
