// Package auth is the authentication slice: local accounts (argon2id), web sessions (cookie),
// native token pairs (opaque bearer + rotating refresh), magic links and OIDC sign-in.
//
// Every secret (session, access, refresh, magic-link, state, one-time code) is an opaque 256-bit
// random token that is stored only as a SHA-256 hash. Never log tokens, passwords or full emails:
// use MaskEmail in audit lines.
package auth

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/mail"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
)

// Domain errors; the handler maps them to problem+json.
var (
	ErrDisabled           = errors.New("sign-in method is disabled")                     // 404
	ErrRegistrationClosed = errors.New("self-registration is closed")                    // 403
	ErrInvalidCredentials = errors.New("invalid email or password")                      // 401
	ErrInvalidGrant       = errors.New("invalid, expired or already used token or code") // 401
	ErrUnauthenticated    = errors.New("not authenticated")                              // 401
	ErrEmailTaken         = errors.New("an account with this email already exists")      // 409
	ErrRateLimited        = errors.New("too many attempts, try again later")             // 429 (see RateLimitError)
	ErrUnknownProvider    = errors.New("unknown identity provider")                      // 404
	ErrIdentityProvider   = errors.New("identity provider unavailable")                  // 502
)

// RateLimitError is ErrRateLimited plus how long until the bucket has a token again (Retry-After).
type RateLimitError struct{ RetryAfter time.Duration }

func (e *RateLimitError) Error() string        { return ErrRateLimited.Error() }
func (e *RateLimitError) Is(target error) bool { return target == ErrRateLimited }

// ValidationError is a 422: the request is well-formed but breaks a rule.
type ValidationError struct{ Detail string }

func (e *ValidationError) Error() string { return e.Detail }

// Fixed lifetimes of the single-use artifacts.
const (
	MagicLinkTTL = 15 * time.Minute
	AuthCodeTTL  = 60 * time.Second
	OIDCStateTTL = 10 * time.Minute
	touchEvery   = time.Minute // minimum interval between last_used_at writes
)

// Options configures the service (see internal/config and .env.example).
type Options struct {
	AppURL              string   // web origin, e.g. https://app.example.com
	APIPublicURL        string   // API base as native clients reach it (native OIDC callback base)
	OIDCWebCallbackBase string   // API base as the browser reaches it, e.g. https://app.example.com/api
	AuthErrorPath       string   // app path the web OIDC flow lands on after a failure (?error=<code>)
	NativeRedirectURIs  []string // exact allow-list for native OIDC redirects; the first also builds native magic links

	CookieName   string
	CookieSecure bool

	SessionTTL         time.Duration // web: idle (sliding) lifetime
	SessionAbsoluteTTL time.Duration // web: hard cap from creation
	AccessTTL          time.Duration // native access token
	RefreshTTL         time.Duration // native refresh token (slides on rotation)
	RefreshAbsoluteTTL time.Duration // native: hard cap from sign-in; then the user signs in again (0: 90 days)

	PasswordEnabled  bool
	RegistrationOpen bool
	Mailer           Mailer // nil disables magic links
	Providers        []ProviderConfig

	Hasher *PasswordHasher // nil: DefaultArgon2Params
	// Rate limits; nil uses the defaults (per IP: 20 burst, 1 per 3s; per email: 5 burst, 1 per 30s).
	IPLimiter    *RateLimiter
	EmailLimiter *RateLimiter
	HTTPClient   *http.Client     // for OIDC; nil: 10s timeout client
	Now          func() time.Time // nil: time.Now
	// Dispatch runs background work (sending email) so responses do not reveal whether an account
	// exists through timing. nil: a goroutine. Tests pass a synchronous func.
	Dispatch func(func())
}

// Service holds the auth business rules.
type Service struct {
	opts      Options
	store     Store
	hasher    *PasswordHasher
	log       *slog.Logger
	now       func() time.Time
	ipLim     *RateLimiter
	emailLim  *RateLimiter
	providers map[string]*provider
	order     []string
	http      *http.Client
}

