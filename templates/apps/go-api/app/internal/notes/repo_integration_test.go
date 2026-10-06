package notes_test

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"net/url"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"__GO_MODULE__/internal/db"
	"__GO_MODULE__/internal/notes"
)

// newTestPool returns a pool bound to a throwaway schema with all migrations applied.
// The test SKIPS when DATABASE_URL is unset, so `go test ./...` works offline.
// Run against local Postgres with: docker compose up -d postgres
// then DATABASE_URL=postgres://postgres:postgres@localhost:5432/<db>?sslmode=disable go test ./...
func newTestPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; skipping Postgres integration test")
	}
	ctx := context.Background()

	suffix := make([]byte, 6)
	if _, err := rand.Read(suffix); err != nil {
		t.Fatal(err)
	}
	schema := "test_" + hex.EncodeToString(suffix)

	admin, err := pgx.Connect(ctx, dsn)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	if _, err := admin.Exec(ctx, "CREATE SCHEMA "+schema); err != nil {
		t.Fatalf("create schema: %v", err)
	}
	t.Cleanup(func() {
		_, _ = admin.Exec(ctx, "DROP SCHEMA "+schema+" CASCADE")
		_ = admin.Close(ctx)
	})

	u, err := url.Parse(dsn)
	if err != nil {
		t.Fatal(err)
	}
	q := u.Query()
	q.Set("search_path", schema)
	u.RawQuery = q.Encode()
	pool, err := pgxpool.New(ctx, u.String())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)

	if err := db.Migrate(ctx, pool); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	return pool
}

func TestPGRepoCreateAndList(t *testing.T) {
	pool := newTestPool(t)
	repo := notes.NewPGRepo(pool)
	svc := notes.NewService(repo, nil)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	created, err := svc.Create(ctx, notes.NewNote{Title: "first", Body: "hello"})
	if err != nil {
		t.Fatal(err)
	}
	if created.ID.String() == "" || created.CreatedAt.IsZero() || created.Body != "hello" {
		t.Fatalf("unexpected created note: %+v", created)
	}
	for _, title := range []string{"second", "third", "fourth", "fifth"} {
		if _, err := svc.Create(ctx, notes.NewNote{Title: title}); err != nil {
			t.Fatal(err)
		}
	}

	limit := 2
	var titles []string
	cursor := ""
	for range 5 {
		page, err := svc.List(ctx, &limit, cursor)
		if err != nil {
			t.Fatal(err)
		}
		for _, n := range page.Items {
			titles = append(titles, n.Title)
		}
		if page.NextCursor == "" {
			break
		}
		cursor = page.NextCursor
	}
	want := []string{"fifth", "fourth", "third", "second", "first"}
	if len(titles) != len(want) {
		t.Fatalf("titles = %v, want %v", titles, want)
	}
	for i := range want {
		if titles[i] != want[i] {
			t.Fatalf("titles = %v, want %v", titles, want)
		}
	}
}

func TestPGRepoEnforcesConstraints(t *testing.T) {
	pool := newTestPool(t)
	repo := notes.NewPGRepo(pool)
	// Bypass the service on purpose: the schema must reject what the service would.
	if _, err := repo.Create(context.Background(), notes.NewNote{Title: ""}); err == nil {
		t.Fatal("empty title accepted by the database")
	}
}
