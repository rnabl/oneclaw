#!/bin/bash
# Full deploy script - runs on VPS
# Kills everything, rebuilds everything, restarts clean

set -e

echo "🚀 OneClaw Full Deploy"
echo "======================"

cd /opt/oneclaw

# Step 1: STOP EVERYTHING FIRST
echo "🛑 Stopping PM2..."
pm2 stop all 2>/dev/null || true
pm2 delete all 2>/dev/null || true
pm2 kill 2>/dev/null || true
sleep 2

# Step 2: Kill ALL processes on our ports (nuclear option)
echo "💀 Killing any processes on ports 8787, 9000, 3000..."
fuser -k 8787/tcp 2>/dev/null || true
fuser -k 9000/tcp 2>/dev/null || true
fuser -k 3000/tcp 2>/dev/null || true
pkill -f "node.*harness" 2>/dev/null || true
pkill -f "oneclaw-node" 2>/dev/null || true
sleep 3

# Double check ports are free
echo "🔍 Verifying ports are free..."
if ss -tlnp | grep -q ":8787 "; then
  echo "❌ Port 8787 still in use, force killing..."
  fuser -k -9 8787/tcp 2>/dev/null || true
  sleep 2
fi
if ss -tlnp | grep -q ":9000 "; then
  echo "❌ Port 9000 still in use, force killing..."
  fuser -k -9 9000/tcp 2>/dev/null || true
  sleep 2
fi

# Step 3: Pull latest code
echo "📥 Pulling latest code..."
git fetch origin
git reset --hard origin/main

# Step 4: Install dependencies
echo "📦 Installing dependencies..."
pnpm install

# Step 5: Build harness
echo "🔨 Building harness..."
cd /opt/oneclaw/packages/harness
pnpm build

# Step 6: Build Rust daemon
echo "🦀 Building daemon (this takes a minute)..."
cd /opt/oneclaw/oneclaw-node
cargo build --release

# Step 7: Start everything fresh
echo "🚀 Starting services..."
cd /opt/oneclaw
pm2 start ecosystem.config.js

# Step 8: Wait and verify
echo "⏳ Waiting for services to start..."
sleep 5

echo ""
echo "📊 Service Status:"
pm2 status

echo ""
echo "🔍 Testing endpoints..."
echo -n "  Harness (8787): "
curl -s -o /dev/null -w "%{http_code}" http://localhost:8787/health || echo "FAILED"
echo ""
echo -n "  Daemon (9000):  "
curl -s -o /dev/null -w "%{http_code}" http://localhost:9000/health || echo "FAILED"
echo ""
echo -n "  Gmail Senders:  "
curl -s -o /dev/null -w "%{http_code}" http://localhost:9000/gmail/senders || echo "FAILED"
echo ""

echo ""
echo "✅ Deploy complete!"
echo "🌐 Test: https://oneclaw.chat/gmail/senders"
