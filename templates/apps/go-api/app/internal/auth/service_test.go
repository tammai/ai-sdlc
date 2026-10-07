package auth_test

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"regexp"
	"strings"
	"testing"
	"time"

	"__GO_MODULE__/internal/auth"
	"__GO_MODULE__/internal/auth/authtest"
)

const pw = "correct horse battery staple"

type clock struct{ t time.Time }

func (c *clock) now() time.Time          { return c.t }
func (c *clock) advance(d time.Duration) { c.t = c.t.Add(d) }

func newService(t *testing.T, mutate func(*auth.Options)) (*auth.Service, *authtest.MemStore, *clock, *bytes.Buffer) {
	t.Helper()
	st := authtest.NewMemStore()
	clk := &clock{t: time.Now().UTC()}
	opts := authtest.Options()
	opts.Now = clk.now
	if mutate != nil {
		mutate(&opts)
	}
	var logs bytes.Buffer
	svc, err := auth.NewService(st, opts, slog.New(slog.NewJSONHandler(&logs, nil)))
	if err != nil {
		t.Fatal(err)
	}
	return svc, st, clk, &logs
}

func ctxIP(ip string) context.Context {
	return auth.WithMeta(context.Background(), auth.ClientMeta{IP: ip, UserAgent: "test"})
}

func TestRegisterAndPasswordSignIn(t *testing.T) {
	svc, st, _, logs := newService(t, nil)
	ctx := ctxIP("192.0.2.1")

	u, err := svc.Register(ctx, "  Alice@Example.COM ", pw, "Alice")
	if err != nil {
		t.Fatal(err)
	}
	if u.Email != "alice@example.com" || u.EmailVerified || u.PasswordHash == nil {
		t.Fatalf("unexpected user %+v", u)
	}
	if _, err := svc.Register(ctx, "ALICE@example.com", pw, ""); !errors.Is(err, auth.ErrEmailTaken) {
		t.Fatalf("duplicate (case-insensitive) email: %v", err)
	}
	var ve *auth.ValidationError
	if _, err := svc.Register(ctx, "bob@example.com", "short", ""); !errors.As(err, &ve) {
		t.Fatalf("short password: %v", err)
	}
	if _, err := svc.Register(ctx, "not an email", pw, ""); !errors.As(err, &ve) {
		t.Fatalf("bad email: %v", err)
	}

	got, err := svc.PasswordSignIn(ctx, "alice@EXAMPLE.com", pw)
	if err != nil || got.ID != u.ID {
		t.Fatalf("sign in: %v", err)
	}
	// Every failure is the same error: no account enumeration.
	for _, c := range []struct{ email, pass string }{
		{"alice@example.com", "wrong password!!"},
		{"nobody@example.com", pw},
		{"garbage", pw},
	} {
		if _, err := svc.PasswordSignIn(ctx, c.email, c.pass); !errors.Is(err, auth.ErrInvalidCredentials) {
			t.Fatalf("sign in %q: %v, want ErrInvalidCredentials", c.email, err)
		}
	}
	if strings.Contains(logs.String(), pw) || strings.Contains(logs.String(), "alice@example.com") || strings.Contains(logs.String(), "nobody@example.com") {
		t.Fatalf("audit log leaks a password or a full email:\n%s", logs.String())
	}
	if !strings.Contains(logs.String(), `"action":"auth.signin"`) || !strings.Contains(logs.String(), `"outcome":"failure"`) {
		t.Fatalf("missing sign-in audit lines:\n%s", logs.String())
	}
	_ = st
}

