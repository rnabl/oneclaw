#!/bin/bash
# Initial setup script for the Droplet
# Run this once on a fresh Ubuntu droplet

set -e

echo "🚀 Setting up iClaw multi-tenant infrastructure..."

# Update system
apt-get update && apt-get upgrade -y

# Install Docker
if ! command -v docker &> /dev/null; then
    echo "📦 Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
fi

# Install Docker Compose
if ! command -v docker-compose &> /dev/null; then
    echo "📦 Installing Docker Compose..."
    apt-get install -y docker-compose-plugin
    # Also install standalone for compatibility
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
fi

# Create base directory structure
mkdir -p /opt/iclaw/users
mkdir -p /opt/iclaw/scripts

# Copy scripts
cp provision-user.sh /opt/iclaw/scripts/
cp deprovision-user.sh /opt/iclaw/scripts/
chmod +x /opt/iclaw/scripts/*.sh

# Install nginx for reverse proxy (if not already)
if ! command -v nginx &> /dev/null; then
    echo "📦 Installing Nginx..."
    apt-get install -y nginx
fi

echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Set ANTHROPIC_API_KEY in /opt/iclaw/.env"
echo "2. Provision users with: /opt/iclaw/scripts/provision-user.sh <phone> <port>"
echo "3. Update nginx config to proxy user ports"
