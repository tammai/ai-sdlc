package auth

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
)

// PKCE bounds (RFC 7636 §4.1): verifier and challenge are 43-128 unreserved characters.
const (
	MinPKCELen = 43
	MaxPKCELen = 128
)

// validPKCE reports whether s is a well-formed PKCE verifier or challenge.
func validPKCE(s string) bool {
	if len(s) < MinPKCELen || len(s) > MaxPKCELen {
		return false
	}
	for _, c := range []byte(s) {
		switch {
		case c >= 'A' && c <= 'Z', c >= 'a' && c <= 'z', c >= '0' && c <= '9', c == '-', c == '.', c == '_', c == '~':
		default:
			return false
		}
	}
	return true
}

// S256Challenge is base64url(SHA-256(verifier)) without padding.
func S256Challenge(verifier string) string {
	sum := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

// verifyPKCE checks verifier against an S256 challenge in constant time.
func verifyPKCE(verifier, challenge string) bool {
	return subtle.ConstantTimeCompare([]byte(S256Challenge(verifier)), []byte(challenge)) == 1
}
