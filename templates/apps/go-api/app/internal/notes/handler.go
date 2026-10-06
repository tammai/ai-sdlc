package notes

import (
	"context"
	"errors"
	"net/http"

	"__GO_MODULE__/internal/api/gen"
	"__GO_MODULE__/internal/problem"
)

// Handler implements the notes operations of the generated gen.StrictServerInterface.
// It decodes, calls the service and maps domain errors to problem+json; no business rules.
type Handler struct{ svc *Service }

// NewHandler builds a Handler.
func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

// ListNotes implements GET /v1/notes.
func (h *Handler) ListNotes(ctx context.Context, req gen.ListNotesRequestObject) (gen.ListNotesResponseObject, error) {
	var cursor string
	if req.Params.Cursor != nil {
		cursor = *req.Params.Cursor
	}
	page, err := h.svc.List(ctx, req.Params.Limit, cursor)
	if err != nil {
		return nil, toProblem(err)
	}

	out := gen.ListNotes200JSONResponse{Items: make([]gen.Note, len(page.Items))}
	for i, n := range page.Items {
		out.Items[i] = toAPI(n)
	}
	if page.NextCursor != "" {
		out.NextCursor = &page.NextCursor
	}
	return out, nil
}

// CreateNote implements POST /v1/notes.
func (h *Handler) CreateNote(ctx context.Context, req gen.CreateNoteRequestObject) (gen.CreateNoteResponseObject, error) {
	if req.Body == nil {
		return nil, problem.New(http.StatusBadRequest, "request body is required")
	}
	in := NewNote{Title: req.Body.Title}
	if req.Body.Body != nil {
		in.Body = *req.Body.Body
	}
	n, err := h.svc.Create(ctx, in)
	if err != nil {
		return nil, toProblem(err)
	}
	return gen.CreateNote201JSONResponse(toAPI(n)), nil
}

func toAPI(n Note) gen.Note {
	return gen.Note{Id: n.ID, Title: n.Title, Body: n.Body, CreatedAt: n.CreatedAt}
}

// toProblem maps domain errors to client-safe problems. Anything unknown is returned as-is and
// becomes a generic 500 in the server's error handler (details are logged, never sent to the client).
func toProblem(err error) error {
	var ve *ValidationError
	if errors.As(err, &ve) {
		return problem.New(http.StatusUnprocessableEntity, ve.Detail)
	}
	return err
}
