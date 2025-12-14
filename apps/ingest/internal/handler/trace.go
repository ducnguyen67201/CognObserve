package handler

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/cognobserve/ingest/internal/temporal"
)

// UserInfoInput represents user information in the request
type UserInfoInput struct {
	Name     *string        `json:"name,omitempty"`
	Email    *string        `json:"email,omitempty"`
	Metadata map[string]any `json:"metadata,omitempty"`
}

// IngestTraceRequest represents the incoming trace request
// This mirrors the proto definition but uses JSON-friendly types
type IngestTraceRequest struct {
	TraceID   *string           `json:"trace_id,omitempty"`
	SessionID *string           `json:"session_id,omitempty"` // External session ID for conversations
	UserID    *string           `json:"user_id,omitempty"`    // External user ID for tracking end-users
	User      *UserInfoInput    `json:"user,omitempty"`       // Optional user metadata
	Name      string            `json:"name"`
	Metadata  map[string]any    `json:"metadata,omitempty"`
	Spans     []IngestSpanInput `json:"spans"`
}

// IngestSpanInput represents a span in the request
type IngestSpanInput struct {
	SpanID          *string          `json:"span_id,omitempty"`
	ParentSpanID    *string          `json:"parent_span_id,omitempty"`
	Name            string           `json:"name"`
	StartTime       *time.Time       `json:"start_time,omitempty"` // Defaults to now if not provided
	EndTime         *time.Time       `json:"end_time,omitempty"`   // Defaults to now if not provided
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
	TraceID    string   `json:"trace_id"`
	SpanIDs    []string `json:"span_ids"`
	WorkflowID string   `json:"workflow_id,omitempty"` // Present when using Temporal
	Success    bool     `json:"success"`
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

	// Build workflow input
	input := temporal.TraceWorkflowInput{
		ID:        traceID,
		ProjectID: projectID,
		Name:      req.Name,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		Metadata:  req.Metadata,
	}

	if req.SessionID != nil {
		input.SessionID = *req.SessionID
	}

	if req.UserID != nil {
		input.UserID = *req.UserID
	}

	if req.User != nil {
		input.User = &temporal.UserInput{}
		if req.User.Name != nil {
			input.User.Name = *req.User.Name
		}
		if req.User.Email != nil {
			input.User.Email = *req.User.Email
		}
	}

	// Convert spans
	spanIDs := make([]string, 0, len(req.Spans))
	now := time.Now().UTC()
	input.Spans = make([]temporal.SpanInput, len(req.Spans))

	for i, s := range req.Spans {
		spanID := generateID()
		if s.SpanID != nil && *s.SpanID != "" {
			spanID = *s.SpanID
		}
		spanIDs = append(spanIDs, spanID)

		// Default start_time to now if not provided
		startTime := now
		if s.StartTime != nil {
			startTime = *s.StartTime
		}

		span := temporal.SpanInput{
			ID:              spanID,
			Name:            s.Name,
			StartTime:       startTime.Format(time.RFC3339),
			Input:           s.Input,
			Output:          s.Output,
			Metadata:        s.Metadata,
			ModelParameters: s.ModelParameters,
			Level:           s.Level,
		}

		if s.ParentSpanID != nil {
			span.ParentSpanID = *s.ParentSpanID
		}

		if s.EndTime != nil {
			span.EndTime = s.EndTime.Format(time.RFC3339)
		} else {
			span.EndTime = now.Format(time.RFC3339)
		}

		if s.Model != nil {
			span.Model = *s.Model
		}

		if s.StatusMessage != nil {
			span.StatusMessage = *s.StatusMessage
		}

		if s.Usage != nil {
			if s.Usage.PromptTokens != nil {
				span.PromptTokens = int(*s.Usage.PromptTokens)
			}
			if s.Usage.CompletionTokens != nil {
				span.CompletionTokens = int(*s.Usage.CompletionTokens)
			}
			if s.Usage.TotalTokens != nil {
				span.TotalTokens = int(*s.Usage.TotalTokens)
			}
		}

		input.Spans[i] = span
	}

	// Start Temporal workflow
	workflowID, err := h.temporalClient.StartTraceWorkflow(r.Context(), input)
	if err != nil {
		slog.Error("failed to start trace workflow", "error", err, "trace_id", traceID)
		http.Error(w, "failed to process trace", http.StatusInternalServerError)
		return
	}
	slog.Info("trace workflow started", "trace_id", traceID, "workflow_id", workflowID, "spans", len(input.Spans))

	// Send response
	resp := IngestTraceResponse{
		TraceID:    traceID,
		SpanIDs:    spanIDs,
		WorkflowID: workflowID,
		Success:    true,
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
