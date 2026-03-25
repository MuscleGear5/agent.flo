#!/bin/bash
# Quick test of rft API call - run this directly in your terminal
cd "$(dirname "$0")"

KEY=$(grep 'DEEPSEEK_API_KEY=' ~/.keys 2>/dev/null | head -1 | cut -d'"' -f2)
URL="https://api.deepseek.com/chat/completions"

echo "1. Testing deepseek-chat..."
resp=$(jq -n --arg usr "Say hello in 5 words" \
  '{"model":"deepseek-chat","messages":[{"role":"system","content":"be brief"},{"role":"user","content":$usr}],"temperature":0.2}' \
  | curl -s --max-time 15 "$URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $KEY" \
  -d @-)
echo "   Result: $(echo "$resp" | jq -r '.choices[0].message.content // "FAILED"')"

echo ""
echo "2. Testing deepseek-reasoner..."
resp=$(jq -n --arg usr "What is 2+2? One word answer." \
  '{"model":"deepseek-reasoner","messages":[{"role":"user","content":$usr}]}' \
  | curl -s --max-time 30 "$URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $KEY" \
  -d @-)
echo "   Result: $(echo "$resp" | jq -r '.choices[0].message.content // "FAILED"')"

echo ""
echo "3. Testing rft question mode..."
timeout 120 ./rft "what does ruflo agent spawn do" 2>&1
echo ""
echo "Done."
