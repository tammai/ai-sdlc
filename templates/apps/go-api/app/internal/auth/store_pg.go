package auth

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"__GO_MODULE__/internal/db/sqlc"
)

// PGStore implements Store with sqlc queries only.
type PGStore struct {
	pool *pgxpool.Pool // nil inside a transaction
	q    *sqlc.Queries
}

// NewPGStore wraps a pool.
func NewPGStore(pool *pgxpool.Pool) *PGStore { return &PGStore{pool: pool, q: sqlc.New(pool)} }

var _ Store = (*PGStore)(nil)

// InTx runs fn in a transaction; nested calls reuse the outer transaction.
func (s *PGStore) InTx(ctx context.Context, fn func(Store) error) error {
	if s.pool == nil {
		return fn(s)
	}
	return pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		return fn(&PGStore{q: sqlc.New(tx)})
	})
}

func mapErr(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" { // unique_violation
		return ErrConflict
	}
	return err
}

func userFromRow(r sqlc.User) User {
	return User{ID: r.ID, Email: r.Email, Name: r.Name, PasswordHash: r.PasswordHash, EmailVerified: r.EmailVerifiedAt != nil, CreatedAt: r.CreatedAt}
}

func sessionFromRow(r sqlc.Session) Session {
	return Session{
		ID: r.ID, UserID: r.UserID, Kind: Client(r.Kind), TokenHash: r.TokenHash, RefreshHash: r.RefreshHash,
		ExpiresAt: r.ExpiresAt, RefreshExpiresAt: r.RefreshExpiresAt, CreatedAt: r.CreatedAt, LastUsedAt: r.LastUsedAt,
		RevokedAt: r.RevokedAt, UserAgent: r.UserAgent, IP: r.Ip,
	}
}

// CreateUser inserts a user.
func (s *PGStore) CreateUser(ctx context.Context, email, name string, passwordHash *string, verifiedAt *time.Time) (User, error) {
	row, err := s.q.CreateUser(ctx, sqlc.CreateUserParams{Email: email, Name: name, PasswordHash: passwordHash, EmailVerifiedAt: verifiedAt})
	if err != nil {
		return User{}, mapErr(err)
	}
	return userFromRow(row), nil
}

// UserByID loads a user.
func (s *PGStore) UserByID(ctx context.Context, id uuid.UUID) (User, error) {
	row, err := s.q.GetUserByID(ctx, id)
	if err != nil {
		return User{}, mapErr(err)
	}
	return userFromRow(row), nil
}

// UserByEmail loads a user by email (case-insensitive).
func (s *PGStore) UserByEmail(ctx context.Context, email string) (User, error) {
	row, err := s.q.GetUserByEmail(ctx, email)
	if err != nil {
		return User{}, mapErr(err)
	}
	return userFromRow(row), nil
}

// SetPasswordHash replaces (or clears, with nil) the password hash.
func (s *PGStore) SetPasswordHash(ctx context.Context, userID uuid.UUID, hash *string) error {
	return mapErr(s.q.SetUserPasswordHash(ctx, sqlc.SetUserPasswordHashParams{PasswordHash: hash, ID: userID}))
}

// MarkEmailVerified sets email_verified_at once.
func (s *PGStore) MarkEmailVerified(ctx context.Context, userID uuid.UUID, at time.Time) error {
	return mapErr(s.q.MarkUserEmailVerified(ctx, sqlc.MarkUserEmailVerifiedParams{VerifiedAt: &at, ID: userID}))
}

// IdentityUserID resolves an external identity.
func (s *PGStore) IdentityUserID(ctx context.Context, provider, subject string) (uuid.UUID, error) {
	id, err := s.q.GetIdentityUserID(ctx, sqlc.GetIdentityUserIDParams{Provider: provider, Subject: subject})
	return id, mapErr(err)
}

// CreateIdentity links an external identity to a user.
func (s *PGStore) CreateIdentity(ctx context.Context, provider, subject string, userID uuid.UUID) error {
	return mapErr(s.q.CreateIdentity(ctx, sqlc.CreateIdentityParams{Provider: provider, Subject: subject, UserID: userID}))
}

// CreateSession inserts a session.
func (s *PGStore) CreateSession(ctx context.Context, x Session) error {
	return mapErr(s.q.CreateSession(ctx, sqlc.CreateSessionParams{
		ID: x.ID, UserID: x.UserID, Kind: string(x.Kind), TokenHash: x.TokenHash, RefreshHash: x.RefreshHash,
		ExpiresAt: x.ExpiresAt, RefreshExpiresAt: x.RefreshExpiresAt, CreatedAt: x.CreatedAt, UserAgent: x.UserAgent, Ip: x.IP,
	}))
}

// SessionByTokenHash finds a session by its session/access token hash.
func (s *PGStore) SessionByTokenHash(ctx context.Context, hash []byte) (Session, error) {
	row, err := s.q.GetSessionByTokenHash(ctx, hash)
	if err != nil {
		return Session{}, mapErr(err)
	}
	return sessionFromRow(row), nil
}

// SessionByID finds a session by id.
func (s *PGStore) SessionByID(ctx context.Context, id uuid.UUID) (Session, error) {
	row, err := s.q.GetSessionByID(ctx, id)
	if err != nil {
		return Session{}, mapErr(err)
	}
	return sessionFromRow(row), nil
}

