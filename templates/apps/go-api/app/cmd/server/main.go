// Command server wires config, database, auth and the HTTP router, then serves until SIGINT/SIGTERM.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"__GO_MODULE__/internal/auth"
	"__GO_MODULE__/internal/config"
	"__GO_MODULE__/internal/db"
	"__GO_MODULE__/internal/notes"
	"__GO_MODULE__/internal/server"
)

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(log)
	if err := run(log); err != nil {
		log.Error("fatal", "error", err)
		os.Exit(1)
	}
}

func run(log *slog.Logger) error {
	cfg, err := config.FromEnv()
	if err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()

	if cfg.RunMigrations {
		mctx, cancel := context.WithTimeout(ctx, time.Minute)
		defer cancel()
		if err := db.Migrate(mctx, pool); err != nil {
			return err
		}
		log.Info("migrations applied")
	}

	authMW, err := auth.Middleware(ctx, auth.Options{
		JWKSURL:  cfg.JWKSURL,
		Issuer:   cfg.JWTIssuer,
		Audience: cfg.JWTAudience,
		Public:   server.PublicPaths,
	}, log)
	if err != nil {
		return err
	}

	svc := notes.NewService(notes.NewPGRepo(pool), log)
	srv := &http.Server{
		Addr: net.JoinHostPort("", cfg.Port),
		Handler: server.NewRouter(server.Deps{
			Notes: notes.NewHandler(svc),
			Ready: pool.Ping,
			Auth:  authMW,
			Log:   log,
		}),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      35 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		log.Info("listening", "addr", srv.Addr)
		errCh <- srv.ListenAndServe()
	}()

	select {
	case err := <-errCh:
		return err
	case <-ctx.Done():
		log.Info("shutting down")
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}
