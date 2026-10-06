package notes

import (
	"context"
	"time"

	"__GO_MODULE__/internal/db/sqlc"
)

// PGRepo implements Repo with sqlc queries only — no SQL and no business rules here.
// Pass a *pgxpool.Pool, or a pgx.Tx when the service needs a transaction.
type PGRepo struct{ q *sqlc.Queries }

// NewPGRepo wraps a pgx pool or transaction.
func NewPGRepo(db sqlc.DBTX) *PGRepo { return &PGRepo{q: sqlc.New(db)} }

// Create inserts a note; id and created_at come from the database.
func (r *PGRepo) Create(ctx context.Context, n NewNote) (Note, error) {
	row, err := r.q.CreateNote(ctx, sqlc.CreateNoteParams{Title: n.Title, Body: n.Body})
	if err != nil {
		return Note{}, err
	}
	return fromRow(row), nil
}

// List returns notes newest first using keyset pagination.
func (r *PGRepo) List(ctx context.Context, after *Cursor, limit int) ([]Note, error) {
	var rows []sqlc.Note
	var err error
	pageLimit := int32(min(limit, 1<<20)) //nolint:gosec // bounded; the service caps limit at MaxLimit+1
	if after == nil {
		rows, err = r.q.ListNotesFirstPage(ctx, pageLimit)
	} else {
		rows, err = r.q.ListNotesAfter(ctx, sqlc.ListNotesAfterParams{
			AfterCreatedAt: after.CreatedAt,
			AfterID:        after.ID,
			PageLimit:      pageLimit,
		})
	}
	if err != nil {
		return nil, err
	}
	out := make([]Note, len(rows))
	for i, row := range rows {
		out[i] = fromRow(row)
	}
	return out, nil
}

func fromRow(r sqlc.Note) Note {
	return Note{ID: r.ID, Title: r.Title, Body: r.Body, CreatedAt: r.CreatedAt.UTC().Truncate(time.Microsecond)}
}
