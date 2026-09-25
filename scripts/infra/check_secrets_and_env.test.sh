#!/usr/bin/env bash
# ==============================================================================
# Unit Test: check_secrets_and_env.sh
# Verifies that check_secrets_and_env.sh correctly detects forbidden secrets
# and passes on compliant codebases.
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GUARD_SCRIPT="$SCRIPT_DIR/check_secrets_and_env.sh"

echo "Running unit tests for check_secrets_and_env.sh..."

# Test 1: Real repository check should pass
echo "Test 1: Running guard against current repository..."
"$GUARD_SCRIPT"
echo "✓ Test 1 Passed: Repository cleanly passed static guard."

# Test 2: Injected secret detection test
echo "Test 2: Verifying synthetic leak detection..."
TEST_DIR=$(mktemp -d -t edora-guard-test-XXXXXX)
trap 'rm -rf "$TEST_DIR"' EXIT

git clone --depth 1 "file://$SCRIPT_DIR/../.." "$TEST_DIR" >/dev/null 2>&1

# Inject a synthetic groq key in a non-test file
echo "const apiKey = 'gsk_1234567890abcdef1234567890abcdef';" >> "$TEST_DIR/src/leak_test.ts"
git -C "$TEST_DIR" add src/leak_test.ts

if (cd "$TEST_DIR" && bash "$GUARD_SCRIPT" >/dev/null 2>&1); then
  echo "❌ Test 2 Failed: Guard failed to catch synthetic Groq key!"
  exit 1
else
  echo "✓ Test 2 Passed: Guard successfully caught synthetic Groq API key leak."
fi

echo "All check_secrets_and_env unit tests PASSED."
