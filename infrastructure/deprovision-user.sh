#!/bin/bash
# Remove an OpenClaw instance for a user
# Usage: ./deprovision-user.sh <phone_number>

set -e

PHONE=$1
USER_ID=$(echo "$PHONE" | sed 's/+//g')
BASE_DIR="/opt/iclaw"
USER_DIR="$BASE_DIR/users/$USER_ID"

if [ -z "$PHONE" ]; then
    echo "Usage: ./deprovision-user.sh <phone_number>"
    exit 1
fi

echo "🗑️  Removing OpenClaw instance for $PHONE..."

# Stop and remove container
cd "$USER_DIR" 2>/dev/null && docker-compose down || true

# Remove user directory
rm -rf "$USER_DIR"

echo "✅ Instance removed for $PHONE"
