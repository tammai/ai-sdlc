package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"runtime"
	"strings"

	"golang.org/x/crypto/argon2"
)

// Password length limits mirror RegisterRequest in contracts/openapi.yaml.
const (
	MinPasswordLen = 12   // characters (runes)
	MaxPasswordLen = 1024 // bytes; also bounds hashing cost
)

// Argon2Params are argon2id cost parameters.
type Argon2Params struct {
	Memory      uint32 // KiB
	Iterations  uint32
	Parallelism uint8
	SaltLen     uint32
	KeyLen      uint32
}

// DefaultArgon2Params follow RFC 9106 / OWASP guidance for interactive logins: 64 MiB, t=3, p=2.
// Raising them later is safe: hashes made with older params are upgraded on the next successful login.
var DefaultArgon2Params = Argon2Params{Memory: 64 * 1024, Iterations: 3, Parallelism: 2, SaltLen: 16, KeyLen: 32}

// PasswordHasher hashes and verifies passwords as PHC strings:
//
//	$argon2id$v=19$m=65536,t=3,p=2$<salt b64>$<hash b64>
//
// Concurrent hashes are bounded so a login burst cannot exhaust memory (each hash uses Memory KiB).
type PasswordHasher struct {
	params Argon2Params
	sem    chan struct{}
	dummy  string // hash of a random password, verified for unknown accounts to equalise timing
}

// NewPasswordHasher builds a hasher. maxConcurrent <= 0 means 2*GOMAXPROCS.
func NewPasswordHasher(p Argon2Params, maxConcurrent int) *PasswordHasher {
	if maxConcurrent <= 0 {
		maxConcurrent = 2 * runtime.GOMAXPROCS(0)
	}
	h := &PasswordHasher{params: p, sem: make(chan struct{}, maxConcurrent)}
	dummy, err := h.Hash(NewToken())
	if err != nil {
		panic(err) // only fails if the RNG fails
	}
	h.dummy = dummy
	return h
}

// Hash returns the PHC string for password.
func (h *PasswordHasher) Hash(password string) (string, error) {
	salt := make([]byte, h.params.SaltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	key := h.derive(password, salt, h.params)
	b64 := base64.RawStdEncoding
	return fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s", argon2.Version,
		h.params.Memory, h.params.Iterations, h.params.Parallelism, b64.EncodeToString(salt), b64.EncodeToString(key)), nil
}

// Verify checks password against a PHC hash. needsRehash is true when the hash was made with other
// parameters than the hasher's current ones (the caller then stores a fresh Hash).
func (h *PasswordHasher) Verify(password, encoded string) (ok, needsRehash bool) {
	p, salt, want, err := decodePHC(encoded)
	if err != nil {
		return false, false
	}
	got := h.derive(password, salt, p)
	if subtle.ConstantTimeCompare(got, want) != 1 {
		return false, false
	}
	return true, p != h.params
}

// VerifyDummy burns the same time as a real Verify; call it when the account does not exist or has
// no password so response timing does not reveal which emails are registered.
func (h *PasswordHasher) VerifyDummy(password string) { h.Verify(password, h.dummy) }

func (h *PasswordHasher) derive(password string, salt []byte, p Argon2Params) []byte {
	h.sem <- struct{}{}
	defer func() { <-h.sem }()
	return argon2.IDKey([]byte(password), salt, p.Iterations, p.Memory, p.Parallelism, p.KeyLen)
}

var errBadPHC = errors.New("invalid argon2id hash")

func decodePHC(s string) (Argon2Params, []byte, []byte, error) {
	parts := strings.Split(s, "$")
	if len(parts) != 6 || parts[0] != "" || parts[1] != "argon2id" {
		return Argon2Params{}, nil, nil, errBadPHC
	}
	var version int
	if _, err := fmt.Sscanf(parts[2], "v=%d", &version); err != nil || version != argon2.Version {
		return Argon2Params{}, nil, nil, errBadPHC
	}
	var p Argon2Params
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &p.Memory, &p.Iterations, &p.Parallelism); err != nil {
		return Argon2Params{}, nil, nil, errBadPHC
	}
	// Refuse absurd parameters from a tampered row (DoS) or degenerate ones.
	if p.Memory < 8*1024 || p.Memory > 1024*1024 || p.Iterations < 1 || p.Iterations > 20 || p.Parallelism < 1 {
		return Argon2Params{}, nil, nil, errBadPHC
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil || len(salt) < 8 {
		return Argon2Params{}, nil, nil, errBadPHC
	}
	key, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil || len(key) < 16 || len(key) > 128 {
		return Argon2Params{}, nil, nil, errBadPHC
	}
	p.SaltLen = uint32(len(salt)) //nolint:gosec // bounded by the decoded string length
	p.KeyLen = uint32(len(key))   //nolint:gosec // checked above
	return p, salt, key, nil
}
