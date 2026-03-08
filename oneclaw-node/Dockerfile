# OneClaw Daemon - Rust Agent Runtime
FROM rust:1.75-slim as builder

WORKDIR /app

# Install dependencies for building
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy Cargo files
COPY Cargo.toml Cargo.lock ./

# Copy source
COPY src ./src

# Build release binary
RUN cargo build --release

# Runtime stage
FROM debian:bookworm-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    curl \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

# Copy binary from builder
COPY --from=builder /app/target/release/oneclaw-node /usr/local/bin/

# Create directories
RUN mkdir -p /root/.oneclaw/workspace /root/.oneclaw/data /app/logs

# Copy templates (for first run)
COPY templates /app/templates

# Expose port
EXPOSE 8787

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD curl -f http://localhost:8787/health || exit 1

# Start daemon
CMD ["oneclaw-node", "daemon"]