// NewService builds a Service. A nil logger discards audit lines.
func NewService(store Store, opts Options, log *slog.Logger) (*Service, error) {
	if log == nil {
		log = slog.New(slog.DiscardHandler)
	}
	s := &Service{opts: opts, store: store, log: log, now: opts.Now, hasher: opts.Hasher, ipLim: opts.IPLimiter, emailLim: opts.EmailLimiter, http: opts.HTTPClient}
	if s.now == nil {
		s.now = time.Now
	}
	if s.hasher == nil {
		s.hasher = NewPasswordHasher(DefaultArgon2Params, 0)
	}
	if s.ipLim == nil {
		s.ipLim = NewRateLimiter(20, 3*time.Second)
	}
	if s.emailLim == nil {
		s.emailLim = NewRateLimiter(5, 30*time.Second)
	}
	if s.http == nil {
		s.http = &http.Client{Timeout: 10 * time.Second}
	}
	if s.opts.Dispatch == nil {
		s.opts.Dispatch = func(f func()) { go f() }
	}
	if s.opts.RefreshAbsoluteTTL <= 0 {
		s.opts.RefreshAbsoluteTTL = 90 * 24 * time.Hour
	}
	if s.opts.CookieName == "" {
		s.opts.CookieName = "session"
	}
	s.providers = map[string]*provider{}
	for _, pc := range opts.Providers {
		if _, dup := s.providers[pc.ID]; dup {
			return nil, fmt.Errorf("duplicate OIDC provider %q", pc.ID)
		}
		s.providers[pc.ID] = &provider{cfg: pc}
		s.order = append(s.order, pc.ID)
	}
	return s, nil
}

// Tokens is a native token pair.
type Tokens struct {
	AccessToken  string
	RefreshToken string
	ExpiresIn    int // seconds
	User         User
}

// ---- local accounts -------------------------------------------------------------------------

// NormalizeEmail trims and lower-cases an address and checks it is a bare addr-spec.
func NormalizeEmail(s string) (string, error) {
	s = strings.ToLower(strings.TrimSpace(s))
	if len(s) < 3 || len(s) > 254 {
		return "", &ValidationError{Detail: "email is invalid"}
	}
	a, err := mail.ParseAddress(s)
	if err != nil || a.Address != s || a.Name != "" || !strings.Contains(s, "@") {
		return "", &ValidationError{Detail: "email is invalid"}
	}
	return s, nil
}

// MaskEmail keeps logs useful without storing the address: "alice@example.com" -> "a***@example.com".
func MaskEmail(email string) string {
	local, domain, ok := strings.Cut(email, "@")
	if !ok || local == "" {
		return "***"
	}
	r, _ := utf8.DecodeRuneInString(local)
	return string(r) + "***@" + domain
}

func validatePassword(p string) error {
	if len(p) > MaxPasswordLen {
		return &ValidationError{Detail: fmt.Sprintf("password must be at most %d bytes", MaxPasswordLen)}
	}
	if utf8.RuneCountInString(p) < MinPasswordLen {
		return &ValidationError{Detail: fmt.Sprintf("password must be at least %d characters", MinPasswordLen)}
	}
	return nil
}

func (s *Service) limit(ctx context.Context, scope, email string) error {
	if ok, wait := s.ipLim.Take(scope + ":ip:" + Meta(ctx).IP); !ok {
		s.audit(ctx, slog.LevelWarn, "auth.rate_limited", "scope", scope, "by", "ip")
		return &RateLimitError{RetryAfter: wait}
	}
	if email != "" {
		if ok, wait := s.emailLim.Take(scope + ":email:" + email); !ok {
			s.audit(ctx, slog.LevelWarn, "auth.rate_limited", "scope", scope, "by", "email", "email", MaskEmail(email))
			return &RateLimitError{RetryAfter: wait}
		}
	}
	return nil
}

