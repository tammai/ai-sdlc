package db

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"

	"__GO_MODULE__/migrations"
)

// Migrate applies the embedded goose migrations (migrations/*.sql) to the pool's database.
// Used by RUN_MIGRATIONS=true and by integration tests. Production deploys may prefer running
// `go tool goose` as a gated release step instead.
func Migrate(ctx context.Context, pool *pgxpool.Pool) error {
	sqlDB := stdlib.OpenDBFromPool(pool)
	defer func() { _ = sqlDB.Close() }()
	return migrateSQL(ctx, sqlDB)
}

func migrateSQL(ctx context.Context, sqlDB *sql.DB) error {
	provider, err := goose.NewProvider(goose.DialectPostgres, sqlDB, migrations.FS)
	if err != nil {
		return fmt.Errorf("goose provider: %w", err)
	}
	if _, err := provider.Up(ctx); err != nil {
		return fmt.Errorf("goose up: %w", err)
	}
	return nil
}
