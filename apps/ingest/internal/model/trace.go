package model

import "time"

// UserInfo represents end-user information for tracking
type UserInfo struct {
	Name     *string        `json:",omitempty"`
	Email    *string        `json:",omitempty"`
	Metadata map[string]any `json:",omitempty"`
}

// Trace represents a trace in the system
// These are internal models - proto types are used for API layer
type Trace struct {
	ID        string
	ProjectID string
	SessionID *string   // External session ID for grouping conversations
	UserID    *string   // External user ID for tracking end-users
	User      *UserInfo // Optional user metadata
	Name      string
	Timestamp time.Time
	Metadata  map[string]any
	Spans     []Span
}

// Span represents a span within a trace
type Span struct {
	ID              string
	TraceID         string
	ParentSpanID    *string
	Name            string
	StartTime       time.Time
	EndTime         *time.Time
	Input           map[string]any
	Output          map[string]any
	Metadata        map[string]any
	Model           *string
	ModelParameters map[string]any
	Usage           *TokenUsage
	Level           SpanLevel
	StatusMessage   *string
}

// TokenUsage represents token usage for LLM calls
type TokenUsage struct {
	PromptTokens     *int32
	CompletionTokens *int32
	TotalTokens      *int32
}

// SpanLevel represents the severity level of a span
type SpanLevel int

const (
	SpanLevelUnspecified SpanLevel = iota
	SpanLevelDebug
	SpanLevelDefault
	SpanLevelWarning
	SpanLevelError
)
