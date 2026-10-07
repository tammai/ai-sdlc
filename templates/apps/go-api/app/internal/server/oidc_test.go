package server_test

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/go-jose/go-jose/v4"

	"__GO_MODULE__/internal/auth"
)

// fakeIdP is a minimal OpenID provider: discovery, JWKS and a token endpoint that checks the PKCE
// verifier and redirect_uri, then returns an RS256-signed ID token. The authorization endpoint is
// simulated by authorize(), which plays the user consenting in the browser.
type fakeIdP struct {
	t      *testing.T
	srv    *httptest.Server
	signer jose.Signer
	key    *rsa.PrivateKey
	mu     sync.Mutex
	codes  map[string]grant
}

type grant struct {
	challenge, redirectURI, nonce string
	claims                        map[string]any
}

const clientID = "test-client"

// testVerifier is the native app's own PKCE verifier (RFC 7636 appendix B example); nativeStart is
// the /start query a native app sends with its S256 challenge.
const testVerifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"

var nativeStart = "?client=native&codeChallengeMethod=S256&codeChallenge=" + auth.S256Challenge(testVerifier)

func newFakeIdP(t *testing.T) *fakeIdP {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	signer, err := jose.NewSigner(jose.SigningKey{Algorithm: jose.RS256, Key: key}, (&jose.SignerOptions{}).WithType("JWT").WithHeader("kid", "k1"))
	if err != nil {
		t.Fatal(err)
	}
	idp := &fakeIdP{t: t, signer: signer, key: key, codes: map[string]grant{}}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /.well-known/openid-configuration", func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"issuer": idp.srv.URL, "authorization_endpoint": idp.srv.URL + "/authorize", "token_endpoint": idp.srv.URL + "/token",
			"jwks_uri": idp.srv.URL + "/jwks", "response_types_supported": []string{"code"}, "subject_types_supported": []string{"public"},
			"id_token_signing_alg_values_supported": []string{"RS256"}, "code_challenge_methods_supported": []string{"S256"},
		})
	})
	mux.HandleFunc("GET /jwks", func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(jose.JSONWebKeySet{Keys: []jose.JSONWebKey{{Key: &key.PublicKey, KeyID: "k1", Algorithm: "RS256", Use: "sig"}}})
	})
	mux.HandleFunc("POST /token", idp.token)
	idp.srv = httptest.NewServer(mux)
	t.Cleanup(idp.srv.Close)
	return idp
}

func (f *fakeIdP) token(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseForm(); err != nil {
		http.Error(w, "bad form", 400)
		return
	}
	id, _, hasBasic := r.BasicAuth()
	if !hasBasic {
		id = r.PostForm.Get("client_id")
	}
	f.mu.Lock()
	g, ok := f.codes[r.PostForm.Get("code")]
	delete(f.codes, r.PostForm.Get("code"))
	f.mu.Unlock()
	sum := sha256.Sum256([]byte(r.PostForm.Get("code_verifier")))
	switch {
	case !ok, id != clientID, r.PostForm.Get("grant_type") != "authorization_code":
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(400)
		_, _ = w.Write([]byte(`{"error":"invalid_grant"}`))
		return
	case base64.RawURLEncoding.EncodeToString(sum[:]) != g.challenge:
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(400)
		_, _ = w.Write([]byte(`{"error":"invalid_grant","error_description":"PKCE verification failed"}`))
		return
	case r.PostForm.Get("redirect_uri") != g.redirectURI:
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(400)
		_, _ = w.Write([]byte(`{"error":"invalid_grant","error_description":"redirect_uri mismatch"}`))
		return
	}
	claims := map[string]any{
		"iss": f.srv.URL, "aud": clientID, "iat": time.Now().Unix(), "exp": time.Now().Add(5 * time.Minute).Unix(), "nonce": g.nonce,
	}
	for k, v := range g.claims {
		claims[k] = v
	}
	payload, _ := json.Marshal(claims)
	obj, err := f.signer.Sign(payload)
	if err != nil {
		f.t.Error(err)
		return
	}
	idToken, _ := obj.CompactSerialize()
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"access_token": "idp-access", "token_type": "Bearer", "expires_in": 300, "id_token": idToken})
}

