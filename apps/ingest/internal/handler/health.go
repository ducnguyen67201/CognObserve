package handler

import (
	"encoding/json"
	"net/http"

	"github.com/cognobserve/ingest/internal/config"
)

type HealthResponse struct {
	Status  string `json:"status"`
	Version string `json:"version"`
}

// Health handles GET /health
func (h *Handler) Health(w http.ResponseWriter, r *http.Request) {
	resp := HealthResponse{
		Status:  "ok",
		Version: config.Version,
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(resp)
}
