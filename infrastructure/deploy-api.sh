#!/bin/bash
# Deploy OneClaw API to the droplet
# Run this on the droplet after cloning the repo

set -e

echo "🦞 Deploying OneClaw API..."

# Navigate to project
cd /opt/oneclaw

# Install pnpm if not installed
if ! command -v pnpm &> /dev/null; then
    echo "📦 Installing pnpm..."
    npm install -g pnpm
fi

# Install PM2 if not installed
if ! command -v pm2 &> /dev/null; then
    echo "📦 Installing PM2..."
    npm install -g pm2
fi

# Install dependencies
echo "📦 Installing dependencies..."
pnpm install

# Build all packages
echo "🔨 Building..."
pnpm build

# Stop existing if running
pm2 stop oneclaw-api 2>/dev/null || true
pm2 delete oneclaw-api 2>/dev/null || true

# Start the API
echo "🚀 Starting OneClaw API on port 4001..."
PORT=4001 pm2 start apps/api/dist/index.js --name oneclaw-api

# Save PM2 config
pm2 save

# Show status
pm2 status

echo ""
echo "✅ OneClaw API deployed!"
echo ""
echo "Next steps:"
echo "1. Configure nginx: sudo cp infrastructure/nginx-oneclaw.conf /etc/nginx/sites-available/oneclaw"
echo "2. Enable site: sudo ln -sf /etc/nginx/sites-available/oneclaw /etc/nginx/sites-enabled/"
echo "3. Test nginx: sudo nginx -t"
echo "4. Reload nginx: sudo systemctl reload nginx"
echo "5. Set Discord Interactions Endpoint to: https://YOUR_DOMAIN/discord/interactions"
