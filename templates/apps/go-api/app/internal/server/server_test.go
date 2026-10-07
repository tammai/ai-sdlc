package server_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"gopkg.in/yaml.v3"

	"__GO_MODULE__/internal/auth"
	"__GO_MODULE__/internal/auth/authtest"
	"__GO_MODULE__/internal/notes"
	"__GO_MODULE__/internal/server"
)

const (
	appOrigin = "http://app.test"
	password  = "correct horse battery staple"
)

// memRepo is an owner-scoped in-memory notes.Repo.
type memRepo struct {
	items []notes.Note
	err   error
}

func (m *memRepo) Create(_ context.Context, owner uuid.UUID, n notes.NewNote) (notes.Note, error) {
	if m.err != nil {
		return notes.Note{}, m.err
	}
	note := notes.Note{ID: uuid.New(), OwnerID: owner, Title: n.Title, Body: n.Body, CreatedAt: time.Now().UTC()}
	m.items = append([]notes.Note{note}, m.items...)
	return note, nil
}

func (m *memRepo) List(_ context.Context, owner uuid.UUID, _ *notes.Cursor, limit int) ([]notes.Note, error) {
	if m.err != nil {
		return nil, m.err
	}
	var out []notes.Note
	for _, n := range m.items {
		if n.OwnerID == owner && len(out) < limit {
			out = append(out, n)
		}
	}
	return out, nil
}

type env struct {
	h     http.Handler
	svc   *auth.Service
	store *authtest.MemStore
}

func newEnv(t *testing.T, repo *memRepo, ready func(context.Context) error, mutate func(*auth.Options)) env {
	t.Helper()
	st := authtest.NewMemStore()
	opts := authtest.Options()
	if mutate != nil {
		mutate(&opts)
	}
	svc, err := auth.NewService(st, opts, nil)
	if err != nil {
		t.Fatal(err)
	}
	if repo == nil {
		repo = &memRepo{}
	}
	h := server.NewRouter(server.Deps{
		Notes:          notes.NewHandler(notes.NewService(repo, nil)),
		Auth:           svc,
		AllowedOrigins: []string{appOrigin},
		Ready:          ready,
	})
	return env{h: h, svc: svc, store: st}
}

// req describes one request; browser=true adds the SPA's Origin + X-Requested-With headers.
type req struct {
	method, path, body string
	bearer             string
	cookies            []*http.Cookie
	browser            bool
	headers            map[string]string
}

