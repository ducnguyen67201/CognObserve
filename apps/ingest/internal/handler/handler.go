package handler

import (
	"github.com/cognobserve/ingest/internal/temporal"
)

// Handler holds dependencies for HTTP handlers
type Handler struct {
	temporalClient *temporal.Client
}

// New creates a new Handler with Temporal client
func New(temporalClient *temporal.Client) *Handler {
	return &Handler{
		temporalClient: temporalClient,
	}
}
