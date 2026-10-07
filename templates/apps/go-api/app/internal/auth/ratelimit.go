package auth

import (
	"sync"
	"time"

	"golang.org/x/time/rate"
)

// RateLimiter is an in-memory token bucket per key (e.g. "ip:203.0.113.7", "login:a@b.c").
// It protects a single instance only: multi-instance deploys must also rate limit at the edge
// (Cloudflare WAF rate-limiting rules, a load balancer, or a shared store such as Redis).
type RateLimiter struct {
	mu      sync.Mutex
	every   rate.Limit
	burst   int
	maxKeys int
	buckets map[string]*bucket
	now     func() time.Time
}

type bucket struct {
	lim  *rate.Limiter
	seen time.Time
}

// NewRateLimiter allows burst events immediately, then one per `per` (refill interval) for each key.
func NewRateLimiter(burst int, per time.Duration) *RateLimiter {
	return &RateLimiter{
		every: rate.Every(per), burst: burst, maxKeys: 100_000,
		buckets: map[string]*bucket{}, now: time.Now,
	}
}

// Allow consumes one token for key and reports whether the event may proceed.
func (l *RateLimiter) Allow(key string) bool {
	ok, _ := l.Take(key)
	return ok
}

// Take is Allow that also returns, when denied, how long until a token is available (Retry-After).
func (l *RateLimiter) Take(key string) (bool, time.Duration) {
	if l == nil {
		return true, 0
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	b, ok := l.buckets[key]
	if !ok {
		if len(l.buckets) >= l.maxKeys {
			l.sweep(now)
		}
		b = &bucket{lim: rate.NewLimiter(l.every, l.burst)}
		l.buckets[key] = b
	}
	b.seen = now
	if b.lim.AllowN(now, 1) {
		return true, 0
	}
	r := b.lim.ReserveN(now, 1)
	wait := r.DelayFrom(now)
	r.CancelAt(now) // only measuring: give the token back
	return false, wait
}

// sweep drops buckets idle long enough to have refilled completely (they carry no state).
// Called with mu held when the map is full; if nothing is idle the map is reset (fail open,
// bounded memory) — which is why edge rate limiting is still required.
func (l *RateLimiter) sweep(now time.Time) {
	full := time.Duration(float64(l.burst) / float64(l.every) * float64(time.Second))
	for k, b := range l.buckets {
		if now.Sub(b.seen) > full {
			delete(l.buckets, k)
		}
	}
	if len(l.buckets) >= l.maxKeys {
		clear(l.buckets)
	}
}
