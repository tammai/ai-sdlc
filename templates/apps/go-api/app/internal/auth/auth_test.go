package auth_test

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"log/slog"
	"math/big"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"__GO_MODULE__/internal/auth"
)

// jwksServer serves the public half of key as a JWKS document.
func jwksServer(t *testing.T, key *rsa.PrivateKey) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"keys": []map[string]string{{
			"kty": "RSA", "kid": "k1", "alg": "RS256", "use": "sig",
			"n": base64.RawURLEncoding.EncodeToString(key.N.Bytes()),
			"e": base64.RawURLEncoding.EncodeToString(big.NewInt(int64(key.E)).Bytes()),
		}}})
	}))
	t.Cleanup(srv.Close)
	return srv
}

func sign(t *testing.T, key *rsa.PrivateKey, claims jwt.RegisteredClaims) string {
	t.Helper()
	tok := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	tok.Header["kid"] = "k1"
	s, err := tok.SignedString(key)
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func TestMiddlewareDisabledWithoutJWKS(t *testing.T) {
	mw, err := auth.Middleware(context.Background(), auth.Options{}, slog.New(slog.DiscardHandler))
	if err != nil {
		t.Fatal(err)
	}
	rec := httptest.NewRecorder()
	mw(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) })).
		ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/v1/notes", nil))
	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want pass-through", rec.Code)
	}
}

func TestMiddlewareValidatesTokens(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	other, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	srv := jwksServer(t, key)

	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	mw, err := auth.Middleware(ctx, auth.Options{
		JWKSURL: srv.URL, Issuer: "https://issuer.test", Audience: "api", Public: []string{"/healthz"},
	}, slog.New(slog.DiscardHandler))
	if err != nil {
		t.Fatal(err)
	}
	var gotSubject string
	h := mw(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotSubject = auth.Subject(r.Context())
		w.WriteHeader(http.StatusNoContent)
	}))

	valid := jwt.RegisteredClaims{
		Subject: "user-1", Issuer: "https://issuer.test", Audience: jwt.ClaimStrings{"api"},
		ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
	}
	expired := valid
	expired.ExpiresAt = jwt.NewNumericDate(time.Now().Add(-time.Hour))
	wrongIssuer := valid
	wrongIssuer.Issuer = "https://evil.test"
	wrongAudience := valid
	wrongAudience.Audience = jwt.ClaimStrings{"other"}
	noExpiry := valid
	noExpiry.ExpiresAt = nil

	tests := []struct {
		name   string
		path   string
		header string
		want   int
	}{
		{name: "public path needs no token", path: "/healthz", want: http.StatusNoContent},
		{name: "missing token", path: "/v1/notes", want: http.StatusUnauthorized},
		{name: "garbage token", path: "/v1/notes", header: "Bearer not-a-jwt", want: http.StatusUnauthorized},
		{name: "wrong scheme", path: "/v1/notes", header: "Basic abc", want: http.StatusUnauthorized},
		{name: "valid token", path: "/v1/notes", header: "Bearer " + sign(t, key, valid), want: http.StatusNoContent},
		{name: "expired token", path: "/v1/notes", header: "Bearer " + sign(t, key, expired), want: http.StatusUnauthorized},
		{name: "token without expiry", path: "/v1/notes", header: "Bearer " + sign(t, key, noExpiry), want: http.StatusUnauthorized},
		{name: "wrong issuer", path: "/v1/notes", header: "Bearer " + sign(t, key, wrongIssuer), want: http.StatusUnauthorized},
		{name: "wrong audience", path: "/v1/notes", header: "Bearer " + sign(t, key, wrongAudience), want: http.StatusUnauthorized},
		{name: "signed by another key", path: "/v1/notes", header: "Bearer " + sign(t, other, valid), want: http.StatusUnauthorized},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotSubject = ""
			req := httptest.NewRequest(http.MethodGet, tt.path, nil)
			if tt.header != "" {
				req.Header.Set("Authorization", tt.header)
			}
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, req)
			if rec.Code != tt.want {
				t.Fatalf("status = %d, want %d", rec.Code, tt.want)
			}
			if tt.want == http.StatusUnauthorized && rec.Header().Get("Content-Type") != "application/problem+json" {
				t.Fatalf("content-type = %q", rec.Header().Get("Content-Type"))
			}
			if tt.name == "valid token" && gotSubject != "user-1" {
				t.Fatalf("subject = %q", gotSubject)
			}
		})
	}
}
