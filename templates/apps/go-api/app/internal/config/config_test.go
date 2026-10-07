package config_test

import (
	"strings"
	"testing"
	"time"

	"__GO_MODULE__/internal/config"
)

func env(kv map[string]string) func(string) string {
	return func(k string) string { return kv[k] }
}

func base(extra map[string]string) map[string]string {
	m := map[string]string{"DATABASE_URL": "postgres://u:p@localhost:5432/db"}
	for k, v := range extra {
		m[k] = v
	}
	return m
}

func prod(extra map[string]string) map[string]string {
	m := base(map[string]string{"APP_ENV": "production", "APP_URL": "https://app.example.com"})
	for k, v := range extra {
		m[k] = v
	}
	return m
}

func TestDefaults(t *testing.T) {
	c, err := config.Load(env(base(nil)))
	if err != nil {
		t.Fatal(err)
	}
	if c.AppURL != "http://localhost:3000" || c.APIPublicURL != "http://localhost:3000/api" || c.OIDCWebCallbackBase != "http://localhost:3000/api" {
		t.Fatalf("urls = %s %s %s", c.AppURL, c.APIPublicURL, c.OIDCWebCallbackBase)
	}
	if !c.CookieSecure || c.CookieName != "session" || !c.PasswordEnabled || !c.RegistrationOpen || c.MagicLink != config.MagicLinkOff {
		t.Fatalf("defaults = %+v", c)
	}
	if c.AccessTTL != 15*time.Minute || c.RefreshTTL != 720*time.Hour || c.RefreshAbsoluteTTL != 2160*time.Hour || len(c.AllowedOrigins) != 1 || c.AllowedOrigins[0] != c.AppURL {
		t.Fatalf("defaults = %+v", c)
	}
}

func TestOIDCProviders(t *testing.T) {
	c, err := config.Load(env(base(map[string]string{
		"OIDC_PROVIDERS":            "google, corp-sso",
		"OIDC_GOOGLE_ISSUER":        "https://accounts.google.com",
		"OIDC_GOOGLE_CLIENT_ID":     "gid",
		"OIDC_GOOGLE_CLIENT_SECRET": "gsecret",
		"OIDC_GOOGLE_NAME":          "Google",
		"OIDC_CORP_SSO_ISSUER":      "https://sso.example.com/realms/main",
		"OIDC_CORP_SSO_CLIENT_ID":   "cid",
		"OIDC_CORP_SSO_SCOPES":      "openid,email,profile,groups",
		"OIDC_CORP_SSO_TRUST_EMAIL": "true",
	})))
	if err != nil {
		t.Fatal(err)
	}
	if len(c.Providers) != 2 || c.Providers[0].Name != "Google" || c.Providers[1].Name != "corp-sso" ||
		len(c.Providers[1].Scopes) != 4 || !c.Providers[1].TrustEmail || c.Providers[0].TrustEmail {
		t.Fatalf("providers = %+v", c.Providers)
	}
}

func TestInvalidConfig(t *testing.T) {
	tests := []struct {
		name string
		env  map[string]string
		want string
	}{
		{"missing database", map[string]string{}, "DATABASE_URL"},
		{"bad registration", base(map[string]string{"AUTH_REGISTRATION": "maybe"}), "AUTH_REGISTRATION"},
		{"bad magic link mode", base(map[string]string{"MAGIC_LINK": "carrier-pigeon"}), "MAGIC_LINK"},
		{"smtp without host", base(map[string]string{"MAGIC_LINK": "smtp", "SMTP_FROM": "a@b.c"}), "SMTP_HOST"},
		{"provider without issuer", base(map[string]string{"OIDC_PROVIDERS": "google", "OIDC_GOOGLE_CLIENT_ID": "x"}), "OIDC_GOOGLE_ISSUER"},
		{"bad provider id", base(map[string]string{"OIDC_PROVIDERS": "Google!"}), "OIDC_PROVIDERS"},
		{"app url with path", base(map[string]string{"APP_URL": "https://app.example.com/x"}), "APP_URL"},
		{"bad native redirect", base(map[string]string{"NATIVE_REDIRECT_URIS": "javascript:alert(1)"}), "NATIVE_REDIRECT_URIS"},
		{"bad trusted proxy", base(map[string]string{"TRUSTED_PROXIES": "nope"}), "TRUSTED_PROXIES"},
		{"bad duration", base(map[string]string{"ACCESS_TOKEN_TTL": "soon"}), "ACCESS_TOKEN_TTL"},
		{"refresh cap below refresh ttl", base(map[string]string{"REFRESH_ABSOLUTE_TTL": "24h"}), "REFRESH_ABSOLUTE_TTL"},
		{"bad error path", base(map[string]string{"AUTH_ERROR_PATH": "https://evil.test"}), "AUTH_ERROR_PATH"},
		{"bad cookie name", base(map[string]string{"COOKIE_NAME": "a b"}), "COOKIE_NAME"},
		// APP_ENV=production refuses insecure settings.
		{"prod without APP_URL", base(map[string]string{"APP_ENV": "production"}), "APP_URL is required"},
		{"prod insecure cookie", prod(map[string]string{"COOKIE_SECURE": "false"}), "COOKIE_SECURE=false"},
		{"prod http app url", prod(map[string]string{"APP_URL": "http://app.example.com"}), "https"},
		{"prod log mailer", prod(map[string]string{"MAGIC_LINK": "log"}), "MAGIC_LINK=log"},
		{"prod smtp without host", prod(map[string]string{"MAGIC_LINK": "smtp"}), "SMTP_HOST"},
		{"prod http issuer", prod(map[string]string{"OIDC_PROVIDERS": "kc", "OIDC_KC_ISSUER": "http://kc.internal", "OIDC_KC_CLIENT_ID": "x"}), "OIDC_KC_ISSUER"},
		{"prod http native redirect", prod(map[string]string{"NATIVE_REDIRECT_URIS": "http://evil.example/cb"}), "NATIVE_REDIRECT_URIS"},
		{"prod http allowed origin", prod(map[string]string{"ALLOWED_ORIGINS": "http://app.example.com"}), "ALLOWED_ORIGINS"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := config.Load(env(tt.env))
			if err == nil || !strings.Contains(err.Error(), tt.want) {
				t.Fatalf("err = %v, want mention of %q", err, tt.want)
			}
		})
	}
}

func TestProductionAcceptsSecureConfig(t *testing.T) {
	_, err := config.Load(env(prod(map[string]string{
		"MAGIC_LINK": "smtp", "SMTP_HOST": "smtp.example.com", "SMTP_FROM": "Notes <no-reply@example.com>",
		"NATIVE_REDIRECT_URIS": "com.example.app:/oauth,https://app.example.com/native",
		"OIDC_PROVIDERS":       "google", "OIDC_GOOGLE_ISSUER": "https://accounts.google.com", "OIDC_GOOGLE_CLIENT_ID": "x",
		"TRUSTED_PROXIES": "10.0.0.0/8",
	})))
	if err != nil {
		t.Fatal(err)
	}
}
