// Package docs provides OpenAPI/Swagger documentation for the API.
package docs

import "embed"

//go:embed openapi.json
var OpenAPISpec embed.FS

//go:embed static/scalar.js
var ScalarJS embed.FS

// GetOpenAPISpec returns the OpenAPI specification as bytes
func GetOpenAPISpec() ([]byte, error) {
	return OpenAPISpec.ReadFile("openapi.json")
}

// GetScalarJS returns the bundled Scalar API reference JavaScript
func GetScalarJS() ([]byte, error) {
	return ScalarJS.ReadFile("static/scalar.js")
}
