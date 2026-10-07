// Package authtest provides test doubles for internal/auth: an in-memory Store with the same
// semantics as the Postgres one (unique emails case-insensitively, single-use Consume*, atomic
// refresh rotation), a cheap password hasher, and a capturing mailer.
package authtest

import (
	"bytes"
	"context"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"

	"__GO_MODULE__/internal/auth"
)

// MemStore is an in-memory auth.Store. InTx is not isolated (tests are single-threaded per store).
type MemStore struct {
	mu         sync.Mutex
	users      map[uuid.UUID]auth.User
	identities map[string]uuid.UUID // provider + "\x00" + subject
	sessions   map[uuid.UUID]auth.Session
	magic      map[string]auth.MagicLink
	magicUsed  map[string]bool
	states     map[string]auth.OIDCState
	codes      map[string]code
}

type code struct {
	user      uuid.UUID
	challenge string
	exp       time.Time
	used      bool
}

// NewMemStore returns an empty store.
func NewMemStore() *MemStore {
	return &MemStore{
		users: map[uuid.UUID]auth.User{}, identities: map[string]uuid.UUID{}, sessions: map[uuid.UUID]auth.Session{},
		magic: map[string]auth.MagicLink{}, magicUsed: map[string]bool{}, states: map[string]auth.OIDCState{}, codes: map[string]code{},
	}
}

var _ auth.Store = (*MemStore)(nil)

// InTx runs fn directly.
func (m *MemStore) InTx(_ context.Context, fn func(auth.Store) error) error { return fn(m) }

// CreateUser inserts a user.
func (m *MemStore) CreateUser(_ context.Context, email, name string, hash *string, verifiedAt *time.Time) (auth.User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, u := range m.users {
		if strings.EqualFold(u.Email, email) {
			return auth.User{}, auth.ErrConflict
		}
	}
	u := auth.User{ID: uuid.New(), Email: email, Name: name, PasswordHash: hash, EmailVerified: verifiedAt != nil, CreatedAt: time.Now()}
	m.users[u.ID] = u
	return u, nil
}

// UserByID loads a user.
func (m *MemStore) UserByID(_ context.Context, id uuid.UUID) (auth.User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	u, ok := m.users[id]
	if !ok {
		return auth.User{}, auth.ErrNotFound
	}
	return u, nil
}

// UserByEmail loads a user case-insensitively.
func (m *MemStore) UserByEmail(_ context.Context, email string) (auth.User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, u := range m.users {
		if strings.EqualFold(u.Email, email) {
			return u, nil
		}
	}
	return auth.User{}, auth.ErrNotFound
}

// SetPasswordHash replaces the hash.
func (m *MemStore) SetPasswordHash(_ context.Context, id uuid.UUID, hash *string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	u := m.users[id]
	u.PasswordHash = hash
	m.users[id] = u
	return nil
}

// MarkEmailVerified flags the email verified.
func (m *MemStore) MarkEmailVerified(_ context.Context, id uuid.UUID, _ time.Time) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	u := m.users[id]
	u.EmailVerified = true
	m.users[id] = u
	return nil
}

// IdentityUserID resolves an identity.
func (m *MemStore) IdentityUserID(_ context.Context, provider, subject string) (uuid.UUID, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	id, ok := m.identities[provider+"\x00"+subject]
	if !ok {
		return uuid.Nil, auth.ErrNotFound
	}
	return id, nil
}

// CreateIdentity links an identity.
func (m *MemStore) CreateIdentity(_ context.Context, provider, subject string, userID uuid.UUID) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	k := provider + "\x00" + subject
	if _, ok := m.identities[k]; ok {
		return auth.ErrConflict
	}
	m.identities[k] = userID
	return nil
}

// Identities returns the (provider, subject) pairs linked to userID.
func (m *MemStore) Identities(userID uuid.UUID) []string {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []string
	for k, v := range m.identities {
		if v == userID {
			out = append(out, strings.ReplaceAll(k, "\x00", ":"))
		}
	}
	slices.Sort(out)
	return out
}

// CreateSession inserts a session.
func (m *MemStore) CreateSession(_ context.Context, s auth.Session) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, x := range m.sessions {
		if bytes.Equal(x.TokenHash, s.TokenHash) || (s.RefreshHash != nil && bytes.Equal(x.RefreshHash, s.RefreshHash)) {
			return auth.ErrConflict
		}
	}
	m.sessions[s.ID] = s
	return nil
}

// SessionByTokenHash finds a session.
func (m *MemStore) SessionByTokenHash(_ context.Context, hash []byte) (auth.Session, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, s := range m.sessions {
		if bytes.Equal(s.TokenHash, hash) {
			return s, nil
		}
	}
	return auth.Session{}, auth.ErrNotFound
}

// SessionByID finds a session.
func (m *MemStore) SessionByID(_ context.Context, id uuid.UUID) (auth.Session, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	s, ok := m.sessions[id]
	if !ok {
		return auth.Session{}, auth.ErrNotFound
	}
	return s, nil
}

// TouchSession updates last use and expiry.
func (m *MemStore) TouchSession(_ context.Context, id uuid.UUID, lastUsed, exp time.Time) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	s, ok := m.sessions[id]
	if ok && s.RevokedAt == nil {
		s.LastUsedAt, s.ExpiresAt = lastUsed, exp
		m.sessions[id] = s
	}
	return nil
}

