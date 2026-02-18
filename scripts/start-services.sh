#!/bin/bash
set -e

echo "🦞 Starting OneClaw Services"
echo "============================"
echo ""

# Get script directory and project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# Source cargo env if it exists
if [ -f "$HOME/.cargo/env" ]; then
    source "$HOME/.cargo/env"
fi

# Check if .env.local exists
if [ ! -f ".env.local" ]; then
    echo "❌ .env.local not found. Run setup-vps.sh first."
    exit 1
fi

# Stop existing PM2 processes (if any)
echo "🛑 Stopping existing services..."
pm2 delete oneclaw-api 2>/dev/null || true
pm2 delete oneclaw-node 2>/dev/null || true

# Start API
echo "🚀 Starting API server..."
cd "$PROJECT_ROOT"
pm2 start pnpm --name oneclaw-api -- --filter @oneclaw/api start

# Start Node
echo "🚀 Starting Node daemon..."
pm2 start --name oneclaw-node "cargo run --release -- daemon" --cwd "$PROJECT_ROOT/oneclaw-node"

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup systemd -u root --hp /root | tail -n 1 | bash || true

echo ""
echo "✅ Services started!"
echo ""
echo "📊 Check status:"
echo "   pm2 status"
echo "   pm2 logs"
echo ""
echo "🌐 Your OneClaw instance is running:"
echo "   - Node UI: Check your domain"
echo "   - API: Check api.yourdomain.com"
echo ""
