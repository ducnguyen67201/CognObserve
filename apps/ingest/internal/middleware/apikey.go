package middleware

import (
	"bytes"
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/cognobserve/ingest/internal/config"
)

const (
	// APIKeyHeader is the header used for API key authentication
	APIKeyHeader = "X-API-Key"

	// APIKeyPrefix is the expected prefix for API keys
	APIKeyPrefix = "co_sk_"

	// ProjectIDHeader is the header set after successful API key validation
	ProjectIDHeader = "X-Project-ID"

	// InternalSecretHeader is the header used for internal API authentication
	InternalSecretHeader = "X-Internal-Secret"

	// MinResponseTime is the minimum response time to prevent timing attacks
	MinResponseTime = 50 * time.Millisecond
)

// APIKeyContextKey is the context key for API key authentication status
const APIKeyContextKey contextKey = "api_key_auth"

// APIKeyProjectIDKey is the context key for the validated project ID from API key auth
const APIKeyProjectIDKey contextKey = "api_key_project_id"

type validateKeyRequest struct {
	HashedKey string `json:"hashedKey"`
}

type validateKeyResponse struct {
	Valid     bool   `json:"valid"`
	ProjectID string `json:"projectId,omitempty"`
	Error     string `json:"error,omitempty"`
}

// APIKeyAuth validates X-API-Key header by calling internal web API
func APIKeyAuth(cfg *config.Config) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			startTime := time.Now()

			apiKey := r.Header.Get(APIKeyHeader)

			// If no API key, fall through to JWT auth
			if apiKey == "" {
				next.ServeHTTP(w, r)
				return
			}

			// Validate format using constant-time comparison for prefix
			if !hasPrefixConstantTime(apiKey, APIKeyPrefix) {
				delayAndRespond(w, startTime, http.StatusUnauthorized, "Invalid API key format")
				return
			}

			// Minimum length validation
			if len(apiKey) < len(APIKeyPrefix)+32 {
				delayAndRespond(w, startTime, http.StatusUnauthorized, "Invalid API key")
				return
			}

			// Hash the key using SHA-256
			hash := sha256.Sum256([]byte(apiKey))
			hashedKey := hex.EncodeToString(hash[:])

			// Validate via internal API
			projectID, err := validateKeyViaAPI(r.Context(), cfg, hashedKey)
			if err != nil {
				// Log only the hash prefix, never the raw key
				slog.Warn("API key validation failed",
					"error", err.Error(),
					"hashedKeyPrefix", hashedKey[:16],
				)
				delayAndRespond(w, startTime, http.StatusUnauthorized, "Invalid or expired API key")
				return
			}

			// Set project ID header for downstream handlers
			r.Header.Set(ProjectIDHeader, projectID)

			// Mark that API key auth was used and store the validated project ID
			// The project ID in context is authoritative - prevents header tampering
			ctx := context.WithValue(r.Context(), APIKeyContextKey, true)
			ctx = context.WithValue(ctx, APIKeyProjectIDKey, projectID)

			// Log only the hash prefix for debugging, never the raw key
			slog.Info("API key validated",
				"projectId", projectID,
				"hashedKeyPrefix", hashedKey[:16],
			)

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// hasPrefixConstantTime checks prefix using constant-time comparison
func hasPrefixConstantTime(s, prefix string) bool {
	if len(s) < len(prefix) {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(s[:len(prefix)]), []byte(prefix)) == 1
}

// delayAndRespond ensures minimum response time to prevent timing attacks
func delayAndRespond(w http.ResponseWriter, startTime time.Time, status int, message string) {
	elapsed := time.Since(startTime)
	if elapsed < MinResponseTime {
		time.Sleep(MinResponseTime - elapsed)
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": message})
}

// validateKeyViaAPI calls the internal validation endpoint
func validateKeyViaAPI(ctx context.Context, cfg *config.Config, hashedKey string) (string, error) {
	url := strings.TrimSuffix(cfg.WebAPIURL, "/") + "/api/internal/validate-key"

	reqBody := validateKeyRequest{HashedKey: hashedKey}
	body, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(body))
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(InternalSecretHeader, cfg.InternalAPISecret)

	// Use a client with timeout
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("validation request failed: %w", err)
	}
	defer resp.Body.Close()

	var result validateKeyResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("failed to decode response: %w", err)
	}

	if !result.Valid {
		if result.Error != "" {
			return "", fmt.Errorf(result.Error)
		}
		return "", fmt.Errorf("invalid API key")
	}

	return result.ProjectID, nil
}

// IsAPIKeyAuthenticated checks if the request was authenticated via API key
func IsAPIKeyAuthenticated(ctx context.Context) bool {
	if authenticated, ok := ctx.Value(APIKeyContextKey).(bool); ok {
		return authenticated
	}
	return false
}

// GetAPIKeyProjectID returns the validated project ID from API key authentication
// Returns empty string if not authenticated via API key
func GetAPIKeyProjectID(ctx context.Context) string {
	if projectID, ok := ctx.Value(APIKeyProjectIDKey).(string); ok {
		return projectID
	}
	return ""
}
