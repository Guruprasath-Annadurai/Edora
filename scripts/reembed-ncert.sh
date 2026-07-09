#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# reembed-ncert.sh — Backfill embedding_q + embedding_c for all NCERT rows
#
# Run this once before launch. Takes ~2-4h for 15k chunks.
# Safe to re-run — skips rows that already have both vectors.
#
# Usage:
#   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... ./scripts/reembed-ncert.sh
#   ./scripts/reembed-ncert.sh Physics        # single subject only
#   ./scripts/reembed-ncert.sh                # all subjects
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

URL="${SUPABASE_URL:-}"
KEY="${SUPABASE_SERVICE_KEY:-${SUPABASE_SERVICE_ROLE_KEY:-}}"

if [[ -z "$URL" || -z "$KEY" ]]; then
  echo "ERROR: Set SUPABASE_URL and SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY)"
  exit 1
fi

ENDPOINT="${URL}/functions/v1/ncert-ingest"
SUBJECT="${1:-}"        # Optional: filter to single subject
BATCH_SIZE="${BATCH_SIZE:-50}"
MAX_BATCHES="${MAX_BATCHES:-99999}"

echo "═══════════════════════════════════════"
echo "NCERT Multi-Vector Embedding Backfill"
echo "Endpoint: $ENDPOINT"
echo "Subject filter: ${SUBJECT:-ALL}"
echo "Batch size: $BATCH_SIZE"
echo "Started: $(date)"
echo "═══════════════════════════════════════"

BODY="{\"action\":\"reembed_missing\",\"batch_size\":$BATCH_SIZE,\"max_batches\":$MAX_BATCHES"
if [[ -n "$SUBJECT" ]]; then
  BODY="${BODY},\"subject\":\"$SUBJECT\""
fi
BODY="${BODY}}"

echo "Sending request..."
RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
  -X POST "$ENDPOINT" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d "$BODY")

HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS:" | cut -d: -f2)
BODY_OUT=$(echo "$RESPONSE" | grep -v "HTTP_STATUS:")

echo "HTTP Status: $HTTP_STATUS"
echo "Response: $BODY_OUT"

if [[ "$HTTP_STATUS" != "200" ]]; then
  echo "ERROR: Non-200 response"
  exit 1
fi

echo ""
echo "Done: $(date)"
echo ""
echo "Next: Run status check to confirm vectors populated:"
echo "  curl -X POST $ENDPOINT -H 'Authorization: Bearer \$KEY' -H 'Content-Type: application/json' -d '{\"action\":\"status\"}'"
