package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/cognobserve/ingest/internal/config"
	"github.com/cognobserve/ingest/internal/queue"
	"github.com/cognobserve/ingest/internal/server"
)

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

	// Initialize queue producer
	producer, err := queue.NewRedisProducer(cfg.RedisURL)
	if err != nil {
		slog.Error("failed to connect to redis", "error", err)
		os.Exit(1)
	}
	defer producer.Close()

	// Create and start server
	srv := server.New(cfg, producer)

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

	slog.Info("starting ingest service", "port", cfg.Port, "version", cfg.Version)

	if err := srv.Run(ctx); err != nil {
		slog.Error("server error", "error", err)
		os.Exit(1)
	}

	// Allow time for graceful shutdown
	time.Sleep(100 * time.Millisecond)
	slog.Info("ingest service stopped")
}
