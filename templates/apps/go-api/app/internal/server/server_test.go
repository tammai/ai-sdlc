package server_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"__GO_MODULE__/internal/notes"
	"__GO_MODULE__/internal/server"
)

type memRepo struct {
	items []notes.Note
	err   error
}

func (m *memRepo) Create(_ context.Context, n notes.NewNote) (notes.Note, error) {
	if m.err != nil {
		return notes.Note{}, m.err
	}
	note := notes.Note{ID: uuid.New(), Title: n.Title, Body: n.Body, CreatedAt: time.Now().UTC()}
	m.items = append([]notes.Note{note}, m.items...)
	return note, nil
}

func (m *memRepo) List(_ context.Context, _ *notes.Cursor, limit int) ([]notes.Note, error) {
	if m.err != nil {
		return nil, m.err
	}
	return m.items[:min(limit, len(m.items))], nil
}

func newRouter(repo *memRepo, ready func(context.Context) error) http.Handler {
	return server.NewRouter(server.Deps{
		Notes: notes.NewHandler(notes.NewService(repo, nil)),
		Ready: ready,
	})
}

func do(h http.Handler, method, path, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestHealth(t *testing.T) {
	h := newRouter(&memRepo{}, nil)
	rec := do(h, http.MethodGet, "/healthz", "")
	if rec.Code != http.StatusOK || strings.TrimSpace(rec.Body.String()) != `{"status":"ok"}` {
		t.Fatalf("healthz = %d %s", rec.Code, rec.Body)
	}
	if rec := do(h, http.MethodGet, "/readyz", ""); rec.Code != http.StatusOK {
		t.Fatalf("readyz = %d", rec.Code)
	}
}

func TestReadyzFailsWhenDependencyDown(t *testing.T) {
	h := newRouter(&memRepo{}, func(context.Context) error { return errors.New("db down") })
	rec := do(h, http.MethodGet, "/readyz", "")
	if rec.Code != http.StatusServiceUnavailable || rec.Header().Get("Content-Type") != "application/problem+json" {
		t.Fatalf("readyz = %d %s", rec.Code, rec.Header().Get("Content-Type"))
	}
}

func TestNotesEndpoints(t *testing.T) {
	tests := []struct {
		name       string
		repo       *memRepo
		method     string
		path       string
		body       string
		wantStatus int
		wantDetail string // substring of problem detail
	}{
		{name: "create ok", repo: &memRepo{}, method: "POST", path: "/v1/notes", body: `{"title":"Hello","body":"World"}`, wantStatus: 201},
		{name: "create without body field", repo: &memRepo{}, method: "POST", path: "/v1/notes", body: `{"title":"Hello"}`, wantStatus: 201},
		{name: "create blank title", repo: &memRepo{}, method: "POST", path: "/v1/notes", body: `{"title":"  "}`, wantStatus: 422, wantDetail: "title is required"},
		{name: "create malformed json", repo: &memRepo{}, method: "POST", path: "/v1/notes", body: `{"title":`, wantStatus: 400},
		{name: "create storage failure hides cause", repo: &memRepo{err: errors.New("secret dsn")}, method: "POST", path: "/v1/notes", body: `{"title":"x"}`, wantStatus: 500},
		{name: "list ok", repo: &memRepo{}, method: "GET", path: "/v1/notes", wantStatus: 200},
		{name: "list limit out of range", repo: &memRepo{}, method: "GET", path: "/v1/notes?limit=101", wantStatus: 422, wantDetail: "limit"},
		{name: "list limit not a number", repo: &memRepo{}, method: "GET", path: "/v1/notes?limit=abc", wantStatus: 400},
		{name: "list bad cursor", repo: &memRepo{}, method: "GET", path: "/v1/notes?cursor=nope", wantStatus: 422, wantDetail: "cursor"},
		{name: "unknown route", repo: &memRepo{}, method: "GET", path: "/nope", wantStatus: 404},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := do(newRouter(tt.repo, nil), tt.method, tt.path, tt.body)
			if rec.Code != tt.wantStatus {
				t.Fatalf("status = %d, want %d (%s)", rec.Code, tt.wantStatus, rec.Body)
			}
			if tt.wantStatus >= 400 {
				if ct := rec.Header().Get("Content-Type"); ct != "application/problem+json" {
					t.Fatalf("content-type = %q, want problem+json", ct)
				}
				var p struct {
					Title  string `json:"title"`
					Status int    `json:"status"`
					Detail string `json:"detail"`
				}
				if err := json.Unmarshal(rec.Body.Bytes(), &p); err != nil {
					t.Fatal(err)
				}
				if p.Status != tt.wantStatus || p.Title == "" || !strings.Contains(p.Detail, tt.wantDetail) {
					t.Fatalf("problem = %+v", p)
				}
				if strings.Contains(rec.Body.String(), "secret dsn") {
					t.Fatal("internal error leaked to client")
				}
			}
		})
	}
}

func TestCreateThenList(t *testing.T) {
	h := newRouter(&memRepo{}, nil)
	rec := do(h, "POST", "/v1/notes", `{"title":"First","body":"b"}`)
	var created struct {
		ID        string `json:"id"`
		Title     string `json:"title"`
		CreatedAt string `json:"createdAt"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &created); err != nil || created.ID == "" || created.CreatedAt == "" {
		t.Fatalf("bad create response: %s (%v)", rec.Body, err)
	}

	rec = do(h, "GET", "/v1/notes", "")
	var page struct {
		Items []struct {
			ID    string `json:"id"`
			Title string `json:"title"`
		} `json:"items"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &page); err != nil {
		t.Fatal(err)
	}
	if len(page.Items) != 1 || page.Items[0].ID != created.ID || page.Items[0].Title != "First" {
		t.Fatalf("list = %s", rec.Body)
	}
}
