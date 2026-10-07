package auth

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"
)

// ProviderConfig is one OIDC identity provider (OIDC_PROVIDERS=<id>,... and OIDC_<ID>_* env vars).
type ProviderConfig struct {
	ID           string // [a-z0-9-]{1,32}; appears in the callback URL
	Name         string // button label
	Issuer       string // discovery: <issuer>/.well-known/openid-configuration
	ClientID     string
	ClientSecret string
	Scopes       []string // default: openid email profile
	// TrustEmail treats every email from this IdP as verified even without email_verified=true
	// (only for IdPs that own the email domain, e.g. a company Keycloak/Entra ID).
	TrustEmail bool
}

// provider lazily runs discovery (so a temporarily unreachable IdP does not stop the API booting)
// and caches the result.
type provider struct {
	cfg      ProviderConfig
	mu       sync.Mutex
	endpoint oauth2.Endpoint
	verifier *oidc.IDTokenVerifier
}

func (p *provider) load(ctx context.Context) (*oidc.IDTokenVerifier, oauth2.Endpoint, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.verifier != nil {
		return p.verifier, p.endpoint, nil
	}
	dctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	op, err := oidc.NewProvider(dctx, p.cfg.Issuer) // verifies the discovered issuer matches
	if err != nil {
		return nil, oauth2.Endpoint{}, err
	}
	p.endpoint = op.Endpoint()
	p.verifier = op.Verifier(&oidc.Config{ClientID: p.cfg.ClientID}) // checks iss, aud, exp, signature (JWKS)
	return p.verifier, p.endpoint, nil
}

// OIDCProvider is a configured provider as listed by /v1/auth/providers.
type OIDCProvider struct{ ID, Name string }

// Providers lists configured OIDC providers in configuration order.
func (s *Service) Providers() []OIDCProvider {
	out := make([]OIDCProvider, 0, len(s.order))
	for _, id := range s.order {
		out = append(out, OIDCProvider{ID: id, Name: s.providers[id].cfg.Name})
	}
	return out
}

// OIDCCallbackURL is the redirect_uri registered at the IdP for a client kind:
//
//	web:    ${OIDC_WEB_CALLBACK_BASE}/v1/auth/oidc/<id>/callback  (default ${APP_URL}/api/..., via the edge proxy,
//	        so the session cookie is set first-party on the app origin)
//	native: ${API_PUBLIC_URL}/v1/auth/oidc/<id>/callback
func (s *Service) OIDCCallbackURL(id string, client Client) string {
	base := s.opts.OIDCWebCallbackBase
	if client == ClientNative {
		base = s.opts.APIPublicURL
	}
	return strings.TrimRight(base, "/") + "/v1/auth/oidc/" + id + "/callback"
}

func (s *Service) oauthConfig(p *provider, ep oauth2.Endpoint, client Client) *oauth2.Config {
	scopes := p.cfg.Scopes
	if len(scopes) == 0 {
		scopes = []string{oidc.ScopeOpenID, "email", "profile"}
	}
	return &oauth2.Config{
		ClientID: p.cfg.ClientID, ClientSecret: p.cfg.ClientSecret, Endpoint: ep, Scopes: scopes,
		RedirectURL: s.OIDCCallbackURL(p.cfg.ID, client),
	}
}

func (s *Service) idpContext(ctx context.Context) context.Context {
	return oidc.ClientContext(context.WithValue(ctx, oauth2.HTTPClient, s.http), s.http)
}

// OIDCStart is the result of StartOIDC: where to send the browser and the state value to bind to
// the browser in a short-lived cookie.
type OIDCStart struct {
	AuthURL string
	State   string
}

