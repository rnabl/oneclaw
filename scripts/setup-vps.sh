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
apt install -y nginx certbot python3-certbot-nginx curl git

echo ""
echo "🔧 Configuring nginx..."
cat > /etc/nginx/sites-available/oneclaw << EOF
server {
    listen 80;
    server_name ${DOMAIN};
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ${DOMAIN};

    # SSL will be configured by certbot
    
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
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.${DOMAIN};

    # SSL will be configured by certbot
    
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
echo "🔐 Getting SSL certificates..."
certbot --nginx --non-interactive --agree-tos --email "$EMAIL" -d "$DOMAIN" -d "api.$DOMAIN"

echo ""
echo "🔄 Reloading nginx..."
systemctl reload nginx

echo ""
echo "✅ Setup complete!"
echo ""
echo "📝 Next steps:"
echo "1. Update Google OAuth redirect URI to: https://api.${DOMAIN}/oauth/google/callback"
echo "2. Update .env.local with: GOOGLE_REDIRECT_URI=https://api.${DOMAIN}/oauth/google/callback"
echo "3. Start services:"
echo "   pm2 start --name oneclaw-api 'pnpm --filter @oneclaw/api start'"
echo "   pm2 start --name oneclaw-node 'cargo run --release -- daemon' --cwd /opt/oneclaw/oneclaw-node"
echo ""
echo "🌐 Your OneClaw instance will be available at:"
echo "   - https://${DOMAIN} (Node UI)"
echo "   - https://api.${DOMAIN} (API)"
echo ""