// Register creates a local account (email unverified). The caller then starts a web session.
func (s *Service) Register(ctx context.Context, email, password, name string) (User, error) {
	if !s.opts.PasswordEnabled {
		return User{}, ErrDisabled
	}
	if !s.opts.RegistrationOpen {
		// TODO(auth): with AUTH_REGISTRATION=closed, accounts can only come from an invite or admin
		// flow, which this template does not include. Add an admin-only endpoint (contract first) that
		// creates the user and emails a magic link, or seed users with a migration/CLI.
		return User{}, ErrRegistrationClosed
	}
	email, err := NormalizeEmail(email)
	if err != nil {
		return User{}, err
	}
	if err := s.limit(ctx, "register", email); err != nil {
		return User{}, err
	}
	if err := validatePassword(password); err != nil {
		return User{}, err
	}
	name = strings.TrimSpace(name)
	if utf8.RuneCountInString(name) > 200 {
		return User{}, &ValidationError{Detail: "name must be at most 200 characters"}
	}
	hash, err := s.hasher.Hash(password)
	if err != nil {
		return User{}, err
	}
	u, err := s.store.CreateUser(ctx, email, name, &hash, nil)
	if errors.Is(err, ErrConflict) {
		s.audit(ctx, slog.LevelInfo, "auth.register", "outcome", "failure", "reason", "email_taken", "email", MaskEmail(email))
		return User{}, ErrEmailTaken
	}
	if err != nil {
		return User{}, fmt.Errorf("create user: %w", err)
	}
	s.audit(ctx, slog.LevelInfo, "auth.register", "outcome", "success", "user_id", u.ID)
	return u, nil
}

// PasswordSignIn checks email + password. Every failure is ErrInvalidCredentials (no enumeration),
// and unknown accounts still pay for one argon2id verification (timing).
func (s *Service) PasswordSignIn(ctx context.Context, email, password string) (User, error) {
	if !s.opts.PasswordEnabled {
		return User{}, ErrDisabled
	}
	norm, normErr := NormalizeEmail(email)
	if err := s.limit(ctx, "signin", norm); err != nil {
		return User{}, err
	}
	fail := func(reason string) (User, error) {
		s.audit(ctx, slog.LevelInfo, "auth.signin", "method", "password", "outcome", "failure", "reason", reason, "email", MaskEmail(norm))
		return User{}, ErrInvalidCredentials
	}
	if normErr != nil || len(password) > MaxPasswordLen {
		s.hasher.VerifyDummy(password[:min(len(password), MaxPasswordLen)])
		return fail("malformed")
	}
	u, err := s.store.UserByEmail(ctx, norm)
	switch {
	case errors.Is(err, ErrNotFound):
		s.hasher.VerifyDummy(password)
		return fail("unknown_account")
	case err != nil:
		return User{}, fmt.Errorf("load user: %w", err)
	case u.PasswordHash == nil:
		s.hasher.VerifyDummy(password)
		return fail("no_password")
	}
	ok, rehash := s.hasher.Verify(password, *u.PasswordHash)
	if !ok {
		return fail("bad_password")
	}
	if rehash {
		if h, err := s.hasher.Hash(password); err == nil {
			if err := s.store.SetPasswordHash(ctx, u.ID, &h); err != nil {
				s.log.WarnContext(ctx, "password rehash failed", "user_id", u.ID, "error", err)
			}
		}
	}
	s.audit(ctx, slog.LevelInfo, "auth.signin", "method", "password", "outcome", "success", "user_id", u.ID)
	return u, nil
}

// User loads a user by id.
func (s *Service) User(ctx context.Context, id uuid.UUID) (User, error) {
	return s.store.UserByID(ctx, id)
}

// proveEmail runs when the user has just proven control of the account's email (magic link, or an
// IdP asserting email_verified). If the account's email was never verified, whoever set its password
// may not own the address (pre-account-takeover): the password is cleared and every existing session
// is revoked, exactly like a password reset. Must run inside a transaction.
func (s *Service) proveEmail(ctx context.Context, st Store, u User) (User, error) {
	if u.EmailVerified {
		return u, nil
	}
	now := s.now()
	if err := st.MarkEmailVerified(ctx, u.ID, now); err != nil {
		return User{}, err
	}
	cleared := u.PasswordHash != nil
	if cleared {
		if err := st.SetPasswordHash(ctx, u.ID, nil); err != nil {
			return User{}, err
		}
		u.PasswordHash = nil
	}
	if err := st.RevokeUserSessions(ctx, u.ID, now); err != nil {
		return User{}, err
	}
	u.EmailVerified = true
	s.audit(ctx, slog.LevelInfo, "auth.email_verified", "user_id", u.ID, "password_cleared", cleared)
	return u, nil
}

// ---- sessions & tokens ----------------------------------------------------------------------

