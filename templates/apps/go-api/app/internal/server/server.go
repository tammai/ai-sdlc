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
	"__GO_MODULE__/internal/auth"
	"__GO_MODULE__/internal/notes"
	"__GO_MODULE__/internal/problem"
)

// PublicOperations never require authentication: exactly the operations with `security: []` in
// contracts/openapi.yaml (TestPublicOperationsMatchContract keeps them in sync). Every other
// operation, including any new one, requires a session cookie or bearer token. /readyz is public too.
var PublicOperations = map[string]bool{
	"Healthz":          true,
	"GetAuthProviders": true,
	"Register":         true,
	"CreateSession":    true,
	"CreateToken":      true,
	"RevokeToken":      true,
	"RequestMagicLink": true,
	"VerifyMagicLink":  true,
	"StartOidc":        true,
	"OidcCallback":     true,
}

// MaxBodyBytes bounds request bodies.
const MaxBodyBytes = 1 << 20

// Deps are the collaborators the router needs.
type Deps struct {
	Notes *notes.Handler
	Auth  *auth.Service
	// Proxies decides whose X-Forwarded-* headers are trusted (TRUSTED_PROXIES).
	Proxies auth.Proxies
	// AllowedOrigins is the CSRF origin allow-list for cookie-authenticated requests (ALLOWED_ORIGINS).
	AllowedOrigins []string
	// Ready reports whether dependencies (the database) are reachable; backs /readyz.
	Ready func(ctx context.Context) error
	Log   *slog.Logger
}

// Aliases give the embedded handlers distinct field names.
type (
	notesHandler = notes.Handler
	authHandler  = auth.Handler
)

// api implements gen.StrictServerInterface: notes + auth operations plus healthz.
type api struct {
	*notesHandler
	*authHandler
}

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
	r.Use(d.Proxies.Middleware)
	r.Use(requestLogger(log))
	r.Use(recoverer(log))
	r.Use(middleware.Timeout(30 * time.Second))
	r.Use(secureHeaders)
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			req.Body = http.MaxBytesReader(w, req.Body, MaxBodyBytes)
			next.ServeHTTP(w, req)
		})
	})
	r.Use(d.Auth.Authenticator)
	r.Use(auth.CSRF(d.AllowedOrigins, d.Auth.CookieName(), log))

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

	strict := gen.NewStrictHandlerWithOptions(api{d.Notes, auth.NewHandler(d.Auth)},
		[]gen.StrictMiddlewareFunc{requireAuth, withRequest},
		gen.StrictHTTPServerOptions{
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

// requireAuth rejects non-public operations without an authenticated principal (401).
func requireAuth(f gen.StrictHandlerFunc, operationID string) gen.StrictHandlerFunc {
	if PublicOperations[operationID] {
		return f
	}
	return func(ctx context.Context, w http.ResponseWriter, r *http.Request, req any) (any, error) {
		if _, ok := auth.PrincipalFrom(ctx); !ok {
			w.Header().Set("WWW-Authenticate", `Bearer realm="api"`)
			return nil, problem.New(http.StatusUnauthorized, "authentication required")
		}
		return f(ctx, w, r, req)
	}
}

// withRequest gives strict handlers access to request cookies (auth.WithRequest).
func withRequest(f gen.StrictHandlerFunc, _ string) gen.StrictHandlerFunc {
	return func(ctx context.Context, w http.ResponseWriter, r *http.Request, req any) (any, error) {
		return f(auth.WithRequest(ctx, r), w, r, req)
	}
}

// secureHeaders: API responses are never cached, sniffed or framed, and never leak their URL as a
// Referer (OIDC callbacks carry code/state; redirects inherit this policy).
func secureHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Cache-Control", "no-store")
		h.Set("Referrer-Policy", "no-referrer")
		next.ServeHTTP(w, r)
	})
}

func requestLogger(log *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
			next.ServeHTTP(ww, r)
			// Path only: query strings can carry one-time codes, states and magic-link tokens.
			log.InfoContext(r.Context(), "request",
				"method", r.Method, "path", r.URL.Path, "status", ww.Status(), "ip", auth.Meta(r.Context()).IP,
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
