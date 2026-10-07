package auth

import (
	"context"
	"net"
	"net/http"
	"net/netip"
	"strings"
)

// Proxies decides whether X-Forwarded-For/-Proto/-Host can be believed: only when the direct peer
// (RemoteAddr) is inside one of the TRUSTED_PROXIES prefixes. With none configured the headers are
// ignored, so a client can never spoof its IP (which would defeat per-IP rate limits).
type Proxies struct{ trusted []netip.Prefix }

// NewProxies builds a Proxies from CIDRs or single IPs (e.g. "10.0.0.0/8", "127.0.0.1").
func NewProxies(entries []string) (Proxies, error) {
	var p Proxies
	for _, e := range entries {
		e = strings.TrimSpace(e)
		if e == "" {
			continue
		}
		if !strings.Contains(e, "/") {
			addr, err := netip.ParseAddr(e)
			if err != nil {
				return Proxies{}, err
			}
			e = netip.PrefixFrom(addr, addr.BitLen()).String()
		}
		pfx, err := netip.ParsePrefix(e)
		if err != nil {
			return Proxies{}, err
		}
		p.trusted = append(p.trusted, pfx.Masked())
	}
	return p, nil
}

func (p Proxies) isTrusted(a netip.Addr) bool {
	a = a.Unmap()
	for _, pfx := range p.trusted {
		if pfx.Contains(a) {
			return true
		}
	}
	return false
}

// ClientMeta describes the caller as seen through trusted proxies.
type ClientMeta struct {
	IP        string
	UserAgent string
	Scheme    string // "https" or "http"
	Host      string
}

type metaKey struct{}

// Meta returns the request's ClientMeta (zero value outside the middleware).
func Meta(ctx context.Context) ClientMeta {
	m, _ := ctx.Value(metaKey{}).(ClientMeta)
	return m
}

// WithMeta stores m in ctx (used by tests and the middleware).
func WithMeta(ctx context.Context, m ClientMeta) context.Context {
	return context.WithValue(ctx, metaKey{}, m)
}

// Middleware resolves ClientMeta once per request.
func (p Proxies) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		next.ServeHTTP(w, r.WithContext(WithMeta(r.Context(), p.Resolve(r))))
	})
}

// Resolve computes ClientMeta for r.
func (p Proxies) Resolve(r *http.Request) ClientMeta {
	m := ClientMeta{UserAgent: truncate(r.UserAgent(), 512), Scheme: "http", Host: r.Host}
	if r.TLS != nil {
		m.Scheme = "https"
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	peer, err := netip.ParseAddr(host)
	if err != nil {
		m.IP = truncate(host, 64)
		return m
	}
	m.IP = peer.Unmap().String()
	if !p.isTrusted(peer) {
		return m
	}
	// Walk X-Forwarded-For right to left; the first hop that is not a trusted proxy is the client.
	var hops []string
	for _, v := range r.Header.Values("X-Forwarded-For") {
		hops = append(hops, strings.Split(v, ",")...)
	}
	for i := len(hops) - 1; i >= 0; i-- {
		a, err := netip.ParseAddr(strings.TrimSpace(hops[i]))
		if err != nil {
			break
		}
		m.IP = a.Unmap().String()
		if !p.isTrusted(a) {
			break
		}
	}
	if proto := strings.ToLower(strings.TrimSpace(r.Header.Get("X-Forwarded-Proto"))); proto == "https" || proto == "http" {
		m.Scheme = proto
	}
	if h := strings.TrimSpace(r.Header.Get("X-Forwarded-Host")); h != "" {
		m.Host = truncate(h, 255)
	}
	return m
}

// truncate cuts s to at most n bytes and drops invalid UTF-8 (Postgres text rejects it).
func truncate(s string, n int) string {
	if len(s) > n {
		s = s[:n]
	}
	return strings.ToValidUTF8(s, "")
}