// StartWebSession creates a web session and returns the cookie value and its expiry.
func (s *Service) StartWebSession(ctx context.Context, userID uuid.UUID) (string, time.Time, error) {
	now := s.now()
	token := NewToken()
	m := Meta(ctx)
	exp := now.Add(min(s.opts.SessionTTL, s.opts.SessionAbsoluteTTL))
	err := s.store.CreateSession(ctx, Session{
		ID: uuid.New(), UserID: userID, Kind: ClientWeb, TokenHash: HashToken(token), ExpiresAt: exp,
		CreatedAt: now, LastUsedAt: now, UserAgent: m.UserAgent, IP: m.IP,
	})
	if err != nil {
		return "", time.Time{}, fmt.Errorf("create session: %w", err)
	}
	return token, exp, nil
}

// IssueNativeTokens creates a native session and returns its token pair.
func (s *Service) IssueNativeTokens(ctx context.Context, u User) (Tokens, error) {
	now := s.now()
	id := uuid.New()
	access, refresh := NewToken(), newRefreshToken(id)
	capAt := now.Add(s.opts.RefreshAbsoluteTTL)
	accessExp, refreshExp := minTime(now.Add(s.opts.AccessTTL), capAt), minTime(now.Add(s.opts.RefreshTTL), capAt)
	m := Meta(ctx)
	err := s.store.CreateSession(ctx, Session{
		ID: id, UserID: u.ID, Kind: ClientNative, TokenHash: HashToken(access), RefreshHash: HashToken(refresh),
		ExpiresAt: accessExp, RefreshExpiresAt: &refreshExp, CreatedAt: now, LastUsedAt: now,
		UserAgent: m.UserAgent, IP: m.IP,
	})
	if err != nil {
		return Tokens{}, fmt.Errorf("create session: %w", err)
	}
	return Tokens{AccessToken: access, RefreshToken: refresh, ExpiresIn: int(accessExp.Sub(now) / time.Second), User: u}, nil
}

// Refresh rotates a native token pair. Presenting a refresh token that is not the session's current
// one (an older, already rotated token) means it leaked: the whole session is revoked. Refresh slides
// by RefreshTTL but never past created + RefreshAbsoluteTTL; after that the user signs in again.
func (s *Service) Refresh(ctx context.Context, refreshToken string) (Tokens, error) {
	if err := s.limit(ctx, "token", ""); err != nil {
		return Tokens{}, err
	}
	sid, err := parseRefreshToken(refreshToken)
	if err != nil {
		return Tokens{}, ErrInvalidGrant
	}
	sess, err := s.store.SessionByID(ctx, sid)
	if errors.Is(err, ErrNotFound) || (err == nil && sess.Kind != ClientNative) {
		return Tokens{}, ErrInvalidGrant
	}
	if err != nil {
		return Tokens{}, fmt.Errorf("load session: %w", err)
	}
	now := s.now()
	presented := HashToken(refreshToken)
	if sess.RevokedAt != nil {
		return Tokens{}, ErrInvalidGrant
	}
	if !EqualHash(presented, sess.RefreshHash) {
		return Tokens{}, s.refreshReuse(ctx, sess, now)
	}
	capAt := sess.CreatedAt.Add(s.opts.RefreshAbsoluteTTL)
	if sess.RefreshExpiresAt == nil || !now.Before(*sess.RefreshExpiresAt) || !now.Before(capAt) {
		return Tokens{}, ErrInvalidGrant
	}
	access, refresh := NewToken(), newRefreshToken(sess.ID)
	accessExp := minTime(now.Add(s.opts.AccessTTL), capAt)
	m := Meta(ctx)
	ok, err := s.store.RotateSession(ctx, Rotation{
		SessionID: sess.ID, OldRefreshHash: presented, NewTokenHash: HashToken(access), NewRefreshHash: HashToken(refresh),
		ExpiresAt: accessExp, RefreshExpiresAt: minTime(now.Add(s.opts.RefreshTTL), capAt), Now: now,
		UserAgent: m.UserAgent, IP: m.IP,
	})
	if err != nil {
		return Tokens{}, fmt.Errorf("rotate session: %w", err)
	}
	if !ok { // lost a race with another refresh using the same token: same as reuse
		return Tokens{}, s.refreshReuse(ctx, sess, now)
	}
	u, err := s.store.UserByID(ctx, sess.UserID)
	if err != nil {
		return Tokens{}, fmt.Errorf("load user: %w", err)
	}
	s.audit(ctx, slog.LevelInfo, "auth.refresh", "outcome", "success", "user_id", u.ID, "session_id", sess.ID)
	return Tokens{AccessToken: access, RefreshToken: refresh, ExpiresIn: int(accessExp.Sub(now) / time.Second), User: u}, nil
}

