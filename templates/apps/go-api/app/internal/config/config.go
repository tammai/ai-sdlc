// Package config reads process configuration from the environment (see .env.example) and refuses
// insecure settings when APP_ENV=production.
package config

import (
	"errors"
	"fmt"
	"net"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"__GO_MODULE__/internal/auth"
)

// Magic-link modes (MAGIC_LINK).
const (
	MagicLinkOff  = "off"
	MagicLinkLog  = "log"  // print links to the log (local development only)
	MagicLinkSMTP = "smtp" // send through SMTP_* (STARTTLS)
)

// SMTP is the SMTP relay for MAGIC_LINK=smtp.
type SMTP struct {
	Host     string
	Port     int
	Username string
	Password string
	From     string
}

// Config is the server configuration.
type Config struct {
	Port          string // PORT (default 8080)
	DatabaseURL   string // DATABASE_URL (required)
	RunMigrations bool   // RUN_MIGRATIONS=true applies the embedded goose migrations on start
	Production    bool   // APP_ENV=production: insecure settings are refused

	AppURL              string   // APP_URL: web origin (the SPA, which proxies /api/* to this API)
	APIPublicURL        string   // API_PUBLIC_URL: API base for native clients (default ${APP_URL}/api)
	OIDCWebCallbackBase string   // OIDC_WEB_CALLBACK_BASE: API base as the browser sees it (default ${APP_URL}/api)
	AllowedOrigins      []string // ALLOWED_ORIGINS: CSRF origin allow-list (default APP_URL)
	TrustedProxies      []string // TRUSTED_PROXIES: CIDRs whose X-Forwarded-* headers are believed
	AuthErrorPath       string   // AUTH_ERROR_PATH: app path for failed web OIDC sign-ins (default /login)
	NativeRedirectURIs  []string // NATIVE_REDIRECT_URIS: exact allow-list (custom scheme or https)

	CookieName   string // COOKIE_NAME (default session)
	CookieSecure bool   // COOKIE_SECURE (default true; false only for local http)

	SessionTTL         time.Duration // SESSION_TTL (default 168h, sliding)
	SessionAbsoluteTTL time.Duration // SESSION_ABSOLUTE_TTL (default 720h)
	AccessTTL          time.Duration // ACCESS_TOKEN_TTL (default 15m)
	RefreshTTL         time.Duration // REFRESH_TOKEN_TTL (default 720h, slides on rotation)
	RefreshAbsoluteTTL time.Duration // REFRESH_ABSOLUTE_TTL (default 2160h = 90 days; then sign in again)

	PasswordEnabled  bool   // AUTH_PASSWORD (default true)
	RegistrationOpen bool   // AUTH_REGISTRATION=open|closed (default open)
	MagicLink        string // MAGIC_LINK=off|log|smtp (default off)
	SMTP             SMTP   // SMTP_HOST, SMTP_PORT (587), SMTP_USER, SMTP_PASS, SMTP_FROM

	Providers []auth.ProviderConfig // OIDC_PROVIDERS + OIDC_<ID>_{ISSUER,CLIENT_ID,CLIENT_SECRET,NAME,SCOPES,TRUST_EMAIL}
}

// FromEnv loads configuration from the process environment.
func FromEnv() (Config, error) { return Load(os.Getenv) }

var (
	providerIDRe = regexp.MustCompile(`^[a-z0-9-]{1,32}$`)
	cookieNameRe = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)
)