// authorize validates the authorization request like a real IdP would and returns the callback URL
// the browser is sent to. claims become the ID token claims ("nonce" can be overridden to test it).
func (f *fakeIdP) authorize(authURL string, claims map[string]any) string {
	f.t.Helper()
	u, err := url.Parse(authURL)
	if err != nil || !strings.HasPrefix(authURL, f.srv.URL+"/authorize?") {
		f.t.Fatalf("not an authorization URL of the IdP: %s", authURL)
	}
	q := u.Query()
	for k, want := range map[string]string{"response_type": "code", "client_id": clientID, "code_challenge_method": "S256"} {
		if q.Get(k) != want {
			f.t.Fatalf("authorization request %s = %q, want %q", k, q.Get(k), want)
		}
	}
	for _, k := range []string{"state", "nonce", "code_challenge", "redirect_uri"} {
		if q.Get(k) == "" {
			f.t.Fatalf("authorization request lacks %s", k)
		}
	}
	if !strings.Contains(q.Get("scope"), "openid") {
		f.t.Fatalf("scope = %q", q.Get("scope"))
	}
	g := grant{challenge: q.Get("code_challenge"), redirectURI: q.Get("redirect_uri"), nonce: q.Get("nonce"), claims: claims}
	if n, ok := claims["nonce"].(string); ok {
		g.nonce = n
	}
	code := auth.NewToken()
	f.mu.Lock()
	f.codes[code] = g
	f.mu.Unlock()
	return g.redirectURI + "?" + url.Values{"code": {code}, "state": {q.Get("state")}}.Encode()
}

func oidcEnv(t *testing.T, idp *fakeIdP, mutate func(*auth.Options)) env {
	return newEnv(t, nil, nil, func(o *auth.Options) {
		o.Providers = []auth.ProviderConfig{{ID: "fake", Name: "Fake IdP", Issuer: idp.srv.URL, ClientID: clientID, ClientSecret: "s3cret"}}
		if mutate != nil {
			mutate(o)
		}
	})
}

// callbackPath maps the public callback URL to the API route (the edge proxy strips /api).
func callbackPath(t *testing.T, callbackURL string) string {
	t.Helper()
	for _, base := range []string{"http://app.test/api", "http://api.test"} {
		if strings.HasPrefix(callbackURL, base+"/") {
			return strings.TrimPrefix(callbackURL, base)
		}
	}
	t.Fatalf("unexpected callback URL %s", callbackURL)
	return ""
}

func cookieNamed(rec *httptest.ResponseRecorder, name string) *http.Cookie {
	for _, c := range rec.Result().Cookies() {
		if c.Name == name {
			return c
		}
	}
	return nil
}

func start(t *testing.T, e env, query string) (authURL string, binding *http.Cookie) {
	t.Helper()
	rec := e.do(req{method: "GET", path: "/v1/auth/oidc/fake/start" + query})
	if rec.Code != http.StatusFound {
		t.Fatalf("start = %d %s", rec.Code, rec.Body)
	}
	binding = cookieNamed(rec, "session_oidc")
	if binding == nil || !binding.HttpOnly || binding.SameSite != http.SameSiteLaxMode || binding.MaxAge <= 0 {
		t.Fatalf("state binding cookie = %+v", binding)
	}
	return rec.Header().Get("Location"), binding
}

