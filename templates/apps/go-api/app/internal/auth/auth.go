// Package auth is the JWT bearer middleware.
//
// When AUTH_JWKS_URL is set, every route except the public paths (/healthz, /readyz) requires a
// valid bearer token (signature via JWKS, expiry, optional issuer/audience) and the token's
// subject becomes the actor in audit logs.
//
// TODO(auth): when AUTH_JWKS_URL is empty the middleware lets everything through (local dev only).
// Before shipping, configure AUTH_JWKS_URL / AUTH_ISSUER / AUTH_AUDIENCE for your identity provider,
// and add ownership checks in the service layer (no IDOR). main refuses to start without
// AUTH_JWKS_URL when APP_ENV=production.
package auth

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"slices"
	"strings"

	"github.com/MicahParks/keyfunc/v3"
	"github.com/golang-jwt/jwt/v5"

	"__GO_MODULE__/internal/problem"
)

type ctxKey struct{}

// Anonymous is the actor reported when no token was validated (auth disabled).
const Anonymous = "anonymous"

// Subject returns the authenticated subject, or Anonymous.
func Subject(ctx context.Context) string {
	if s, ok := ctx.Value(ctxKey{}).(string); ok && s != "" {
		return s
	}
	return Anonymous
}

// Options configures the middleware.
type Options struct {
	JWKSURL  string   // empty disables validation (TODO above)
	Issuer   string   // optional
	Audience string   // optional
	Public   []string // exact paths that never require a token
}

// Middleware builds the chi/net-http middleware. ctx bounds the lifetime of JWKS refreshing.
func Middleware(ctx context.Context, opts Options, log *slog.Logger) (func(http.Handler) http.Handler, error) {
	if opts.JWKSURL == "" {
		log.Warn("AUTH_JWKS_URL is not set: JWT validation is DISABLED (local development only)")
		return func(next http.Handler) http.Handler { return next }, nil
	}

	jwks, err := keyfunc.NewDefaultCtx(ctx, []string{opts.JWKSURL})
	if err != nil {
		return nil, fmt.Errorf("load JWKS: %w", err)
	}
	parserOpts := []jwt.ParserOption{
		jwt.WithValidMethods([]string{"RS256", "RS384", "RS512", "ES256", "ES384", "ES512", "EdDSA"}),
		jwt.WithExpirationRequired(),
	}
	if opts.Issuer != "" {
		parserOpts = append(parserOpts, jwt.WithIssuer(opts.Issuer))
	}
	if opts.Audience != "" {
		parserOpts = append(parserOpts, jwt.WithAudience(opts.Audience))
	}
	parser := jwt.NewParser(parserOpts...)

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if slices.Contains(opts.Public, r.URL.Path) {
				next.ServeHTTP(w, r)
				return
			}
			raw, ok := bearer(r)
			if !ok {
				unauthorized(w, "missing bearer token")
				return
			}
			claims := jwt.RegisteredClaims{}
			if _, err := parser.ParseWithClaims(raw, &claims, jwks.Keyfunc); err != nil {
				unauthorized(w, "invalid or expired token")
				return
			}
			next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), ctxKey{}, claims.Subject)))
		})
	}, nil
}

func bearer(r *http.Request) (string, bool) {
	scheme, token, ok := strings.Cut(r.Header.Get("Authorization"), " ")
	if !ok || !strings.EqualFold(scheme, "Bearer") || strings.TrimSpace(token) == "" {
		return "", false
	}
	return strings.TrimSpace(token), true
}

func unauthorized(w http.ResponseWriter, detail string) {
	w.Header().Set("WWW-Authenticate", `Bearer realm="api"`)
	problem.Write(w, problem.New(http.StatusUnauthorized, detail))
}
