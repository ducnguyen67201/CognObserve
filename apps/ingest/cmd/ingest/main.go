package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/cognobserve/ingest/internal/config"
	"github.com/cognobserve/ingest/internal/server"
	"github.com/cognobserve/ingest/internal/temporal"
)

// Environment variables are injected by Doppler at runtime.
// Run with: doppler run -- go run ./cmd/ingest
// See: docs/specs/issue-104-doppler-secret-management.md

func main() {
	// Setup structured logging
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	slog.SetDefault(logger)

	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		slog.Error("failed to load config", "error", err)
		os.Exit(1)
	}

	// Initialize Temporal client (required)
	slog.Info("connecting to temporal...",
		"address", cfg.TemporalAddress,
		"namespace", cfg.TemporalNamespace,
		"task_queue", cfg.TemporalTaskQueue,
	)
	temporalClient, err := temporal.New(
		cfg.TemporalAddress,
		cfg.TemporalNamespace,
		cfg.TemporalTaskQueue,
	)
	if err != nil {
		slog.Error("failed to connect to temporal", "error", err)
		os.Exit(1)
	}
	defer temporalClient.Close()
	slog.Info("temporal client connected")

	// Create and start server
	srv := server.New(cfg, temporalClient)
	defer srv.Close()

	// Graceful shutdown
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh
		slog.Info("shutdown signal received")
		cancel()
	}()

	slog.Info("starting ingest service",
		"port", cfg.Port,
		"version", cfg.Version,
	)

	if err := srv.Run(ctx); err != nil {
		slog.Error("server error", "error", err)
		os.Exit(1)
	}

	// Allow time for graceful shutdown
	time.Sleep(100 * time.Millisecond)
	slog.Info("ingest service stopped")
}
