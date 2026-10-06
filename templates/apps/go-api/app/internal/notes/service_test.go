package notes_test

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"__GO_MODULE__/internal/notes"
)

// fakeRepo is an in-memory notes.Repo. Notes are kept newest first, like the real query.
type fakeRepo struct {
	notes []notes.Note
	err   error
	calls int
}

func (f *fakeRepo) Create(_ context.Context, n notes.NewNote) (notes.Note, error) {
	f.calls++
	if f.err != nil {
		return notes.Note{}, f.err
	}
	note := notes.Note{
		ID:        uuid.New(),
		Title:     n.Title,
		Body:      n.Body,
		CreatedAt: time.Date(2026, 1, 1, 0, 0, len(f.notes), 0, time.UTC),
	}
	f.notes = append([]notes.Note{note}, f.notes...)
	return note, nil
}

func (f *fakeRepo) List(_ context.Context, after *notes.Cursor, limit int) ([]notes.Note, error) {
	f.calls++
	if f.err != nil {
		return nil, f.err
	}
	var out []notes.Note
	for _, n := range f.notes {
		if after != nil && !n.CreatedAt.Before(after.CreatedAt) {
			continue
		}
		out = append(out, n)
		if len(out) == limit {
			break
		}
	}
	return out, nil
}

func ptr[T any](v T) *T { return &v }

func TestServiceCreate(t *testing.T) {
	tests := []struct {
		name      string
		in        notes.NewNote
		repoErr   error
		wantTitle string
		wantErr   string // "validation" | "repo" | ""
		wantCalls int
	}{
		{name: "valid", in: notes.NewNote{Title: "Buy milk", Body: "2 litres"}, wantTitle: "Buy milk", wantCalls: 1},
		{name: "title is trimmed", in: notes.NewNote{Title: "  Hello  "}, wantTitle: "Hello", wantCalls: 1},
		{name: "empty title", in: notes.NewNote{Title: ""}, wantErr: "validation"},
		{name: "blank title", in: notes.NewNote{Title: "   "}, wantErr: "validation"},
		{name: "title at limit", in: notes.NewNote{Title: strings.Repeat("a", notes.MaxTitleLen)}, wantTitle: strings.Repeat("a", notes.MaxTitleLen), wantCalls: 1},
		{name: "title too long", in: notes.NewNote{Title: strings.Repeat("a", notes.MaxTitleLen+1)}, wantErr: "validation"},
		{name: "multibyte title counts runes", in: notes.NewNote{Title: strings.Repeat("é", notes.MaxTitleLen)}, wantTitle: strings.Repeat("é", notes.MaxTitleLen), wantCalls: 1},
		{name: "body too long", in: notes.NewNote{Title: "x", Body: strings.Repeat("b", notes.MaxBodyLen+1)}, wantErr: "validation"},
		{name: "repo failure is not a validation error", in: notes.NewNote{Title: "x"}, repoErr: errors.New("db down"), wantErr: "repo", wantCalls: 1},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := &fakeRepo{err: tt.repoErr}
			var logs bytes.Buffer
			svc := notes.NewService(repo, slog.New(slog.NewJSONHandler(&logs, nil)))

			got, err := svc.Create(context.Background(), tt.in)

			var ve *notes.ValidationError
			switch tt.wantErr {
			case "validation":
				if !errors.As(err, &ve) {
					t.Fatalf("want ValidationError, got %v", err)
				}
			case "repo":
				if err == nil || errors.As(err, &ve) {
					t.Fatalf("want non-validation error, got %v", err)
				}
			default:
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if got.Title != tt.wantTitle {
					t.Fatalf("title = %q, want %q", got.Title, tt.wantTitle)
				}
				if !strings.Contains(logs.String(), `"action":"note.create"`) || !strings.Contains(logs.String(), got.ID.String()) {
					t.Fatalf("missing audit line: %s", logs.String())
				}
				if strings.Contains(logs.String(), got.Title) && got.Title != "" {
					t.Fatalf("audit line must not contain note content: %s", logs.String())
				}
			}
			if repo.calls != tt.wantCalls {
				t.Fatalf("repo calls = %d, want %d", repo.calls, tt.wantCalls)
			}
		})
	}
}

func TestServiceListValidation(t *testing.T) {
	tests := []struct {
		name   string
		limit  *int
		cursor string
		ok     bool
	}{
		{name: "defaults", ok: true},
		{name: "limit 1", limit: ptr(1), ok: true},
		{name: "limit max", limit: ptr(notes.MaxLimit), ok: true},
		{name: "limit zero", limit: ptr(0)},
		{name: "limit negative", limit: ptr(-5)},
		{name: "limit too big", limit: ptr(notes.MaxLimit + 1)},
		{name: "cursor not base64", cursor: "!!!"},
		{name: "cursor wrong shape", cursor: "aGVsbG8"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			svc := notes.NewService(&fakeRepo{}, nil)
			_, err := svc.List(context.Background(), tt.limit, tt.cursor)
			var ve *notes.ValidationError
			if tt.ok && err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if !tt.ok && !errors.As(err, &ve) {
				t.Fatalf("want ValidationError, got %v", err)
			}
		})
	}
}

func TestServiceListPagination(t *testing.T) {
	repo := &fakeRepo{}
	svc := notes.NewService(repo, nil)
	ctx := context.Background()
	for _, title := range []string{"one", "two", "three", "four", "five"} {
		if _, err := svc.Create(ctx, notes.NewNote{Title: title}); err != nil {
			t.Fatal(err)
		}
	}

	var titles []string
	cursor := ""
	pages := 0
	for {
		page, err := svc.List(ctx, ptr(2), cursor)
		if err != nil {
			t.Fatal(err)
		}
		pages++
		for _, n := range page.Items {
			titles = append(titles, n.Title)
		}
		if page.NextCursor == "" {
			break
		}
		cursor = page.NextCursor
		if pages > 10 {
			t.Fatal("pagination does not terminate")
		}
	}

	want := []string{"five", "four", "three", "two", "one"} // newest first
	if strings.Join(titles, ",") != strings.Join(want, ",") {
		t.Fatalf("titles = %v, want %v", titles, want)
	}
	if pages != 3 {
		t.Fatalf("pages = %d, want 3", pages)
	}
}

func TestServiceListExactPageHasNoCursor(t *testing.T) {
	repo := &fakeRepo{}
	svc := notes.NewService(repo, nil)
	ctx := context.Background()
	for _, title := range []string{"a", "b"} {
		_, _ = svc.Create(ctx, notes.NewNote{Title: title})
	}
	page, err := svc.List(ctx, ptr(2), "")
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Items) != 2 || page.NextCursor != "" {
		t.Fatalf("got %d items, cursor %q; want 2 items and no cursor", len(page.Items), page.NextCursor)
	}
}

func TestServiceListRepoError(t *testing.T) {
	svc := notes.NewService(&fakeRepo{err: errors.New("boom")}, nil)
	_, err := svc.List(context.Background(), nil, "")
	var ve *notes.ValidationError
	if err == nil || errors.As(err, &ve) {
		t.Fatalf("want non-validation error, got %v", err)
	}
}
