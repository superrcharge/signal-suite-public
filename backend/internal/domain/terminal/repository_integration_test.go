//go:build integration

package terminal

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"backend/config"
	"backend/internal/infrastructure/database"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// The only tests in this domain that exercise real SQL. Every other terminal
// test drives MockRepository, so row order comes from a Go literal and the
// ORDER BY clause is never executed - which is why plain lexicographic name
// ordering shipped unnoticed for eight releases and no test caught it.
//
// These assert the `natural_sort` collation from migration 038 is actually
// applied. Mirrored on the client by compareNatural's tests in
// frontend/src/utils/index.test.ts, because the two must agree.

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

// Terminals reference sections(key), so a row has to exist for the FK.
func seedSection(t *testing.T, key string) {
	t.Helper()
	_, err := testDB.Exec(context.Background(),
		`INSERT INTO sections (key, label, color, pace_enabled)
		 VALUES ($1, $2, '#888888', false) ON CONFLICT (key) DO NOTHING`, key, key)
	if err != nil {
		t.Fatalf("failed to seed section %q: %v", key, err)
	}
}

func cleanupTerminals(t *testing.T) {
	t.Helper()
	if _, err := testDB.Exec(context.Background(), "DELETE FROM terminals"); err != nil {
		t.Fatalf("failed to cleanup terminals: %v", err)
	}
}

func createNamed(t *testing.T, repo *PostgresRepository, section string, names []string) {
	t.Helper()
	now := time.Now()
	for _, n := range names {
		term := &Terminal{
			ID: uuid.New().String(), Name: n, Section: section,
			Status: "available", UpdatedBy: "integration-test",
			CreatedAt: now, UpdatedAt: now,
		}
		if err := repo.Create(context.Background(), term); err != nil {
			t.Fatalf("Create(%q) failed: %v", n, err)
		}
	}
}

func namesOf(terms []*Terminal) []string {
	out := make([]string, len(terms))
	for i, t := range terms {
		out[i] = t.Name
	}
	return out
}

func assertOrder(t *testing.T, got, want []string) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("expected %d rows, got %d (%v)", len(want), len(got), got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("wrong order.\n got: %v\nwant: %v", got, want)
			return
		}
	}
}

// The reported bug: names reaching double digits interleaved, so 10, 11 and 12
// sorted above 2. Insertion order here is deliberately not the expected order,
// so a query that returned rows as inserted would fail too.
func TestFindAll_OrdersEmbeddedNumbersNumerically(t *testing.T) {
	repo := NewRepository(testDB)
	cleanupTerminals(t)
	seedSection(t, "natsort")

	createNamed(t, repo, "natsort", []string{
		"ASQD MINI 10", "ASQD MINI 2", "ASQD MINI 12",
		"ASQD MINI 1", "ASQD MINI 9", "ASQD MINI 11",
	})

	found, total, _, err := repo.FindAll(context.Background(), nil, nil, "", "", 1, 50)
	if err != nil {
		t.Fatalf("FindAll failed: %v", err)
	}
	if total != 6 {
		t.Errorf("expected total 6, got %d", total)
	}

	assertOrder(t, namesOf(found), []string{
		"ASQD MINI 1", "ASQD MINI 2", "ASQD MINI 9",
		"ASQD MINI 10", "ASQD MINI 11", "ASQD MINI 12",
	})
}

// The export path is a separate query from the list path, so it needs its own
// assertion - otherwise the CSV can silently disagree with the screen.
func TestFindForExport_OrdersEmbeddedNumbersNumerically(t *testing.T) {
	repo := NewRepository(testDB)
	cleanupTerminals(t)
	seedSection(t, "natsort")

	createNamed(t, repo, "natsort", []string{"T 10", "T 2", "T 1", "T 20", "T 3"})

	found, err := repo.FindForExport(context.Background(), ExportFilter{})
	if err != nil {
		t.Fatalf("FindForExport failed: %v", err)
	}

	assertOrder(t, namesOf(found), []string{"T 1", "T 2", "T 3", "T 10", "T 20"})
}

// Pagination is plain LIMIT/OFFSET with no cursor, so the ordering has to be a
// total order or a row can be duplicated on one page and skipped on another.
// The `, id` tiebreaker is what guarantees that; this walks both pages and
// checks every row appears exactly once.
func TestFindAll_PaginationIsStableAcrossPages(t *testing.T) {
	repo := NewRepository(testDB)
	cleanupTerminals(t)
	seedSection(t, "natsort")

	// Zero-padded and bare forms of the same ordinal are the pairs a numeric
	// collation could consider equal, which is exactly where a tie would bite.
	names := []string{"P 1", "P 01", "P 2", "P 02", "P 10", "P 010", "P 3", "P 03"}
	createNamed(t, repo, "natsort", names)

	seen := map[string]int{}
	for page := 1; page <= 2; page++ {
		found, total, _, err := repo.FindAll(context.Background(), nil, nil, "", "", page, 4)
		if err != nil {
			t.Fatalf("FindAll page %d failed: %v", page, err)
		}
		if total != len(names) {
			t.Errorf("page %d: expected total %d, got %d", page, len(names), total)
		}
		if len(found) != 4 {
			t.Errorf("page %d: expected 4 rows, got %d", page, len(found))
		}
		for _, n := range namesOf(found) {
			seen[n]++
		}
	}

	for _, n := range names {
		if seen[n] != 1 {
			t.Errorf("%q appeared %d times across the two pages, want exactly 1 (all: %v)", n, seen[n], seen)
		}
	}
}