// StartOIDC begins an authorization-code + PKCE (S256) flow with state and nonce.
// web: redirect is an app-relative path (validated, open-redirect safe; default "/").
// native: redirect must exactly match NATIVE_REDIRECT_URIS (default: the first entry), and the app
// must send its own PKCE challenge (codeChallenge + codeChallengeMethod=S256, RFC 8252); it is bound
// to the one-time code and checked against codeVerifier at /v1/auth/token. A bad challenge goes back
// to the (allow-listed) app URI as error=invalid_request (an *OIDCError).
func (s *Service) StartOIDC(ctx context.Context, providerID string, client Client, redirect, codeChallenge, challengeMethod string) (OIDCStart, error) {
	p, ok := s.providers[providerID]
	if !ok {
		return OIDCStart{}, ErrUnknownProvider
	}
	switch client {
	case "", ClientWeb:
		client = ClientWeb
		path, ok := SafeRedirectPath(redirect)
		if !ok {
			return OIDCStart{}, &ValidationError{Detail: "redirect must be an app-relative path starting with /"}
		}
		redirect = path
	case ClientNative:
		uri, ok := AllowedNativeRedirect(s.opts.NativeRedirectURIs, redirect)
		if !ok {
			return OIDCStart{}, &ValidationError{Detail: "redirect is not an allowed native redirect URI"}
		}
		redirect = uri
		if challengeMethod != "S256" || !validPKCE(codeChallenge) {
			s.audit(ctx, slog.LevelWarn, "auth.pkce", "outcome", "failure", "reason", "bad_challenge", "provider", providerID)
			return OIDCStart{}, &OIDCError{Code: "invalid_request", Client: ClientNative, Redirect: uri,
				Err: errors.New("native sign-in requires codeChallenge (43-128 chars) with codeChallengeMethod=S256")}
		}
	default:
		return OIDCStart{}, &ValidationError{Detail: "client must be web or native"}
	}
	if err := s.limit(ctx, "oidc", ""); err != nil {
		return OIDCStart{}, err
	}
	ictx := s.idpContext(ctx)
	_, ep, err := p.load(ictx)
	if err != nil {
		s.log.ErrorContext(ctx, "oidc discovery failed", "provider", providerID, "error", err)
		return OIDCStart{}, ErrIdentityProvider
	}
	state, nonce, verifier := NewToken(), NewToken(), oauth2.GenerateVerifier()
	if err := s.store.CreateOIDCState(ctx, OIDCState{
		StateHash: HashToken(state), Provider: providerID, CodeVerifier: verifier, Nonce: nonce,
		Client: client, Redirect: redirect, ClientChallenge: nativeOnly(client, codeChallenge), ExpiresAt: s.now().Add(OIDCStateTTL),
	}); err != nil {
		return OIDCStart{}, fmt.Errorf("store oidc state: %w", err)
	}
	authURL := s.oauthConfig(p, ep, client).AuthCodeURL(state, oauth2.S256ChallengeOption(verifier), oidc.Nonce(nonce))
	return OIDCStart{AuthURL: authURL, State: state}, nil
}

func nativeOnly(client Client, challenge string) string {
	if client == ClientNative {
		return challenge
	}
	return ""
}

// OIDCError is a failed start or callback: the handler sends the user back to the app instead of showing JSON.
//
//	web:    ${APP_URL}${AUTH_ERROR_PATH}?error=<Code>   (default /login)
//	native: <allow-listed redirect>?error=<OAuth code>  (see NativeErrorCode)
//
// A missing/unknown state has no trustworthy native redirect, so it always lands on the web page.
type OIDCError struct {
	Code     string // invalid_state | invalid_request | access_denied | server_error | email_not_verified | registration_closed | no_email
	Client   Client
	Redirect string
	Err      error
}

// NativeErrorCode maps a failure to the OAuth 2.0 error code the native redirect carries.
func NativeErrorCode(code string) string {
	switch code {
	case "invalid_state", "invalid_request":
		return "invalid_request"
	case "server_error":
		return "server_error"
	default: // the user or a sign-in policy said no
		return "access_denied"
	}
}

func (e *OIDCError) Error() string { return "oidc: " + e.Code + ": " + fmt.Sprint(e.Err) }
func (e *OIDCError) Unwrap() error { return e.Err }

