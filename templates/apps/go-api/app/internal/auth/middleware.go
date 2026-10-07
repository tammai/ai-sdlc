package auth

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"time"

	"github.com/google/uuid"

	"__GO_MODULE__/internal/problem"
)

// Principal is the authenticated caller.
type Principal struct {
	UserID    uuid.UUID
	SessionID uuid.UUID
	Kind      Client // web = session cookie, native = bearer access token
}

type principalKey struct{}

// WithPrincipal stores p in ctx (used by the middleware and tests).
func WithPrincipal(ctx context.Context, p Principal) context.Context {
	return context.WithValue(ctx, principalKey{}, p)
}

// PrincipalFrom returns the authenticated caller, if any.
func PrincipalFrom(ctx context.Context) (Principal, bool) {
	p, ok := ctx.Value(principalKey{}).(Principal)
	return p, ok
}

// Actor is the audit-log actor: the user id, or "anonymous".
func Actor(ctx context.Context) string {
	if p, ok := PrincipalFrom(ctx); ok {
		return p.UserID.String()
	}
	return "anonymous"
}

type requestKey struct{}

// WithRequest makes the *http.Request available to strict handlers (cookies); see server.
func WithRequest(ctx context.Context, r *http.Request) context.Context {
	return context.WithValue(ctx, requestKey{}, r)
}

func requestFrom(ctx context.Context) *http.Request {
	r, _ := ctx.Value(requestKey{}).(*http.Request)
	return r
}

func cookieValue(ctx context.Context, name string) string {
	if r := requestFrom(ctx); r != nil {
		if c, err := r.Cookie(name); err == nil {
			return c.Value
		}
	}
	return ""
}

// bearerToken returns the token of an "Authorization: Bearer <token>" header.
func bearerToken(r *http.Request) (string, bool) {
	scheme, token, ok := strings.Cut(r.Header.Get("Authorization"), " ")
	if !ok || !strings.EqualFold(scheme, "Bearer") {
		return "", false
	}
	token = strings.TrimSpace(token)
	return token, token != ""
}

// Authenticator attaches a Principal from a bearer access token (native) or the session cookie
// (web). A bearer header takes precedence and is never combined with the cookie. It never rejects:
// enforcement happens per operation (server.requireAuth), so public endpoints keep working. A web
// session close to expiry gets its cookie re-sent with the slid expiry.
func (s *Service) Authenticator(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		var (
			p       Principal
			renewed time.Time
			err     error
			token   string
		)
		if bt, ok := bearerToken(r); ok {
			p, _, err = s.Authenticate(ctx, bt, ClientNative)
		} else if c, cerr := r.Cookie(s.opts.CookieName); cerr == nil && c.Value != "" {
			token = c.Value
			p, renewed, err = s.Authenticate(ctx, token, ClientWeb)
		} else {
			next.ServeHTTP(w, r)
			return
		}
		switch {
		case errors.Is(err, ErrUnauthenticated):
			next.ServeHTTP(w, r)
			return
		case err != nil:
			s.log.ErrorContext(ctx, "authenticate failed", "error", err)
			problem.Write(w, problem.New(http.StatusServiceUnavailable, "authentication is temporarily unavailable"))
			return
		}
		if !renewed.IsZero() {
			http.SetCookie(w, s.SessionCookie(token, renewed))
		}
		next.ServeHTTP(w, r.WithContext(WithPrincipal(ctx, p)))
	})
}

// SessionCookie is the web session cookie: HttpOnly, Secure (COOKIE_SECURE), SameSite=Lax, Path=/,
// host-only (no Domain), persistent until the session's (sliding) expiry.
func (s *Service) SessionCookie(token string, expires time.Time) *http.Cookie {
	return &http.Cookie{ //nolint:gosec // Secure follows COOKIE_SECURE, which config forces on when APP_ENV=production
		Name: s.opts.CookieName, Value: token, Path: "/", HttpOnly: true, Secure: s.opts.CookieSecure,
		SameSite: http.SameSiteLaxMode, Expires: expires.UTC(), MaxAge: max(1, int(expires.Sub(s.now()).Seconds())),
	}
}

// ClearSessionCookie deletes the session cookie in the browser.
func (s *Service) ClearSessionCookie() *http.Cookie {
	return &http.Cookie{ //nolint:gosec // Secure follows COOKIE_SECURE, which config forces on when APP_ENV=production
		Name: s.opts.CookieName, Value: "", Path: "/", HttpOnly: true, Secure: s.opts.CookieSecure,
		SameSite: http.SameSiteLaxMode, MaxAge: -1, Expires: time.Unix(0, 0).UTC(),
	}
}

// CSRF protects cookie-authenticated, state-changing requests. For unsafe methods it requires
// `X-Requested-With: fetch` and an Origin (or Referer) in allowedOrigins, and rejects
// `Sec-Fetch-Site: cross-site`. The custom header forces a CORS preflight that this API never
// grants, so a cross-site page cannot send it.
//
// Exempt: requests carrying a bearer token (no ambient credentials), and non-browser requests with
// no session cookie and no Origin/Referer/Sec-Fetch-Site (native apps, curl). Browsers always send
// Origin on cross-site POSTs, so the public sign-in endpoints are covered too (login CSRF).
func CSRF(allowedOrigins []string, cookieName string, log *slog.Logger) func(http.Handler) http.Handler {
	allowed := make([]string, 0, len(allowedOrigins))
	for _, o := range allowedOrigins {
		if n := normalizeOrigin(o); n != "" {
			allowed = append(allowed, n)
		}
	}
	if log == nil {
		log = slog.New(slog.DiscardHandler)
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			switch r.Method {
			case http.MethodGet, http.MethodHead, http.MethodOptions, http.MethodTrace:
				next.ServeHTTP(w, r)
				return
			}
			if _, ok := bearerToken(r); ok {
				next.ServeHTTP(w, r)
				return
			}
			_, cookieErr := r.Cookie(cookieName)
			origin := r.Header.Get("Origin")
			referer := r.Header.Get("Referer")
			fetchSite := r.Header.Get("Sec-Fetch-Site")
			if cookieErr != nil && origin == "" && referer == "" && fetchSite == "" {
				next.ServeHTTP(w, r) // not a browser, no ambient credentials
				return
			}
			reason := ""
			switch {
			case !strings.EqualFold(r.Header.Get("X-Requested-With"), "fetch"):
				reason = "missing X-Requested-With: fetch"
			case strings.EqualFold(fetchSite, "cross-site"):
				reason = "cross-site request"
			default:
				src := origin
				if src == "" || src == "null" {
					src = referer
				}
				if n := normalizeOrigin(src); n == "" || !slices.Contains(allowed, n) {
					reason = "origin not allowed"
				}
			}
			if reason != "" {
				log.WarnContext(r.Context(), "csrf rejected", "reason", reason, "path", r.URL.Path, "ip", Meta(r.Context()).IP)
				problem.Write(w, problem.New(http.StatusForbidden, "cross-site request rejected: "+reason))
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// normalizeOrigin returns "scheme://host[:port]" in lower case, or "" when s is not an http(s) URL.
func normalizeOrigin(s string) string {
	u, err := url.Parse(strings.TrimSpace(s))
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return ""
	}
	host := strings.ToLower(u.Host)
	if (u.Scheme == "https" && strings.HasSuffix(host, ":443")) || (u.Scheme == "http" && strings.HasSuffix(host, ":80")) {
		host = host[:strings.LastIndex(host, ":")]
	}
	return u.Scheme + "://" + host
}
