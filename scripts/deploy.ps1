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

# Step 3: SSH and run full deploy script on VPS
Write-Host "`n🔄 Deploying on VPS..." -ForegroundColor Yellow

# Upload and run the deploy script (avoids line ending issues)
scp scripts/deploy-full.sh "${VPS_HOST}:/opt/oneclaw/deploy-full.sh"
ssh $VPS_HOST "chmod +x /opt/oneclaw/deploy-full.sh && /opt/oneclaw/deploy-full.sh"

Write-Host "`n✅ Deployment finished!" -ForegroundColor Green
Write-Host "🌐 Test: https://oneclaw.chat/oauth/google?user=oneclaw-vps-1" -ForegroundColor Cyan
