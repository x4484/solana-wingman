#!/bin/bash
# Test a Solana Action endpoint

set -e

ACTION_URL="${1:-http://localhost:3000/api/actions/tip}"

echo "🔗 Testing Solana Action: $ACTION_URL"
echo ""

# Test GET
echo "📥 GET Request:"
echo "---"
GET_RESPONSE=$(curl -s "$ACTION_URL")
echo "$GET_RESPONSE" | jq . 2>/dev/null || echo "$GET_RESPONSE"
echo ""

# Validate GET response
echo "✅ Checking GET response..."
if echo "$GET_RESPONSE" | jq -e '.icon' > /dev/null 2>&1; then
  echo "  ✓ icon present"
else
  echo "  ✗ icon missing"
fi

if echo "$GET_RESPONSE" | jq -e '.title' > /dev/null 2>&1; then
  echo "  ✓ title present"
else
  echo "  ✗ title missing"
fi

if echo "$GET_RESPONSE" | jq -e '.description' > /dev/null 2>&1; then
  echo "  ✓ description present"
else
  echo "  ✗ description missing"
fi

if echo "$GET_RESPONSE" | jq -e '.label' > /dev/null 2>&1; then
  echo "  ✓ label present"
else
  echo "  ✗ label missing"
fi
echo ""

# Test OPTIONS (CORS)
echo "🌐 OPTIONS Request (CORS):"
echo "---"
CORS_HEADERS=$(curl -s -I -X OPTIONS "$ACTION_URL" 2>&1 | grep -i "access-control")
if [ -n "$CORS_HEADERS" ]; then
  echo "$CORS_HEADERS"
  echo "  ✓ CORS headers present"
else
  echo "  ✗ CORS headers missing!"
fi
echo ""

# Test POST (if wallet provided)
if [ -n "$2" ]; then
  WALLET="$2"
  echo "📤 POST Request (wallet: ${WALLET:0:8}...):"
  echo "---"
  POST_RESPONSE=$(curl -s -X POST "$ACTION_URL" \
    -H "Content-Type: application/json" \
    -d "{\"account\": \"$WALLET\"}")
  echo "$POST_RESPONSE" | jq . 2>/dev/null || echo "$POST_RESPONSE"
  echo ""
  
  if echo "$POST_RESPONSE" | jq -e '.transaction' > /dev/null 2>&1; then
    echo "  ✓ transaction present"
    TX_LEN=$(echo "$POST_RESPONSE" | jq -r '.transaction' | wc -c)
    echo "  ✓ transaction length: $TX_LEN bytes"
  else
    echo "  ✗ transaction missing"
  fi
else
  echo "💡 To test POST, provide a wallet address:"
  echo "   $0 $ACTION_URL YOUR_WALLET_PUBKEY"
fi

echo ""
echo "🔍 Full test at: https://www.blinks.xyz/inspector"
echo "   Enter: $ACTION_URL"
