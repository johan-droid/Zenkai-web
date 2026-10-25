#!/usr/bin/env bash

# ==============================================================================
# Zenkai Web — Official Full-Stack Development Startup Script
# Boots Backend Fastify API (port 4000) and Frontend Next.js App (port 3000)
# ==============================================================================

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Detect repository directory whether executed from root or subfolder
if [ -d "$SCRIPT_DIR/Zenkai Website" ]; then
  REPO_DIR="$SCRIPT_DIR/Zenkai Website"
elif [ -d "$SCRIPT_DIR/backend" ] && [ -d "$SCRIPT_DIR/frontend" ]; then
  REPO_DIR="$SCRIPT_DIR"
else
  echo "❌ Error: Could not locate Zenkai Website repository directory."
  exit 1
fi

echo -e "\033[1;36m==================================================\033[0m"
echo -e "\033[1;35m⚡ Zenkai Web — Full-Stack Launcher\033[0m"
echo -e "\033[1;36m==================================================\033[0m"
echo -e "📂 Target Directory: \033[33m$REPO_DIR\033[0m"

# Verify Node.js and npm
if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node.js is not installed or not in PATH."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "❌ npm is not installed or not in PATH."
  exit 1
fi

echo -e "🟢 Node: $(node -v) | npm: $(npm -v)"

# Ensure dependencies are installed
if [ ! -d "$REPO_DIR/backend/node_modules" ]; then
  echo -e "\033[33m📦 Installing backend dependencies...\033[0m"
  (cd "$REPO_DIR/backend" && npm install)
fi

if [ ! -d "$REPO_DIR/frontend/node_modules" ]; then
  echo -e "\033[33m📦 Installing frontend dependencies...\033[0m"
  (cd "$REPO_DIR/frontend" && npm install)
fi

# Launch dev servers using dev.js orchestrator
exec node "$REPO_DIR/scripts/dev.js"
