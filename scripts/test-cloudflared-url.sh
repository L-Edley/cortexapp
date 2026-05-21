#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <cloudflared-url>"
  echo ""
  echo "Example:"
  echo "  $0 https://xxxx.trycloudflare.com"
  exit 1
fi

BASE_URL="${1%/}"
API_KEY="${AION_CORE_API_KEY:-supersecret-cortex-token}"

echo "==================================="
echo " Testing AION Core via cloudflared"
echo " URL: $BASE_URL"
echo "==================================="
echo ""

# 1. Test /health
echo "--- GET /health ---"
HEALTH=$(curl -s --max-time 5 "$BASE_URL/health" 2>&1) || HEALTH="curl failed ($?)"
echo "$HEALTH"
echo ""

# 2. Test POST /v1/core/chat
echo "--- POST /v1/core/chat ---"
BODY=$(cat <<'EOF'
{
  "app_id": "cortex",
  "user_id": "cortex",
  "input": "quem é o técnico da seleção brasileira?",
  "context": {
    "timezone": "America/Sao_Paulo",
    "locale": "pt-BR"
  }
}
EOF
)

RESPONSE=$(curl -s --max-time 20 \
  -X POST "$BASE_URL/v1/core/chat" \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: cortex" \
  -H "Authorization: Bearer $API_KEY" \
  -d "$BODY" 2>&1) || RESPONSE="curl failed ($?)"

echo "$RESPONSE" | head -c 500
echo ""
echo ""
echo "--- Done ---"