func TestOIDCWebFlow(t *testing.T) {
	idp := newFakeIdP(t)
	e := oidcEnv(t, idp, nil)

	authURL, binding := start(t, e, "?redirect=%2Fnotes%3Ftab%3Dall")
	u, _ := url.Parse(authURL)
	if got := u.Query().Get("redirect_uri"); got != "http://app.test/api/v1/auth/oidc/fake/callback" {
		t.Fatalf("web redirect_uri = %s (must go through the app origin)", got)
	}
	cb := idp.authorize(authURL, map[string]any{"sub": "user-1", "email": "Oidc@Example.com", "email_verified": true, "name": "Oidc User"})
	rec := e.do(req{method: "GET", path: callbackPath(t, cb), cookies: []*http.Cookie{binding}})
	if rec.Code != http.StatusFound || rec.Header().Get("Location") != "http://app.test/notes?tab=all" {
		t.Fatalf("callback = %d Location=%q %s", rec.Code, rec.Header().Get("Location"), rec.Body)
	}
	if rec.Header().Get("Referrer-Policy") != "no-referrer" {
		t.Fatal("callback redirect must not leak code/state via Referer")
	}
	sess := sessionCookie(t, rec)
	if !sess.HttpOnly || !sess.Secure || sess.SameSite != http.SameSiteLaxMode || sess.Path != "/" {
		t.Fatalf("session cookie = %+v", sess)
	}
	if n := len(rec.Header().Values("Set-Cookie")); n != 1 {
		t.Fatalf("callback sets %d cookies, want only the session cookie", n)
	}
	me := e.do(req{method: "GET", path: "/v1/auth/me", cookies: []*http.Cookie{sess}})
	if me.Code != 200 || !strings.Contains(me.Body.String(), `"email":"oidc@example.com"`) || !strings.Contains(me.Body.String(), "Oidc User") {
		t.Fatalf("me = %d %s", me.Code, me.Body)
	}

	// Replaying the callback (same state) fails: states are single use.
	if rec := e.do(req{method: "GET", path: callbackPath(t, cb), cookies: []*http.Cookie{binding}}); rec.Code != 302 ||
		rec.Header().Get("Location") != "http://app.test/login?error=invalid_state" || sessionCookieOrNil(rec) != nil {
		t.Fatalf("replayed callback = %d %q", rec.Code, rec.Header().Get("Location"))
	}

	// Second sign-in with the same subject resolves to the same user.
	authURL, binding = start(t, e, "")
	cb = idp.authorize(authURL, map[string]any{"sub": "user-1", "email": "changed@example.com", "email_verified": true})
	rec = e.do(req{method: "GET", path: callbackPath(t, cb), cookies: []*http.Cookie{binding}})
	if rec.Code != 302 || rec.Header().Get("Location") != "http://app.test/" {
		t.Fatalf("second sign-in = %d %q", rec.Code, rec.Header().Get("Location"))
	}
	me = e.do(req{method: "GET", path: "/v1/auth/me", cookies: []*http.Cookie{sessionCookie(t, rec)}})
	if !strings.Contains(me.Body.String(), "oidc@example.com") {
		t.Fatalf("identity not linked by subject: %s", me.Body)
	}
}

func TestOIDCStartRejectsOpenRedirects(t *testing.T) {
	idp := newFakeIdP(t)
	e := oidcEnv(t, idp, nil)
	for _, bad := range []string{"https://evil.test/", "//evil.test", "/\\evil.test", "evil"} {
		rec := e.do(req{method: "GET", path: "/v1/auth/oidc/fake/start?redirect=" + url.QueryEscape(bad)})
		if rec.Code != 422 {
			t.Fatalf("redirect %q accepted: %d", bad, rec.Code)
		}
	}
	if rec := e.do(req{method: "GET", path: "/v1/auth/oidc/fake/start?client=native&redirect=" + url.QueryEscape("com.evil.app:/oauth")}); rec.Code != 422 {
		t.Fatalf("unlisted native redirect accepted: %d", rec.Code)
	}
	if rec := e.do(req{method: "GET", path: "/v1/auth/oidc/nope/start"}); rec.Code != 404 {
		t.Fatalf("unknown provider = %d", rec.Code)
	}
}

