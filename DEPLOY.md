# OneClaw Deployment Guide

## Prerequisites

- DigitalOcean droplet: `104.131.111.116` (oneclaw-gateway)
- Domain: `oneclaw.chat` (point DNS to the droplet IP)
- Discord Application ID: `1473023766996189337`

## Step 1: SSH to Droplet

```bash
ssh root@104.131.111.116
```

## Step 2: Clone the Repo

```bash
cd /opt
git clone https://github.com/rnabl/oneclaw.git
cd oneclaw
```

## Step 3: Create .env.local

```bash
nano .env.local
```

Add your environment variables (see `.env.example` for all options):

```env
# Required for Discord
DISCORD_BOT_TOKEN=your_token
DISCORD_APPLICATION_ID=1473023766996189337
DISCORD_PUBLIC_KEY=your_public_key

# Required for workflows
APIFY_API_KEY=your_apify_key
ANTHROPIC_API_KEY=your_anthropic_key

# Server
PORT=4001
NODE_ENV=production
```

## Step 4: Deploy

```bash
chmod +x infrastructure/deploy-api.sh
./infrastructure/deploy-api.sh
```

This will:
- Install pnpm and PM2
- Install dependencies
- Build all packages
- Start the API on port 4001

## Step 5: Configure nginx

```bash
# Copy config
sudo cp infrastructure/nginx-oneclaw.conf /etc/nginx/sites-available/oneclaw

# Edit to use your domain or IP
sudo nano /etc/nginx/sites-available/oneclaw

# Enable site
sudo ln -sf /etc/nginx/sites-available/oneclaw /etc/nginx/sites-enabled/

# Test config
sudo nginx -t

# Reload
sudo systemctl reload nginx
```

## Step 6: (Optional) Set Up SSL with Let's Encrypt

```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d oneclaw.chat -d api.oneclaw.chat

# Certificate auto-renews
```

## Step 7: Configure Discord Interactions Endpoint

1. Go to: https://discord.com/developers/applications/1473023766996189337
2. Navigate to "General Information"
3. Set **Interactions Endpoint URL** to:
   - Without SSL: `http://104.131.111.116/discord/interactions`
   - With SSL: `https://oneclaw.chat/discord/interactions`
4. Save changes

Discord will send a PING to verify the endpoint works.

## Step 8: Register Slash Commands

```bash
# From your local machine or the droplet
curl http://oneclaw.chat/discord/register-commands
```

Or with IP:
```bash
curl http://104.131.111.116/discord/register-commands
```

## Step 9: Test

1. Go to your Discord server where the bot is added
2. Try `/help` - should show the commands
3. Try `/status` - should show wallet info

## Troubleshooting

### Check API logs
```bash
pm2 logs oneclaw-api
```

### Restart API
```bash
pm2 restart oneclaw-api
```

### Check if port is listening
```bash
curl http://localhost:4001/health
```

### Check nginx error logs
```bash
tail -f /var/log/nginx/error.log
```

## Useful Commands

```bash
# View running processes
pm2 status

# Watch logs
pm2 logs oneclaw-api --lines 100

# Update and redeploy
cd /opt/oneclaw && git pull && pnpm build && pm2 restart oneclaw-api
```