func TestRehashOnLogin(t *testing.T) {
	weak := auth.NewPasswordHasher(auth.Argon2Params{Memory: 8 * 1024, Iterations: 1, Parallelism: 1, SaltLen: 16, KeyLen: 32}, 2)
	svc, st, _, _ := newService(t, func(o *auth.Options) { o.Hasher = weak })
	u, err := svc.Register(ctxIP("192.0.2.1"), "a@example.com", pw, "")
	if err != nil {
		t.Fatal(err)
	}
	old := *u.PasswordHash

	strongerOpts := authtest.Options()
	strongerOpts.Hasher = auth.NewPasswordHasher(auth.Argon2Params{Memory: 8 * 1024, Iterations: 2, Parallelism: 1, SaltLen: 16, KeyLen: 32}, 2)
	svc2, err := auth.NewService(st, strongerOpts, nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc2.PasswordSignIn(ctxIP("192.0.2.1"), "a@example.com", pw); err != nil {
		t.Fatal(err)
	}
	after, _ := st.UserByID(context.Background(), u.ID)
	if *after.PasswordHash == old || !strings.Contains(*after.PasswordHash, "t=2") {
		t.Fatalf("hash not upgraded: %s", *after.PasswordHash)
	}
}

func TestRegistrationAndPasswordSwitches(t *testing.T) {
	closed, _, _, _ := newService(t, func(o *auth.Options) { o.RegistrationOpen = false })
	if _, err := closed.Register(ctxIP("192.0.2.1"), "a@example.com", pw, ""); !errors.Is(err, auth.ErrRegistrationClosed) {
		t.Fatalf("closed registration: %v", err)
	}
	off, _, _, _ := newService(t, func(o *auth.Options) { o.PasswordEnabled = false })
	if _, err := off.Register(ctxIP("192.0.2.1"), "a@example.com", pw, ""); !errors.Is(err, auth.ErrDisabled) {
		t.Fatalf("password disabled register: %v", err)
	}
	if _, err := off.PasswordSignIn(ctxIP("192.0.2.1"), "a@example.com", pw); !errors.Is(err, auth.ErrDisabled) {
		t.Fatalf("password disabled sign-in: %v", err)
	}
}

func TestSignInRateLimitedPerEmailAndIP(t *testing.T) {
	svc, _, _, _ := newService(t, func(o *auth.Options) {
		o.IPLimiter = auth.NewRateLimiter(5, time.Hour)
		o.EmailLimiter = auth.NewRateLimiter(3, time.Hour)
	})
	for i := range 3 {
		if _, err := svc.PasswordSignIn(ctxIP("192.0.2.1"), "victim@example.com", "nope nope nope"); !errors.Is(err, auth.ErrInvalidCredentials) {
			t.Fatalf("attempt %d: %v", i+1, err)
		}
	}
	// Same email from another IP: the per-email bucket is empty.
	if _, err := svc.PasswordSignIn(ctxIP("192.0.2.2"), "victim@example.com", "nope nope nope"); !errors.Is(err, auth.ErrRateLimited) {
		t.Fatalf("per-email limit: %v", err)
	}
	// Same IP, other emails: the per-IP bucket (5) runs out.
	_, _ = svc.PasswordSignIn(ctxIP("192.0.2.1"), "x@example.com", "nope nope nope")
	_, _ = svc.PasswordSignIn(ctxIP("192.0.2.1"), "y@example.com", "nope nope nope")
	if _, err := svc.PasswordSignIn(ctxIP("192.0.2.1"), "z@example.com", "nope nope nope"); !errors.Is(err, auth.ErrRateLimited) {
		t.Fatalf("per-IP limit: %v", err)
	}
}

func TestRefreshRotationAndReuseDetection(t *testing.T) {
	svc, st, clk, logs := newService(t, nil)
	ctx := ctxIP("192.0.2.1")
	u, _ := svc.Register(ctx, "a@example.com", pw, "")

	first, err := svc.IssueNativeTokens(ctx, u)
	if err != nil {
		t.Fatal(err)
	}
	if first.ExpiresIn != 900 {
		t.Fatalf("expiresIn = %d, want 900", first.ExpiresIn)
	}
	p, _, err := svc.Authenticate(ctx, first.AccessToken, auth.ClientNative)
	if err != nil || p.UserID != u.ID {
		t.Fatalf("access token rejected: %v", err)
	}
	if _, _, err := svc.Authenticate(ctx, first.AccessToken, auth.ClientWeb); !errors.Is(err, auth.ErrUnauthenticated) {
		t.Fatal("an access token must not work as a web session cookie")
	}

	second, err := svc.Refresh(ctx, first.RefreshToken)
	if err != nil {
		t.Fatal(err)
	}
	if second.RefreshToken == first.RefreshToken || second.AccessToken == first.AccessToken {
		t.Fatal("refresh must rotate both tokens")
	}
	if _, _, err := svc.Authenticate(ctx, first.AccessToken, auth.ClientNative); err == nil {
		t.Fatal("old access token still valid after rotation")
	}
	third, err := svc.Refresh(ctx, second.RefreshToken)
	if err != nil {
		t.Fatal(err)
	}

	// Reusing an already rotated refresh token revokes the whole session.
	if _, err := svc.Refresh(ctx, first.RefreshToken); !errors.Is(err, auth.ErrInvalidGrant) {
		t.Fatalf("reuse: %v", err)
	}
	sess, _ := st.Session(p.SessionID)
	if sess.RevokedAt == nil {
		t.Fatal("session not revoked after refresh-token reuse")
	}
	if _, err := svc.Refresh(ctx, third.RefreshToken); !errors.Is(err, auth.ErrInvalidGrant) {
		t.Fatal("current refresh token must die with the revoked session")
	}
	if _, _, err := svc.Authenticate(ctx, third.AccessToken, auth.ClientNative); err == nil {
		t.Fatal("access token of a revoked session still valid")
	}
	if !strings.Contains(logs.String(), `"action":"auth.refresh_reuse"`) {
		t.Fatalf("missing reuse audit line:\n%s", logs.String())
	}
	if strings.Contains(logs.String(), first.RefreshToken) || strings.Contains(logs.String(), third.AccessToken) {
		t.Fatal("tokens leaked into logs")
	}

	// Expiry and garbage.
	fresh, _ := svc.IssueNativeTokens(ctx, u)
	clk.advance(16 * time.Minute)
	if _, _, err := svc.Authenticate(ctx, fresh.AccessToken, auth.ClientNative); err == nil {
		t.Fatal("expired access token accepted")
	}
	clk.advance(31 * 24 * time.Hour)
	if _, err := svc.Refresh(ctx, fresh.RefreshToken); !errors.Is(err, auth.ErrInvalidGrant) {
		t.Fatal("expired refresh token accepted")
	}
	for _, bad := range []string{"", "garbage", "00000000-0000-0000-0000-000000000000." + auth.NewToken()} {
		if _, err := svc.Refresh(ctx, bad); !errors.Is(err, auth.ErrInvalidGrant) {
			t.Fatalf("refresh(%q): %v", bad, err)
		}
	}
}

func TestRevokeRefreshToken(t *testing.T) {
	svc, st, _, _ := newService(t, nil)
	ctx := ctxIP("192.0.2.1")
	u, _ := svc.Register(ctx, "a@example.com", pw, "")
	tok, _ := svc.IssueNativeTokens(ctx, u)
	p, _, _ := svc.Authenticate(ctx, tok.AccessToken, auth.ClientNative)
	if err := svc.RevokeRefreshToken(ctx, tok.RefreshToken); err != nil {
		t.Fatal(err)
	}
	if err := svc.RevokeRefreshToken(ctx, tok.RefreshToken); err != nil {
		t.Fatal("revoke must be idempotent")
	}
	if err := svc.RevokeRefreshToken(ctx, "garbage"); err != nil {
		t.Fatal("revoke of garbage must be a no-op")
	}
	if s, _ := st.Session(p.SessionID); s.RevokedAt == nil {
		t.Fatal("not revoked")
	}
}

func TestWebSessionSlidingExpiry(t *testing.T) {
	svc, _, clk, _ := newService(t, func(o *auth.Options) {
		o.SessionTTL = time.Hour
		o.SessionAbsoluteTTL = 3 * time.Hour
	})
	ctx := ctxIP("192.0.2.1")
	u, _ := svc.Register(ctx, "a@example.com", pw, "")
	t0 := clk.now()
	tok, exp, err := svc.StartWebSession(ctx, u.ID)
	if err != nil || !exp.Equal(t0.Add(time.Hour)) {
		t.Fatalf("exp = %v (%v)", exp, err)
	}
	// Used every 50 minutes: the idle expiry slides by SESSION_TTL, capped at created + SESSION_ABSOLUTE_TTL.
	for _, want := range []time.Duration{110 * time.Minute, 160 * time.Minute, 180 * time.Minute} {
		clk.advance(50 * time.Minute)
		_, renewed, err := svc.Authenticate(ctx, tok, auth.ClientWeb)
		if err != nil {
			t.Fatalf("session died early at +%v: %v", clk.now().Sub(t0), err)
		}
		if !renewed.Equal(t0.Add(want)) {
			t.Fatalf("renewed = +%v, want +%v", renewed.Sub(t0), want)
		}
	}
	clk.advance(50 * time.Minute) // +200m > absolute cap (+180m)
	if _, _, err := svc.Authenticate(ctx, tok, auth.ClientWeb); !errors.Is(err, auth.ErrUnauthenticated) {
		t.Fatal("session outlived its absolute lifetime")
	}

	// Idle longer than SESSION_TTL: expired.
	tok2, _, _ := svc.StartWebSession(ctx, u.ID)
	clk.advance(61 * time.Minute)
	if _, _, err := svc.Authenticate(ctx, tok2, auth.ClientWeb); !errors.Is(err, auth.ErrUnauthenticated) {
		t.Fatal("idle session not expired")
	}
}

func TestMagicLinkWithLogMailer(t *testing.T) {
	var mailLog bytes.Buffer
	mailer := auth.LogMailer{Log: slog.New(slog.NewTextHandler(&mailLog, nil))}
	svc, st, clk, _ := newService(t, func(o *auth.Options) { o.Mailer = mailer })
	ctx := ctxIP("192.0.2.1")

	if err := svc.RequestMagicLink(ctx, "New@Example.com", auth.ClientWeb); err != nil {
		t.Fatal(err)
	}
	link := regexp.MustCompile(`http://app\.test/auth/magic\?token=[A-Za-z0-9_-]+`).FindString(mailLog.String())
	if link == "" {
		t.Fatalf("log mailer did not print a web link:\n%s", mailLog.String())
	}
	u, _ := url.Parse(link)
	token := u.Query().Get("token")

	if _, err := svc.ConsumeMagicLink(ctx, token, auth.ClientNative); !errors.Is(err, auth.ErrInvalidGrant) {
		t.Fatal("a web link must not be usable by a native client")
	}
	// The failed attempt consumed it: single use, even on client mismatch.
	if _, err := svc.ConsumeMagicLink(ctx, token, auth.ClientWeb); !errors.Is(err, auth.ErrInvalidGrant) {
		t.Fatal("link usable twice")
	}

	mailLog.Reset()
	_ = svc.RequestMagicLink(ctx, "new@example.com", auth.ClientWeb)
	token = regexp.MustCompile(`token=([A-Za-z0-9_-]+)`).FindStringSubmatch(mailLog.String())[1]
	user, err := svc.ConsumeMagicLink(ctx, token, auth.ClientWeb)
	if err != nil {
		t.Fatal(err)
	}
	if user.Email != "new@example.com" || !user.EmailVerified || user.PasswordHash != nil {
		t.Fatalf("account not created as verified: %+v", user)
	}
	if _, err := svc.ConsumeMagicLink(ctx, token, auth.ClientWeb); !errors.Is(err, auth.ErrInvalidGrant) {
		t.Fatal("link usable twice")
	}

	// Expiry.
	mailLog.Reset()
	_ = svc.RequestMagicLink(ctx, "new@example.com", auth.ClientWeb)
	token = regexp.MustCompile(`token=([A-Za-z0-9_-]+)`).FindStringSubmatch(mailLog.String())[1]
	clk.advance(auth.MagicLinkTTL + time.Second)
	if _, err := svc.ConsumeMagicLink(ctx, token, auth.ClientWeb); !errors.Is(err, auth.ErrInvalidGrant) {
		t.Fatal("expired link accepted")
	}
	_ = st
}

func TestMagicLinkNativeAndNoEnumeration(t *testing.T) {
	box := &authtest.Mailbox{}
	svc, _, _, _ := newService(t, func(o *auth.Options) { o.Mailer = box; o.RegistrationOpen = false })
	ctx := ctxIP("192.0.2.1")

	// Registration closed + unknown email: still success, nothing sent.
	if err := svc.RequestMagicLink(ctx, "ghost@example.com", auth.ClientWeb); err != nil {
		t.Fatal(err)
	}
	if n := len(box.Messages()); n != 0 {
		t.Fatalf("sent %d emails to an unknown address with registration closed", n)
	}

	svc2, st2, _, _ := newService(t, func(o *auth.Options) { o.Mailer = box })
	if _, err := svc2.Register(ctx, "a@example.com", pw, ""); err != nil {
		t.Fatal(err)
	}
	if err := svc2.RequestMagicLink(ctx, "a@example.com", auth.ClientNative); err != nil {
		t.Fatal(err)
	}
	msgs := box.Messages()
	if len(msgs) != 1 || !strings.Contains(msgs[0].Text, "com.example.app:/oauth/magic?token=") {
		t.Fatalf("native link missing: %+v", msgs)
	}
	token := regexp.MustCompile(`token=([A-Za-z0-9_-]+)`).FindStringSubmatch(msgs[0].Text)[1]
	u, err := svc2.ConsumeMagicLink(ctx, token, auth.ClientNative)
	if err != nil {
		t.Fatal(err)
	}
	// Proving the email of a password account whose email was never verified clears the password
	// (pre-account-takeover defense).
	if !u.EmailVerified || u.PasswordHash != nil {
		t.Fatalf("unverified account not reset on first email proof: %+v", u)
	}
	stored, _ := st2.UserByEmail(context.Background(), "a@example.com")
	if stored.PasswordHash != nil {
		t.Fatal("password still set")
	}

	off, _, _, _ := newService(t, nil)
	if err := off.RequestMagicLink(ctx, "a@example.com", auth.ClientWeb); !errors.Is(err, auth.ErrDisabled) {
		t.Fatalf("magic link without mailer: %v", err)
	}
}

func TestCSRF(t *testing.T) {
	mw := auth.CSRF([]string{"https://app.example.com"}, "session", nil)
	ok := mw(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) }))
	type hdr map[string]string
	tests := []struct {
		name   string
		method string
		cookie bool
		h      hdr
		want   int
	}{
		{"safe method passes", "GET", true, hdr{}, 204},
		{"cookie POST without header", "POST", true, hdr{"Origin": "https://app.example.com"}, 403},
		{"cookie POST with header and origin", "POST", true, hdr{"X-Requested-With": "fetch", "Origin": "https://app.example.com"}, 204},
		{"origin with default port", "POST", true, hdr{"X-Requested-With": "fetch", "Origin": "https://APP.example.com:443"}, 204},
		{"cookie POST from other origin", "POST", true, hdr{"X-Requested-With": "fetch", "Origin": "https://evil.example"}, 403},
		{"cookie POST without origin, good referer", "DELETE", true, hdr{"X-Requested-With": "fetch", "Referer": "https://app.example.com/notes"}, 204},
		{"cookie POST without origin or referer", "POST", true, hdr{"X-Requested-With": "fetch"}, 403},
		{"null origin falls back to referer", "POST", true, hdr{"X-Requested-With": "fetch", "Origin": "null"}, 403},
		{"cross-site fetch metadata", "POST", true, hdr{"X-Requested-With": "fetch", "Origin": "https://app.example.com", "Sec-Fetch-Site": "cross-site"}, 403},
		{"wrong header value", "POST", true, hdr{"X-Requested-With": "XMLHttpRequest", "Origin": "https://app.example.com"}, 403},
		{"browser login form post (no cookie) is checked", "POST", false, hdr{"Origin": "https://evil.example"}, 403},
		{"bearer request exempt", "POST", true, hdr{"Authorization": "Bearer abc"}, 204},
		{"native client without cookie or origin", "POST", false, hdr{}, 204},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := httptest.NewRequest(tt.method, "/v1/notes", nil)
			if tt.cookie {
				r.AddCookie(&http.Cookie{Name: "session", Value: "x"})
			}
			for k, v := range tt.h {
				r.Header.Set(k, v)
			}
			rec := httptest.NewRecorder()
			ok.ServeHTTP(rec, r)
			if rec.Code != tt.want {
				t.Fatalf("status = %d, want %d (%s)", rec.Code, tt.want, rec.Body)
			}
			if tt.want == 403 && rec.Header().Get("Content-Type") != "application/problem+json" {
				t.Fatal("CSRF rejection must be problem+json")
			}
		})
	}
}