// RotateSession swaps tokens if the old refresh hash is current.
func (m *MemStore) RotateSession(_ context.Context, r auth.Rotation) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	s, ok := m.sessions[r.SessionID]
	if !ok || s.RevokedAt != nil || !bytes.Equal(s.RefreshHash, r.OldRefreshHash) || s.RefreshExpiresAt == nil || !r.Now.Before(*s.RefreshExpiresAt) {
		return false, nil
	}
	exp := r.RefreshExpiresAt
	s.TokenHash, s.RefreshHash, s.ExpiresAt, s.RefreshExpiresAt, s.LastUsedAt = r.NewTokenHash, r.NewRefreshHash, r.ExpiresAt, &exp, r.Now
	m.sessions[r.SessionID] = s
	return true, nil
}

// RevokeSession revokes a session.
func (m *MemStore) RevokeSession(_ context.Context, id uuid.UUID, at time.Time) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if s, ok := m.sessions[id]; ok && s.RevokedAt == nil {
		s.RevokedAt = &at
		m.sessions[id] = s
	}
	return nil
}

// RevokeUserSessions revokes all of a user's sessions.
func (m *MemStore) RevokeUserSessions(_ context.Context, userID uuid.UUID, at time.Time) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for id, s := range m.sessions {
		if s.UserID == userID && s.RevokedAt == nil {
			s.RevokedAt = &at
			m.sessions[id] = s
		}
	}
	return nil
}

// CreateMagicLink stores a link.
func (m *MemStore) CreateMagicLink(_ context.Context, l auth.MagicLink) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.magic[string(l.TokenHash)] = l
	return nil
}

// ConsumeMagicLink uses a link once.
func (m *MemStore) ConsumeMagicLink(_ context.Context, hash []byte, now time.Time) (auth.MagicLink, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	l, ok := m.magic[string(hash)]
	if !ok || m.magicUsed[string(hash)] || !now.Before(l.ExpiresAt) {
		return auth.MagicLink{}, auth.ErrNotFound
	}
	m.magicUsed[string(hash)] = true
	return l, nil
}

// CreateOIDCState stores a state.
func (m *MemStore) CreateOIDCState(_ context.Context, s auth.OIDCState) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.states[string(s.StateHash)] = s
	return nil
}

// ConsumeOIDCState deletes and returns a state.
func (m *MemStore) ConsumeOIDCState(_ context.Context, hash []byte, now time.Time) (auth.OIDCState, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	s, ok := m.states[string(hash)]
	if !ok || !now.Before(s.ExpiresAt) {
		return auth.OIDCState{}, auth.ErrNotFound
	}
	delete(m.states, string(hash))
	return s, nil
}

// CreateAuthCode stores a code.
func (m *MemStore) CreateAuthCode(_ context.Context, hash []byte, userID uuid.UUID, challenge string, exp time.Time) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.codes[string(hash)] = code{user: userID, challenge: challenge, exp: exp}
	return nil
}

// ConsumeAuthCode uses a code once.
func (m *MemStore) ConsumeAuthCode(_ context.Context, hash []byte, now time.Time) (auth.AuthCode, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	c, ok := m.codes[string(hash)]
	if !ok || c.used || !now.Before(c.exp) {
		return auth.AuthCode{}, auth.ErrNotFound
	}
	c.used = true
	m.codes[string(hash)] = c
	return auth.AuthCode{UserID: c.user, CodeChallenge: c.challenge}, nil
}

// DeleteExpired is a no-op count of nothing (tests do not need purging).
func (m *MemStore) DeleteExpired(context.Context, time.Time) (int64, error) { return 0, nil }

// Session returns a copy of a session (for assertions).
func (m *MemStore) Session(id uuid.UUID) (auth.Session, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	s, ok := m.sessions[id]
	return s, ok
}

// FastHasher is an argon2id hasher with minimal cost for tests.
func FastHasher() *auth.PasswordHasher {
	return auth.NewPasswordHasher(auth.Argon2Params{Memory: 8 * 1024, Iterations: 1, Parallelism: 1, SaltLen: 16, KeyLen: 32}, 4)
}

// Mailbox is a Mailer that keeps every message.
type Mailbox struct {
	mu   sync.Mutex
	msgs []auth.Message
}

// Send records m.
func (b *Mailbox) Send(_ context.Context, m auth.Message) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.msgs = append(b.msgs, m)
	return nil
}

// Messages returns the recorded messages.
func (b *Mailbox) Messages() []auth.Message {
	b.mu.Lock()
	defer b.mu.Unlock()
	return slices.Clone(b.msgs)
}

// Options returns service options suitable for tests: fast hashing, synchronous email, generous
// rate limits, password + open registration, http://app.test as the app.
func Options() auth.Options {
	return auth.Options{
		AppURL: "http://app.test", APIPublicURL: "http://api.test", OIDCWebCallbackBase: "http://app.test/api",
		AuthErrorPath: "/login", NativeRedirectURIs: []string{"com.example.app:/oauth"},
		CookieName: "session", CookieSecure: true,
		SessionTTL: 7 * 24 * time.Hour, SessionAbsoluteTTL: 30 * 24 * time.Hour, AccessTTL: 15 * time.Minute, RefreshTTL: 30 * 24 * time.Hour,
		RefreshAbsoluteTTL: 90 * 24 * time.Hour,
		PasswordEnabled:    true, RegistrationOpen: true,
		Hasher:    FastHasher(),
		IPLimiter: auth.NewRateLimiter(1000, time.Millisecond), EmailLimiter: auth.NewRateLimiter(1000, time.Millisecond),
		Dispatch: func(f func()) { f() },
	}
}
