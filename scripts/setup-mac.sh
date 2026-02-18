#!/bin/bash
# iClaw Mac VPS Setup Script
# Run this on your Mac VPS to set up the complete environment

set -e

echo "=========================================="
echo "iClaw Mac VPS Setup"
echo "=========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo -e "${RED}Error: This script must be run on macOS${NC}"
    exit 1
fi

echo -e "${YELLOW}Step 1: Checking Homebrew...${NC}"
if ! command -v brew &> /dev/null; then
    echo "Installing Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    
    # Add Homebrew to PATH for Apple Silicon
    if [[ $(uname -m) == 'arm64' ]]; then
        echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
        eval "$(/opt/homebrew/bin/brew shellenv)"
    fi
else
    echo -e "${GREEN}Homebrew already installed${NC}"
fi

echo -e "${YELLOW}Step 2: Installing Node.js...${NC}"
if ! command -v node &> /dev/null; then
    brew install node
else
    echo -e "${GREEN}Node.js already installed: $(node --version)${NC}"
fi

echo -e "${YELLOW}Step 3: Installing OpenClaw CLI...${NC}"
if ! command -v openclaw &> /dev/null; then
    npm install -g @openclaw/cli
else
    echo -e "${GREEN}OpenClaw CLI already installed${NC}"
fi

echo -e "${YELLOW}Step 4: Creating directory structure...${NC}"
mkdir -p ~/.openclaw/workspace/skills/iclaw

echo -e "${YELLOW}Step 5: Checking for configuration files...${NC}"

# Check if config exists
if [ ! -f ~/.openclaw/openclaw.json ]; then
    echo -e "${YELLOW}Creating default OpenClaw config...${NC}"
    cat > ~/.openclaw/openclaw.json << 'EOF'
{
  "agent": {
    "name": "iClaw",
    "model": "anthropic/claude-sonnet-4-20250514",
    "systemPrompt": "You are iClaw, a helpful AI assistant for iPhone users accessed via iMessage."
  },
  "channels": {
    "bluebubbles": {
      "enabled": true,
      "serverUrl": "http://localhost:1234",
      "password": "${BLUEBUBBLES_PASSWORD}"
    }
  },
  "browser": {
    "enabled": true,
    "headless": true
  },
  "skills": {
    "enabled": true,
    "directory": "./workspace/skills"
  }
}
EOF
    echo -e "${GREEN}Config created at ~/.openclaw/openclaw.json${NC}"
else
    echo -e "${GREEN}Config already exists${NC}"
fi

# Check if skill exists
if [ ! -f ~/.openclaw/workspace/skills/iclaw/SKILL.md ]; then
    echo -e "${YELLOW}Please copy the iClaw SKILL.md to ~/.openclaw/workspace/skills/iclaw/${NC}"
fi

echo -e "${YELLOW}Step 6: Checking BlueBubbles...${NC}"
if [ -d "/Applications/BlueBubbles.app" ]; then
    echo -e "${GREEN}BlueBubbles is installed${NC}"
else
    echo -e "${YELLOW}BlueBubbles not found. Please install it from: https://bluebubbles.app${NC}"
fi

echo -e "${YELLOW}Step 7: Environment file...${NC}"
if [ ! -f ~/.openclaw/.env ]; then
    cat > ~/.openclaw/.env << 'EOF'
# iClaw Environment Variables
# Fill in your actual values

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
ANTHROPIC_API_KEY=sk-ant-your-key
BLUEBUBBLES_PASSWORD=your-password
STRIPE_STARTER_LINK=https://buy.stripe.com/starter
STRIPE_PRO_LINK=https://buy.stripe.com/pro
EOF
    echo -e "${YELLOW}Created ~/.openclaw/.env - Please fill in your values${NC}"
else
    echo -e "${GREEN}Environment file exists${NC}"
fi

echo ""
echo "=========================================="
echo -e "${GREEN}Setup complete!${NC}"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Edit ~/.openclaw/.env with your actual API keys"
echo "2. Copy SKILL.md to ~/.openclaw/workspace/skills/iclaw/"
echo "3. Ensure BlueBubbles is running"
echo "4. Start OpenClaw: openclaw start"
echo ""
echo "To run OpenClaw in background:"
echo "  nohup openclaw start > ~/openclaw.log 2>&1 &"
echo ""
