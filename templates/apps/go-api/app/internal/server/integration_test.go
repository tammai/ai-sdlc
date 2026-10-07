package server_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"

	"__GO_MODULE__/internal/auth"
	"__GO_MODULE__/internal/auth/authtest"
	"__GO_MODULE__/internal/db/dbtest"
	"__GO_MODULE__/internal/notes"
	"__GO_MODULE__/internal/server"
)

// pgEnv is the real stack (Postgres store + repo) behind the router. Skips without DATABASE_URL.
func pgEnv(t *testing.T, mutate func(*auth.Options)) (env, *auth.PGStore) {
	t.Helper()
	pool := dbtest.NewPool(t)
	st := auth.NewPGStore(pool)
	opts := authtest.Options()
	if mutate != nil {
		mutate(&opts)
	}
	svc, err := auth.NewService(st, opts, nil)
	if err != nil {
		t.Fatal(err)
	}
	h := server.NewRouter(server.Deps{
		Notes:          notes.NewHandler(notes.NewService(notes.NewPGRepo(pool), nil)),
		Auth:           svc,
		AllowedOrigins: []string{appOrigin},
		Ready:          pool.Ping,
	})
	return env{h: h, svc: svc}, st
}

func listCount(t *testing.T, e env, r req) int {
	t.Helper()
	r.method, r.path = "GET", "/v1/notes"
	rec := e.do(r)
	if rec.Code != 200 {
		t.Fatalf("list = %d %s", rec.Code, rec.Body)
	}
	var page struct {
		Items []struct{ Title string } `json:"items"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &page); err != nil {
		t.Fatal(err)
	}
	return len(page.Items)
}

// register -> cookie session -> notes scoped per user (B cannot see A's) -> logout revokes.
func TestIntegrationWebSessionsAndNoteOwnership(t *testing.T) {
	e, _ := pgEnv(t, nil)

	register := func(email string) *http.Cookie {
		rec := e.do(req{method: "POST", path: "/v1/auth/register", browser: true, body: `{"email":"` + email + `","password":"` + password + `"}`})
		if rec.Code != http.StatusCreated {
			t.Fatalf("register %s = %d %s", email, rec.Code, rec.Body)
		}
		return sessionCookie(t, rec)
	}
	a := register("a@example.com")
	b := register("b@example.com")
	if rec := e.do(req{method: "POST", path: "/v1/auth/register", browser: true, body: `{"email":"A@EXAMPLE.COM","password":"` + password + `"}`}); rec.Code != http.StatusConflict {
		t.Fatalf("duplicate email (case-insensitive) = %d", rec.Code)
	}

	if rec := e.do(req{method: "POST", path: "/v1/notes", cookies: []*http.Cookie{a}, body: `{"title":"a's note"}`}); rec.Code != http.StatusForbidden {
		t.Fatalf("cookie write without CSRF headers = %d", rec.Code)
	}
	for _, title := range []string{"a1", "a2"} {
		if rec := e.do(req{method: "POST", path: "/v1/notes", cookies: []*http.Cookie{a}, browser: true, body: `{"title":"` + title + `"}`}); rec.Code != http.StatusCreated {
			t.Fatalf("create = %d %s", rec.Code, rec.Body)
		}
	}
	if n := listCount(t, e, req{cookies: []*http.Cookie{a}}); n != 2 {
		t.Fatalf("A sees %d notes, want 2", n)
	}
	if n := listCount(t, e, req{cookies: []*http.Cookie{b}}); n != 0 {
		t.Fatalf("B sees %d notes, want 0 (IDOR)", n)
	}

	// Sign in with the password (new session), then sign out of the first one.
	rec := e.do(req{method: "POST", path: "/v1/auth/session", browser: true, body: `{"email":"a@example.com","password":"` + password + `"}`})
	if rec.Code != 200 {
		t.Fatalf("sign-in = %d %s", rec.Code, rec.Body)
	}
	a2 := sessionCookie(t, rec)
	if rec := e.do(req{method: "DELETE", path: "/v1/auth/session", cookies: []*http.Cookie{a}, browser: true}); rec.Code != http.StatusNoContent {
		t.Fatalf("logout = %d", rec.Code)
	}
	if rec := e.do(req{method: "GET", path: "/v1/notes", cookies: []*http.Cookie{a}}); rec.Code != http.StatusUnauthorized {
		t.Fatalf("revoked session = %d", rec.Code)
	}
	if n := listCount(t, e, req{cookies: []*http.Cookie{a2}}); n != 2 {
		t.Fatalf("other session of A sees %d notes", n)
	}
	if rec := e.do(req{method: "POST", path: "/v1/auth/session", browser: true, body: `{"email":"a@example.com","password":"wrong password!"}`}); rec.Code != 401 {
		t.Fatalf("bad password = %d", rec.Code)
	}
}

func TestIntegrationNativeRefreshRotation(t *testing.T) {
	e, _ := pgEnv(t, nil)
	if _, err := e.svc.Register(context.Background(), "n@example.com", password, ""); err != nil {
		t.Fatal(err)
	}
	type tokens struct{ AccessToken, RefreshToken string }
	grant := func(body string) (int, tokens) {
		rec := e.do(req{method: "POST", path: "/v1/auth/token", body: body})
		var tk tokens
		_ = json.Unmarshal(rec.Body.Bytes(), &tk)
		return rec.Code, tk
	}
	code, t1 := grant(`{"grantType":"password","email":"n@example.com","password":"` + password + `"}`)
	if code != 200 {
		t.Fatalf("password grant = %d", code)
	}
	if rec := e.do(req{method: "POST", path: "/v1/notes", bearer: t1.AccessToken, body: `{"title":"native"}`}); rec.Code != 201 {
		t.Fatalf("bearer write (no CSRF headers needed) = %d %s", rec.Code, rec.Body)
	}
	code, t2 := grant(`{"grantType":"refresh_token","refreshToken":"` + t1.RefreshToken + `"}`)
	if code != 200 || t2.RefreshToken == t1.RefreshToken {
		t.Fatalf("refresh = %d", code)
	}
	if n := listCount(t, e, req{bearer: t2.AccessToken}); n != 1 {
		t.Fatalf("notes = %d", n)
	}
	if code, _ := grant(`{"grantType":"refresh_token","refreshToken":"` + t1.RefreshToken + `"}`); code != 401 {
		t.Fatalf("reuse = %d", code)
	}
	if rec := e.do(req{method: "GET", path: "/v1/auth/me", bearer: t2.AccessToken}); rec.Code != 401 {
		t.Fatalf("session alive after reuse: %d", rec.Code)
	}
	if code, _ := grant(`{"grantType":"refresh_token","refreshToken":"` + t2.RefreshToken + `"}`); code != 401 {
		t.Fatalf("current refresh token alive after reuse: %d", code)
	}
}

func TestIntegrationMagicLinkAndOIDCNative(t *testing.T) {
	box := &authtest.Mailbox{}
	idp := newFakeIdP(t)
	e, st := pgEnv(t, func(o *auth.Options) {
		o.Mailer = box
		o.Providers = []auth.ProviderConfig{{ID: "fake", Name: "Fake", Issuer: idp.srv.URL, ClientID: clientID, ClientSecret: "s3cret"}}
	})

	// Magic link (native): link -> token grant; single use.
	if rec := e.do(req{method: "POST", path: "/v1/auth/magic-link", body: `{"email":"m@example.com","client":"native"}`}); rec.Code != 202 {
		t.Fatalf("magic link = %d %s", rec.Code, rec.Body)
	}
	msgs := box.Messages()
	if len(msgs) != 1 {
		t.Fatalf("messages = %d", len(msgs))
	}
	link := msgs[0].Text[strings.Index(msgs[0].Text, "com.example.app:"):strings.Index(msgs[0].Text, "\r\n\r\nIt expires")]
	u, _ := url.Parse(link)
	body := `{"grantType":"magic_link","token":"` + u.Query().Get("token") + `"}`
	if rec := e.do(req{method: "POST", path: "/v1/auth/token", body: body}); rec.Code != 200 {
		t.Fatalf("magic link grant = %d %s", rec.Code, rec.Body)
	}
	if rec := e.do(req{method: "POST", path: "/v1/auth/token", body: body}); rec.Code != 401 {
		t.Fatalf("magic link reused = %d", rec.Code)
	}
	m, err := st.UserByEmail(context.Background(), "M@example.com")
	if err != nil || !m.EmailVerified {
		t.Fatalf("magic-link account = %+v, %v", m, err)
	}

	// OIDC native: links to the magic-link account by verified email; code is single use.
	authURL, binding := start(t, e, nativeStart)
	cb := idp.authorize(authURL, map[string]any{"sub": "sub-m", "email": "m@example.com", "email_verified": true})
	rec := e.do(req{method: "GET", path: callbackPath(t, cb), cookies: []*http.Cookie{binding}})
	loc, _ := url.Parse(rec.Header().Get("Location"))
	if rec.Code != 302 || loc.Query().Get("code") == "" {
		t.Fatalf("callback = %d %q", rec.Code, rec.Header().Get("Location"))
	}
	if rec := e.do(req{method: "GET", path: callbackPath(t, cb), cookies: []*http.Cookie{binding}}); rec.Code != 302 ||
		rec.Header().Get("Location") != "http://app.test/login?error=invalid_state" {
		t.Fatalf("replayed state = %d %q", rec.Code, rec.Header().Get("Location"))
	}
	exchange := req{method: "POST", path: "/v1/auth/token", body: `{"grantType":"authorization_code","code":"` + loc.Query().Get("code") + `","codeVerifier":"` + testVerifier + `"}`}
	rec = e.do(exchange)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), m.ID.String()) {
		t.Fatalf("code exchange = %d %s", rec.Code, rec.Body)
	}
	if rec := e.do(exchange); rec.Code != 401 {
		t.Fatalf("code reused = %d", rec.Code)
	}
	if uid, err := st.IdentityUserID(context.Background(), "fake", "sub-m"); err != nil || uid != m.ID {
		t.Fatalf("identity = %v, %v", uid, err)
	}
	if n, err := st.DeleteExpired(context.Background(), time.Now().Add(48*time.Hour)); err != nil || n == 0 {
		t.Fatalf("janitor purge = %d, %v", n, err)
	}
}
