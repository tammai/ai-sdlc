package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"strings"

	"github.com/google/uuid"
)

// TokenBytes is the entropy of every opaque token (session, access, refresh, magic link, codes, state).
const TokenBytes = 32

// NewToken returns a fresh opaque token: TokenBytes from crypto/rand, base64url without padding.
func NewToken() string {
	b := make([]byte, TokenBytes)
	_, _ = rand.Read(b) // crypto/rand.Read never returns an error (it panics if the OS RNG fails)
	return base64.RawURLEncoding.EncodeToString(b)
}

// HashToken is the only form in which tokens are stored: SHA-256 of the token string.
// Tokens carry 256 bits of entropy, so a fast unsalted hash is appropriate (unlike passwords).
func HashToken(token string) []byte {
	sum := sha256.Sum256([]byte(token))
	return sum[:]
}

// EqualHash compares two hashes in constant time.
func EqualHash(a, b []byte) bool {
	return len(a) == len(b) && subtle.ConstantTimeCompare(a, b) == 1
}

// validToken reports whether s looks like a token from NewToken (cheap pre-check before any DB lookup).
func validToken(s string) bool {
	if len(s) != base64.RawURLEncoding.EncodedLen(TokenBytes) {
		return false
	}
	_, err := base64.RawURLEncoding.DecodeString(s)
	return err == nil
}

// Refresh tokens are "<session id>.<random token>": the session id lets the server find the token's
// family, so presenting any older (rotated) refresh token is detected as reuse and revokes the session.
func newRefreshToken(sessionID uuid.UUID) string {
	return sessionID.String() + "." + NewToken()
}

var errMalformedToken = errors.New("malformed token")

func parseRefreshToken(s string) (uuid.UUID, error) {
	id, secret, ok := strings.Cut(s, ".")
	if !ok || !validToken(secret) {
		return uuid.Nil, errMalformedToken
	}
	sid, err := uuid.Parse(id)
	if err != nil || sid.String() != id { // canonical form only
		return uuid.Nil, errMalformedToken
	}
	return sid, nil
}