func TestOIDCNativeFlow(t *testing.T) {
	idp := newFakeIdP(t)
	e := oidcEnv(t, idp, nil)

	authURL, binding := start(t, e, nativeStart)
	u, _ := url.Parse(authURL)
	if got := u.Query().Get("redirect_uri"); got != "http://api.test/v1/auth/oidc/fake/callback" {
		t.Fatalf("native redirect_uri = %s", got)
	}
	cb := idp.authorize(authURL, map[string]any{"sub": "native-1", "email": "n@example.com", "email_verified": true})
	rec := e.do(req{method: "GET", path: callbackPath(t, cb), cookies: []*http.Cookie{binding}})
	loc, _ := url.Parse(rec.Header().Get("Location"))
	if rec.Code != 302 || loc == nil || loc.Scheme != "com.example.app" || loc.Path != "/oauth" || loc.Query().Get("code") == "" {
		t.Fatalf("native callback = %d %q", rec.Code, rec.Header().Get("Location"))
	}
	if sessionCookieOrNil(rec) != nil {
		t.Fatal("native flow must not set a web session cookie")
	}
	exchange := func(code, verifier string) *httptest.ResponseRecorder {
		body := `{"grantType":"authorization_code","code":"` + code + `"`
		if verifier != "" {
			body += `,"codeVerifier":"` + verifier + `"`
		}
		return e.do(req{method: "POST", path: "/v1/auth/token", body: body + "}"})
	}
	code := loc.Query().Get("code")
	rec = exchange(code, testVerifier)
	var tok struct{ AccessToken, RefreshToken string }
	_ = json.Unmarshal(rec.Body.Bytes(), &tok)
	if rec.Code != 200 || tok.AccessToken == "" || tok.RefreshToken == "" {
		t.Fatalf("code exchange = %d %s", rec.Code, rec.Body)
	}
	if me := e.do(req{method: "GET", path: "/v1/auth/me", bearer: tok.AccessToken}); me.Code != 200 || !strings.Contains(me.Body.String(), "n@example.com") {
		t.Fatalf("me = %d %s", me.Code, me.Body)
	}
	if rec := exchange(code, testVerifier); rec.Code != 401 {
		t.Fatalf("one-time code redeemed twice: %d", rec.Code)
	}
}

// nativeCode runs a native OIDC flow (with nativeStart's PKCE challenge) and returns the one-time code.
func nativeCode(t *testing.T, e env, idp *fakeIdP) string {
	t.Helper()
	authURL, binding := start(t, e, nativeStart)
	cb := idp.authorize(authURL, map[string]any{"sub": "pkce", "email": "pkce@example.com", "email_verified": true})
	rec := e.do(req{method: "GET", path: callbackPath(t, cb), cookies: []*http.Cookie{binding}})
	return mustQuery(t, rec.Header().Get("Location"), "code")
}

