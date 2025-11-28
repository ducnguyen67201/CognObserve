package handler

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/cognobserve/ingest/internal/model"
)

// IngestTraceRequest represents the incoming trace request
// This mirrors the proto definition but uses JSON-friendly types
type IngestTraceRequest struct {
	TraceID  *string           `json:"trace_id,omitempty"`
	Name     string            `json:"name"`
	Metadata map[string]any    `json:"metadata,omitempty"`
	Spans    []IngestSpanInput `json:"spans"`
}

// IngestSpanInput represents a span in the request
type IngestSpanInput struct {
	SpanID          *string          `json:"span_id,omitempty"`
	ParentSpanID    *string          `json:"parent_span_id,omitempty"`
	Name            string           `json:"name"`
	StartTime       time.Time        `json:"start_time"`
	EndTime         *time.Time       `json:"end_time,omitempty"`
	Input           map[string]any   `json:"input,omitempty"`
	Output          map[string]any   `json:"output,omitempty"`
	Metadata        map[string]any   `json:"metadata,omitempty"`
	Model           *string          `json:"model,omitempty"`
	ModelParameters map[string]any   `json:"model_parameters,omitempty"`
	Usage           *TokenUsageInput `json:"usage,omitempty"`
	Level           string           `json:"level,omitempty"`
	StatusMessage   *string          `json:"status_message,omitempty"`
}

// TokenUsageInput represents token usage in the request
type TokenUsageInput struct {
	PromptTokens     *int32 `json:"prompt_tokens,omitempty"`
	CompletionTokens *int32 `json:"completion_tokens,omitempty"`
	TotalTokens      *int32 `json:"total_tokens,omitempty"`
}

// IngestTraceResponse represents the response after ingesting
type IngestTraceResponse struct {
	TraceID string   `json:"trace_id"`
	SpanIDs []string `json:"span_ids"`
	Success bool     `json:"success"`
}

// IngestTrace handles POST /v1/traces
func (h *Handler) IngestTrace(w http.ResponseWriter, r *http.Request) {
	var req IngestTraceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		slog.Warn("failed to decode request", "error", err)
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	// Validate request
	if req.Name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}

	// Get project ID from header (set by auth middleware)
	projectID := r.Header.Get("X-Project-ID")
	if projectID == "" {
		projectID = "default" // For testing
	}

	// Generate trace ID if not provided
	traceID := generateID()
	if req.TraceID != nil && *req.TraceID != "" {
		traceID = *req.TraceID
	}

	// Convert to internal model
	trace := &model.Trace{
		ID:        traceID,
		ProjectID: projectID,
		Name:      req.Name,
		Timestamp: time.Now().UTC(),
		Metadata:  req.Metadata,
		Spans:     make([]model.Span, 0, len(req.Spans)),
	}

	spanIDs := make([]string, 0, len(req.Spans))
	for _, s := range req.Spans {
		spanID := generateID()
		if s.SpanID != nil && *s.SpanID != "" {
			spanID = *s.SpanID
		}
		spanIDs = append(spanIDs, spanID)

		span := model.Span{
			ID:              spanID,
			TraceID:         traceID,
			ParentSpanID:    s.ParentSpanID,
			Name:            s.Name,
			StartTime:       s.StartTime,
			EndTime:         s.EndTime,
			Input:           s.Input,
			Output:          s.Output,
			Metadata:        s.Metadata,
			Model:           s.Model,
			ModelParameters: s.ModelParameters,
			Level:           parseSpanLevel(s.Level),
			StatusMessage:   s.StatusMessage,
		}

		if s.Usage != nil {
			span.Usage = &model.TokenUsage{
				PromptTokens:     s.Usage.PromptTokens,
				CompletionTokens: s.Usage.CompletionTokens,
				TotalTokens:      s.Usage.TotalTokens,
			}
		}

		trace.Spans = append(trace.Spans, span)
	}

	// Publish to queue
	if err := h.producer.PublishTrace(r.Context(), trace); err != nil {
		slog.Error("failed to publish trace", "error", err, "trace_id", traceID)
		http.Error(w, "failed to process trace", http.StatusInternalServerError)
		return
	}

	slog.Info("trace ingested", "trace_id", traceID, "spans", len(trace.Spans))

	// Send response
	resp := IngestTraceResponse{
		TraceID: traceID,
		SpanIDs: spanIDs,
		Success: true,
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	_ = json.NewEncoder(w).Encode(resp)
}

// generateID generates a random ID
func generateID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// parseSpanLevel converts string to SpanLevel
func parseSpanLevel(level string) model.SpanLevel {
	switch level {
	case "DEBUG":
		return model.SpanLevelDebug
	case "DEFAULT", "":
		return model.SpanLevelDefault
	case "WARNING":
		return model.SpanLevelWarning
	case "ERROR":
		return model.SpanLevelError
	default:
		return model.SpanLevelDefault
	}
}
