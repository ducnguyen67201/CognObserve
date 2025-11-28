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

// JWTAuth validates Bearer tokens from NextAuth
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

// RequireProjectAccess checks if user has access to the specified project
func RequireProjectAccess(projectIDHeader string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			projectID := r.Header.Get(projectIDHeader)
			if projectID == "" {
				http.Error(w, `{"error":"Missing project ID"}`, http.StatusBadRequest)
				return
			}

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