// TestOIDCNativePKCE: the one-time code is bound to the app's S256 challenge (RFC 8252). An app that
// intercepts the custom-scheme redirect cannot redeem it, and every failed attempt burns the code.
func TestOIDCNativePKCE(t *testing.T) {
	idp := newFakeIdP(t)
	e := oidcEnv(t, idp, nil)
	exchange := func(code, verifier string) int {
		body := `{"grantType":"authorization_code","code":"` + code + `"`
		if verifier != "" {
			body += `,"codeVerifier":"` + verifier + `"`
		}
		return e.do(req{method: "POST", path: "/v1/auth/token", body: body + "}"}).Code
	}
	otherVerifier := strings.Repeat("x", 43)

	code := nativeCode(t, e, idp)
	if got := exchange(code, otherVerifier); got != 401 {
		t.Fatalf("wrong verifier = %d, want 401", got)
	}
	if got := exchange(code, testVerifier); got != 401 {
		t.Fatalf("code still redeemable after a wrong verifier: %d", got)
	}

	code = nativeCode(t, e, idp)
	if got := exchange(code, ""); got != 422 {
		t.Fatalf("missing verifier = %d, want 422", got)
	}
	if got := exchange(code, testVerifier); got != 401 {
		t.Fatalf("code still redeemable after a missing verifier: %d", got)
	}

	code = nativeCode(t, e, idp)
	if got := exchange(code, "short"); got != 422 {
		t.Fatalf("malformed verifier = %d, want 422", got)
	}

	code = nativeCode(t, e, idp)
	if got := exchange(code, testVerifier); got != 200 {
		t.Fatalf("correct verifier = %d", got)
	}
	if got := exchange(code, testVerifier); got != 401 {
		t.Fatalf("redeemed twice: %d", got)
	}

	// /start without a valid S256 challenge goes back to the app with error=invalid_request.
	for name, q := range map[string]string{
		"no challenge":    "?client=native",
		"no method":       "?client=native&codeChallenge=" + auth.S256Challenge(testVerifier),
		"plain method":    "?client=native&codeChallengeMethod=plain&codeChallenge=" + testVerifier,
		"short challenge": "?client=native&codeChallengeMethod=S256&codeChallenge=abc",
		"bad characters":  "?client=native&codeChallengeMethod=S256&codeChallenge=" + url.QueryEscape(strings.Repeat("a", 42)+"/"),
	} {
		rec := e.do(req{method: "GET", path: "/v1/auth/oidc/fake/start" + q})
		if rec.Code != http.StatusFound || rec.Header().Get("Location") != "com.example.app:/oauth?error=invalid_request" || cookieNamed(rec, "session_oidc") != nil {
			t.Fatalf("%s: %d %q %s", name, rec.Code, rec.Header().Get("Location"), rec.Body)
		}
	}
	// No trustworthy redirect at all: 422.
	if rec := e.do(req{method: "GET", path: "/v1/auth/oidc/fake/start?client=native&redirect=" + url.QueryEscape("com.evil.app:/oauth")}); rec.Code != 422 {
		t.Fatalf("unlisted redirect without challenge = %d", rec.Code)
	}
}

func sessionCookieOrNil(rec *httptest.ResponseRecorder) *http.Cookie {
	if c := cookieNamed(rec, "session"); c != nil && c.Value != "" {
		return c
	}
	return nil
}

