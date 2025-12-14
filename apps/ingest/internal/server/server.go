package server

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"github.com/cognobserve/ingest/internal/config"
	"github.com/cognobserve/ingest/internal/handler"
	authmw "github.com/cognobserve/ingest/internal/middleware"
	"github.com/cognobserve/ingest/internal/temporal"
)

// Server represents the HTTP server
type Server struct {
	cfg            *config.Config
	handler        *handler.Handler
	router         chi.Router
	server         *http.Server
	temporalClient *temporal.Client
}

// New creates a new server with Temporal client
func New(cfg *config.Config, temporalClient *temporal.Client) *Server {
	h := handler.New(temporalClient)
	r := chi.NewRouter()

	s := &Server{
		cfg:            cfg,
		handler:        h,
		router:         r,
		temporalClient: temporalClient,
	}

	s.setupRoutes()
	return s
}

func (s *Server) setupRoutes() {
	r := s.router

	// Middleware
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(30 * time.Second))

	// CORS
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-Project-ID", "X-API-Key"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: false,
		MaxAge:           300,
	}))

	// Health check (no auth)
	r.Get("/health", s.handler.Health)

	// API routes
	r.Route("/v1", func(r chi.Router) {
		// Authentication middleware chain:
		// 1. API key auth (if X-API-Key header present)
		// 2. Optional JWT auth (if Authorization header present)
		// 3. Require at least one auth method
		r.Use(authmw.APIKeyAuth(s.cfg))
		r.Use(authmw.OptionalJWTAuth)
		r.Use(authmw.RequireAuth)

		// Trace endpoints (require project access)
		r.Route("/traces", func(r chi.Router) {
			r.Use(authmw.RequireProjectAccess("X-Project-ID"))
			r.Post("/", s.handler.IngestTrace)
		})
	})
}

// Run starts the server and blocks until context is cancelled
func (s *Server) Run(ctx context.Context) error {
	s.server = &http.Server{
		Addr:         fmt.Sprintf(":%s", s.cfg.Port),
		Handler:      s.router,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Start server in goroutine
	errCh := make(chan error, 1)
	go func() {
		if err := s.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			errCh <- err
		}
	}()

	// Wait for context cancellation or error
	select {
	case <-ctx.Done():
		// Graceful shutdown
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return s.server.Shutdown(shutdownCtx)
	case err := <-errCh:
		return err
	}
}

// Close cleans up server resources
func (s *Server) Close() {
	if s.temporalClient != nil {
		s.temporalClient.Close()
	}
}
