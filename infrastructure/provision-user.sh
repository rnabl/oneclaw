#!/bin/bash
# Provision a new OpenClaw instance for a user
# Usage: ./provision-user.sh <phone_number> <port>

set -e

PHONE=$1
PORT=$2
USER_ID=$(echo "$PHONE" | sed 's/+//g')  # Remove + from phone number
BASE_DIR="/opt/iclaw"
USER_DIR="$BASE_DIR/users/$USER_ID"

# Validate inputs
if [ -z "$PHONE" ] || [ -z "$PORT" ]; then
    echo "Usage: ./provision-user.sh <phone_number> <port>"
    echo "Example: ./provision-user.sh +17862847802 18001"
    exit 1
fi

echo "🦞 Provisioning OpenClaw instance for $PHONE on port $PORT..."

# Create user directory structure
mkdir -p "$USER_DIR/data"
mkdir -p "$USER_DIR/workspace"

# Create OpenClaw config for this user (using OpenRouter)
OPENROUTER_MODEL=${OPENROUTER_MODEL:-"minimax/minimax-01"}

cat > "$USER_DIR/data/openclaw.json" << EOF
{
  "model": {
    "provider": "openrouter",
    "model": "$OPENROUTER_MODEL"
  },
  "agent": {
    "systemPrompt": "You are a helpful AI assistant accessible via iMessage. Keep responses concise and conversational - this is texting, not email. Use plain text only, no markdown formatting. Be friendly but brief. Use emojis sparingly."
  },
  "gateway": {
    "port": 18789,
    "mode": "local",
    "auth": {
      "mode": "token",
      "token": "$(openssl rand -hex 24)"
    },
    "http": {
      "endpoints": {
        "chatCompletions": {
          "enabled": true
        }
      }
    }
  }
}
EOF

# Create docker-compose for this user
cat > "$USER_DIR/docker-compose.yml" << EOF
version: '3.8'

services:
  openclaw:
    image: node:22-slim
    container_name: openclaw-$USER_ID
    restart: unless-stopped
    ports:
      - "$PORT:18789"
    volumes:
      - ./data:/root/.openclaw
      - ./workspace:/workspace
    environment:
      - OPENROUTER_API_KEY=\${OPENROUTER_API_KEY}
      - OPENROUTER_MODEL=\${OPENROUTER_MODEL:-minimax/minimax-01}
    working_dir: /root
    command: >
      sh -c "
        npm install -g openclaw@latest &&
        openclaw gateway
      "
EOF

# Create .env file with API key
cat > "$USER_DIR/.env" << EOF
OPENROUTER_API_KEY=${OPENROUTER_API_KEY:-sk-or-v1-YOUR_KEY_HERE}
OPENROUTER_MODEL=${OPENROUTER_MODEL:-minimax/minimax-01}
EOF

# Start the container
cd "$USER_DIR"
docker-compose up -d

echo "✅ OpenClaw instance for $PHONE started on port $PORT"
echo "   Container: openclaw-$USER_ID"
echo "   Endpoint: http://localhost:$PORT/v1/chat/completions"

# Extract the token for this user
TOKEN=$(cat "$USER_DIR/data/openclaw.json" | grep -o '"token": "[^"]*"' | cut -d'"' -f4)
echo "   Token: $TOKEN"
echo ""
echo "📝 Save this info to Supabase:"
echo "   phone_number: $PHONE"
echo "   openclaw_port: $PORT"
echo "   openclaw_token: $TOKEN"
