package temporal

// TraceWorkflowInput matches the TypeScript TraceWorkflowInput type
type TraceWorkflowInput struct {
	ID        string                 `json:"id"`
	ProjectID string                 `json:"projectId"`
	Name      string                 `json:"name"`
	Timestamp string                 `json:"timestamp"` // ISO 8601 string
	Metadata  map[string]interface{} `json:"metadata,omitempty"`
	SessionID string                 `json:"sessionId,omitempty"`
	UserID    string                 `json:"userId,omitempty"`
	User      *UserInput             `json:"user,omitempty"`
	Spans     []SpanInput            `json:"spans"`
}

// UserInput matches TypeScript UserInput
type UserInput struct {
	Name  string `json:"name,omitempty"`
	Email string `json:"email,omitempty"`
	// Additional fields can be added as map entries
}

// SpanInput matches TypeScript SpanInput
type SpanInput struct {
	ID               string                 `json:"id"`
	ParentSpanID     string                 `json:"parentSpanId,omitempty"`
	Name             string                 `json:"name"`
	StartTime        string                 `json:"startTime"` // ISO 8601 string
	EndTime          string                 `json:"endTime,omitempty"`
	Input            interface{}            `json:"input,omitempty"`
	Output           interface{}            `json:"output,omitempty"`
	Metadata         map[string]interface{} `json:"metadata,omitempty"`
	Model            string                 `json:"model,omitempty"`
	ModelParameters  map[string]interface{} `json:"modelParameters,omitempty"`
	PromptTokens     int                    `json:"promptTokens,omitempty"`
	CompletionTokens int                    `json:"completionTokens,omitempty"`
	TotalTokens      int                    `json:"totalTokens,omitempty"`
	Level            string                 `json:"level,omitempty"` // DEBUG, DEFAULT, WARNING, ERROR
	StatusMessage    string                 `json:"statusMessage,omitempty"`
}

// ScoreWorkflowInput matches TypeScript ScoreWorkflowInput
type ScoreWorkflowInput struct {
	ID            string                 `json:"id"`
	ProjectID     string                 `json:"projectId"`
	ConfigID      string                 `json:"configId,omitempty"`
	TraceID       string                 `json:"traceId,omitempty"`
	SpanID        string                 `json:"spanId,omitempty"`
	SessionID     string                 `json:"sessionId,omitempty"`
	TrackedUserID string                 `json:"trackedUserId,omitempty"`
	Name          string                 `json:"name"`
	Value         interface{}            `json:"value"` // number, string, or boolean
	Comment       string                 `json:"comment,omitempty"`
	Metadata      map[string]interface{} `json:"metadata,omitempty"`
}

// TraceWorkflowResult matches TypeScript TraceWorkflowResult
type TraceWorkflowResult struct {
	TraceID         string `json:"traceId"`
	SpanCount       int    `json:"spanCount"`
	CostsCalculated int    `json:"costsCalculated"`
}

// ScoreWorkflowResult matches TypeScript ScoreWorkflowResult
type ScoreWorkflowResult struct {
	ScoreID  string `json:"scoreId"`
	DataType string `json:"dataType"` // NUMERIC, CATEGORICAL, BOOLEAN
}
