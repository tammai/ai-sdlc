// Package notes is the notes slice: handler (HTTP <-> domain), service (business rules), repo (sqlc).
package notes

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"

	"__GO_MODULE__/internal/auth"
)

// Limits mirror contracts/openapi.yaml (NewNote, listNotes.limit).
const (
	MaxTitleLen  = 200
	MaxBodyLen   = 10000
	DefaultLimit = 20
	MaxLimit     = 100
)

// Note is the domain model.
type Note struct {
	ID        uuid.UUID
	Title     string
	Body      string
	CreatedAt time.Time
}

// NewNote is the input for creating a note.
type NewNote struct {
	Title string
	Body  string
}

// Cursor is a keyset position: the last note of the previous page.
type Cursor struct {
	CreatedAt time.Time
	ID        uuid.UUID
}

// Page is one page of notes, newest first.
type Page struct {
	Items      []Note
	NextCursor string // empty when there is no next page
}

// ValidationError is a client error: the request is well-formed but breaks a business rule.
type ValidationError struct{ Detail string }

func (e *ValidationError) Error() string { return e.Detail }

// Repo is the persistence port. The real implementation is sqlc-only (see repo.go).
type Repo interface {
	Create(ctx context.Context, n NewNote) (Note, error)
	// List returns up to limit notes newest first, strictly after the cursor when given.
	List(ctx context.Context, after *Cursor, limit int) ([]Note, error)
}

// Service holds the notes business rules.
type Service struct {
	repo Repo
	log  *slog.Logger
}

// NewService builds a Service. A nil logger discards audit lines.
func NewService(repo Repo, log *slog.Logger) *Service {
	if log == nil {
		log = slog.New(slog.DiscardHandler)
	}
	return &Service{repo: repo, log: log}
}

// Create validates and stores a note, then emits an audit line (actor, action, entity, id; no content).
func (s *Service) Create(ctx context.Context, in NewNote) (Note, error) {
	in.Title = strings.TrimSpace(in.Title)
	switch {
	case in.Title == "":
		return Note{}, &ValidationError{Detail: "title is required"}
	case utf8.RuneCountInString(in.Title) > MaxTitleLen:
		return Note{}, &ValidationError{Detail: fmt.Sprintf("title must be at most %d characters", MaxTitleLen)}
	case utf8.RuneCountInString(in.Body) > MaxBodyLen:
		return Note{}, &ValidationError{Detail: fmt.Sprintf("body must be at most %d characters", MaxBodyLen)}
	}

	n, err := s.repo.Create(ctx, in)
	if err != nil {
		return Note{}, fmt.Errorf("create note: %w", err)
	}
	s.log.InfoContext(ctx, "audit", "actor", auth.Subject(ctx), "action", "note.create", "entity", "note", "id", n.ID)
	return n, nil
}

// List returns one page of notes. A nil limit means DefaultLimit; an empty cursor means the first page.
func (s *Service) List(ctx context.Context, limit *int, cursor string) (Page, error) {
	n := DefaultLimit
	if limit != nil {
		n = *limit
	}
	if n < 1 || n > MaxLimit {
		return Page{}, &ValidationError{Detail: fmt.Sprintf("limit must be between 1 and %d", MaxLimit)}
	}
	var after *Cursor
	if cursor != "" {
		c, err := decodeCursor(cursor)
		if err != nil {
			return Page{}, &ValidationError{Detail: "cursor is invalid"}
		}
		after = &c
	}

	// Fetch one extra row to know whether another page exists.
	items, err := s.repo.List(ctx, after, n+1)
	if err != nil {
		return Page{}, fmt.Errorf("list notes: %w", err)
	}
	page := Page{Items: items}
	if len(items) > n {
		page.Items = items[:n]
		last := page.Items[n-1]
		page.NextCursor = encodeCursor(Cursor{CreatedAt: last.CreatedAt, ID: last.ID})
	}
	return page, nil
}

func encodeCursor(c Cursor) string {
	raw := c.CreatedAt.UTC().Format(time.RFC3339Nano) + "|" + c.ID.String()
	return base64.RawURLEncoding.EncodeToString([]byte(raw))
}

func decodeCursor(s string) (Cursor, error) {
	raw, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return Cursor{}, err
	}
	ts, id, ok := strings.Cut(string(raw), "|")
	if !ok {
		return Cursor{}, errors.New("malformed cursor")
	}
	t, err := time.Parse(time.RFC3339Nano, ts)
	if err != nil {
		return Cursor{}, err
	}
	u, err := uuid.Parse(id)
	if err != nil {
		return Cursor{}, err
	}
	return Cursor{CreatedAt: t, ID: u}, nil
}
