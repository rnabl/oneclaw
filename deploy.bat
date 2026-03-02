@echo off
REM OneClaw One-Click Deploy
REM Double-click this file to deploy everything to VPS

echo.
echo ========================================
echo    OneClaw One-Click Deploy
echo ========================================
echo.

REM Config
set VPS=root@104.131.111.116
set VPS_PATH=/opt/oneclaw
set LOCAL_ENV=%~dp0.env.production

REM Check if .env.production exists
if not exist "%LOCAL_ENV%" (
    echo ERROR: .env.production not found!
    pause
    exit /b 1
)

echo [1/4] Pushing code to GitHub...
cd /d "%~dp0"
git add -A
git commit -m "deploy: %date% %time%" 2>nul
git push

echo.
echo [2/4] Copying .env.production to VPS securely...
scp "%LOCAL_ENV%" %VPS%:%VPS_PATH%/.env.production

echo.
echo [3/4] Running deploy on VPS...
ssh %VPS% "cd %VPS_PATH% && git fetch origin && git reset --hard origin/main && pnpm install && cd packages/database && pnpm build && cd %VPS_PATH% && cd packages/harness && pnpm build && cd %VPS_PATH% && ln -sf %VPS_PATH%/.env.production %VPS_PATH%/apps/api/.env.production && pm2 restart all && sleep 3 && pm2 status"

echo.
echo [4/4] Testing...
curl -s "https://oneclaw.chat/health"

echo.
echo ========================================
echo    DEPLOY COMPLETE!
echo ========================================
echo.
echo Test OAuth: https://oneclaw.chat/oauth/google?user=oneclaw-vps-1
echo.
pause
