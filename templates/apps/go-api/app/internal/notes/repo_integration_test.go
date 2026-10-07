package notes_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"__GO_MODULE__/internal/auth"
	"__GO_MODULE__/internal/db/dbtest"
	"__GO_MODULE__/internal/notes"
)

func newUser(t *testing.T, pool *pgxpool.Pool, email string) uuid.UUID {
	t.Helper()
	u, err := auth.NewPGStore(pool).CreateUser(context.Background(), email, "", nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	return u.ID
}

func TestPGRepoCreateAndList(t *testing.T) {
	pool := dbtest.NewPool(t)
	owner := newUser(t, pool, "owner@example.com")
	other := newUser(t, pool, "other@example.com")
	repo := notes.NewPGRepo(pool)
	svc := notes.NewService(repo, nil)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	created, err := svc.Create(ctx, owner, notes.NewNote{Title: "first", Body: "hello"})
	if err != nil {
		t.Fatal(err)
	}
	if created.ID == uuid.Nil || created.CreatedAt.IsZero() || created.Body != "hello" || created.OwnerID != owner {
		t.Fatalf("unexpected created note: %+v", created)
	}
	for _, title := range []string{"second", "third", "fourth", "fifth"} {
		if _, err := svc.Create(ctx, owner, notes.NewNote{Title: title}); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := svc.Create(ctx, other, notes.NewNote{Title: "someone else's"}); err != nil {
		t.Fatal(err)
	}

	limit := 2
	var titles []string
	cursor := ""
	for range 5 {
		page, err := svc.List(ctx, owner, &limit, cursor)
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

	page, err := svc.List(ctx, other, nil, "")
	if err != nil || len(page.Items) != 1 || page.Items[0].Title != "someone else's" {
		t.Fatalf("other's page = %+v, %v", page, err)
	}
}

func TestPGRepoEnforcesConstraints(t *testing.T) {
	pool := dbtest.NewPool(t)
	repo := notes.NewPGRepo(pool)
	owner := newUser(t, pool, "c@example.com")
	// Bypass the service on purpose: the schema must reject what the service would.
	if _, err := repo.Create(context.Background(), owner, notes.NewNote{Title: ""}); err == nil {
		t.Fatal("empty title accepted by the database")
	}
	if _, err := repo.Create(context.Background(), uuid.New(), notes.NewNote{Title: "orphan"}); err == nil {
		t.Fatal("note without an existing owner accepted by the database")
	}
}
