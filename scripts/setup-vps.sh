#!/bin/bash
set -e  # Exit on any error

echo "🦞 OneClaw VPS Setup"
echo "===================="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
   echo "❌ Please run as root (use sudo)"
   exit 1
fi

# Prompt for domain
read -p "Enter your domain (e.g., oneclaw.chat): " DOMAIN
if [ -z "$DOMAIN" ]; then
    echo "❌ Domain is required"
    exit 1
fi

read -p "Enter your email for SSL certificates: " EMAIL
if [ -z "$EMAIL" ]; then
    echo "❌ Email is required"
    exit 1
fi

echo ""
echo "📦 Installing dependencies..."
apt update -qq
apt install -y nginx certbot python3-certbot-nginx curl git build-essential

# Install Node.js 20
if ! command -v node &> /dev/null; then
    echo "📦 Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
fi

# Install pnpm
if ! command -v pnpm &> /dev/null; then
    echo "📦 Installing pnpm..."
    npm install -g pnpm
fi

# Install PM2
if ! command -v pm2 &> /dev/null; then
    echo "📦 Installing PM2..."
    npm install -g pm2
fi

# Install Rust
if ! command -v cargo &> /dev/null; then
    echo "📦 Installing Rust..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
fi

echo ""
echo "🔧 Configuring nginx (HTTP-only for Certbot verification)..."
cat > /etc/nginx/sites-available/oneclaw << EOF
server {
    listen 80;
    server_name ${DOMAIN};
    
    location / {
        proxy_pass http://localhost:8787;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}

server {
    listen 80;
    server_name api.${DOMAIN};
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

# Enable site
ln -sf /etc/nginx/sites-available/oneclaw /etc/nginx/sites-enabled/

# Test nginx config
echo ""
echo "🧪 Testing nginx configuration..."
nginx -t

echo ""
echo "🔄 Reloading nginx..."
systemctl reload nginx

echo ""
echo "🔐 Getting SSL certificates..."
certbot --nginx --non-interactive --agree-tos --email "$EMAIL" --redirect -d "$DOMAIN" -d "api.$DOMAIN"

echo ""
echo "✅ Setup complete!"
echo ""
echo "📝 Configuring environment..."

# Get script directory and project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Copy .env.example to .env.local if it doesn't exist
if [ ! -f "$PROJECT_ROOT/.env.local" ]; then
    echo "Creating .env.local from .env.example..."
    cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/.env.local"
fi

# Update GOOGLE_REDIRECT_URI in .env.local
echo "Updating GOOGLE_REDIRECT_URI in .env.local..."
sed -i "s|GOOGLE_REDIRECT_URI=.*|GOOGLE_REDIRECT_URI=https://api.${DOMAIN}/oauth/google/callback|g" "$PROJECT_ROOT/.env.local"

# Create Node config directory and file
mkdir -p /root/.config/oneclaw
if [ ! -f /root/.config/oneclaw/config.toml ]; then
    echo "Creating Node config.toml..."
    cat > /root/.config/oneclaw/config.toml << NODEEOF
[node]
id = "vps-node"
name = "OneClaw VPS"
environment = "production"

[control_plane]
url = "http://localhost:3000"

[paths]
workflows = "/opt/oneclaw/.oneclaw/workflows"
logs = "/opt/oneclaw/.oneclaw/logs"
cache = "/opt/oneclaw/.oneclaw/cache"
NODEEOF
    
    # Create directories
    mkdir -p /opt/oneclaw/.oneclaw/{workflows,logs,cache}
fi

echo ""
echo "✅ All configuration complete!"
echo ""
echo "📝 Next steps:"
echo "1. Add your API keys to .env.local:"
echo "   nano $PROJECT_ROOT/.env.local"
echo ""
echo "2. Update Google OAuth redirect URI to:"
echo "   https://api.${DOMAIN}/oauth/google/callback"
echo ""
echo "3. Install dependencies and build:"
echo "   cd $PROJECT_ROOT && pnpm install && pnpm build"
echo ""
echo "4. Start services:"
echo "   ./scripts/start-services.sh"
echo ""
echo "🌐 Your OneClaw instance will be available at:"
echo "   - https://${DOMAIN} (Node UI)"
echo "   - https://api.${DOMAIN} (API)"
echo ""
