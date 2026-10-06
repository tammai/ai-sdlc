// Package migrations embeds the goose SQL migrations so the server binary (and tests)
// can apply them without the goose CLI. Migrations are append-only: never edit an applied one.
package migrations

import "embed"

// FS holds every NNNN_*.sql migration at its root.
//
//go:embed *.sql
var FS embed.FS