func TestSessionCookieAttributes(t *testing.T) {
	for _, secure := range []bool{true, false} {
		svc, _, clk, _ := newService(t, func(o *auth.Options) { o.CookieSecure = secure; o.CookieName = "sid" })
		c := svc.SessionCookie("tok", clk.now().Add(time.Hour))
		raw := c.String()
		for _, want := range []string{"sid=tok", "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=3600"} {
			if !strings.Contains(raw, want) {
				t.Fatalf("cookie %q lacks %q", raw, want)
			}
		}
		if strings.Contains(raw, "Domain=") {
			t.Fatalf("cookie must be host-only: %q", raw)
		}
		if strings.Contains(raw, "Secure") != secure {
			t.Fatalf("Secure flag = %v in %q", !secure, raw)
		}
		clear := svc.ClearSessionCookie().String()
		if !strings.Contains(clear, "Max-Age=0") || !strings.Contains(clear, "sid=") {
			t.Fatalf("clear cookie = %q", clear)
		}
	}
}

func TestAuthenticatorMiddleware(t *testing.T) {
	svc, _, clk, _ := newService(t, func(o *auth.Options) { o.SessionTTL = time.Hour })
	ctx := ctxIP("192.0.2.1")
	u, _ := svc.Register(ctx, "a@example.com", pw, "")
	cookie, _, _ := svc.StartWebSession(ctx, u.ID)
	native, _ := svc.IssueNativeTokens(ctx, u)

	var got *auth.Principal
	h := svc.Authenticator(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		if p, ok := auth.PrincipalFrom(r.Context()); ok {
			got = &p
		}
	}))
	run := func(setup func(*http.Request)) *httptest.ResponseRecorder {
		got = nil
		r := httptest.NewRequest("GET", "/v1/notes", nil)
		setup(r)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, r)
		return rec
	}

	run(func(r *http.Request) { r.AddCookie(&http.Cookie{Name: "session", Value: cookie}) })
	if got == nil || got.Kind != auth.ClientWeb || got.UserID != u.ID {
		t.Fatalf("cookie principal = %+v", got)
	}
	run(func(r *http.Request) { r.Header.Set("Authorization", "Bearer "+native.AccessToken) })
	if got == nil || got.Kind != auth.ClientNative {
		t.Fatalf("bearer principal = %+v", got)
	}
	run(func(r *http.Request) {
		r.Header.Set("Authorization", "Bearer bogus")
		r.AddCookie(&http.Cookie{Name: "session", Value: cookie})
	})
	if got != nil {
		t.Fatal("an invalid bearer token must not fall back to the cookie")
	}
	run(func(r *http.Request) { r.Header.Set("Authorization", "Bearer "+cookie) })
	if got != nil {
		t.Fatal("a web session token must not work as a bearer token")
	}

	clk.advance(30 * time.Minute)
	rec := run(func(r *http.Request) { r.AddCookie(&http.Cookie{Name: "session", Value: cookie}) })
	if sc := rec.Header().Get("Set-Cookie"); !strings.Contains(sc, "session="+cookie) || !strings.Contains(sc, "Max-Age=3600") {
		t.Fatalf("sliding renewal cookie = %q", sc)
	}
}

