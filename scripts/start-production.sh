#!/bin/bash
set -e

cd /opt/oneclaw

echo "🛑 Stopping PM2 completely..."
pm2 kill 2>/dev/null || true
sleep 2

echo "🔪 Killing ALL oneclaw processes..."
pkill -9 -f "oneclaw-node" 2>/dev/null || true
pkill -9 -f "node.*harness" 2>/dev/null || true
pkill -9 -f "node.*server.js" 2>/dev/null || true
sleep 1

echo "🔪 Force killing any processes on ports 8787 and 9000..."
fuser -k 8787/tcp 2>/dev/null || true
fuser -k 9000/tcp 2>/dev/null || true
fuser -k 3000/tcp 2>/dev/null || true
sleep 3

echo "🔍 Waiting for ports to be free..."
for i in {1..10}; do
  PORT_8787=$(ss -tlnp 2>/dev/null | grep ":8787 " || true)
  PORT_9000=$(ss -tlnp 2>/dev/null | grep ":9000 " || true)
  if [ -z "$PORT_8787" ] && [ -z "$PORT_9000" ]; then
    echo "✅ Ports 8787 and 9000 are free"
    break
  fi
  if [ $i -eq 10 ]; then
    echo "❌ Ports still in use after 10 attempts!"
    ss -tlnp | grep -E ":(8787|9000) " || true
    exit 1
  fi
  echo "   Waiting... ($i/10)"
  sleep 1
done

echo "🚀 Starting harness first..."
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

echo "🚀 Starting API..."
pm2 start /opt/oneclaw/ecosystem.config.js --only api
sleep 2

echo ""
echo "✅ All services started!"
pm2 status

echo ""
echo "🔍 Verification:"
echo "Harness health:"
curl -s http://localhost:8787/health && echo ""
echo "Tools count:"
curl -s http://localhost:8787/tools | grep -o '"id"' | wc -l | xargs echo "  Tools loaded:"

echo ""
echo "📱 To test OAuth, visit: https://oneclaw.chat/oauth/google?user=default"
