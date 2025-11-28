package config

import (
	"fmt"
	"os"
)

const Version = "0.1.0"

type Config struct {
	Port     string
	RedisURL string
	Version  string
}

func Load() (*Config, error) {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		redisURL = "redis://localhost:6379"
	}

	cfg := &Config{
		Port:     port,
		RedisURL: redisURL,
		Version:  Version,
	}

	if err := cfg.Validate(); err != nil {
		return nil, err
	}

	return cfg, nil
}

func (c *Config) Validate() error {
	if c.Port == "" {
		return fmt.Errorf("port is required")
	}
	if c.RedisURL == "" {
		return fmt.Errorf("redis url is required")
	}
	return nil
}