// ErrOIDCState is a missing, unknown, expired, reused or browser-mismatched state.
var ErrOIDCState = errors.New("invalid or expired sign-in state")

// OIDCResult is a successful callback.
type OIDCResult struct {
	User            User
	Client          Client
	Redirect        string
	ClientChallenge string // native: the app's PKCE challenge, bound to the one-time code
}

// FinishOIDC validates the callback: state (single use, bound to the browser via bindingCookie),
// code exchange with the PKCE verifier, ID token signature/issuer/audience/expiry, and nonce.
// Then it signs the user in (see SignInExternal).
func (s *Service) FinishOIDC(ctx context.Context, providerID, code, state, idpError, bindingCookie string) (OIDCResult, error) {
	p, ok := s.providers[providerID]
	if !ok {
		return OIDCResult{}, ErrUnknownProvider
	}
	badState := func(reason string) (OIDCResult, error) {
		s.audit(ctx, slog.LevelWarn, "auth.signin", "method", "oidc", "provider", providerID, "outcome", "failure", "reason", reason)
		return OIDCResult{}, &OIDCError{Code: "invalid_state", Client: ClientWeb, Err: ErrOIDCState}
	}
	if !validToken(state) {
		return badState("malformed_state")
	}
	// Consumed before the browser-binding check: a state is single use whatever happens next.
	st, err := s.store.ConsumeOIDCState(ctx, HashToken(state), s.now())
	if errors.Is(err, ErrNotFound) || (err == nil && st.Provider != providerID) {
		return badState("unknown_state")
	}
	if err != nil {
		return OIDCResult{}, fmt.Errorf("consume oidc state: %w", err)
	}
	fail := func(code string, err error) (OIDCResult, error) {
		s.audit(ctx, slog.LevelInfo, "auth.signin", "method", "oidc", "provider", providerID, "outcome", "failure", "reason", code)
		return OIDCResult{}, &OIDCError{Code: code, Client: st.Client, Redirect: st.Redirect, Err: err}
	}
	// The state must come back to the browser that started the flow (login-CSRF defense): an
	// attacker's callback URL opened in the victim's browser lacks the binding cookie.
	if !EqualHash(HashToken(state), HashToken(bindingCookie)) {
		return fail("invalid_state", ErrOIDCState)
	}
	if idpError != "" || code == "" {
		reason := "access_denied"
		if idpError != "" && idpError != "access_denied" {
			reason = "server_error"
		}
		return fail(reason, fmt.Errorf("idp returned error %q", truncate(idpError, 64)))
	}
	ictx := s.idpContext(ctx)
	verifier, ep, err := p.load(ictx)
	if err != nil {
		return fail("server_error", err)
	}
	tok, err := s.oauthConfig(p, ep, st.Client).Exchange(ictx, code, oauth2.VerifierOption(st.CodeVerifier))
	if err != nil {
		return fail("server_error", fmt.Errorf("code exchange: %w", err))
	}
	rawID, _ := tok.Extra("id_token").(string)
	if rawID == "" {
		return fail("server_error", errors.New("no id_token in token response"))
	}
	idt, err := verifier.Verify(ictx, rawID)
	if err != nil {
		return fail("server_error", fmt.Errorf("verify id_token: %w", err))
	}
	if !EqualHash(HashToken(idt.Nonce), HashToken(st.Nonce)) {
		return fail("server_error", errors.New("id_token nonce mismatch"))
	}
	var claims struct {
		Email         string `json:"email"`
		EmailVerified any    `json:"email_verified"` // bool, or "true" from some IdPs
		Name          string `json:"name"`
	}
	if err := idt.Claims(&claims); err != nil {
		return fail("server_error", fmt.Errorf("id_token claims: %w", err))
	}
	verified := p.cfg.TrustEmail || claims.EmailVerified == true || claims.EmailVerified == "true"
	u, err := s.SignInExternal(ctx, providerID, ExternalIdentity{Subject: idt.Subject, Email: claims.Email, EmailVerified: verified, Name: claims.Name})
	if err != nil {
		var code string
		switch {
		case errors.Is(err, errEmailNotVerified):
			code = "email_not_verified"
		case errors.Is(err, errNoEmail):
			code = "no_email"
		case errors.Is(err, ErrRegistrationClosed):
			code = "registration_closed"
		default:
			return OIDCResult{}, err
		}
		return fail(code, err)
	}
	return OIDCResult{User: u, Client: st.Client, Redirect: st.Redirect, ClientChallenge: st.ClientChallenge}, nil
}

