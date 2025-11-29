package queue

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/cognobserve/ingest/internal/model"
)

const (
	TraceQueueKey = "cognobserve:traces"

	// Connection timeouts
	RedisConnectTimeout = 10 * time.Second
	RedisReadTimeout    = 5 * time.Second
	RedisWriteTimeout   = 5 * time.Second
)

// Producer interface for queue operations
type Producer interface {
	PublishTrace(ctx context.Context, trace *model.Trace) error
	Close() error
}

// RedisProducer implements Producer using Redis
type RedisProducer struct {
	client *redis.Client
}

// NewRedisProducer creates a new Redis producer
func NewRedisProducer(redisURL string) (*RedisProducer, error) {
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, fmt.Errorf("failed to parse redis url: %w", err)
	}

	// Set connection timeouts to prevent indefinite hangs
	opts.DialTimeout = RedisConnectTimeout
	opts.ReadTimeout = RedisReadTimeout
	opts.WriteTimeout = RedisWriteTimeout

	client := redis.NewClient(opts)

	// Test connection with timeout context
	ctx, cancel := context.WithTimeout(context.Background(), RedisConnectTimeout)
	defer cancel()

	if err := client.Ping(ctx).Err(); err != nil {
		client.Close()
		return nil, fmt.Errorf("failed to connect to redis (timeout: %v): %w", RedisConnectTimeout, err)
	}

	return &RedisProducer{client: client}, nil
}

// PublishTrace publishes a trace to the queue
func (p *RedisProducer) PublishTrace(ctx context.Context, trace *model.Trace) error {
	data, err := json.Marshal(trace)
	if err != nil {
		return fmt.Errorf("failed to marshal trace: %w", err)
	}

	if err := p.client.LPush(ctx, TraceQueueKey, data).Err(); err != nil {
		return fmt.Errorf("failed to publish trace: %w", err)
	}

	return nil
}

// Close closes the Redis connection
func (p *RedisProducer) Close() error {
	return p.client.Close()
}