func TestOIDCRejectsBadStateAndNonce(t *testing.T) {
	idp := newFakeIdP(t)
	e := oidcEnv(t, idp, nil)
	claims := map[string]any{"sub": "s", "email": "s@example.com", "email_verified": true}
	const webInvalidState = "http://app.test/login?error=invalid_state"
	expect := func(name string, rec *httptest.ResponseRecorder, location string) {
		t.Helper()
		if rec.Code != http.StatusFound || rec.Header().Get("Location") != location || sessionCookieOrNil(rec) != nil {
			t.Fatalf("%s = %d %q (%s), want 302 to %s and no session", name, rec.Code, rec.Header().Get("Location"), rec.Body, location)
		}
	}

	// State not bound to this browser (login CSRF: attacker's callback URL opened by the victim).
	authURL, _ := start(t, e, "")
	cb := idp.authorize(authURL, claims)
	expect("callback without binding cookie", e.do(req{method: "GET", path: callbackPath(t, cb)}), webInvalidState)
	authURL, _ = start(t, e, "")
	_, otherBinding := start(t, e, "")
	cb = idp.authorize(authURL, claims)
	expect("callback with another flow's binding cookie",
		e.do(req{method: "GET", path: callbackPath(t, cb), cookies: []*http.Cookie{otherBinding}}), webInvalidState)
	// Forged, malformed and missing state: no trustworthy native redirect, so the web error page.
	forged := auth.NewToken()
	expect("forged state", e.do(req{method: "GET", path: "/v1/auth/oidc/fake/callback?code=x&state=" + forged,
		cookies: []*http.Cookie{{Name: "session_oidc", Value: forged}}}), webInvalidState)
	expect("malformed state", e.do(req{method: "GET", path: "/v1/auth/oidc/fake/callback?code=x&state=%3Cscript%3E"}), webInvalidState)
	expect("missing state", e.do(req{method: "GET", path: "/v1/auth/oidc/fake/callback?error=access_denied"}), webInvalidState)

	// Wrong nonce in the ID token (replayed/injected token): back to the app with an error, no session.
	authURL, binding := start(t, e, "")
	cb = idp.authorize(authURL, map[string]any{"sub": "s", "email": "s@example.com", "email_verified": true, "nonce": "not-the-nonce"})
	expect("bad nonce", e.do(req{method: "GET", path: callbackPath(t, cb), cookies: []*http.Cookie{binding}}), "http://app.test/login?error=server_error")

	// IdP reported an error (user cancelled).
	authURL, binding = start(t, e, "")
	state := mustQuery(t, authURL, "state")
	expect("idp access_denied", e.do(req{method: "GET", path: "/v1/auth/oidc/fake/callback?error=access_denied&state=" + state,
		cookies: []*http.Cookie{binding}}), "http://app.test/login?error=access_denied")

	// Token signed by another key.
	other := newFakeIdP(t)
	authURL, binding = start(t, e, "")
	cb = idp.authorize(authURL, claims)
	saved := idp.signer
	idp.signer = other.signer
	expect("foreign signature", e.do(req{method: "GET", path: callbackPath(t, cb), cookies: []*http.Cookie{binding}}), "http://app.test/login?error=server_error")
	idp.signer = saved
}

// Native failures go back to the allow-listed app URI with an OAuth error code instead of a code.
func TestOIDCNativeErrors(t *testing.T) {
	idp := newFakeIdP(t)
	e := oidcEnv(t, idp, nil)
	const native = "com.example.app:/oauth"
	expect := func(name string, rec *httptest.ResponseRecorder, wantErr string) {
		t.Helper()
		loc, err := url.Parse(rec.Header().Get("Location"))
		if rec.Code != http.StatusFound || err != nil || loc.Scheme+":"+loc.Path != native ||
			loc.Query().Get("error") != wantErr || loc.Query().Get("code") != "" {
			t.Fatalf("%s = %d %q, want %s?error=%s", name, rec.Code, rec.Header().Get("Location"), native, wantErr)
		}
	}

	authURL, binding := start(t, e, nativeStart)
	state := mustQuery(t, authURL, "state")
	expect("user cancelled", e.do(req{method: "GET", path: "/v1/auth/oidc/fake/callback?error=access_denied&state=" + state,
		cookies: []*http.Cookie{binding}}), "access_denied")

	authURL, binding = start(t, e, nativeStart)
	state = mustQuery(t, authURL, "state")
	expect("idp failure", e.do(req{method: "GET", path: "/v1/auth/oidc/fake/callback?error=temporarily_unavailable&state=" + state,
		cookies: []*http.Cookie{binding}}), "server_error")

	authURL, binding = start(t, e, nativeStart)
	cb := idp.authorize(authURL, map[string]any{"sub": "x", "email": "x@example.com", "email_verified": true, "nonce": "wrong"})
	expect("bad nonce", e.do(req{method: "GET", path: callbackPath(t, cb), cookies: []*http.Cookie{binding}}), "server_error")

	authURL, _ = start(t, e, nativeStart)
	cb = idp.authorize(authURL, map[string]any{"sub": "x", "email": "x@example.com", "email_verified": true})
	expect("state not bound to this browser", e.do(req{method: "GET", path: callbackPath(t, cb)}), "invalid_request")

	authURL, binding = start(t, e, nativeStart)
	cb = idp.authorize(authURL, map[string]any{"sub": "y", "email": "y@example.com", "email_verified": false})
	expect("unverified email", e.do(req{method: "GET", path: callbackPath(t, cb), cookies: []*http.Cookie{binding}}), "access_denied")
}

