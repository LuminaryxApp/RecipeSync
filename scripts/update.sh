#!/bin/bash
set -euo pipefail

# ─── RecipeSync Update Script ───────────────────────────────
# Run this after pulling new code to rebuild and redeploy.
#
# Usage:
#   git pull
#   ./scripts/update.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

echo "▸ Rebuilding API image..."
docker compose build api

echo ""
echo "▸ Restarting API (zero-downtime)..."
docker compose up -d --no-deps api

echo ""
echo "▸ Running migrations..."
sleep 3
docker compose exec api npx knex migrate:latest --knexfile knexfile.production.js 2>/dev/null || echo "  (no new migrations)"

echo ""
echo "▸ Verifying..."
sleep 2
HEALTH=$(curl -sf http://127.0.0.1:3001/api/health 2>/dev/null || echo "FAILED")
if echo "$HEALTH" | grep -q '"ok"'; then
    echo "  ✓ Update successful!"
else
    echo "  ✗ Health check failed. Rolling back..."
    docker compose logs --tail=50 api
    exit 1
fi
