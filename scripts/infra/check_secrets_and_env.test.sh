#!/usr/bin/env bash
# ==============================================================================
# Hardened Unit Tests for check_secrets_and_env.sh
#
# Verifies:
# 1. Real-looking key in src/ => FAIL
# 2. Real-looking key in docs/ => FAIL
# 3. Real-looking key in test file => FAIL
# 4. Explicit safe placeholder (gsk_TEST_PLACEHOLDER) => PASS
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GUARD_SCRIPT="$SCRIPT_DIR/check_secrets_and_env.sh"

echo "=========================================================="
echo "RUNNING HARDENED SECRET SCANNER REGRESSION TESTS"
echo "=========================================================="

# Baseline Test: Clean repository must pass
echo "Baseline Test: Running guard on clean repository..."
"$GUARD_SCRIPT"
echo "✓ Baseline Passed: Clean repository passed static guard."

# Setup isolated test directory
TEST_DIR=$(mktemp -d -t edora-secret-test-XXXXXX)
trap 'rm -rf "$TEST_DIR"' EXIT

git clone --depth 1 "file://$SCRIPT_DIR/../.." "$TEST_DIR" >/dev/null 2>&1
cp "$SCRIPT_DIR/check_secrets_and_env.sh" "$TEST_DIR/scripts/infra/"
cp "$SCRIPT_DIR/check_secrets_and_env.test.sh" "$TEST_DIR/scripts/infra/"
git -C "$TEST_DIR" add "$TEST_DIR/scripts/infra/" >/dev/null 2>&1

# Dynamically construct synthetic high-confidence keys without static literals in test source
PREFIX_GROQ="gsk_"
PREFIX_ANTHROPIC="sk-ant-"
FAKE_SECRET_SUFFIX="1234567890abcdef1234567890abcdef"
SYNTHETIC_GROQ_KEY="${PREFIX_GROQ}${FAKE_SECRET_SUFFIX}"
SYNTHETIC_CLAUDE_KEY="${PREFIX_ANTHROPIC}${FAKE_SECRET_SUFFIX}"

# ------------------------------------------------------------------------------
# Test 1: Real-looking key in src/ => FAIL
# ------------------------------------------------------------------------------
echo "Test 1: Verifying real-looking key in src/ => FAIL"
TEST1_FILE="$TEST_DIR/src/injected_key.ts"
echo "const apiKey = '${SYNTHETIC_GROQ_KEY}';" > "$TEST1_FILE"
git -C "$TEST_DIR" add "$TEST1_FILE"

if (cd "$TEST_DIR" && bash "$GUARD_SCRIPT" >/dev/null 2>&1); then
  echo "❌ Test 1 Failed: Guard failed to block key in src/!"
  exit 1
else
  echo "✓ Test 1 Passed: Guard blocked real-looking key in src/."
fi
git -C "$TEST_DIR" rm -f "$TEST1_FILE" >/dev/null 2>&1

# ------------------------------------------------------------------------------
# Test 2: Real-looking key in docs/ => FAIL
# ------------------------------------------------------------------------------
echo "Test 2: Verifying real-looking key in docs/ => FAIL"
TEST2_FILE="$TEST_DIR/docs/leaked_secret.md"
echo "Example key: ${SYNTHETIC_CLAUDE_KEY}" > "$TEST2_FILE"
git -C "$TEST_DIR" add "$TEST2_FILE"

if (cd "$TEST_DIR" && bash "$GUARD_SCRIPT" >/dev/null 2>&1); then
  echo "❌ Test 2 Failed: Guard failed to block key in docs/!"
  exit 1
else
  echo "✓ Test 2 Passed: Guard blocked real-looking key in docs/."
fi
git -C "$TEST_DIR" rm -f "$TEST2_FILE" >/dev/null 2>&1

# ------------------------------------------------------------------------------
# Test 3: Real-looking key in test file => FAIL
# ------------------------------------------------------------------------------
echo "Test 3: Verifying real-looking key in a test file => FAIL"
TEST3_FILE="$TEST_DIR/src/service.test.ts"
echo "const mockKey = '${SYNTHETIC_GROQ_KEY}';" > "$TEST3_FILE"
git -C "$TEST_DIR" add "$TEST3_FILE"

if (cd "$TEST_DIR" && bash "$GUARD_SCRIPT" >/dev/null 2>&1); then
  echo "❌ Test 3 Failed: Guard failed to block key in test file!"
  exit 1
else
  echo "✓ Test 3 Passed: Guard blocked real-looking key in test file."
fi
git -C "$TEST_DIR" rm -f "$TEST3_FILE" >/dev/null 2>&1

# ------------------------------------------------------------------------------
# Test 4: Explicit safe placeholder => PASS
# ------------------------------------------------------------------------------
echo "Test 4: Verifying explicit safe placeholder (gsk_TEST_PLACEHOLDER) => PASS"
TEST4_FILE="$TEST_DIR/src/safe_placeholder.test.ts"
echo "const testToken = 'gsk_TEST_PLACEHOLDER';" > "$TEST4_FILE"
git -C "$TEST_DIR" add "$TEST4_FILE"

if (cd "$TEST_DIR" && bash "$GUARD_SCRIPT" >/dev/null 2>&1); then
  echo "✓ Test 4 Passed: Guard accepted explicit safe placeholder."
else
  echo "❌ Test 4 Failed: Guard rejected valid safe placeholder!"
  exit 1
fi
git -C "$TEST_DIR" rm -f "$TEST4_FILE" >/dev/null 2>&1

echo "=========================================================="
echo "ALL HARDENED SECRET SCANNER REGRESSION TESTS PASSED."
echo "=========================================================="