func (s *Service) refreshReuse(ctx context.Context, sess Session, now time.Time) error {
	if err := s.store.RevokeSession(ctx, sess.ID, now); err != nil {
		return fmt.Errorf("revoke session: %w", err)
	}
	s.audit(ctx, slog.LevelWarn, "auth.refresh_reuse", "outcome", "session_revoked", "user_id", sess.UserID, "session_id", sess.ID)
	return ErrInvalidGrant
}

// RevokeRefreshToken ends the native session behind a refresh token. Idempotent: unknown or
// malformed tokens are ignored. A stale (rotated) token also revokes the session (reuse).
func (s *Service) RevokeRefreshToken(ctx context.Context, refreshToken string) error {
	sid, err := parseRefreshToken(refreshToken)
	if err != nil {
		return nil
	}
	sess, err := s.store.SessionByID(ctx, sid)
	if errors.Is(err, ErrNotFound) || (err == nil && (sess.Kind != ClientNative || sess.RevokedAt != nil)) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("load session: %w", err)
	}
	if !EqualHash(HashToken(refreshToken), sess.RefreshHash) {
		return ignoreGrant(s.refreshReuse(ctx, sess, s.now()))
	}
	return s.SignOut(ctx, sess.ID, sess.UserID)
}

func ignoreGrant(err error) error {
	if errors.Is(err, ErrInvalidGrant) {
		return nil
	}
	return err
}

// SignOut revokes one session.
func (s *Service) SignOut(ctx context.Context, sessionID, userID uuid.UUID) error {
	if err := s.store.RevokeSession(ctx, sessionID, s.now()); err != nil {
		return fmt.Errorf("revoke session: %w", err)
	}
	s.audit(ctx, slog.LevelInfo, "auth.signout", "user_id", userID, "session_id", sessionID)
	return nil
}

// Authenticate resolves a session cookie (kind web) or access token (kind native). For web sessions
// it slides the expiry; renewed is non-zero when the cookie should be re-sent with the new expiry.
func (s *Service) Authenticate(ctx context.Context, token string, kind Client) (p Principal, renewed time.Time, err error) {
	if !validToken(token) {
		return Principal{}, time.Time{}, ErrUnauthenticated
	}
	sess, err := s.store.SessionByTokenHash(ctx, HashToken(token))
	if errors.Is(err, ErrNotFound) {
		return Principal{}, time.Time{}, ErrUnauthenticated
	}
	if err != nil {
		return Principal{}, time.Time{}, fmt.Errorf("load session: %w", err)
	}
	now := s.now()
	if sess.Kind != kind || sess.RevokedAt != nil || !now.Before(sess.ExpiresAt) {
		return Principal{}, time.Time{}, ErrUnauthenticated
	}
	p = Principal{UserID: sess.UserID, SessionID: sess.ID, Kind: kind}
	if now.Sub(sess.LastUsedAt) < touchEvery {
		return p, time.Time{}, nil
	}
	exp := sess.ExpiresAt
	if kind == ClientWeb {
		exp = minTime(now.Add(s.opts.SessionTTL), sess.CreatedAt.Add(s.opts.SessionAbsoluteTTL))
		renewed = exp
	}
	if err := s.store.TouchSession(ctx, sess.ID, now, exp); err != nil {
		s.log.WarnContext(ctx, "touch session failed", "session_id", sess.ID, "error", err)
		renewed = time.Time{}
	}
	return p, renewed, nil
}

func minTime(a, b time.Time) time.Time {
	if a.Before(b) {
		return a
	}
	return b
}

// ---- magic links ----------------------------------------------------------------------------

// MagicLinkEnabled reports whether a mailer is configured.
func (s *Service) MagicLinkEnabled() bool { return s.opts.Mailer != nil }

