package config

import (
	"fmt"

	"github.com/caarlos0/env/v11"
)

const Version = "0.1.0"

// Config holds all configuration for the ingest service.
// Uses struct tags for validation (similar to @t3-oss/env-nextjs).
//
// Usage with Doppler:
//
//	doppler run -- go run cmd/ingest/main.go
type Config struct {
	// Server
	Port    string `env:"PORT" envDefault:"8080"`
	Version string `env:"-"` // Set programmatically

	// Web API (for internal validation calls)
	WebAPIURL string `env:"WEB_API_URL" envDefault:"http://localhost:3000"`

	// Security - Required, injected via Doppler in production
	InternalAPISecret string `env:"INTERNAL_API_SECRET,required"`
	JWTSharedSecret   string `env:"JWT_SHARED_SECRET,required"`

	// API Key Configuration (matches web app env)
	APIKeyPrefix            string `env:"API_KEY_PREFIX" envDefault:"co_sk_"`
	APIKeyRandomBytesLength int    `env:"API_KEY_RANDOM_BYTES_LENGTH" envDefault:"32"`

	// Temporal Configuration (required - Temporal is the only queue backend)
	TemporalAddress   string `env:"TEMPORAL_ADDRESS" envDefault:"localhost:7233"`
	TemporalNamespace string `env:"TEMPORAL_NAMESPACE" envDefault:"default"`
	TemporalTaskQueue string `env:"TEMPORAL_TASK_QUEUE" envDefault:"cognobserve-tasks"`
}

// Load parses environment variables into Config struct.
// Returns error if required fields are missing or validation fails.
func Load() (*Config, error) {
	cfg := &Config{}

	if err := env.Parse(cfg); err != nil {
		return nil, fmt.Errorf("failed to parse env: %w", err)
	}

	cfg.Version = Version

	if err := cfg.Validate(); err != nil {
		return nil, err
	}

	return cfg, nil
}

// Validate performs additional validation beyond struct tags.
func (c *Config) Validate() error {
	if len(c.InternalAPISecret) < 32 {
		return fmt.Errorf("INTERNAL_API_SECRET must be at least 32 characters (got %d)", len(c.InternalAPISecret))
	}
	if len(c.JWTSharedSecret) < 32 {
		return fmt.Errorf("JWT_SHARED_SECRET must be at least 32 characters (got %d)", len(c.JWTSharedSecret))
	}
	if c.APIKeyRandomBytesLength < 16 || c.APIKeyRandomBytesLength > 64 {
		return fmt.Errorf("API_KEY_RANDOM_BYTES_LENGTH must be between 16 and 64 (got %d)", c.APIKeyRandomBytesLength)
	}
	return nil
}
