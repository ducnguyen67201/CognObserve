package middleware

import (
	"context"
	"net/http"
	"os"
	"strings"

	"github.com/golang-jwt/jwt/v5"
)

type contextKey string

const (
	UserContextKey     contextKey = "user"
	ProjectsContextKey contextKey = "projects"
)

type ProjectAccess struct {
	ID   string `json:"id"`
	Role string `json:"role"`
}

type UserClaims struct {
	jwt.RegisteredClaims
	Email    string          `json:"email"`
	Projects []ProjectAccess `json:"projects"`
}

// JWTAuth validates Bearer tokens from NextAuth (required)
func JWTAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Extract token from Authorization header
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			http.Error(w, `{"error":"Missing authorization header"}`, http.StatusUnauthorized)
			return
		}

		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
			http.Error(w, `{"error":"Invalid authorization header format"}`, http.StatusUnauthorized)
			return
		}

		tokenString := parts[1]

		// Parse and validate token
		secret := []byte(os.Getenv("JWT_SHARED_SECRET"))
		token, err := jwt.ParseWithClaims(tokenString, &UserClaims{}, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, jwt.ErrSignatureInvalid
			}
			return secret, nil
		})

		if err != nil || !token.Valid {
			http.Error(w, `{"error":"Invalid token"}`, http.StatusUnauthorized)
			return
		}

		claims, ok := token.Claims.(*UserClaims)
		if !ok {
			http.Error(w, `{"error":"Invalid token claims"}`, http.StatusUnauthorized)
			return
		}

		// Add claims to context
		ctx := context.WithValue(r.Context(), UserContextKey, claims.Subject)
		ctx = context.WithValue(ctx, ProjectsContextKey, claims.Projects)

		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// OptionalJWTAuth validates Bearer tokens if present, but doesn't require them
// Used when API key auth is also an option
func OptionalJWTAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// If already authenticated via API key, skip JWT auth
		if IsAPIKeyAuthenticated(r.Context()) {
			next.ServeHTTP(w, r)
			return
		}

		// Extract token from Authorization header
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			// No JWT token, continue without auth (RequireAuth will check later)
			next.ServeHTTP(w, r)
			return
		}

		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
			http.Error(w, `{"error":"Invalid authorization header format"}`, http.StatusUnauthorized)
			return
		}

		tokenString := parts[1]

		// Parse and validate token
		secret := []byte(os.Getenv("JWT_SHARED_SECRET"))
		token, err := jwt.ParseWithClaims(tokenString, &UserClaims{}, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, jwt.ErrSignatureInvalid
			}
			return secret, nil
		})

		if err != nil || !token.Valid {
			http.Error(w, `{"error":"Invalid token"}`, http.StatusUnauthorized)
			return
		}

		claims, ok := token.Claims.(*UserClaims)
		if !ok {
			http.Error(w, `{"error":"Invalid token claims"}`, http.StatusUnauthorized)
			return
		}

		// Add claims to context
		ctx := context.WithValue(r.Context(), UserContextKey, claims.Subject)
		ctx = context.WithValue(ctx, ProjectsContextKey, claims.Projects)

		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// RequireAuth ensures at least one authentication method was used (API key or JWT)
func RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Check if API key auth was used
		if IsAPIKeyAuthenticated(r.Context()) {
			next.ServeHTTP(w, r)
			return
		}

		// Check if JWT auth was used (user ID in context)
		if GetUserID(r.Context()) != "" {
			next.ServeHTTP(w, r)
			return
		}

		http.Error(w, `{"error":"Authentication required"}`, http.StatusUnauthorized)
	})
}

// RequireProjectAccess checks if user has access to the specified project
// For API key auth: validates that the requested project matches the key's bound project
// For JWT auth: project membership is checked from the token claims
func RequireProjectAccess(projectIDHeader string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			projectID := r.Header.Get(projectIDHeader)
			if projectID == "" {
				http.Error(w, `{"error":"Missing project ID"}`, http.StatusBadRequest)
				return
			}

			// If authenticated via API key, verify the requested project matches the key's project
			// This prevents header tampering attacks where an attacker uses a valid key
			// but tries to access a different project by manipulating the header
			if IsAPIKeyAuthenticated(r.Context()) {
				validatedProjectID := GetAPIKeyProjectID(r.Context())
				if validatedProjectID == "" {
					http.Error(w, `{"error":"Invalid API key context"}`, http.StatusInternalServerError)
					return
				}
				if validatedProjectID != projectID {
					http.Error(w, `{"error":"API key not authorized for this project"}`, http.StatusForbidden)
					return
				}
				next.ServeHTTP(w, r)
				return
			}

			// For JWT auth, check project membership
			projects, ok := r.Context().Value(ProjectsContextKey).([]ProjectAccess)
			if !ok {
				http.Error(w, `{"error":"Invalid context"}`, http.StatusInternalServerError)
				return
			}

			// Check if user has access to this project
			hasAccess := false
			for _, p := range projects {
				if p.ID == projectID {
					hasAccess = true
					break
				}
			}

			if !hasAccess {
				http.Error(w, `{"error":"Access denied to project"}`, http.StatusForbidden)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// GetUserID gets the user ID from context
func GetUserID(ctx context.Context) string {
	if userID, ok := ctx.Value(UserContextKey).(string); ok {
		return userID
	}
	return ""
}

// GetProjects gets the user's projects from context
func GetProjects(ctx context.Context) []ProjectAccess {
	if projects, ok := ctx.Value(ProjectsContextKey).([]ProjectAccess); ok {
		return projects
	}
	return nil
}