func mustQuery(t *testing.T, raw, key string) string {
	t.Helper()
	u, err := url.Parse(raw)
	if err != nil || u.Query().Get(key) == "" {
		t.Fatalf("%s has no %s", raw, key)
	}
	return u.Query().Get(key)
}

func TestOIDCEmailLinking(t *testing.T) {
	idp := newFakeIdP(t)
	e := oidcEnv(t, idp, nil)
	ctx := context.Background()
	existing, err := e.svc.Register(ctx, "owner@example.com", password, "Owner")
	if err != nil {
		t.Fatal(err)
	}

	// email_verified=false must not link to (or take over) the existing account.
	authURL, binding := start(t, e, "")
	cb := idp.authorize(authURL, map[string]any{"sub": "attacker", "email": "owner@example.com", "email_verified": false})
	rec := e.do(req{method: "GET", path: callbackPath(t, cb), cookies: []*http.Cookie{binding}})
	if rec.Code != 302 || rec.Header().Get("Location") != "http://app.test/login?error=email_not_verified" || sessionCookieOrNil(rec) != nil {
		t.Fatalf("unverified email = %d %q", rec.Code, rec.Header().Get("Location"))
	}
	if ids := e.store.Identities(existing.ID); len(ids) != 0 {
		t.Fatalf("identity linked despite email_verified=false: %v", ids)
	}
	if u, _ := e.store.UserByID(ctx, existing.ID); u.PasswordHash == nil {
		t.Fatal("existing account modified by an unverified IdP email")
	}
	// String "false" is not verified either; a missing claim neither.
	for _, claim := range []any{"false", nil} {
		authURL, binding = start(t, e, "")
		c := map[string]any{"sub": "attacker2", "email": "owner@example.com"}
		if claim != nil {
			c["email_verified"] = claim
		}
		rec = e.do(req{method: "GET", path: callbackPath(t, idp.authorize(authURL, c)), cookies: []*http.Cookie{binding}})
		if !strings.HasSuffix(rec.Header().Get("Location"), "error=email_not_verified") {
			t.Fatalf("email_verified=%v linked: %q", claim, rec.Header().Get("Location"))
		}
	}

	// email_verified=true links to the existing account; since that account's email had never been
	// verified, its password is cleared and its sessions revoked (pre-account-takeover defense).
	authURL, binding = start(t, e, "")
	cb = idp.authorize(authURL, map[string]any{"sub": "owner-sub", "email": "OWNER@example.com", "email_verified": "true"})
	rec = e.do(req{method: "GET", path: callbackPath(t, cb), cookies: []*http.Cookie{binding}})
	if rec.Code != 302 || rec.Header().Get("Location") != "http://app.test/" {
		t.Fatalf("verified link = %d %q", rec.Code, rec.Header().Get("Location"))
	}
	if ids := e.store.Identities(existing.ID); len(ids) != 1 || ids[0] != "fake:owner-sub" {
		t.Fatalf("identities = %v", ids)
	}
	if u, _ := e.store.UserByID(ctx, existing.ID); u.PasswordHash != nil || !u.EmailVerified {
		t.Fatalf("account after first verified link: %+v", u)
	}

	// Registration closed: unknown verified emails are not turned into accounts.
	closed := oidcEnv(t, idp, func(o *auth.Options) { o.RegistrationOpen = false })
	authURL, binding = start(t, closed, "")
	rec = closed.do(req{method: "GET", path: callbackPath(t, idp.authorize(authURL, map[string]any{"sub": "new", "email": "new@example.com", "email_verified": true})), cookies: []*http.Cookie{binding}})
	if rec.Header().Get("Location") != "http://app.test/login?error=registration_closed" {
		t.Fatalf("closed registration = %q", rec.Header().Get("Location"))
	}
}