// RequestMagicLink emails a single-use link. It never reveals whether the account exists: the email
// is sent in the background, and nothing is sent for unknown addresses when registration is closed.
func (s *Service) RequestMagicLink(ctx context.Context, email string, client Client) error {
	if s.opts.Mailer == nil {
		return ErrDisabled
	}
	email, err := NormalizeEmail(email)
	if err != nil {
		return err
	}
	if client == "" {
		client = ClientWeb
	}
	if client != ClientWeb && client != ClientNative {
		return &ValidationError{Detail: "client must be web or native"}
	}
	if client == ClientNative && len(s.opts.NativeRedirectURIs) == 0 {
		return &ValidationError{Detail: "native sign-in links are not configured"}
	}
	if err := s.limit(ctx, "magic", email); err != nil {
		return err
	}
	_, err = s.store.UserByEmail(ctx, email)
	switch {
	case errors.Is(err, ErrNotFound) && !s.opts.RegistrationOpen:
		s.audit(ctx, slog.LevelInfo, "auth.magic_link.request", "outcome", "skipped", "email", MaskEmail(email))
		return nil
	case err != nil && !errors.Is(err, ErrNotFound):
		return fmt.Errorf("load user: %w", err)
	}
	token := NewToken()
	if err := s.store.CreateMagicLink(ctx, MagicLink{TokenHash: HashToken(token), Email: email, Client: client, ExpiresAt: s.now().Add(MagicLinkTTL)}); err != nil {
		return fmt.Errorf("create magic link: %w", err)
	}
	msg := Message{To: email, Subject: "Your __APP_TITLE__ sign-in link", Text: fmt.Sprintf(
		"Use this link to sign in to __APP_TITLE__:\r\n\r\n%s\r\n\r\nIt expires in %d minutes and works once. If you did not ask for it, ignore this email.\r\n",
		s.MagicLinkURL(client, token), int(MagicLinkTTL/time.Minute))}
	mailer, log := s.opts.Mailer, s.log
	s.opts.Dispatch(func() {
		sendCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 30*time.Second)
		defer cancel()
		if err := mailer.Send(sendCtx, msg); err != nil {
			log.ErrorContext(sendCtx, "magic link email failed", "email", MaskEmail(email), "error", err)
		}
	})
	s.audit(ctx, slog.LevelInfo, "auth.magic_link.request", "outcome", "sent", "email", MaskEmail(email), "client", client)
	return nil
}

// MagicLinkURL builds the link put in the email:
//
//	web:    ${APP_URL}/auth/magic?token=<token>                (the SPA page POSTs it to /v1/auth/magic-link/verify)
//	native: ${first NATIVE_REDIRECT_URIS entry}/magic?token=<token> (the app exchanges it at /v1/auth/token, grantType=magic_link)
func (s *Service) MagicLinkURL(client Client, token string) string {
	base := strings.TrimRight(s.opts.AppURL, "/") + "/auth"
	if client == ClientNative && len(s.opts.NativeRedirectURIs) > 0 {
		base = strings.TrimRight(s.opts.NativeRedirectURIs[0], "/")
	}
	return withQuery(base+"/magic", "token", token)
}

// ConsumeMagicLink signs in with a magic-link token issued for client. The account is created on
// first use when registration is open; the email counts as verified.
func (s *Service) ConsumeMagicLink(ctx context.Context, token string, client Client) (User, error) {
	if s.opts.Mailer == nil {
		return User{}, ErrDisabled
	}
	if err := s.limit(ctx, "magic_verify", ""); err != nil {
		return User{}, err
	}
	if !validToken(token) {
		return User{}, ErrInvalidGrant
	}
	// Consumed outside the transaction: any attempt burns the link, even one that fails below.
	ml, err := s.store.ConsumeMagicLink(ctx, HashToken(token), s.now())
	if errors.Is(err, ErrNotFound) || (err == nil && ml.Client != client) {
		s.audit(ctx, slog.LevelInfo, "auth.signin", "method", "magic_link", "outcome", "failure")
		return User{}, ErrInvalidGrant
	}
	if err != nil {
		return User{}, fmt.Errorf("consume magic link: %w", err)
	}
	var u User
	err = s.store.InTx(ctx, func(st Store) error {
		var err error
		u, err = st.UserByEmail(ctx, ml.Email)
		if errors.Is(err, ErrNotFound) {
			if !s.opts.RegistrationOpen {
				return ErrInvalidGrant
			}
			now := s.now()
			u, err = st.CreateUser(ctx, ml.Email, "", nil, &now)
			if err == nil {
				s.audit(ctx, slog.LevelInfo, "auth.register", "method", "magic_link", "outcome", "success", "user_id", u.ID)
			}
			return err
		}
		if err != nil {
			return err
		}
		u, err = s.proveEmail(ctx, st, u)
		return err
	})
	if err != nil {
		return User{}, err
	}
	s.audit(ctx, slog.LevelInfo, "auth.signin", "method", "magic_link", "outcome", "success", "user_id", u.ID)
	return u, nil
}

