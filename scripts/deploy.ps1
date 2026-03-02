# OneClaw Deploy Script for Windows
# Usage: .\scripts\deploy.ps1

$VPS_HOST = "root@104.131.111.116"
$VPS_PATH = "/opt/oneclaw"
$LOCAL_ENV = "c:\Users\Ryan Nguyen\OneDrive\Desktop\Projects\oneclaw\.env.production"

Write-Host "🚀 OneClaw Deploy Script" -ForegroundColor Cyan
Write-Host "========================" -ForegroundColor Cyan

# Step 1: Push code to git
Write-Host "`n📦 Pushing code to GitHub..." -ForegroundColor Yellow
git add -A
git commit -m "deploy: $(Get-Date -Format 'yyyy-MM-dd HH:mm')" 2>$null
git push

# Step 2: Copy .env.production to VPS
Write-Host "`n🔐 Syncing .env.production to VPS..." -ForegroundColor Yellow
if (Test-Path $LOCAL_ENV) {
    scp $LOCAL_ENV "${VPS_HOST}:${VPS_PATH}/.env.production"
    Write-Host "   ✅ .env.production copied" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  .env.production not found locally!" -ForegroundColor Red
    exit 1
}

# Step 3: SSH and run deploy commands on VPS
Write-Host "`n🔄 Deploying on VPS..." -ForegroundColor Yellow
$DEPLOY_COMMANDS = @"
cd /opt/oneclaw
echo '📥 Pulling latest code...'
git fetch origin && git reset --hard origin/main

echo '📦 Installing dependencies...'
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

echo '🔨 Building packages...'
cd packages/database && pnpm build && cd /opt/oneclaw
cd packages/harness && pnpm build && cd /opt/oneclaw

echo '🔗 Linking env files...'
ln -sf /opt/oneclaw/.env.production /opt/oneclaw/apps/api/.env.production
ln -sf /opt/oneclaw/.env.production /opt/oneclaw/packages/harness/.env.production

echo '🔄 Restarting services...'
pm2 restart all

echo '⏳ Waiting for services...'
sleep 3

echo '📊 Service status:'
pm2 status

echo '✅ Deploy complete!'
"@

ssh $VPS_HOST $DEPLOY_COMMANDS

Write-Host "`n✅ Deployment finished!" -ForegroundColor Green
Write-Host "🌐 Test: https://oneclaw.chat/oauth/google?user=oneclaw-vps-1" -ForegroundColor Cyan
