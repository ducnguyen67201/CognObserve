package handler

import (
	"github.com/cognobserve/ingest/internal/queue"
)

// Handler holds dependencies for HTTP handlers
type Handler struct {
	producer queue.Producer
}

// New creates a new Handler
func New(producer queue.Producer) *Handler {
	return &Handler{
		producer: producer,
	}
}
