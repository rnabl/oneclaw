#!/bin/bash
# IDIOT-PROOF DEPLOY SCRIPT
# Run this ONE command: ./scripts/nuke-and-deploy.sh
# It handles EVERYTHING.

set -e

echo "🔥 NUCLEAR DEPLOY - OneClaw"
echo "============================"
echo ""

cd /opt/oneclaw

# ============================================
# STEP 1: STOP ALL OLD SYSTEMD SERVICES
# ============================================
echo "🛑 Stopping old systemd services..."
systemctl stop oneclaw-harness 2>/dev/null || true
systemctl stop oneclaw-node 2>/dev/null || true
systemctl disable oneclaw-harness 2>/dev/null || true
systemctl disable oneclaw-node 2>/dev/null || true

# ============================================
# STEP 2: KILL THE OLD ONECLAW USER PROCESSES
# ============================================
echo "💀 Killing old oneclaw user processes..."
pkill -9 -u oneclaw 2>/dev/null || true

# ============================================
# STEP 3: STOP PM2
# ============================================
echo "🛑 Stopping PM2..."
pm2 stop all 2>/dev/null || true
pm2 delete all 2>/dev/null || true
pm2 kill 2>/dev/null || true

# ============================================
# STEP 4: KILL ANYTHING ON OUR PORTS
# ============================================
echo "💀 Killing processes on ports 8787, 9000, 3000..."
fuser -k -9 8787/tcp 2>/dev/null || true
fuser -k -9 9000/tcp 2>/dev/null || true
fuser -k -9 3000/tcp 2>/dev/null || true
pkill -9 -f "oneclaw-node" 2>/dev/null || true
pkill -9 -f "harness" 2>/dev/null || true
sleep 3

# ============================================
# STEP 5: VERIFY PORTS ARE FREE
# ============================================
echo "🔍 Verifying ports are free..."
if ss -tlnp | grep -qE ":8787|:9000|:3000"; then
    echo "❌ PORTS STILL IN USE:"
    ss -tlnp | grep -E ":8787|:9000|:3000"
    echo ""
    echo "Trying harder..."
    for port in 8787 9000 3000; do
        pid=$(ss -tlnp | grep ":$port " | grep -oP 'pid=\K\d+' | head -1)
        if [ -n "$pid" ]; then
            echo "Killing PID $pid on port $port"
            kill -9 $pid 2>/dev/null || true
        fi
    done
    sleep 2
fi

# Final check
if ss -tlnp | grep -qE ":8787|:9000|:3000"; then
    echo "❌ FATAL: Cannot free ports. Aborting."
    ss -tlnp | grep -E ":8787|:9000|:3000"
    exit 1
fi
echo "✅ All ports are free"

# ============================================
# STEP 6: PULL LATEST CODE
# ============================================
echo ""
echo "📥 Pulling latest code..."
git fetch origin
git reset --hard origin/main

# ============================================
# STEP 7: INSTALL DEPENDENCIES
# ============================================
echo ""
echo "📦 Installing dependencies..."
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# ============================================
# STEP 8: BUILD HARNESS
# ============================================
echo ""
echo "🔨 Building Harness..."
cd /opt/oneclaw/packages/harness
pnpm build

# ============================================
# STEP 9: BUILD RUST DAEMON
# ============================================
echo ""
echo "🦀 Building Daemon (this takes ~60 seconds)..."
cd /opt/oneclaw/oneclaw-node
cargo build --release

# ============================================
# STEP 10: START SERVICES WITH PM2
# ============================================
echo ""
echo "🚀 Starting services..."
cd /opt/oneclaw

# Source production env file if it exists
if [ -f /opt/oneclaw/.env.production ]; then
    echo "   Loading environment from .env.production"
    set -a
    source /opt/oneclaw/.env.production
    set +a
else
    echo "   ⚠️ No .env.production found. Telegram notifications will be disabled."
    echo "   Copy .env.production.example to /opt/oneclaw/.env.production"
fi

# Start harness first, wait for it
pm2 start ecosystem.config.js --only harness
echo "   Waiting for Harness..."
sleep 5

# Check harness is up
for i in {1..10}; do
    if curl -s http://localhost:8787/health > /dev/null 2>&1; then
        echo "   ✅ Harness is up on port 8787"
        break
    fi
    if [ $i -eq 10 ]; then
        echo "   ❌ Harness failed to start"
        pm2 logs harness --lines 20 --nostream
        exit 1
    fi
    sleep 1
done

# Start daemon
pm2 start ecosystem.config.js --only daemon
sleep 3

# Start API
pm2 start ecosystem.config.js --only api
sleep 2

# ============================================
# STEP 11: SAVE PM2 CONFIG
# ============================================
pm2 save

# ============================================
# FINAL STATUS
# ============================================
echo ""
echo "========================================"
echo "📊 FINAL STATUS"
echo "========================================"
pm2 status

echo ""
echo "🔍 Port Check:"
echo -n "   Harness (8787): "
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8787/health || echo "FAILED"
echo -n "   Daemon (9000):  "
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:9000/health || echo "FAILED"
echo -n "   Gmail Senders:  "
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8787/gmail/senders || echo "FAILED"

echo ""
echo "📧 Email Queue Status:"
curl -s http://localhost:8787/scheduler/email-queue | head -c 500 || echo "   FAILED to get queue status"

echo ""
echo "✅ DEPLOY COMPLETE"
echo "🌐 Test: https://oneclaw.chat/gmail/senders"
echo "📊 Email Status: https://oneclaw.chat/scheduler/email-queue"
echo ""