// Load reads configuration through getenv and validates it.
func Load(getenv func(string) string) (Config, error) {
	var errs []error
	get := func(k, def string) string {
		if v := strings.TrimSpace(getenv(k)); v != "" {
			return v
		}
		return def
	}
	boolean := func(k string, def bool) bool {
		v := get(k, "")
		if v == "" {
			return def
		}
		b, err := strconv.ParseBool(v)
		if err != nil {
			errs = append(errs, fmt.Errorf("%s must be true or false", k))
		}
		return b
	}
	duration := func(k string, def time.Duration) time.Duration {
		v := get(k, "")
		if v == "" {
			return def
		}
		d, err := time.ParseDuration(v)
		if err != nil || d <= 0 {
			errs = append(errs, fmt.Errorf("%s must be a positive duration like 15m or 720h", k))
		}
		return d
	}

	c := Config{
		Port:               get("PORT", "8080"),
		DatabaseURL:        get("DATABASE_URL", ""),
		RunMigrations:      boolean("RUN_MIGRATIONS", false),
		Production:         get("APP_ENV", "") == "production",
		TrustedProxies:     list(get("TRUSTED_PROXIES", "")),
		AuthErrorPath:      get("AUTH_ERROR_PATH", "/login"),
		NativeRedirectURIs: list(get("NATIVE_REDIRECT_URIS", "")),
		CookieName:         get("COOKIE_NAME", "session"),
		CookieSecure:       boolean("COOKIE_SECURE", true),
		SessionTTL:         duration("SESSION_TTL", 7*24*time.Hour),
		SessionAbsoluteTTL: duration("SESSION_ABSOLUTE_TTL", 30*24*time.Hour),
		AccessTTL:          duration("ACCESS_TOKEN_TTL", 15*time.Minute),
		RefreshTTL:         duration("REFRESH_TOKEN_TTL", 30*24*time.Hour),
		RefreshAbsoluteTTL: duration("REFRESH_ABSOLUTE_TTL", 90*24*time.Hour),
		PasswordEnabled:    boolean("AUTH_PASSWORD", true),
		MagicLink:          strings.ToLower(get("MAGIC_LINK", MagicLinkOff)),
	}

	appURLSet := get("APP_URL", "") != ""
	c.AppURL = strings.TrimRight(get("APP_URL", "http://localhost:3000"), "/")
	c.APIPublicURL = strings.TrimRight(get("API_PUBLIC_URL", c.AppURL+"/api"), "/")
	c.OIDCWebCallbackBase = strings.TrimRight(get("OIDC_WEB_CALLBACK_BASE", c.AppURL+"/api"), "/")
	c.AllowedOrigins = list(get("ALLOWED_ORIGINS", c.AppURL))

	if c.DatabaseURL == "" {
		errs = append(errs, errors.New("DATABASE_URL is required"))
	}
	switch reg := strings.ToLower(get("AUTH_REGISTRATION", "open")); reg {
	case "open":
		c.RegistrationOpen = true
	case "closed":
	default:
		errs = append(errs, errors.New("AUTH_REGISTRATION must be open or closed"))
	}
	if !cookieNameRe.MatchString(c.CookieName) {
		errs = append(errs, errors.New("COOKIE_NAME may only contain letters, digits, '-' and '_'"))
	}
	if c.SessionAbsoluteTTL < c.SessionTTL {
		errs = append(errs, errors.New("SESSION_ABSOLUTE_TTL must be >= SESSION_TTL"))
	}
	if c.RefreshAbsoluteTTL < c.RefreshTTL {
		errs = append(errs, errors.New("REFRESH_ABSOLUTE_TTL must be >= REFRESH_TOKEN_TTL"))
	}
	if _, ok := auth.SafeRedirectPath(c.AuthErrorPath); !ok || strings.Contains(c.AuthErrorPath, "?") {
		errs = append(errs, errors.New("AUTH_ERROR_PATH must be an app-relative path like /login"))
	}
	if _, err := auth.NewProxies(c.TrustedProxies); err != nil {
		errs = append(errs, fmt.Errorf("TRUSTED_PROXIES: %w", err))
	}

	// URLs: absolute http(s); https in production.
	checkURL := func(k, v string, originOnly bool) {
		u, err := url.Parse(v)
		switch {
		case err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "":
			errs = append(errs, fmt.Errorf("%s must be an absolute http(s) URL without query or fragment, got %q", k, v))
		case originOnly && u.Path != "":
			errs = append(errs, fmt.Errorf("%s must be an origin (scheme://host[:port]) without a path, got %q", k, v))
		case c.Production && u.Scheme != "https":
			errs = append(errs, fmt.Errorf("%s must use https when APP_ENV=production", k))
		}
	}
	checkURL("APP_URL", c.AppURL, true)
	checkURL("API_PUBLIC_URL", c.APIPublicURL, false)
	checkURL("OIDC_WEB_CALLBACK_BASE", c.OIDCWebCallbackBase, false)
	for _, o := range c.AllowedOrigins {
		checkURL("ALLOWED_ORIGINS", strings.TrimRight(o, "/"), true)
	}
	for _, r := range c.NativeRedirectURIs {
		u, err := url.Parse(r)
		switch {
		case err != nil || u.Scheme == "" || u.Fragment != "" || u.RawQuery != "":
			errs = append(errs, fmt.Errorf("NATIVE_REDIRECT_URIS entry %q must be an absolute URI without query or fragment", r))
		case u.Scheme == "javascript" || u.Scheme == "data" || u.Scheme == "file":
			errs = append(errs, fmt.Errorf("NATIVE_REDIRECT_URIS entry %q has a forbidden scheme", r))
		case u.Scheme == "http" && c.Production && !isLoopback(u.Hostname()):
			errs = append(errs, fmt.Errorf("NATIVE_REDIRECT_URIS entry %q: http is only allowed for loopback in production", r))
		}
	}

	switch c.MagicLink {
	case MagicLinkOff, MagicLinkLog:
	case MagicLinkSMTP:
		c.SMTP = SMTP{Host: get("SMTP_HOST", ""), Username: get("SMTP_USER", ""), Password: getenv("SMTP_PASS"), From: get("SMTP_FROM", "")}
		port, err := strconv.Atoi(get("SMTP_PORT", "587"))
		if err != nil || port < 1 || port > 65535 {
			errs = append(errs, errors.New("SMTP_PORT must be a port number"))
		}
		c.SMTP.Port = port
		if c.SMTP.Host == "" || c.SMTP.From == "" {
			errs = append(errs, errors.New("MAGIC_LINK=smtp needs SMTP_HOST and SMTP_FROM"))
		}
	default:
		errs = append(errs, errors.New("MAGIC_LINK must be off, log or smtp"))
	}

	for _, id := range list(get("OIDC_PROVIDERS", "")) {
		if !providerIDRe.MatchString(id) {
			errs = append(errs, fmt.Errorf("OIDC_PROVIDERS: id %q must match [a-z0-9-]{1,32}", id))
			continue
		}
		pfx := "OIDC_" + strings.ToUpper(strings.ReplaceAll(id, "-", "_")) + "_"
		p := auth.ProviderConfig{
			ID: id, Name: get(pfx+"NAME", id), Issuer: get(pfx+"ISSUER", ""),
			ClientID: get(pfx+"CLIENT_ID", ""), ClientSecret: getenv(pfx + "CLIENT_SECRET"),
			Scopes: strings.Fields(strings.ReplaceAll(get(pfx+"SCOPES", ""), ",", " ")), TrustEmail: boolean(pfx+"TRUST_EMAIL", false),
		}
		if p.Issuer == "" || p.ClientID == "" {
			errs = append(errs, fmt.Errorf("OIDC provider %q needs %sISSUER and %sCLIENT_ID", id, pfx, pfx))
		} else {
			checkURL(pfx+"ISSUER", p.Issuer, false)
		}
		c.Providers = append(c.Providers, p)
	}

	if c.Production {
		if !appURLSet {
			errs = append(errs, errors.New("APP_URL is required when APP_ENV=production"))
		}
		if !c.CookieSecure {
			errs = append(errs, errors.New("COOKIE_SECURE=false is not allowed when APP_ENV=production"))
		}
		if c.MagicLink == MagicLinkLog {
			errs = append(errs, errors.New("MAGIC_LINK=log prints sign-in links to the log and is not allowed when APP_ENV=production"))
		}
	}
	if len(errs) > 0 {
		return Config{}, fmt.Errorf("invalid configuration: %w", errors.Join(errs...))
	}
	return c, nil
}

func list(s string) []string {
	var out []string
	for _, p := range strings.Split(s, ",") {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}

func isLoopback(host string) bool {
	if host == "localhost" {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}
