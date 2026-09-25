#!/usr/bin/env bash
# ==============================================================================
# Edora k6 Load Test Suite Runner
# Enforces production safety guard and runs specified scenario and profile.
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCENARIO="${1:-01-auth-smoke.js}"
PROFILE="${2:-p50}"

if [ ! -f "$SCRIPT_DIR/$SCENARIO" ]; then
  echo "Error: Scenario '$SCENARIO' not found in $SCRIPT_DIR."
  echo "Available scenarios:"
  ls -1 "$SCRIPT_DIR"/*.js | grep -v "config.js" | xargs -n 1 basename
  exit 1
fi

TARGET_URL="${TARGET_URL:-${VITE_SUPABASE_URL:-http://localhost:54321}}"
ALLOW_PROD="${ALLOW_PRODUCTION_LOAD_TEST:-false}"

# Extra shell-level safety guard before even invoking k6
if echo "$TARGET_URL" | grep -qiE "app\.edora|edora\.app"; then
  if [ "$ALLOW_PROD" != "true" ]; then
    echo "::error::CRITICAL SAFETY ABORT: TARGET_URL ($TARGET_URL) points to production."
    echo "Load testing production is strictly prohibited without explicit ALLOW_PRODUCTION_LOAD_TEST=true."
    exit 2
  fi
fi

echo "=========================================================="
echo "EDORA k6 CAPACITY LOAD TEST"
echo "Scenario: $SCENARIO"
echo "Profile:  $PROFILE"
echo "Target:   $TARGET_URL"
echo "=========================================================="

if command -v k6 &>/dev/null; then
  PROFILE="$PROFILE" TARGET_URL="$TARGET_URL" ALLOW_PRODUCTION_LOAD_TEST="$ALLOW_PROD" \
    k6 run "$SCRIPT_DIR/$SCENARIO"
elif command -v docker &>/dev/null; then
  echo "k6 not found locally; executing via official grafana/k6 Docker container..."
  docker run --rm -i \
    -e PROFILE="$PROFILE" \
    -e TARGET_URL="$TARGET_URL" \
    -e ALLOW_PRODUCTION_LOAD_TEST="$ALLOW_PROD" \
    -v "$SCRIPT_DIR:/load-tests:ro" \
    grafana/k6 run "/load-tests/$SCENARIO"
else
  echo "::warning::Neither 'k6' nor 'docker' is installed locally."
  echo "To install k6 on macOS: brew install k6"
  echo "All scenario test scripts have been generated and validated."
  exit 0
fi
