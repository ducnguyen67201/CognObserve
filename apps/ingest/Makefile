.PHONY: build run test lint clean proto

# Variables
BINARY_NAME=ingest
GO=go

# Build the binary
build:
	$(GO) build -o bin/$(BINARY_NAME) ./cmd/ingest

# Run the service (loads .env from root)
run:
	@set -a && source ../../.env && set +a && $(GO) run ./cmd/ingest

# Run with hot reload (requires air: go install github.com/air-verse/air@latest)
# Loads environment variables from root .env
dev:
	@set -a && source ../../.env && set +a && air

# Run tests
test:
	$(GO) test -v ./...

# Run tests with coverage
test-coverage:
	$(GO) test -v -coverprofile=coverage.out ./...
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

# Docker run
docker-run:
	docker run -p 8080:8080 --env-file ../../.env cognobserve-ingest:latest
