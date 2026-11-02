//go:build integration

package organization

import (
	"context"
	"os"
	"testing"
	"time"

	"backend/config"
	"backend/internal/infrastructure/database"

	"github.com/jackc/pgx/v5/pgxpool"
)

// The only tests in this domain that exercise real SQL. Every other test
// drives MockRepository, so operation_count there is whatever a Go literal
// says and the correlated subquery in selectCols is never executed.
//
// What is pinned here and nowhere else: operation_count counts distinct
// operations that name the organization's key, reports 0 for an unused one,
// and ignores ad hoc participants (NULL organization_key, migration 048), on
// every read the repository offers.
//
// They run against the dev database and clean up after themselves: the rows
// carry a prefix nothing else uses, and deleting the operations cascades to
// their participants before the organizations go.

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

const (
	itestUsed   = "itest_opcount_used"
	itestUnused = "itest_opcount_unused"
	itestOpName = "itest opcount "
)

func clearOperationCountRows(t *testing.T) {
	t.Helper()
	ctx := context.Background()
	for _, stmt := range []string{
		`DELETE FROM operations WHERE name LIKE 'itest opcount %'`,
		`DELETE FROM organizations WHERE key LIKE 'itest_opcount_%'`,
	} {
		if _, err := testDB.Exec(ctx, stmt); err != nil {
			t.Fatalf("clear: %v", err)
		}
	}
}

func seedOperation(t *testing.T, name string) string {
	t.Helper()
	var id string
	if err := testDB.QueryRow(context.Background(),
		`INSERT INTO operations (name) VALUES ($1) RETURNING id`, name,
	).Scan(&id); err != nil {
		t.Fatalf("seed operation %q: %v", name, err)
	}
	return id
}

func TestOperationCount(t *testing.T) {
	clearOperationCountRows(t)
	t.Cleanup(func() { clearOperationCountRows(t) })
	ctx := context.Background()
	r := NewRepository(testDB)

	now := time.Now().UTC()
	for _, o := range []*Organization{
		{Key: itestUsed, Name: "ITEST opcount used", CreatedAt: now, UpdatedAt: now},
		{Key: itestUnused, Name: "ITEST opcount unused", CreatedAt: now, UpdatedAt: now},
	} {
		if err := r.Create(ctx, o); err != nil {
			t.Fatalf("create %s: %v", o.Key, err)
		}
	}

	// The used organization is checked in to two operations. Each of those
	// operations, and a third, also carries an ad hoc participant, one of them
	// named exactly as the unused organization, which must count for nothing.
	opA := seedOperation(t, itestOpName+"a")
	opB := seedOperation(t, itestOpName+"b")
	opC := seedOperation(t, itestOpName+"c")
	for _, op := range []string{opA, opB} {
		if _, err := testDB.Exec(ctx,
			`INSERT INTO operation_participants (operation_id, organization_key) VALUES ($1, $2)`,
			op, itestUsed,
		); err != nil {
			t.Fatalf("check in %s: %v", op, err)
		}
	}
	for _, op := range []string{opA, opB, opC} {
		if _, err := testDB.Exec(ctx,
			`INSERT INTO operation_participants (operation_id, organization_key, adhoc_name) VALUES ($1, NULL, $2)`,
			op, "ITEST opcount unused",
		); err != nil {
			t.Fatalf("ad hoc participant in %s: %v", op, err)
		}
	}

	want := map[string]int{itestUsed: 2, itestUnused: 0}

	t.Run("FindAll", func(t *testing.T) {
		all, err := r.FindAll(ctx)
		if err != nil {
			t.Fatal(err)
		}
		got := map[string]int{}
		for _, o := range all {
			if _, ok := want[o.Key]; ok {
				got[o.Key] = o.OperationCount
			}
		}
		if len(got) != len(want) || got[itestUsed] != 2 || got[itestUnused] != 0 {
			t.Errorf("counts = %v; want %v", got, want)
		}
	})

	t.Run("FindByKey", func(t *testing.T) {
		for key, n := range want {
			o, err := r.FindByKey(ctx, key)
			if err != nil {
				t.Fatalf("%s: %v", key, err)
			}
			if o.OperationCount != n {
				t.Errorf("%s: operation_count = %d; want %d", key, o.OperationCount, n)
			}
		}
	})

	t.Run("FindByKeys", func(t *testing.T) {
		items, err := r.FindByKeys(ctx, []string{itestUsed, itestUnused})
		if err != nil {
			t.Fatal(err)
		}
		if len(items) != 2 {
			t.Fatalf("got %d organizations; want 2", len(items))
		}
		for _, o := range items {
			if o.OperationCount != want[o.Key] {
				t.Errorf("%s: operation_count = %d; want %d", o.Key, o.OperationCount, want[o.Key])
			}
		}
	})
}