func TestNativeRefreshAbsoluteCap(t *testing.T) {
	svc, _, clk, _ := newService(t, func(o *auth.Options) {
		o.RefreshTTL = 30 * 24 * time.Hour
		o.RefreshAbsoluteTTL = 45 * 24 * time.Hour
	})
	ctx := ctxIP("192.0.2.1")
	u, _ := svc.Register(ctx, "a@example.com", pw, "")
	tok, err := svc.IssueNativeTokens(ctx, u)
	if err != nil {
		t.Fatal(err)
	}
	// Refreshing regularly keeps the session alive (sliding)...
	for range 2 {
		clk.advance(20 * 24 * time.Hour)
		if tok, err = svc.Refresh(ctx, tok.RefreshToken); err != nil {
			t.Fatalf("refresh at +%v: %v", 20*24*time.Hour, err)
		}
	}
	// ...but never past created + REFRESH_ABSOLUTE_TTL: near the cap the access token is shortened.
	clk.advance(5*24*time.Hour - 5*time.Minute) // +45d-5m
	if tok, err = svc.Refresh(ctx, tok.RefreshToken); err != nil {
		t.Fatal(err)
	}
	if tok.ExpiresIn != 300 {
		t.Fatalf("expiresIn near the cap = %d, want 300", tok.ExpiresIn)
	}
	clk.advance(5 * time.Minute) // +45d
	if _, err := svc.Refresh(ctx, tok.RefreshToken); !errors.Is(err, auth.ErrInvalidGrant) {
		t.Fatalf("refresh past the absolute cap: %v, want ErrInvalidGrant (sign in again)", err)
	}
	if _, _, err := svc.Authenticate(ctx, tok.AccessToken, auth.ClientNative); err == nil {
		t.Fatal("access token outlived the absolute cap")
	}
}

func TestRateLimitRetryAfter(t *testing.T) {
	svc, _, _, _ := newService(t, func(o *auth.Options) { o.IPLimiter = auth.NewRateLimiter(1, 30*time.Second) })
	_, _ = svc.PasswordSignIn(ctxIP("192.0.2.9"), "a@example.com", "nope nope nope")
	_, err := svc.PasswordSignIn(ctxIP("192.0.2.9"), "a@example.com", "nope nope nope")
	var rl *auth.RateLimitError
	if !errors.As(err, &rl) || !errors.Is(err, auth.ErrRateLimited) {
		t.Fatalf("err = %v, want *RateLimitError", err)
	}
	if rl.RetryAfter <= 29*time.Second || rl.RetryAfter > 30*time.Second {
		t.Fatalf("RetryAfter = %v, want ~30s", rl.RetryAfter)
	}
}
