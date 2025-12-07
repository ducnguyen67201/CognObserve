.PHONY: build run test lint clean proto dev dev-no-doppler

# Variables
BINARY_NAME=ingest
GO=go

# Build the binary
build:
	$(GO) build -o bin/$(BINARY_NAME) ./cmd/ingest

# Run the service with Doppler secrets
run:
	doppler run -- $(GO) run ./cmd/ingest

# Run with hot reload using Doppler (requires air: go install github.com/air-verse/air@latest)
dev:
	doppler run -- air

# Run with hot reload WITHOUT Doppler (fallback, loads from .env)
dev-no-doppler:
	@set -a && source ../../.env && set +a && air

# Run tests with Doppler secrets
test:
	doppler run -- $(GO) test -v ./...

# Run tests with coverage
test-coverage:
	doppler run -- $(GO) test -v -coverprofile=coverage.out ./...
	$(GO) tool cover -html=coverage.out -o coverage.html

# Lint (requires golangci-lint)
lint:
	golangci-lint run

# Clean build artifacts
clean:
	rm -rf bin/
	rm -f coverage.out coverage.html

# Download dependencies
deps:
	$(GO) mod download
	$(GO) mod tidy

# Docker build
docker-build:
	docker build -t cognobserve-ingest:latest .

# Docker run with Doppler (requires DOPPLER_TOKEN env var)
docker-run:
	docker run -p 8080:8080 -e DOPPLER_TOKEN=${DOPPLER_TOKEN} cognobserve-ingest:latest

# Production run (expects DOPPLER_TOKEN env var to be set)
run-prod:
	doppler run -- ./bin/$(BINARY_NAME)
