package auth_test

import (
	"encoding/base64"
	"net/http/httptest"
	"strings"
	"testing"

	"__GO_MODULE__/internal/auth"
	"__GO_MODULE__/internal/auth/authtest"
)

func TestNewToken(t *testing.T) {
	seen := map[string]bool{}
	for range 1000 {
		tok := auth.NewToken()
		raw, err := base64.RawURLEncoding.DecodeString(tok)
		if err != nil || len(raw) != auth.TokenBytes {
			t.Fatalf("token %q: not %d bytes of base64url (%v)", tok, auth.TokenBytes, err)
		}
		if strings.ContainsAny(tok, "+/=") {
			t.Fatalf("token %q is not URL-safe", tok)
		}
		if seen[tok] {
			t.Fatal("duplicate token")
		}
		seen[tok] = true
	}
}

func TestHashToken(t *testing.T) {
	a, b := auth.NewToken(), auth.NewToken()
	if len(auth.HashToken(a)) != 32 {
		t.Fatal("hash must be SHA-256 (32 bytes)")
	}
	if !auth.EqualHash(auth.HashToken(a), auth.HashToken(a)) {
		t.Fatal("same token must hash equal")
	}
	if auth.EqualHash(auth.HashToken(a), auth.HashToken(b)) {
		t.Fatal("different tokens must hash differently")
	}
	if auth.EqualHash(auth.HashToken(a), auth.HashToken(a)[:31]) {
		t.Fatal("length mismatch must not compare equal")
	}
	if strings.Contains(string(auth.HashToken(a)), a) {
		t.Fatal("hash must not contain the token")
	}
}

func TestPasswordHashVerifyRehash(t *testing.T) {
	cheap := auth.Argon2Params{Memory: 8 * 1024, Iterations: 1, Parallelism: 1, SaltLen: 16, KeyLen: 32}
	h := auth.NewPasswordHasher(cheap, 2)

	hash, err := h.Hash("correct horse battery staple")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(hash, "$argon2id$v=19$m=8192,t=1,p=1$") || strings.Count(hash, "$") != 5 {
		t.Fatalf("not a PHC argon2id string: %s", hash)
	}
	if again, _ := h.Hash("correct horse battery staple"); again == hash {
		t.Fatal("hashes must be salted")
	}
	if ok, rehash := h.Verify("correct horse battery staple", hash); !ok || rehash {
		t.Fatalf("verify = %v, rehash = %v; want true, false", ok, rehash)
	}
	if ok, _ := h.Verify("correct horse battery stapl", hash); ok {
		t.Fatal("wrong password verified")
	}

	stronger := cheap
	stronger.Iterations = 2
	h2 := auth.NewPasswordHasher(stronger, 2)
	if ok, rehash := h2.Verify("correct horse battery staple", hash); !ok || !rehash {
		t.Fatalf("old-params hash: verify = %v, rehash = %v; want true, true", ok, rehash)
	}

	for _, bad := range []string{
		"", "plaintext", "$argon2i$v=19$m=8192,t=1,p=1$c2FsdHNhbHQ$aGFzaGhhc2hoYXNoaGFzaA",
		"$argon2id$v=19$m=99999999,t=1,p=1$c2FsdHNhbHRzYWx0$aGFzaGhhc2hoYXNoaGFzaA", // absurd memory (DoS)
		"$argon2id$v=19$m=8192,t=1,p=1$!!$aGFzaGhhc2hoYXNoaGFzaA",
		strings.Replace(hash, "v=19", "v=16", 1),
	} {
		if ok, _ := h.Verify("correct horse battery staple", bad); ok {
			t.Fatalf("malformed hash %q verified", bad)
		}
	}
	h.VerifyDummy("anything") // must not panic
}

func TestSafeRedirectPath(t *testing.T) {
	tests := []struct {
		in   string
		want string
		ok   bool
	}{
		{"", "/", true},
		{"/", "/", true},
		{"/notes", "/notes", true},
		{"/notes?tab=all#top", "/notes?tab=all#top", true},
		{"https://evil.com", "", false},
		{"//evil.com", "", false},
		{"///evil.com", "", false},
		{"/\\evil.com", "", false},
		{"\\\\evil.com", "", false},
		{"/%2F%2Fevil.com", "", false},
		{"/%5cevil.com", "", false},
		{"evil.com", "", false},
		{"javascript:alert(1)", "", false},
		{"/notes\r\nSet-Cookie: x=1", "", false},
		{"/\tx", "", false},
		{"/" + strings.Repeat("a", auth.MaxRedirectLen), "", false},
	}
	for _, tt := range tests {
		got, ok := auth.SafeRedirectPath(tt.in)
		if got != tt.want || ok != tt.ok {
			t.Errorf("SafeRedirectPath(%q) = %q, %v; want %q, %v", tt.in, got, ok, tt.want, tt.ok)
		}
	}
}

