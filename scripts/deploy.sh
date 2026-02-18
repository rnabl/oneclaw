#!/bin/bash
# iClaw Deployment Script
# Deploys the iClaw skill and config to Mac VPS

set -e

# Configuration - Update these
MAC_VPS_HOST="${MAC_VPS_HOST:-your-mac-vps-ip}"
MAC_VPS_USER="${MAC_VPS_USER:-admin}"

echo "=========================================="
echo "iClaw Deployment"
echo "=========================================="

# Check if we have the required files
if [ ! -f "openclaw/openclaw.json" ]; then
    echo "Error: openclaw/openclaw.json not found"
    exit 1
fi

if [ ! -f "openclaw/workspace/skills/iclaw/SKILL.md" ]; then
    echo "Error: openclaw/workspace/skills/iclaw/SKILL.md not found"
    exit 1
fi

echo "Deploying to $MAC_VPS_USER@$MAC_VPS_HOST..."

# Create remote directories
ssh "$MAC_VPS_USER@$MAC_VPS_HOST" "mkdir -p ~/.openclaw/workspace/skills/iclaw"

# Copy OpenClaw config
echo "Copying OpenClaw config..."
scp openclaw/openclaw.json "$MAC_VPS_USER@$MAC_VPS_HOST:~/.openclaw/"

# Copy iClaw skill
echo "Copying iClaw skill..."
scp openclaw/workspace/skills/iclaw/SKILL.md "$MAC_VPS_USER@$MAC_VPS_HOST:~/.openclaw/workspace/skills/iclaw/"

# Restart OpenClaw (if running)
echo "Restarting OpenClaw..."
ssh "$MAC_VPS_USER@$MAC_VPS_HOST" "pkill -f 'openclaw' || true; sleep 2; cd ~ && nohup openclaw start > ~/openclaw.log 2>&1 &"

echo ""
echo "=========================================="
echo "Deployment complete!"
echo "=========================================="
echo ""
echo "View logs: ssh $MAC_VPS_USER@$MAC_VPS_HOST 'tail -f ~/openclaw.log'"
echo ""
