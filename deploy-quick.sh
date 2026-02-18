#!/bin/bash
# Quick deploy script for OneClaw API + Node to VPS
# Fixes: harness package.json exports, gmail.ts syntax

set -e

echo "🚀 OneClaw VPS Deployment"
echo "========================="

# SSH details
HOST="root@104.131.111.116"
REPO_PATH="/opt/oneclaw"

echo ""
echo "📦 Step 1: Push local changes to git..."
git add -A
git commit -m "fix: Add harness subpath exports and gmail.ts syntax" || echo "No changes to commit"
git push origin main

echo ""
echo "🔄 Step 2: Pull changes on VPS..."
ssh $HOST << 'ENDSSH'
cd /opt/oneclaw
git pull origin main
ENDSSH

echo ""
echo "🏗️  Step 3: Build packages..."
ssh $HOST << 'ENDSSH'
cd /opt/oneclaw
pnpm install
pnpm build
ENDSSH

echo ""
echo "🔌 Step 4: Restart API..."
ssh $HOST << 'ENDSSH'
pm2 restart oneclaw-api || pm2 start --name oneclaw-api "pnpm --filter @oneclaw/api start"
ENDSSH

echo ""
echo "🦀 Step 5: Deploy Node (Rust daemon)..."
ssh $HOST << 'ENDSSH'
cd /opt/oneclaw/oneclaw-node
cargo build --release
pm2 restart oneclaw-node || pm2 start --name oneclaw-node "./target/release/oneclaw-node daemon"
ENDSSH

echo ""
echo "✅ Deployment complete!"
echo ""
echo "🔗 API: http://104.131.111.116:4001"
echo "🔗 Node: http://104.131.111.116:8787"
echo ""
echo "📝 Check logs:"
echo "  pm2 logs oneclaw-api"
echo "  pm2 logs oneclaw-node"
ENDSSH
