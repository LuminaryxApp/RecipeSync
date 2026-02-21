#!/bin/bash
set -euo pipefail

# ─── RecipeSync VPS Deployment Script ───────────────────────
# Run this on your VPS after cloning the repo.
#
# Prerequisites:
#   - Docker & Docker Compose installed
#   - Nginx installed
#   - .env file configured (copy from .env.production)
#
# Usage:
#   chmod +x scripts/deploy.sh
#   ./scripts/deploy.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

echo "═══════════════════════════════════════════════════"
echo "  RecipeSync Deployment"
echo "═══════════════════════════════════════════════════"
echo ""

# ─── Check prerequisites ─────────────────────────────────
echo "▸ Checking prerequisites..."

if ! command -v docker &>/dev/null; then
    echo "  ✗ Docker not found. Install with:"
    echo "    curl -fsSL https://get.docker.com | sh"
    exit 1
fi
echo "  ✓ Docker $(docker --version | grep -oP '\d+\.\d+\.\d+')"

if ! docker compose version &>/dev/null; then
    echo "  ✗ Docker Compose not found."
    exit 1
fi
echo "  ✓ Docker Compose available"

if ! command -v nginx &>/dev/null; then
    echo "  ✗ Nginx not found. Install with: apt install nginx"
    exit 1
fi
echo "  ✓ Nginx installed"

# ─── Check .env file ─────────────────────────────────────
if [ ! -f .env ]; then
    echo ""
    echo "  ✗ No .env file found!"
    echo "    Copy the template and fill in values:"
    echo "    cp .env.production .env"
    echo "    nano .env"
    exit 1
fi
echo "  ✓ .env file found"

# Check for placeholder values
if grep -q "CHANGE_ME" .env; then
    echo ""
    echo "  ⚠ Your .env still has CHANGE_ME placeholder values!"
    echo "    Edit .env and set real secrets before deploying."
    echo "    Generate JWT secrets with: openssl rand -hex 32"
    exit 1
fi

echo ""

# ─── Build and start services ────────────────────────────
echo "▸ Building Docker images..."
docker compose build --no-cache

echo ""
echo "▸ Starting services (postgres, redis, api)..."
docker compose up -d

echo ""
echo "▸ Waiting for database to be ready..."
sleep 5

# ─── Run database migrations ─────────────────────────────
echo "▸ Running database migrations..."
docker compose exec api npx knex migrate:latest --knexfile knexfile.production.js
echo "  ✓ Migrations complete"

echo ""

# ─── Setup Nginx ─────────────────────────────────────────
echo "▸ Setting up Nginx configuration..."
if [ ! -f /etc/nginx/sites-available/recipesync ]; then
    sudo cp nginx/recipesync.conf /etc/nginx/sites-available/recipesync
    sudo ln -sf /etc/nginx/sites-available/recipesync /etc/nginx/sites-enabled/
    echo "  ✓ Nginx config installed"
    echo "  ⚠ IMPORTANT: Edit /etc/nginx/sites-available/recipesync"
    echo "    Replace YOUR_DOMAIN with your actual domain or IP"
else
    echo "  → Nginx config already exists, skipping (update manually if needed)"
fi

echo ""
echo "▸ Testing Nginx configuration..."
sudo nginx -t

echo ""
echo "▸ Reloading Nginx..."
sudo systemctl reload nginx

echo ""

# ─── Verify deployment ───────────────────────────────────
echo "▸ Verifying deployment..."
sleep 3

HEALTH=$(curl -sf http://127.0.0.1:3001/api/health 2>/dev/null || echo "FAILED")
if echo "$HEALTH" | grep -q '"ok"'; then
    echo "  ✓ API health check passed!"
else
    echo "  ✗ API health check failed. Check logs with:"
    echo "    docker compose logs api"
    exit 1
fi

echo ""
echo "═══════════════════════════════════════════════════"
echo "  ✓ RecipeSync deployed successfully!"
echo "═══════════════════════════════════════════════════"
echo ""
echo "  Services:"
echo "    API:        http://127.0.0.1:3001"
echo "    PostgreSQL: 127.0.0.1:5433"
echo "    Redis:      127.0.0.1:6380"
echo ""
echo "  Useful commands:"
echo "    docker compose logs -f api     # View API logs"
echo "    docker compose ps              # Check status"
echo "    docker compose restart api     # Restart API"
echo "    docker compose down            # Stop all"
echo ""
echo "  Next steps:"
echo "    1. Edit /etc/nginx/sites-available/recipesync"
echo "       Replace YOUR_DOMAIN with your domain or VPS IP"
echo "    2. (Optional) Setup SSL with certbot:"
echo "       sudo certbot --nginx -d YOUR_DOMAIN"
echo "    3. Update mobile app API_URL to point to your domain"
echo ""
