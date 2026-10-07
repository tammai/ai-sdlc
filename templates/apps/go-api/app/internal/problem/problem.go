// Package problem renders RFC 9457 problem details (application/problem+json).
package problem

import (
	"encoding/json"
	"net/http"
)

// ContentType is the media type for problem details.
const ContentType = "application/problem+json"

// Error is an error that maps to an HTTP problem response. Handlers return it (or wrap it);
// the server's error handlers write it. Detail must be safe to show to clients.
type Error struct {
	Status int
	Title  string
	Detail string
	Header http.Header // extra response headers (e.g. Retry-After on 429); optional
}

func (e *Error) Error() string {
	if e.Detail != "" {
		return e.Title + ": " + e.Detail
	}
	return e.Title
}

// New builds an Error with the standard status text as title.
func New(status int, detail string) *Error {
	return &Error{Status: status, Title: http.StatusText(status), Detail: detail}
}

// body mirrors the Problem schema in contracts/openapi.yaml.
type body struct {
	Type   string `json:"type,omitempty"`
	Title  string `json:"title"`
	Status int    `json:"status"`
	Detail string `json:"detail,omitempty"`
}

// Write sends the problem as application/problem+json.
func Write(w http.ResponseWriter, e *Error) {
	for k, vs := range e.Header {
		for _, v := range vs {
			w.Header().Add(k, v)
		}
	}
	w.Header().Set("Content-Type", ContentType)
	w.WriteHeader(e.Status)
	_ = json.NewEncoder(w).Encode(body{Type: "about:blank", Title: e.Title, Status: e.Status, Detail: e.Detail})
}