// ExternalIdentity is what an IdP asserted about the user.
type ExternalIdentity struct {
	Subject       string
	Email         string
	EmailVerified bool
	Name          string
}

var (
	errEmailNotVerified = errors.New("the identity provider did not verify this email")
	errNoEmail          = errors.New("the identity provider did not return an email")
)

// SignInExternal resolves an IdP identity to a user:
//   - known (provider, subject): that user.
//   - else the email must be verified by the IdP (or TrustEmail): an existing account with that
//     email is linked (and proveEmail applies); otherwise a new account is created if registration
//     is open. Unverified emails never link to, or create, an account.
func (s *Service) SignInExternal(ctx context.Context, providerID string, id ExternalIdentity) (User, error) {
	if id.Subject == "" || len(id.Subject) > 255 {
		return User{}, errors.New("invalid subject")
	}
	var u User
	err := s.store.InTx(ctx, func(st Store) error {
		uid, err := st.IdentityUserID(ctx, providerID, id.Subject)
		if err == nil {
			u, err = st.UserByID(ctx, uid)
			return err
		}
		if !errors.Is(err, ErrNotFound) {
			return err
		}
		if id.Email == "" {
			return errNoEmail
		}
		email, err := NormalizeEmail(id.Email)
		if err != nil {
			return errNoEmail
		}
		if !id.EmailVerified {
			return errEmailNotVerified
		}
		u, err = st.UserByEmail(ctx, email)
		switch {
		case err == nil:
			if u, err = s.proveEmail(ctx, st, u); err != nil {
				return err
			}
		case errors.Is(err, ErrNotFound):
			if !s.opts.RegistrationOpen {
				return ErrRegistrationClosed
			}
			now := s.now()
			name := id.Name
			if len([]rune(name)) > 200 {
				name = string([]rune(name)[:200])
			}
			if u, err = st.CreateUser(ctx, email, name, nil, &now); err != nil {
				return err
			}
			s.audit(ctx, slog.LevelInfo, "auth.register", "method", "oidc", "provider", providerID, "outcome", "success", "user_id", u.ID)
		default:
			return err
		}
		if err := st.CreateIdentity(ctx, providerID, id.Subject, u.ID); err != nil {
			return err
		}
		s.audit(ctx, slog.LevelInfo, "auth.identity_linked", "provider", providerID, "user_id", u.ID)
		return nil
	})
	if err != nil {
		return User{}, err
	}
	s.audit(ctx, slog.LevelInfo, "auth.signin", "method", "oidc", "provider", providerID, "outcome", "success", "user_id", u.ID)
	return u, nil
}

// OIDCErrorRedirect is where a failed flow sends the user back to.
func (s *Service) OIDCErrorRedirect(e *OIDCError) string {
	if e.Client == ClientNative && e.Redirect != "" {
		return withQuery(e.Redirect, "error", NativeErrorCode(e.Code))
	}
	return withQuery(strings.TrimRight(s.opts.AppURL, "/")+s.opts.AuthErrorPath, "error", e.Code)
}

// NativeCodeRedirect is the custom-scheme redirect carrying the one-time code.
func NativeCodeRedirect(redirect, code string) string { return withQuery(redirect, "code", code) }

// WebLanding is the absolute app URL for a validated app-relative path.
func (s *Service) WebLanding(path string) string {
	if p, ok := SafeRedirectPath(path); ok {
		return strings.TrimRight(s.opts.AppURL, "/") + p
	}
	return strings.TrimRight(s.opts.AppURL, "/") + "/"
}
