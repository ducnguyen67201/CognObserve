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
	"github.com/cognobserve/ingest/internal/queue"
)

// Server represents the HTTP server
type Server struct {
	cfg     *config.Config
	handler *handler.Handler
	router  chi.Router
	server  *http.Server
}

// New creates a new server
func New(cfg *config.Config, producer queue.Producer) *Server {
	h := handler.New(producer)
	r := chi.NewRouter()

	s := &Server{
		cfg:     cfg,
		handler: h,
		router:  r,
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
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-Project-ID"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: false,
		MaxAge:           300,
	}))

	// Health check (no auth)
	r.Get("/health", s.handler.Health)

	// API routes
	r.Route("/v1", func(r chi.Router) {
		// JWT authentication middleware
		r.Use(authmw.JWTAuth)

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
