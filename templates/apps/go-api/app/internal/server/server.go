// Package server builds the HTTP router: chi + the generated strict server, middleware,
// health endpoints and RFC 9457 error mapping. It holds wiring only, no business rules.
package server

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"__GO_MODULE__/internal/api/gen"
	"__GO_MODULE__/internal/notes"
	"__GO_MODULE__/internal/problem"
)

// PublicPaths never require a bearer token (healthz is also `security: []` in the contract).
var PublicPaths = []string{"/healthz", "/readyz"}

// Deps are the collaborators the router needs.
type Deps struct {
	Notes *notes.Handler
	// Ready reports whether dependencies (the database) are reachable; backs /readyz.
	Ready func(ctx context.Context) error
	// Auth is the bearer-token middleware (see internal/auth); nil means no auth.
	Auth func(http.Handler) http.Handler
	Log  *slog.Logger
}

// api implements gen.StrictServerInterface: notes operations plus healthz.
type api struct{ *notes.Handler }

func (api) Healthz(context.Context, gen.HealthzRequestObject) (gen.HealthzResponseObject, error) {
	return gen.Healthz200JSONResponse{Status: gen.Healthz200JSONResponseBodyStatusOk}, nil
}

var _ gen.StrictServerInterface = api{}

// NewRouter builds the full HTTP handler.
func NewRouter(d Deps) http.Handler {
	log := d.Log
	if log == nil {
		log = slog.New(slog.DiscardHandler)
	}

	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(requestLogger(log))
	r.Use(recoverer(log))
	r.Use(middleware.Timeout(30 * time.Second))
	if d.Auth != nil {
		r.Use(d.Auth)
	}

	r.NotFound(func(w http.ResponseWriter, _ *http.Request) { problem.Write(w, problem.New(http.StatusNotFound, "")) })
	r.MethodNotAllowed(func(w http.ResponseWriter, _ *http.Request) {
		problem.Write(w, problem.New(http.StatusMethodNotAllowed, ""))
	})

	r.Get("/readyz", func(w http.ResponseWriter, req *http.Request) {
		ctx, cancel := context.WithTimeout(req.Context(), 2*time.Second)
		defer cancel()
		if d.Ready != nil {
			if err := d.Ready(ctx); err != nil {
				log.WarnContext(req.Context(), "not ready", "error", err)
				problem.Write(w, problem.New(http.StatusServiceUnavailable, "dependencies unavailable"))
				return
			}
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	})

	strict := gen.NewStrictHandlerWithOptions(api{d.Notes}, nil, gen.StrictHTTPServerOptions{
		RequestErrorHandlerFunc: func(w http.ResponseWriter, _ *http.Request, err error) {
			problem.Write(w, problem.New(http.StatusBadRequest, err.Error()))
		},
		ResponseErrorHandlerFunc: func(w http.ResponseWriter, req *http.Request, err error) {
			var pe *problem.Error
			if errors.As(err, &pe) {
				problem.Write(w, pe)
				return
			}
			// Unexpected: log the cause, never leak it to the client.
			log.ErrorContext(req.Context(), "request failed", "error", err, "request_id", middleware.GetReqID(req.Context()))
			problem.Write(w, problem.New(http.StatusInternalServerError, ""))
		},
	})
	gen.HandlerWithOptions(strict, gen.ChiServerOptions{
		BaseRouter: r,
		ErrorHandlerFunc: func(w http.ResponseWriter, _ *http.Request, err error) {
			problem.Write(w, problem.New(http.StatusBadRequest, err.Error()))
		},
	})
	return r
}

func requestLogger(log *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
			next.ServeHTTP(ww, r)
			log.InfoContext(r.Context(), "request",
				"method", r.Method, "path", r.URL.Path, "status", ww.Status(),
				"duration_ms", time.Since(start).Milliseconds(), "request_id", middleware.GetReqID(r.Context()))
		})
	}
}

func recoverer(log *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				if rec := recover(); rec != nil && rec != http.ErrAbortHandler {
					log.ErrorContext(r.Context(), "panic", "panic", rec, "request_id", middleware.GetReqID(r.Context()))
					problem.Write(w, problem.New(http.StatusInternalServerError, ""))
				}
			}()
			next.ServeHTTP(w, r)
		})
	}
}
