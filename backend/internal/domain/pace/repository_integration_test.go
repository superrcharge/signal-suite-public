//go:build integration

package pace

import (
	"context"
	"os"
	"testing"

	"backend/config"
	"backend/internal/infrastructure/database"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// The only tests in this domain that exercise real SQL. Everything else drives
// MockRepository, which is how the header upsert shipped a statement Postgres
// refuses outright (a placeholder reused inside a subselect, 42P08): every
// mock-driven test passed while every real save returned 500.
//
// Two things are pinned here and nowhere else:
//
//   - a card saves and reads back in both theaters, and the theaters do not
//     touch each other;
//   - the emblem invariant from pace.md: for a section, every pace_plans row
//     shares one emblem_url, and a non-empty emblem implies a row for every
//     entry of ValidTheaters.
//
// They run against the dev database and roll back, so nothing they write
// survives them.

var testDB *pgxpool.Pool

func TestMain(m *testing.M) {
	cfg := config.Load()
	ctx := context.Background()

	pool, err := database.NewPostgresPool(ctx, cfg.Database)
	if err != nil {
		panic("failed to connect to test database: " + err.Error())
	}
	testDB = pool

	code := m.Run()

	pool.Close()
	os.Exit(code)
}

// A section that exists in every dev database (seeded by migration 037) and
// whose rows this test clears before and after itself.
const integrationSection = "spt"

func clearSection(t *testing.T) {
	t.Helper()
	ctx := context.Background()
	for _, stmt := range []string{
		`DELETE FROM channel_plans WHERE section = $1`,
		`DELETE FROM pace_plans WHERE section = $1`,
		`DELETE FROM pace_freq_rows WHERE section = $1`,
		`DELETE FROM pace_tmn_rows WHERE section = $1`,
		`DELETE FROM pace_tiers WHERE section = $1`,
	} {
		if _, err := testDB.Exec(ctx, stmt, integrationSection); err != nil {
			t.Fatalf("clear: %v", err)
		}
	}
}

func cardFor(theater, title string) *CommsCard {
	return &CommsCard{
		Section: integrationSection,
		Theater: theater,
		Header:  &CardHeader{ID: uuid.New().String(), Section: integrationSection, Theater: theater, Title: title},
		Plans: []*ChannelPlan{{
			ID: uuid.New().String(), Section: integrationSection, Theater: theater,
			RadioType: RadioJEM, Label: title + " WHEEL", ChannelCount: 16, Assignments: []*ChannelAssignment{},
		}},
		LTACRows:   []*FreqRow{{Name: title + " LTAC"}},
		TACSATRows: []*FreqRow{},
		TmnRows:    []*TmnRow{},
	}
}

func TestSaveCard_KeepsTheTheatersApart(t *testing.T) {
	clearSection(t)
	t.Cleanup(func() { clearSection(t) })
	ctx := context.Background()
	r := NewRepository(testDB)

	for _, theater := range ValidTheaters {
		if err := r.SaveCard(ctx, cardFor(theater, "CARD "+theater)); err != nil {
			t.Fatalf("save %s: %v", theater, err)
		}
	}
	// Saving CONUS again must not disturb OCONUS.
	if err := r.SaveCard(ctx, cardFor(TheaterCONUS, "CARD conus v2")); err != nil {
		t.Fatalf("resave conus: %v", err)
	}

	for theater, want := range map[string]string{TheaterCONUS: "CARD conus v2", TheaterOCONUS: "CARD oconus"} {
		card, err := r.FindCard(ctx, integrationSection, theater)
		if err != nil {
			t.Fatalf("find %s: %v", theater, err)
		}
		if card.Theater != theater || card.Header.Title != want {
			t.Errorf("%s: theater = %q, title = %q, want %q", theater, card.Theater, card.Header.Title, want)
		}
		if p := card.PlanFor(RadioJEM); p == nil || p.Theater != theater || p.Label != want+" WHEEL" {
			t.Errorf("%s: plan = %+v", theater, p)
		}
		if len(card.LTACRows) != 1 || card.LTACRows[0].Name != want+" LTAC" {
			t.Errorf("%s: ltac rows = %+v", theater, card.LTACRows)
		}
	}
}

func TestEmblem_IsSharedAcrossTheaters(t *testing.T) {
	clearSection(t)
	t.Cleanup(func() { clearSection(t) })
	ctx := context.Background()
	r := NewRepository(testDB)

	// Uploaded before either card has been saved: the header rows are created
	// by the upload itself, one per theater.
	if err := r.SetEmblemURL(ctx, integrationSection, "https://blob/emblem.png"); err != nil {
		t.Fatalf("set emblem: %v", err)
	}
	assertEmblemInvariant(t, "https://blob/emblem.png")

	// A first save of either card keeps the emblem it did not carry.
	for _, theater := range ValidTheaters {
		if err := r.SaveCard(ctx, cardFor(theater, "T")); err != nil {
			t.Fatalf("save %s: %v", theater, err)
		}
	}
	assertEmblemInvariant(t, "https://blob/emblem.png")

	// Clearing clears every row, and a card first saved after that inherits
	// the empty value rather than a stale one.
	clearSection(t)
	if err := r.SaveCard(ctx, cardFor(TheaterCONUS, "first")); err != nil {
		t.Fatalf("save conus: %v", err)
	}
	if err := r.SetEmblemURL(ctx, integrationSection, "https://blob/second.png"); err != nil {
		t.Fatalf("set emblem: %v", err)
	}
	if err := r.SaveCard(ctx, cardFor(TheaterOCONUS, "second")); err != nil {
		t.Fatalf("save oconus: %v", err)
	}
	assertEmblemInvariant(t, "https://blob/second.png")
	if err := r.SetEmblemURL(ctx, integrationSection, ""); err != nil {
		t.Fatalf("clear emblem: %v", err)
	}
	assertEmblemInvariant(t, "")
}

func assertEmblemInvariant(t *testing.T, want string) {
	t.Helper()
	var distinct, rows int
	err := testDB.QueryRow(context.Background(),
		`SELECT COUNT(DISTINCT emblem_url), COUNT(*) FROM pace_plans WHERE section = $1`, integrationSection,
	).Scan(&distinct, &rows)
	if err != nil {
		t.Fatalf("count: %v", err)
	}
	if distinct != 1 || rows != len(ValidTheaters) {
		t.Fatalf("emblem invariant broken: %d distinct values across %d rows, want 1 across %d", distinct, rows, len(ValidTheaters))
	}
	var got string
	if err := testDB.QueryRow(context.Background(),
		`SELECT emblem_url FROM pace_plans WHERE section = $1 LIMIT 1`, integrationSection,
	).Scan(&got); err != nil {
		t.Fatalf("read: %v", err)
	}
	if got != want {
		t.Errorf("emblem_url = %q, want %q", got, want)
	}
}