// Search is `name ILIKE ...` in the WHERE clause and takes its collation from
// the column, which migration 038 does not touch. This is the guard on that:
// if the collation is ever attached to the column instead of the ORDER BY,
// Postgres raises "nondeterministic collations are not supported for LIKE"
// and this test is what reports it.
func TestFindAll_SearchStillMatchesUnderTheCollation(t *testing.T) {
	repo := NewRepository(testDB)
	cleanupTerminals(t)
	seedSection(t, "natsort")

	createNamed(t, repo, "natsort", []string{"ASQD MINI 2", "ASQD MINI 10", "BSQD HP 1"})

	found, total, _, err := repo.FindAll(context.Background(), nil, nil, "asqd", "", 1, 50)
	if err != nil {
		t.Fatalf("FindAll with search failed: %v", err)
	}
	if total != 2 {
		t.Errorf("expected 2 search matches, got %d (%v)", total, namesOf(found))
	}
	// Matches are still numerically ordered.
	assertOrder(t, namesOf(found), []string{"ASQD MINI 2", "ASQD MINI 10"})
}

func createTagged(t *testing.T, repo *PostgresRepository, section string, tags []string) {
	t.Helper()
	now := time.Now()
	for i, tag := range tags {
		tag := tag
		term := &Terminal{
			ID: uuid.New().String(), Name: fmt.Sprintf("TAGGED %d", i), Section: section,
			Status: "available", UpdatedBy: "integration-test",
			Tag:       &tag,
			CreatedAt: now, UpdatedAt: now,
		}
		if err := repo.Create(context.Background(), term); err != nil {
			t.Fatalf("Create(tag=%q) failed: %v", tag, err)
		}
	}
}

// FindAllTags answered 500 for every request from the moment the natural_sort
// collation was applied to it. The query was `SELECT DISTINCT tag ... ORDER BY
// tag COLLATE natural_sort`, and Postgres rejects an ORDER BY expression that
// is not literally in the select list of a SELECT DISTINCT:
//
//	ERROR: for SELECT DISTINCT, ORDER BY expressions must appear in select list
//
// Nothing caught it for the reason this file opens with - every other terminal
// test drives MockRepository, so the SQL is never executed. That applies to the
// query parsing at all, not only to the ordering, which is why a 500 on a live
// endpoint went unnoticed while the unit tests stayed green.
func TestFindAllTags_ReturnsRowsRatherThanErroring(t *testing.T) {
	repo := NewRepository(testDB)
	cleanupTerminals(t)
	seedSection(t, "natsort")

	createTagged(t, repo, "natsort", []string{"EXERCISE 10", "EXERCISE 2", "EXERCISE 1"})

	tags, err := repo.FindAllTags(context.Background())
	if err != nil {
		t.Fatalf("FindAllTags failed: %v", err)
	}
	if len(tags) != 3 {
		t.Fatalf("expected 3 tags, got %d (%v)", len(tags), tags)
	}
}

// GROUP BY has to keep doing what SELECT DISTINCT did.
func TestFindAllTags_DeduplicatesAndSortsNaturally(t *testing.T) {
	repo := NewRepository(testDB)
	cleanupTerminals(t)
	seedSection(t, "natsort")

	// EXERCISE 2 twice: three terminals can share a tag and the chip set must
	// still list it once. Insertion order is deliberately not the wanted order.
	createTagged(t, repo, "natsort", []string{
		"EXERCISE 10", "EXERCISE 2", "EXERCISE 1", "EXERCISE 2", "EXERCISE 9",
	})

	tags, err := repo.FindAllTags(context.Background())
	if err != nil {
		t.Fatalf("FindAllTags failed: %v", err)
	}

	assertOrder(t, tags, []string{"EXERCISE 1", "EXERCISE 2", "EXERCISE 9", "EXERCISE 10"})
}

// The WHERE clause is load-bearing: a terminal with no tag, or one saved as an
// empty string, must not become a blank chip in the UI.
func TestFindAllTags_SkipsNullAndEmpty(t *testing.T) {
	repo := NewRepository(testDB)
	cleanupTerminals(t)
	seedSection(t, "natsort")

	createTagged(t, repo, "natsort", []string{"REAL", ""})
	createNamed(t, repo, "natsort", []string{"UNTAGGED 1"}) // Tag stays nil

	tags, err := repo.FindAllTags(context.Background())
	if err != nil {
		t.Fatalf("FindAllTags failed: %v", err)
	}

	assertOrder(t, tags, []string{"REAL"})
}
