#!/bin/bash
# Install Deno for Execute Code Tool
# This script installs Deno on macOS/Linux using the official installer

set -e

echo "Installing Deno..."

# Download and install Deno
curl -fsSL https://deno.land/x/install/install.sh | sh

# Add Deno to PATH for current session
export DENO_INSTALL="$HOME/.deno"
export PATH="$DENO_INSTALL/bin:$PATH"

echo ""
echo "Deno installed successfully!"
echo "Location: $HOME/.deno/bin"
echo ""
echo "Verifying installation..."
deno --version

echo ""
echo "✅ Setup complete!"
echo ""
echo "To use Deno in new terminal sessions, add this to your shell config (~/.bashrc, ~/.zshrc, etc):"
echo "  export DENO_INSTALL=\"\$HOME/.deno\""
echo "  export PATH=\"\$DENO_INSTALL/bin:\$PATH\""
