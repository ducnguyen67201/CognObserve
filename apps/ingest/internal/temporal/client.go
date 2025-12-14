package temporal

import (
	"context"
	"fmt"
	"time"

	"go.temporal.io/sdk/client"
)

// Workflow names must match the TypeScript workflow function names
const (
	TraceWorkflowName = "traceWorkflow"
	ScoreWorkflowName = "scoreWorkflow"
)

// Workflow execution timeouts
const (
	TraceWorkflowTimeout = 5 * time.Minute
	ScoreWorkflowTimeout = 2 * time.Minute
)

// Client wraps the Temporal SDK client for workflow operations
type Client struct {
	client    client.Client
	taskQueue string
}

// New creates a new Temporal client connection
func New(address, namespace, taskQueue string) (*Client, error) {
	c, err := client.Dial(client.Options{
		HostPort:  address,
		Namespace: namespace,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to connect to Temporal at %s: %w", address, err)
	}

	return &Client{
		client:    c,
		taskQueue: taskQueue,
	}, nil
}

// StartTraceWorkflow starts a trace ingestion workflow
// Returns the workflow ID for tracking
func (c *Client) StartTraceWorkflow(ctx context.Context, input TraceWorkflowInput) (string, error) {
	workflowID := "trace-" + input.ID

	opts := client.StartWorkflowOptions{
		ID:                       workflowID,
		TaskQueue:                c.taskQueue,
		WorkflowExecutionTimeout: TraceWorkflowTimeout,
	}

	we, err := c.client.ExecuteWorkflow(ctx, opts, TraceWorkflowName, input)
	if err != nil {
		return "", fmt.Errorf("failed to start trace workflow: %w", err)
	}

	return we.GetID(), nil
}

// StartScoreWorkflow starts a score ingestion workflow
// Returns the workflow ID for tracking
func (c *Client) StartScoreWorkflow(ctx context.Context, input ScoreWorkflowInput) (string, error) {
	workflowID := "score-" + input.ID

	opts := client.StartWorkflowOptions{
		ID:                       workflowID,
		TaskQueue:                c.taskQueue,
		WorkflowExecutionTimeout: ScoreWorkflowTimeout,
	}

	we, err := c.client.ExecuteWorkflow(ctx, opts, ScoreWorkflowName, input)
	if err != nil {
		return "", fmt.Errorf("failed to start score workflow: %w", err)
	}

	return we.GetID(), nil
}

// Close closes the Temporal client connection
func (c *Client) Close() {
	if c.client != nil {
		c.client.Close()
	}
}

// IsHealthy checks if the Temporal connection is healthy
func (c *Client) IsHealthy(ctx context.Context) bool {
	// Try to describe the default namespace as a health check
	_, err := c.client.WorkflowService().DescribeNamespace(ctx, nil)
	return err == nil
}
