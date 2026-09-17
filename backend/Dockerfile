# Production multi-stage Dockerfile

# Build stage
FROM golang:1.27-alpine AS builder

WORKDIR /app

# Install dependencies for CGO if needed
RUN apk add --no-cache gcc musl-dev

# Copy go mod files first for better caching
COPY go.mod go.sum* ./
RUN go mod download 2>/dev/null || true

# Copy source code
COPY . .

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o main .

# Runtime stage
FROM alpine:3.24

WORKDIR /app

# Install ca-certificates for HTTPS and wget for healthcheck
RUN apk --no-cache add ca-certificates wget

# Create non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup

# Copy binary from builder
COPY --from=builder /app/main .

# Create static directory for frontend files
RUN mkdir -p static && chown -R appuser:appgroup /app

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 3001

# Run the application
CMD ["./main"]
