package auth

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
)

// Store errors.
var (
	ErrNotFound = errors.New("not found")
	ErrConflict = errors.New("already exists")
)

// Client is the kind of client a flow belongs to (contract: ClientKind).
type Client string

// Client kinds; also the session kinds.
const (
	ClientWeb    Client = "web"
	ClientNative Client = "native"
)

// User is an account.
type User struct {
	ID            uuid.UUID
	Email         string
	Name          string
	PasswordHash  *string // nil: no password sign-in for this account
	EmailVerified bool
	CreatedAt     time.Time
}

// Session is a server-side session (web cookie or native token pair). Only token hashes are stored.
type Session struct {
	ID               uuid.UUID
	UserID           uuid.UUID
	Kind             Client
	TokenHash        []byte
	RefreshHash      []byte     // native only
	ExpiresAt        time.Time  // web: sliding session expiry; native: access token expiry
	RefreshExpiresAt *time.Time // native only
	CreatedAt        time.Time
	LastUsedAt       time.Time
	RevokedAt        *time.Time
	UserAgent        string
	IP               string
}

// Rotation replaces a native session's token pair if (and only if) OldRefreshHash is still current.
type Rotation struct {
	SessionID        uuid.UUID
	OldRefreshHash   []byte
	NewTokenHash     []byte
	NewRefreshHash   []byte
	ExpiresAt        time.Time
	RefreshExpiresAt time.Time
	Now              time.Time
	UserAgent        string
	IP               string
}

// MagicLink is a pending single-use sign-in link.
type MagicLink struct {
	TokenHash []byte
	Email     string
	Client    Client
	ExpiresAt time.Time
}

// OIDCState is the server-side half of an in-flight OIDC authorization request.
type OIDCState struct {
	StateHash    []byte
	Provider     string
	CodeVerifier string
	Nonce        string
	Client       Client
	Redirect     string // web: app-relative path; native: allow-listed redirect URI
	// ClientChallenge is the native app's own PKCE S256 challenge (RFC 8252); "" for web.
	ClientChallenge string
	ExpiresAt       time.Time
}

// AuthCode is a redeemed one-time native code: its user and the app's PKCE challenge.
type AuthCode struct {
	UserID        uuid.UUID
	CodeChallenge string
}

// Store is the auth persistence port: PGStore in production, authtest.MemStore in unit tests.
// Consume* methods are atomic and single-use: a second call for the same hash returns ErrNotFound.
type Store interface {
	// InTx runs fn in a transaction (fn receives a Store bound to it).
	InTx(ctx context.Context, fn func(Store) error) error

	CreateUser(ctx context.Context, email, name string, passwordHash *string, verifiedAt *time.Time) (User, error) // ErrConflict on duplicate email
	UserByID(ctx context.Context, id uuid.UUID) (User, error)
	UserByEmail(ctx context.Context, email string) (User, error) // case-insensitive
	SetPasswordHash(ctx context.Context, userID uuid.UUID, hash *string) error
	MarkEmailVerified(ctx context.Context, userID uuid.UUID, at time.Time) error

	IdentityUserID(ctx context.Context, provider, subject string) (uuid.UUID, error)
	CreateIdentity(ctx context.Context, provider, subject string, userID uuid.UUID) error

	CreateSession(ctx context.Context, s Session) error
	SessionByTokenHash(ctx context.Context, hash []byte) (Session, error)
	SessionByID(ctx context.Context, id uuid.UUID) (Session, error)
	TouchSession(ctx context.Context, id uuid.UUID, lastUsed, expiresAt time.Time) error
	RotateSession(ctx context.Context, r Rotation) (bool, error) // false: old refresh hash no longer current
	RevokeSession(ctx context.Context, id uuid.UUID, at time.Time) error
	RevokeUserSessions(ctx context.Context, userID uuid.UUID, at time.Time) error

	CreateMagicLink(ctx context.Context, m MagicLink) error
	ConsumeMagicLink(ctx context.Context, hash []byte, now time.Time) (MagicLink, error)
	CreateOIDCState(ctx context.Context, s OIDCState) error
	ConsumeOIDCState(ctx context.Context, hash []byte, now time.Time) (OIDCState, error)
	CreateAuthCode(ctx context.Context, hash []byte, userID uuid.UUID, codeChallenge string, expiresAt time.Time) error
	ConsumeAuthCode(ctx context.Context, hash []byte, now time.Time) (AuthCode, error)

	// DeleteExpired removes flow artifacts and sessions that expired (or were revoked) before `before`.
	DeleteExpired(ctx context.Context, before time.Time) (int64, error)
}
