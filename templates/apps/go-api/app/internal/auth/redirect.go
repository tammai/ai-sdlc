package auth

import (
	"net/url"
	"slices"
	"strings"
)

// MaxRedirectLen bounds the app-relative redirect (mirrors startOidc.redirect in the contract).
const MaxRedirectLen = 512

// SafeRedirectPath validates an app-relative path to land on after a web sign-in. Only same-app
// paths are allowed ("/notes?x=1"); absolute URLs, scheme-relative ("//evil.com"), backslash tricks
// ("/\evil.com"), control characters and anything that would parse with a scheme or host are rejected
// (open-redirect safe). Empty means "/".
func SafeRedirectPath(p string) (string, bool) {
	if p == "" {
		return "/", true
	}
	if len(p) > MaxRedirectLen || !strings.HasPrefix(p, "/") || strings.HasPrefix(p, "//") ||
		strings.ContainsAny(p, "\\") || strings.ContainsFunc(p, func(r rune) bool { return r < 0x20 || r == 0x7f }) {
		return "", false
	}
	u, err := url.Parse(p)
	if err != nil || u.Scheme != "" || u.Host != "" || u.User != nil || u.Opaque != "" || !strings.HasPrefix(u.Path, "/") {
		return "", false
	}
	// Percent-encoded slashes/backslashes at the start could be normalised into "//" by a later hop.
	if lp := strings.ToLower(p); strings.HasPrefix(lp, "/%2f") || strings.HasPrefix(lp, "/%5c") {
		return "", false
	}
	return p, true
}

// AllowedNativeRedirect returns uri when it exactly matches an entry of the allow-list
// (NATIVE_REDIRECT_URIS); an empty uri selects the first entry. No prefix or pattern matching.
func AllowedNativeRedirect(allowList []string, uri string) (string, bool) {
	if len(allowList) == 0 {
		return "", false
	}
	if uri == "" {
		return allowList[0], true
	}
	if slices.Contains(allowList, uri) {
		return uri, true
	}
	return "", false
}

// withQuery appends query parameters to an absolute URI (custom schemes included).
func withQuery(base string, kv ...string) string {
	u, err := url.Parse(base)
	if err != nil {
		return base
	}
	q := u.Query()
	for i := 0; i+1 < len(kv); i += 2 {
		q.Set(kv[i], kv[i+1])
	}
	u.RawQuery = q.Encode()
	return u.String()
}
