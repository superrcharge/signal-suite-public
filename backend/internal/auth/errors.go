package auth

import "errors"

var (
	// ErrUnauthorized indicates no valid bearer token was supplied.
	ErrUnauthorized = errors.New("unauthorized")
	// ErrInvalidToken indicates the JWT is malformed, has a bad signature,
	// or fails audience / issuer validation.
	ErrInvalidToken = errors.New("invalid token")
	// ErrTokenExpired indicates the JWT is past its exp claim.
	ErrTokenExpired = errors.New("token expired")
)