// TouchSession records use and (web) slides the expiry.
func (s *PGStore) TouchSession(ctx context.Context, id uuid.UUID, lastUsed, expiresAt time.Time) error {
	return mapErr(s.q.TouchSession(ctx, sqlc.TouchSessionParams{LastUsedAt: lastUsed, ExpiresAt: expiresAt, ID: id}))
}

// RotateSession swaps the native token pair atomically (compare-and-swap on the refresh hash).
func (s *PGStore) RotateSession(ctx context.Context, r Rotation) (bool, error) {
	n, err := s.q.RotateSession(ctx, sqlc.RotateSessionParams{
		NewTokenHash: r.NewTokenHash, NewRefreshHash: r.NewRefreshHash, ExpiresAt: r.ExpiresAt,
		RefreshExpiresAt: &r.RefreshExpiresAt, Now: r.Now, UserAgent: r.UserAgent, Ip: r.IP,
		ID: r.SessionID, OldRefreshHash: r.OldRefreshHash,
	})
	return n == 1, mapErr(err)
}

// RevokeSession revokes one session (idempotent).
func (s *PGStore) RevokeSession(ctx context.Context, id uuid.UUID, at time.Time) error {
	return mapErr(s.q.RevokeSession(ctx, sqlc.RevokeSessionParams{RevokedAt: &at, ID: id}))
}

// RevokeUserSessions revokes every session of a user.
func (s *PGStore) RevokeUserSessions(ctx context.Context, userID uuid.UUID, at time.Time) error {
	return mapErr(s.q.RevokeUserSessions(ctx, sqlc.RevokeUserSessionsParams{RevokedAt: &at, UserID: userID}))
}

// CreateMagicLink stores a pending magic link.
func (s *PGStore) CreateMagicLink(ctx context.Context, m MagicLink) error {
	return mapErr(s.q.CreateMagicLink(ctx, sqlc.CreateMagicLinkParams{TokenHash: m.TokenHash, Email: m.Email, Client: string(m.Client), ExpiresAt: m.ExpiresAt}))
}

// ConsumeMagicLink marks an unexpired, unused link as used and returns it.
func (s *PGStore) ConsumeMagicLink(ctx context.Context, hash []byte, now time.Time) (MagicLink, error) {
	row, err := s.q.ConsumeMagicLink(ctx, sqlc.ConsumeMagicLinkParams{Now: &now, TokenHash: hash})
	if err != nil {
		return MagicLink{}, mapErr(err)
	}
	return MagicLink{TokenHash: hash, Email: row.Email, Client: Client(row.Client)}, nil
}

// CreateOIDCState stores an in-flight authorization request.
func (s *PGStore) CreateOIDCState(ctx context.Context, x OIDCState) error {
	return mapErr(s.q.CreateOIDCState(ctx, sqlc.CreateOIDCStateParams{
		StateHash: x.StateHash, Provider: x.Provider, CodeVerifier: x.CodeVerifier, Nonce: x.Nonce,
		Client: string(x.Client), Redirect: x.Redirect, ClientChallenge: x.ClientChallenge, ExpiresAt: x.ExpiresAt,
	}))
}

// ConsumeOIDCState deletes and returns an unexpired state.
func (s *PGStore) ConsumeOIDCState(ctx context.Context, hash []byte, now time.Time) (OIDCState, error) {
	row, err := s.q.ConsumeOIDCState(ctx, sqlc.ConsumeOIDCStateParams{StateHash: hash, Now: now})
	if err != nil {
		return OIDCState{}, mapErr(err)
	}
	return OIDCState{
		StateHash: hash, Provider: row.Provider, CodeVerifier: row.CodeVerifier, Nonce: row.Nonce,
		Client: Client(row.Client), Redirect: row.Redirect, ClientChallenge: row.ClientChallenge,
	}, nil
}

// CreateAuthCode stores a one-time native code with the app's PKCE challenge.
func (s *PGStore) CreateAuthCode(ctx context.Context, hash []byte, userID uuid.UUID, codeChallenge string, expiresAt time.Time) error {
	return mapErr(s.q.CreateAuthCode(ctx, sqlc.CreateAuthCodeParams{CodeHash: hash, UserID: userID, CodeChallenge: codeChallenge, ExpiresAt: expiresAt}))
}

// ConsumeAuthCode marks an unexpired, unused code as used and returns its user and challenge.
func (s *PGStore) ConsumeAuthCode(ctx context.Context, hash []byte, now time.Time) (AuthCode, error) {
	row, err := s.q.ConsumeAuthCode(ctx, sqlc.ConsumeAuthCodeParams{Now: &now, CodeHash: hash})
	if err != nil {
		return AuthCode{}, mapErr(err)
	}
	return AuthCode{UserID: row.UserID, CodeChallenge: row.CodeChallenge}, nil
}

// DeleteExpired purges expired/revoked rows.
func (s *PGStore) DeleteExpired(ctx context.Context, before time.Time) (int64, error) {
	var total int64
	for _, del := range []func(context.Context, time.Time) (int64, error){
		s.q.DeleteExpiredSessions, s.q.DeleteExpiredMagicLinks, s.q.DeleteExpiredOIDCStates, s.q.DeleteExpiredAuthCodes,
	} {
		n, err := del(ctx, before)
		if err != nil {
			return total, err
		}
		total += n
	}
	return total, nil
}
