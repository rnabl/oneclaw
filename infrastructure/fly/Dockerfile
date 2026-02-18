# OpenClaw per-user container
FROM node:22-slim

# Install git (required by openclaw)
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

# Install openclaw globally
RUN npm install -g openclaw

# Create data directory
RUN mkdir -p /root/.openclaw

# Copy config template (will be overwritten at runtime)
COPY openclaw.json /root/.openclaw/openclaw.json

# Expose gateway port
EXPOSE 18789

# Start gateway
CMD ["openclaw", "gateway", "start"]