// ---- one-time native codes ------------------------------------------------------------------

// IssueAuthCode creates the one-time code a native app exchanges after the OIDC redirect, bound to
// the PKCE S256 challenge the app sent to /start.
func (s *Service) IssueAuthCode(ctx context.Context, userID uuid.UUID, codeChallenge string) (string, error) {
	if !validPKCE(codeChallenge) {
		return "", errors.New("auth code requires a PKCE challenge")
	}
	code := NewToken()
	if err := s.store.CreateAuthCode(ctx, HashToken(code), userID, codeChallenge, s.now().Add(AuthCodeTTL)); err != nil {
		return "", fmt.Errorf("create auth code: %w", err)
	}
	return code, nil
}

// ExchangeAuthCode redeems a one-time code with the PKCE verifier whose S256 challenge was sent to
// /start (RFC 8252: an app that intercepted the custom-scheme redirect cannot redeem the code).
// The code is consumed first, so a missing, malformed or wrong verifier also burns it.
func (s *Service) ExchangeAuthCode(ctx context.Context, code, codeVerifier string) (User, error) {
	if err := s.limit(ctx, "token", ""); err != nil {
		return User{}, err
	}
	if !validToken(code) {
		return User{}, ErrInvalidGrant
	}
	ac, err := s.store.ConsumeAuthCode(ctx, HashToken(code), s.now())
	if errors.Is(err, ErrNotFound) {
		return User{}, ErrInvalidGrant
	}
	if err != nil {
		return User{}, fmt.Errorf("consume auth code: %w", err)
	}
	if !validPKCE(codeVerifier) {
		s.audit(ctx, slog.LevelWarn, "auth.pkce", "outcome", "failure", "reason", "missing_or_malformed_verifier", "user_id", ac.UserID)
		return User{}, &ValidationError{Detail: "codeVerifier must be 43-128 characters of [A-Za-z0-9-._~]"}
	}
	if !verifyPKCE(codeVerifier, ac.CodeChallenge) {
		s.audit(ctx, slog.LevelWarn, "auth.pkce", "outcome", "failure", "reason", "verifier_mismatch", "user_id", ac.UserID)
		return User{}, ErrInvalidGrant
	}
	u, err := s.store.UserByID(ctx, ac.UserID)
	if errors.Is(err, ErrNotFound) {
		return User{}, ErrInvalidGrant
	}
	return u, err
}

// ---- audit ----------------------------------------------------------------------------------

// audit writes one structured line. Never pass tokens, passwords or full emails (use MaskEmail).
func (s *Service) audit(ctx context.Context, level slog.Level, action string, attrs ...any) {
	m := Meta(ctx)
	s.log.Log(ctx, level, "audit", append([]any{"action", action, "ip", m.IP}, attrs...)...)
}

// CookieName is the web session cookie name (COOKIE_NAME).
func (s *Service) CookieName() string { return s.opts.CookieName }

// RunJanitor deletes expired sessions and flow artifacts every interval until ctx is done.
// Rows are kept for a day after expiry/revocation so refresh-token reuse is still detected briefly.
func (s *Service) RunJanitor(ctx context.Context, every time.Duration) {
	t := time.NewTicker(every)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			dctx, cancel := context.WithTimeout(ctx, time.Minute)
			n, err := s.store.DeleteExpired(dctx, s.now().Add(-24*time.Hour))
			cancel()
			if err != nil {
				s.log.WarnContext(ctx, "auth janitor failed", "error", err)
			} else if n > 0 {
				s.log.InfoContext(ctx, "auth janitor", "deleted", n)
			}
		}
	}
}
