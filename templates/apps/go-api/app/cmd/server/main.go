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
	if !cfg.Production {
		log.Warn("APP_ENV is not production: development settings are accepted", "cookie_secure", cfg.CookieSecure, "magic_link", cfg.MagicLink)
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

	proxies, err := auth.NewProxies(cfg.TrustedProxies)
	if err != nil {
		return err
	}
	var mailer auth.Mailer
	switch cfg.MagicLink {
	case config.MagicLinkLog:
		mailer = auth.LogMailer{Log: log}
	case config.MagicLinkSMTP:
		mailer = auth.SMTPMailer{Host: cfg.SMTP.Host, Port: cfg.SMTP.Port, Username: cfg.SMTP.Username, Password: cfg.SMTP.Password, From: cfg.SMTP.From}
	}
	authSvc, err := auth.NewService(auth.NewPGStore(pool), auth.Options{
		AppURL: cfg.AppURL, APIPublicURL: cfg.APIPublicURL, OIDCWebCallbackBase: cfg.OIDCWebCallbackBase,
		AuthErrorPath: cfg.AuthErrorPath, NativeRedirectURIs: cfg.NativeRedirectURIs,
		CookieName: cfg.CookieName, CookieSecure: cfg.CookieSecure,
		SessionTTL: cfg.SessionTTL, SessionAbsoluteTTL: cfg.SessionAbsoluteTTL, AccessTTL: cfg.AccessTTL, RefreshTTL: cfg.RefreshTTL,
		RefreshAbsoluteTTL: cfg.RefreshAbsoluteTTL,
		PasswordEnabled:    cfg.PasswordEnabled, RegistrationOpen: cfg.RegistrationOpen,
		Mailer: mailer, Providers: cfg.Providers,
	}, log)
	if err != nil {
		return err
	}
	for _, p := range authSvc.Providers() {
		log.Info("oidc provider", "id", p.ID,
			"web_callback", authSvc.OIDCCallbackURL(p.ID, auth.ClientWeb), "native_callback", authSvc.OIDCCallbackURL(p.ID, auth.ClientNative))
	}
	go authSvc.RunJanitor(ctx, 10*time.Minute)

	srv := &http.Server{
		Addr: net.JoinHostPort("", cfg.Port),
		Handler: server.NewRouter(server.Deps{
			Notes:          notes.NewHandler(notes.NewService(notes.NewPGRepo(pool), log)),
			Auth:           authSvc,
			Proxies:        proxies,
			AllowedOrigins: cfg.AllowedOrigins,
			Ready:          pool.Ping,
			Log:            log,
		}),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      35 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    64 << 10,
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
