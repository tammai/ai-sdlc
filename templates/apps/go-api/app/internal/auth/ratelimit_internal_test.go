package auth

import (
	"testing"
	"time"
)

func TestRateLimiterBurstRefillAndKeys(t *testing.T) {
	now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	l := NewRateLimiter(3, 10*time.Second)
	l.now = func() time.Time { return now }

	for i := range 3 {
		if !l.Allow("ip:1") {
			t.Fatalf("event %d within burst rejected", i+1)
		}
	}
	if l.Allow("ip:1") {
		t.Fatal("event over burst allowed")
	}
	if !l.Allow("ip:2") {
		t.Fatal("keys must be independent")
	}
	now = now.Add(10 * time.Second)
	if !l.Allow("ip:1") {
		t.Fatal("token not refilled after the interval")
	}
	if l.Allow("ip:1") {
		t.Fatal("only one token refills per interval")
	}
}

func TestRateLimiterBoundedMemory(t *testing.T) {
	now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	l := NewRateLimiter(1, time.Second)
	l.now = func() time.Time { return now }
	l.maxKeys = 10
	for i := range 25 {
		l.Allow(string(rune('a' + i)))
	}
	if len(l.buckets) > 10 {
		t.Fatalf("buckets = %d, want <= maxKeys", len(l.buckets))
	}
	var nilLimiter *RateLimiter
	if !nilLimiter.Allow("x") {
		t.Fatal("nil limiter must allow")
	}
}

func TestRefreshTokenFormat(t *testing.T) {
	id := [16]byte{1, 2, 3}
	tok := newRefreshToken(id)
	got, err := parseRefreshToken(tok)
	if err != nil || got != id {
		t.Fatalf("parse(%q) = %v, %v", tok, got, err)
	}
	for _, bad := range []string{"", "x.y", tok + "x", "01020300-0000-0000-0000-000000000000", "01020300-0000-0000-0000-000000000000." + NewToken()[:10]} {
		if _, err := parseRefreshToken(bad); err == nil {
			t.Fatalf("parse(%q) accepted", bad)
		}
	}
}
