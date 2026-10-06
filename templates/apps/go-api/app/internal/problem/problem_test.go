package problem_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"__GO_MODULE__/internal/problem"
)

func TestWrite(t *testing.T) {
	rec := httptest.NewRecorder()
	problem.Write(rec, problem.New(http.StatusUnprocessableEntity, "title is required"))

	if got := rec.Header().Get("Content-Type"); got != problem.ContentType {
		t.Fatalf("content-type = %q, want %q", got, problem.ContentType)
	}
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d", rec.Code)
	}
	var got map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got["title"] != "Unprocessable Entity" || got["detail"] != "title is required" || got["status"] != float64(422) {
		t.Fatalf("unexpected body: %v", got)
	}
}
