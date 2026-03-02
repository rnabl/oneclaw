#!/bin/bash
set -e

echo "🛑 Stopping all services..."
pm2 delete all 2>/dev/null || true

echo "🔪 Killing any processes on ports 8787 and 9000..."
fuser -k 8787/tcp 2>/dev/null || true
fuser -k 9000/tcp 2>/dev/null || true
sleep 2

echo "🚀 Starting harness..."
pm2 start /opt/oneclaw/ecosystem.config.js --only harness

echo "⏳ Waiting for harness to be ready..."
for i in {1..30}; do
  if curl -s http://localhost:8787/health > /dev/null 2>&1; then
    echo "✅ Harness is ready!"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "❌ Harness failed to start after 30 seconds"
    pm2 logs harness --lines 20 --nostream
    exit 1
  fi
  sleep 1
done

echo "🚀 Starting daemon..."
pm2 start /opt/oneclaw/ecosystem.config.js --only daemon
sleep 3

echo "📊 Checking daemon loaded tools..."
DAEMON_LOG=$(pm2 logs daemon --lines 10 --nostream 2>&1)
if echo "$DAEMON_LOG" | grep -q "Loaded 0 harness tools"; then
  echo "⚠️  Daemon loaded 0 tools, restarting..."
  pm2 restart daemon
  sleep 3
fi

echo ""
echo "✅ All services started!"
pm2 status
echo ""
echo "🔍 Verification:"
curl -s http://localhost:8787/health && echo ""
curl -s http://localhost:8787/tools | head -c 200 && echo "..."
