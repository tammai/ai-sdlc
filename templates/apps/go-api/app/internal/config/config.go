// Package config reads process configuration from the environment.
package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
)

// Config is the server configuration. See .env.example.
type Config struct {
	Port          string // PORT (default 8080)
	DatabaseURL   string // DATABASE_URL (required)
	RunMigrations bool   // RUN_MIGRATIONS=true applies the embedded goose migrations on start
	JWKSURL       string // AUTH_JWKS_URL — when empty, JWT validation is OFF (local dev only)
	JWTIssuer     string // AUTH_ISSUER — optional `iss` check
	JWTAudience   string // AUTH_AUDIENCE — optional `aud` check
	Production    bool   // APP_ENV=production
}

// FromEnv loads and validates configuration.
func FromEnv() (Config, error) {
	c := Config{
		Port:        getenv("PORT", "8080"),
		DatabaseURL: os.Getenv("DATABASE_URL"),
		JWKSURL:     os.Getenv("AUTH_JWKS_URL"),
		JWTIssuer:   os.Getenv("AUTH_ISSUER"),
		JWTAudience: os.Getenv("AUTH_AUDIENCE"),
		Production:  os.Getenv("APP_ENV") == "production",
	}
	if v := os.Getenv("RUN_MIGRATIONS"); v != "" {
		b, err := strconv.ParseBool(v)
		if err != nil {
			return Config{}, fmt.Errorf("RUN_MIGRATIONS must be a boolean: %w", err)
		}
		c.RunMigrations = b
	}
	if c.DatabaseURL == "" {
		return Config{}, errors.New("DATABASE_URL is required")
	}
	if c.Production && c.JWKSURL == "" {
		return Config{}, errors.New("AUTH_JWKS_URL is required when APP_ENV=production")
	}
	return c, nil
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