func (e env) do(r req) *httptest.ResponseRecorder {
	hr := httptest.NewRequest(r.method, r.path, strings.NewReader(r.body))
	if r.body != "" {
		hr.Header.Set("Content-Type", "application/json")
	}
	if r.bearer != "" {
		hr.Header.Set("Authorization", "Bearer "+r.bearer)
	}
	for _, c := range r.cookies {
		hr.AddCookie(c)
	}
	if r.browser {
		hr.Header.Set("Origin", appOrigin)
		hr.Header.Set("X-Requested-With", "fetch")
	}
	for k, v := range r.headers {
		hr.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	e.h.ServeHTTP(rec, hr)
	return rec
}

// nativeToken registers a user through the service and returns a bearer access token.
func (e env) nativeToken(t *testing.T, email string) string {
	t.Helper()
	ctx := context.Background()
	u, err := e.svc.Register(ctx, email, password, "")
	if err != nil {
		t.Fatal(err)
	}
	tok, err := e.svc.IssueNativeTokens(ctx, u)
	if err != nil {
		t.Fatal(err)
	}
	return tok.AccessToken
}

func sessionCookie(t *testing.T, rec *httptest.ResponseRecorder) *http.Cookie {
	t.Helper()
	for _, c := range rec.Result().Cookies() {
		if c.Name == "session" && c.Value != "" {
			return c
		}
	}
	t.Fatalf("no session cookie in %v", rec.Header().Values("Set-Cookie"))
	return nil
}

func TestHealth(t *testing.T) {
	e := newEnv(t, nil, nil, nil)
	rec := e.do(req{method: "GET", path: "/healthz"})
	if rec.Code != http.StatusOK || strings.TrimSpace(rec.Body.String()) != `{"status":"ok"}` {
		t.Fatalf("healthz = %d %s", rec.Code, rec.Body)
	}
	if rec := e.do(req{method: "GET", path: "/readyz"}); rec.Code != http.StatusOK {
		t.Fatalf("readyz = %d", rec.Code)
	}
}

func TestReadyzFailsWhenDependencyDown(t *testing.T) {
	e := newEnv(t, nil, func(context.Context) error { return errors.New("db down") }, nil)
	rec := e.do(req{method: "GET", path: "/readyz"})
	if rec.Code != http.StatusServiceUnavailable || rec.Header().Get("Content-Type") != "application/problem+json" {
		t.Fatalf("readyz = %d %s", rec.Code, rec.Header().Get("Content-Type"))
	}
}

func TestNotesRequireAuthentication(t *testing.T) {
	e := newEnv(t, nil, nil, nil)
	for _, r := range []req{
		{method: "GET", path: "/v1/notes"},
		{method: "POST", path: "/v1/notes", body: `{"title":"x"}`},
		{method: "GET", path: "/v1/auth/me"},
		{method: "DELETE", path: "/v1/auth/session"},
		{method: "GET", path: "/v1/notes", bearer: "not-a-real-token"},
		{method: "GET", path: "/v1/notes", cookies: []*http.Cookie{{Name: "session", Value: auth.NewToken()}}},
	} {
		rec := e.do(r)
		if rec.Code != http.StatusUnauthorized || rec.Header().Get("Content-Type") != "application/problem+json" {
			t.Fatalf("%s %s: status = %d %s", r.method, r.path, rec.Code, rec.Body)
		}
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
			e := newEnv(t, tt.repo, nil, nil)
			rec := e.do(req{method: tt.method, path: tt.path, body: tt.body, bearer: e.nativeToken(t, "a@example.com")})
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

func TestNotesAreScopedToTheirOwner(t *testing.T) {
	e := newEnv(t, &memRepo{}, nil, nil)
	alice, bob := e.nativeToken(t, "alice@example.com"), e.nativeToken(t, "bob@example.com")
	if rec := e.do(req{method: "POST", path: "/v1/notes", body: `{"title":"alice's"}`, bearer: alice}); rec.Code != 201 {
		t.Fatalf("create = %d", rec.Code)
	}
	list := func(tok string) int {
		var page struct {
			Items []json.RawMessage `json:"items"`
		}
		rec := e.do(req{method: "GET", path: "/v1/notes", bearer: tok})
		if err := json.Unmarshal(rec.Body.Bytes(), &page); err != nil {
			t.Fatal(err)
		}
		return len(page.Items)
	}
	if list(alice) != 1 || list(bob) != 0 {
		t.Fatalf("alice sees %d, bob sees %d; want 1 and 0", list(alice), list(bob))
	}
}

// TestWebCookieFlow: register (cookie) -> me -> CSRF-protected write -> logout -> cookie dead.
func TestWebCookieFlow(t *testing.T) {
	e := newEnv(t, &memRepo{}, nil, nil)

	rec := e.do(req{method: "POST", path: "/v1/auth/register", browser: true, body: `{"email":"Web@Example.com","password":"` + password + `","name":"Web"}`})
	if rec.Code != http.StatusCreated {
		t.Fatalf("register = %d %s", rec.Code, rec.Body)
	}
	c := sessionCookie(t, rec)
	if !c.HttpOnly || !c.Secure || c.SameSite != http.SameSiteLaxMode || c.Path != "/" || c.Domain != "" || c.MaxAge <= 0 {
		t.Fatalf("cookie attributes: %+v", c)
	}
	if rec.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("auth responses must not be cached")
	}
	var u struct{ Email, Name string }
	_ = json.Unmarshal(rec.Body.Bytes(), &u)
	if u.Email != "web@example.com" || u.Name != "Web" {
		t.Fatalf("user = %+v", u)
	}

	if rec := e.do(req{method: "GET", path: "/v1/auth/me", cookies: []*http.Cookie{c}}); rec.Code != 200 {
		t.Fatalf("me = %d", rec.Code)
	}
	// CSRF: cookie-authenticated write without X-Requested-With is rejected...
	rec = e.do(req{method: "POST", path: "/v1/notes", cookies: []*http.Cookie{c}, body: `{"title":"x"}`, headers: map[string]string{"Origin": appOrigin}})
	if rec.Code != http.StatusForbidden {
		t.Fatalf("write without X-Requested-With = %d", rec.Code)
	}
	// ...as is one from another origin...
	rec = e.do(req{method: "POST", path: "/v1/notes", cookies: []*http.Cookie{c}, body: `{"title":"x"}`, headers: map[string]string{"Origin": "https://evil.test", "X-Requested-With": "fetch"}})
	if rec.Code != http.StatusForbidden {
		t.Fatalf("cross-origin write = %d", rec.Code)
	}
	// ...and the SPA's request goes through.
	if rec := e.do(req{method: "POST", path: "/v1/notes", cookies: []*http.Cookie{c}, browser: true, body: `{"title":"x"}`}); rec.Code != 201 {
		t.Fatalf("SPA write = %d %s", rec.Code, rec.Body)
	}

	// Login CSRF: a cross-site form post to the sign-in endpoint is rejected.
	rec = e.do(req{method: "POST", path: "/v1/auth/session", body: `{"email":"web@example.com","password":"` + password + `"}`, headers: map[string]string{"Origin": "https://evil.test"}})
	if rec.Code != http.StatusForbidden {
		t.Fatalf("cross-site sign-in = %d", rec.Code)
	}
	// Sign in again (new session), then sign out.
	rec = e.do(req{method: "POST", path: "/v1/auth/session", browser: true, body: `{"email":"web@example.com","password":"` + password + `"}`})
	if rec.Code != 200 {
		t.Fatalf("sign-in = %d %s", rec.Code, rec.Body)
	}
	c2 := sessionCookie(t, rec)
	rec = e.do(req{method: "DELETE", path: "/v1/auth/session", cookies: []*http.Cookie{c2}, browser: true})
	if rec.Code != http.StatusNoContent || !strings.Contains(rec.Header().Get("Set-Cookie"), "Max-Age=0") {
		t.Fatalf("logout = %d %q", rec.Code, rec.Header().Get("Set-Cookie"))
	}
	if rec := e.do(req{method: "GET", path: "/v1/auth/me", cookies: []*http.Cookie{c2}}); rec.Code != 401 {
		t.Fatalf("revoked cookie still works: %d", rec.Code)
	}
	if rec := e.do(req{method: "GET", path: "/v1/auth/me", cookies: []*http.Cookie{c}}); rec.Code != 200 {
		t.Fatal("signing out one session must not end the others")
	}

	// Bad credentials: generic 401.
	rec = e.do(req{method: "POST", path: "/v1/auth/session", browser: true, body: `{"email":"web@example.com","password":"wrong password!"}`})
	if rec.Code != 401 || !strings.Contains(rec.Body.String(), "invalid email or password") {
		t.Fatalf("bad password = %d %s", rec.Code, rec.Body)
	}
}

func TestNativeTokenFlow(t *testing.T) {
	e := newEnv(t, nil, nil, nil)
	// Native sign-up: POST /v1/auth/register without Origin or cookie (not a browser, so no CSRF
	// headers are needed; the app ignores the cookie), then a password grant.
	if rec := e.do(req{method: "POST", path: "/v1/auth/register", body: `{"email":"n@example.com","password":"` + password + `"}`}); rec.Code != http.StatusCreated {
		t.Fatalf("native register = %d %s", rec.Code, rec.Body)
	}
	type tokens struct {
		AccessToken, RefreshToken, TokenType string
		ExpiresIn                            int
	}
	grant := func(body string) (*httptest.ResponseRecorder, tokens) {
		rec := e.do(req{method: "POST", path: "/v1/auth/token", body: body})
		var tk tokens
		_ = json.Unmarshal(rec.Body.Bytes(), &tk)
		return rec, tk
	}
	rec, t1 := grant(`{"grantType":"password","email":"n@example.com","password":"` + password + `"}`)
	if rec.Code != 200 || t1.TokenType != "Bearer" || t1.ExpiresIn != 900 || t1.AccessToken == "" {
		t.Fatalf("password grant = %d %s", rec.Code, rec.Body)
	}
	if len(rec.Result().Cookies()) != 0 {
		t.Fatal("native grants must not set cookies")
	}
	if rec := e.do(req{method: "GET", path: "/v1/auth/me", bearer: t1.AccessToken}); rec.Code != 200 {
		t.Fatalf("me = %d", rec.Code)
	}
	rec, t2 := grant(`{"grantType":"refresh_token","refreshToken":"` + t1.RefreshToken + `"}`)
	if rec.Code != 200 || t2.RefreshToken == t1.RefreshToken {
		t.Fatalf("refresh = %d %s", rec.Code, rec.Body)
	}
	if rec, _ := grant(`{"grantType":"refresh_token","refreshToken":"` + t1.RefreshToken + `"}`); rec.Code != 401 {
		t.Fatalf("reused refresh token = %d", rec.Code)
	}
	if rec := e.do(req{method: "GET", path: "/v1/auth/me", bearer: t2.AccessToken}); rec.Code != 401 {
		t.Fatalf("session must be revoked after reuse: %d", rec.Code)
	}
	if rec, _ := grant(`{"grantType":"password","email":"n@example.com","password":"wrong password!"}`); rec.Code != 401 {
		t.Fatalf("bad password = %d", rec.Code)
	}
	if rec, _ := grant(`{"grantType":"password"}`); rec.Code != 422 {
		t.Fatalf("missing fields = %d", rec.Code)
	}
	if rec, _ := grant(`{"grantType":"magic_link","token":"` + auth.NewToken() + `"}`); rec.Code != 404 {
		t.Fatalf("magic_link grant with magic links off = %d", rec.Code)
	}
	if rec, _ := grant(`{"grantType":"magic_link","token":"short"}`); rec.Code != 422 {
		t.Fatalf("magic_link token shorter than 16 = %d", rec.Code)
	}
	if rec, _ := grant(`{"grantType":"magic_link","token":"` + strings.Repeat("a", 513) + `"}`); rec.Code != 422 {
		t.Fatalf("magic_link token longer than 512 = %d", rec.Code)
	}

	_, t3 := grant(`{"grantType":"password","email":"n@example.com","password":"` + password + `"}`)
	if rec := e.do(req{method: "POST", path: "/v1/auth/token/revoke", body: `{"refreshToken":"` + t3.RefreshToken + `"}`}); rec.Code != 204 {
		t.Fatalf("revoke = %d", rec.Code)
	}
	if rec := e.do(req{method: "GET", path: "/v1/auth/me", bearer: t3.AccessToken}); rec.Code != 401 {
		t.Fatal("access token alive after revoke")
	}
}

func TestRegistrationSwitches(t *testing.T) {
	body := `{"email":"a@example.com","password":"` + password + `"}`
	if rec := newEnv(t, nil, nil, func(o *auth.Options) { o.RegistrationOpen = false }).do(req{method: "POST", path: "/v1/auth/register", browser: true, body: body}); rec.Code != 403 {
		t.Fatalf("closed registration = %d", rec.Code)
	}
	if rec := newEnv(t, nil, nil, func(o *auth.Options) { o.PasswordEnabled = false }).do(req{method: "POST", path: "/v1/auth/session", browser: true, body: body}); rec.Code != 404 {
		t.Fatalf("password disabled = %d", rec.Code)
	}
	e := newEnv(t, nil, nil, nil)
	_ = e.do(req{method: "POST", path: "/v1/auth/register", browser: true, body: body})
	if rec := e.do(req{method: "POST", path: "/v1/auth/register", browser: true, body: body}); rec.Code != 409 {
		t.Fatalf("duplicate registration = %d", rec.Code)
	}
	if rec := e.do(req{method: "POST", path: "/v1/auth/register", browser: true, body: `{"email":"b@example.com","password":"short"}`}); rec.Code != 422 {
		t.Fatalf("short password = %d", rec.Code)
	}
}

func TestProvidersEndpoint(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*auth.Options)
		want   string
	}{
		{"defaults", nil, `{"magicLink":false,"oidc":[],"password":true,"registration":true}`},
		{"closed registration", func(o *auth.Options) { o.RegistrationOpen = false }, `{"magicLink":false,"oidc":[],"password":true,"registration":false}`},
		{"no password", func(o *auth.Options) { o.PasswordEnabled = false }, `{"magicLink":false,"oidc":[],"password":false,"registration":false}`},
		{"magic link + oidc", func(o *auth.Options) {
			o.Mailer = &authtest.Mailbox{}
			o.Providers = []auth.ProviderConfig{{ID: "google", Name: "Google", Issuer: "https://accounts.google.com", ClientID: "x"}, {ID: "corp", Name: "Corp SSO", Issuer: "https://sso.example.com", ClientID: "y"}}
		}, `{"magicLink":true,"oidc":[{"id":"google","name":"Google"},{"id":"corp","name":"Corp SSO"}],"password":true,"registration":true}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := newEnv(t, nil, nil, tt.mutate).do(req{method: "GET", path: "/v1/auth/providers"})
			if rec.Code != 200 || strings.TrimSpace(rec.Body.String()) != tt.want {
				t.Fatalf("providers = %d %s, want %s", rec.Code, rec.Body, tt.want)
			}
		})
	}
}

func TestMagicLinkEndpoints(t *testing.T) {
	off := newEnv(t, nil, nil, nil)
	if rec := off.do(req{method: "POST", path: "/v1/auth/magic-link", browser: true, body: `{"email":"a@example.com"}`}); rec.Code != 404 {
		t.Fatalf("magic link off = %d", rec.Code)
	}
	if rec := off.do(req{method: "POST", path: "/v1/auth/magic-link/verify", browser: true, body: `{"token":"` + auth.NewToken() + `"}`}); rec.Code != 404 {
		t.Fatalf("magic link verify off = %d", rec.Code)
	}

	box := &authtest.Mailbox{}
	e := newEnv(t, nil, nil, func(o *auth.Options) { o.Mailer = box })
	for _, email := range []string{"known@example.com", "unknown@example.com"} {
		if rec := e.do(req{method: "POST", path: "/v1/auth/magic-link", browser: true, body: `{"email":"` + email + `"}`}); rec.Code != 202 {
			t.Fatalf("request = %d %s", rec.Code, rec.Body)
		}
	}
	msgs := box.Messages()
	if len(msgs) != 2 {
		t.Fatalf("messages = %d", len(msgs))
	}
	token := msgs[0].Text[strings.Index(msgs[0].Text, "token=")+len("token=") : strings.Index(msgs[0].Text, "\r\n\r\nIt expires")]
	rec := e.do(req{method: "POST", path: "/v1/auth/magic-link/verify", browser: true, body: `{"token":"` + token + `"}`})
	if rec.Code != 200 {
		t.Fatalf("verify = %d %s", rec.Code, rec.Body)
	}
	c := sessionCookie(t, rec)
	if rec := e.do(req{method: "GET", path: "/v1/auth/me", cookies: []*http.Cookie{c}}); rec.Code != 200 || !strings.Contains(rec.Body.String(), "known@example.com") {
		t.Fatalf("me = %d %s", rec.Code, rec.Body)
	}
	if rec := e.do(req{method: "POST", path: "/v1/auth/magic-link/verify", browser: true, body: `{"token":"` + token + `"}`}); rec.Code != 401 {
		t.Fatalf("replayed link = %d", rec.Code)
	}
}

// TestPublicOperationsMatchContract keeps server.PublicOperations equal to the operations with
// `security: []` in contracts/openapi.yaml, so a new operation is protected unless the contract says otherwise.
func TestPublicOperationsMatchContract(t *testing.T) {
	raw, err := os.ReadFile("../../../contracts/openapi.yaml")
	if err != nil {
		t.Skipf("contract not found next to the api (%v)", err)
	}
	var doc struct {
		Paths map[string]map[string]struct {
			OperationID string `yaml:"operationId"`
			Security    *[]any `yaml:"security"`
		} `yaml:"paths"`
	}
	if err := yaml.Unmarshal(raw, &doc); err != nil {
		t.Fatal(err)
	}
	var public, ops []string
	for _, methods := range doc.Paths {
		for _, op := range methods {
			if op.OperationID == "" {
				continue
			}
			name := strings.ToUpper(op.OperationID[:1]) + op.OperationID[1:]
			ops = append(ops, name)
			if op.Security != nil && len(*op.Security) == 0 {
				public = append(public, name)
			}
		}
	}
	var mine []string
	for op := range server.PublicOperations {
		mine = append(mine, op)
		if !slices.Contains(ops, op) {
			t.Errorf("PublicOperations has %q, which is not in the contract", op)
		}
	}
	slices.Sort(public)
	slices.Sort(mine)
	if !slices.Equal(public, mine) {
		t.Fatalf("public operations in contract %v != server.PublicOperations %v", public, mine)
	}
}

func TestRateLimitedResponseHasRetryAfter(t *testing.T) {
	e := newEnv(t, nil, nil, func(o *auth.Options) { o.IPLimiter = auth.NewRateLimiter(1, 30*time.Second) })
	body := `{"grantType":"password","email":"a@example.com","password":"nope nope nope"}`
	if rec := e.do(req{method: "POST", path: "/v1/auth/token", body: body}); rec.Code != 401 {
		t.Fatalf("first attempt = %d", rec.Code)
	}
	rec := e.do(req{method: "POST", path: "/v1/auth/token", body: body})
	if rec.Code != http.StatusTooManyRequests || rec.Header().Get("Retry-After") != "30" ||
		rec.Header().Get("Content-Type") != "application/problem+json" {
		t.Fatalf("rate limited = %d Retry-After=%q %s", rec.Code, rec.Header().Get("Retry-After"), rec.Body)
	}
}
