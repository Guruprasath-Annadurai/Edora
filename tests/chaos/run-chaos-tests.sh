#!/usr/bin/env bash
# ==============================================================================
# Edora Chaos & Failure Test Suite Runner
# Starts local chaos mock server, runs test suite, and tears down safely.
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export CHAOS_PORT="${CHAOS_PORT:-9099}"

echo "Starting local Chaos Mock Server on port $CHAOS_PORT..."
node "$SCRIPT_DIR/chaos-server.js" &
SERVER_PID=$!

cleanup() {
  echo "Tearing down Chaos Mock Server (PID: $SERVER_PID)..."
  kill "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT

# Allow server to initialize
sleep 1

echo "Executing failure injection test scenarios..."
node "$SCRIPT_DIR/failure-scenarios.test.js"

echo "✓ Chaos tests completed successfully."