func TestAllowedNativeRedirect(t *testing.T) {
	list := []string{"com.example.app:/oauth", "https://app.example.com/native"}
	cases := []struct {
		in, want string
		ok       bool
	}{
		{"", "com.example.app:/oauth", true},
		{"https://app.example.com/native", "https://app.example.com/native", true},
		{"com.example.app:/oauth/extra", "", false},
		{"com.evil.app:/oauth", "", false},
		{"https://app.example.com/native?x=1", "", false},
	}
	for _, c := range cases {
		got, ok := auth.AllowedNativeRedirect(list, c.in)
		if got != c.want || ok != c.ok {
			t.Errorf("AllowedNativeRedirect(%q) = %q, %v", c.in, got, ok)
		}
	}
	if _, ok := auth.AllowedNativeRedirect(nil, ""); ok {
		t.Fatal("empty allow-list must reject")
	}
}

func TestProxiesResolve(t *testing.T) {
	trusted, err := auth.NewProxies([]string{"10.0.0.0/8", "127.0.0.1"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := auth.NewProxies([]string{"not-an-ip"}); err == nil {
		t.Fatal("bad TRUSTED_PROXIES entry accepted")
	}
	tests := []struct {
		name, remote, xff, proto string
		p                        auth.Proxies
		wantIP, wantScheme       string
	}{
		{name: "no proxies: headers ignored", remote: "203.0.113.9:1234", xff: "1.2.3.4", proto: "https", p: auth.Proxies{}, wantIP: "203.0.113.9", wantScheme: "http"},
		{name: "untrusted peer: headers ignored", remote: "203.0.113.9:1234", xff: "1.2.3.4", proto: "https", p: trusted, wantIP: "203.0.113.9", wantScheme: "http"},
		{name: "trusted peer", remote: "10.1.2.3:1234", xff: "198.51.100.7", proto: "https", p: trusted, wantIP: "198.51.100.7", wantScheme: "https"},
		{name: "spoofed left-most entry ignored", remote: "10.1.2.3:1234", xff: "6.6.6.6, 198.51.100.7, 10.0.0.5", p: trusted, wantIP: "198.51.100.7", wantScheme: "http"},
		{name: "garbage hop stops the walk", remote: "127.0.0.1:1", xff: "198.51.100.7, garbage", p: trusted, wantIP: "127.0.0.1", wantScheme: "http"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := httptest.NewRequest("GET", "/", nil)
			r.RemoteAddr = tt.remote
			if tt.xff != "" {
				r.Header.Set("X-Forwarded-For", tt.xff)
			}
			if tt.proto != "" {
				r.Header.Set("X-Forwarded-Proto", tt.proto)
			}
			m := tt.p.Resolve(r)
			if m.IP != tt.wantIP || m.Scheme != tt.wantScheme {
				t.Fatalf("got ip=%s scheme=%s, want %s %s", m.IP, m.Scheme, tt.wantIP, tt.wantScheme)
			}
		})
	}
}

func TestMaskEmail(t *testing.T) {
	if got := auth.MaskEmail("alice@example.com"); got != "a***@example.com" {
		t.Fatalf("MaskEmail = %q", got)
	}
	if got := auth.MaskEmail("nonsense"); got != "***" {
		t.Fatalf("MaskEmail = %q", got)
	}
}

func TestFastHasherIsArgon2id(t *testing.T) {
	h, err := authtest.FastHasher().Hash("x")
	if err != nil || !strings.HasPrefix(h, "$argon2id$") {
		t.Fatalf("hash = %q, %v", h, err)
	}
}

func TestS256ChallengeRFC7636Vector(t *testing.T) {
	// RFC 7636 appendix B.
	if got := auth.S256Challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"); got != "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM" {
		t.Fatalf("S256Challenge = %s", got)
	}
}
