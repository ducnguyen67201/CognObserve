.PHONY: setup proto proto-lint proto-breaking install-buf dev build clean

# ============================================================================
# QUICK START
# ============================================================================

# One command setup - installs everything and starts infrastructure
setup:
	@./scripts/setup.sh

# ============================================================================
# DEVELOPMENT
# ============================================================================

# Development - run all TypeScript services
dev:
	pnpm dev

# Development - run Go ingest service (run in separate terminal)
dev-ingest:
	cd apps/ingest && make dev

# Install all dependencies
install:
	pnpm install
	cd apps/ingest && go mod download

# Format all code
format:
	pnpm format
	cd apps/ingest && go fmt ./...

# ============================================================================
# PROTO / TYPES
# ============================================================================

# Install buf CLI
install-buf:
	@which buf > /dev/null || (echo "Installing buf..." && \
		curl -sSL "https://github.com/bufbuild/buf/releases/download/v1.47.2/buf-$(shell uname -s)-$(shell uname -m)" -o /usr/local/bin/buf && \
		chmod +x /usr/local/bin/buf)

# Generate proto types for all languages
proto:
	make install-buf
	buf generate

# Lint proto files
proto-lint:
	buf lint

# Check for breaking changes
proto-breaking:
	buf breaking --against '.git#branch=main'

# Update buf dependencies
proto-deps:
	buf dep update

# ============================================================================
# DATABASE
# ============================================================================

# Generate Prisma client
db-generate:
	pnpm db:generate

# Push schema to database
db-push:
	pnpm db:push

# Open Prisma Studio
db-studio:
	pnpm db:studio

# ============================================================================
# BUILD
# ============================================================================

# Build all services
build:
	pnpm build
	cd apps/ingest && make build

# Clean all build artifacts
clean:
	pnpm clean
	cd apps/ingest && make clean

# ============================================================================
# DOCKER
# ============================================================================

# Start PostgreSQL and Redis
docker-up:
	docker-compose up -d

# Stop containers
docker-down:
	docker-compose down

# Stop and remove volumes
docker-reset:
	docker-compose down -v

# View logs
docker-logs:
	docker-compose logs -f

# ============================================================================
# HELP
# ============================================================================

help:
	@echo ""
	@echo "CognObserve - AI Observability Platform"
	@echo ""
	@echo "Quick Start:"
	@echo "  make setup          - One command setup (recommended for new devs)"
	@echo ""
	@echo "Development:"
	@echo "  make dev            - Run TypeScript apps (web, worker)"
	@echo "  make dev-ingest     - Run Go ingest service"
	@echo "  make install        - Install all dependencies"
	@echo "  make format         - Format all code"
	@echo ""
	@echo "Proto/Types:"
	@echo "  make proto          - Generate Go + TypeScript types"
	@echo "  make proto-lint     - Lint proto files"
	@echo "  make install-buf    - Install buf CLI"
	@echo ""
	@echo "Database:"
	@echo "  make db-generate    - Generate Prisma client"
	@echo "  make db-push        - Push schema to database"
	@echo "  make db-studio      - Open Prisma Studio GUI"
	@echo ""
	@echo "Docker:"
	@echo "  make docker-up      - Start PostgreSQL + Redis"
	@echo "  make docker-down    - Stop containers"
	@echo "  make docker-reset   - Stop and remove volumes"
	@echo ""
	@echo "Build:"
	@echo "  make build          - Build all services"
	@echo "  make clean          - Clean build artifacts"
	@echo ""
