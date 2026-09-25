#!/usr/bin/env bash
# ==============================================================================
# Edora — Hardened Environment & Secrets Static CI Guard
# ZERO-COST: Scans ALL git-tracked files for high-confidence real secret patterns,
# unencrypted private keys, credential-bearing database URLs, and package ID parity.
#
# POLICY:
# 1. High-confidence secret patterns are scanned across ALL files (including docs & tests).
# 2. Explicit safe placeholders (e.g. gsk_TEST_PLACEHOLDER) are permitted.
# 3. Secret values are NEVER echoed into logs; outputs file and secret type ONLY.
# ==============================================================================

set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

VIOLATIONS=0

report_violation() {
  local file="$1"
  local secret_type="$2"
  # Strictly report file path and secret type ONLY. Never echo secret material.
  echo "::error file=$file::[Secret Leak] Hardcoded credential detected: $secret_type"
  VIOLATIONS=$((VIOLATIONS + 1))
}

echo "=========================================================="
echo "EDORA HARDENED SECRETS & ENVIRONMENT STATIC GUARD"
echo "Root: $ROOT_DIR"
echo "=========================================================="

# ------------------------------------------------------------------------------
# 1. Private Keys & High-Risk Certificates (Scanned across ALL tracked files)
# ------------------------------------------------------------------------------
echo "Step 1: Scanning for unencrypted private keys across all repository files..."
PRIVATE_KEYS=$(git grep -n -EI "BEGIN (RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY" || true)
if [ -n "$PRIVATE_KEYS" ]; then
  while IFS= read -r line; do
    FILE=$(echo "$line" | cut -d: -f1)
    MATCH_CONTENT=$(echo "$line" | cut -d: -f3-)
    # Allow regex replacement patterns and comment templates
    if [[ "$MATCH_CONTENT" =~ \.replace\(.*BEGIN.*PRIVATE\ KEY ]] || [[ "$MATCH_CONTENT" =~ \/-----BEGIN.*PRIVATE\ KEY.*\/ ]]; then
      continue
    fi
    report_violation "$FILE" "Unencrypted Private Key Block"
  done <<< "$PRIVATE_KEYS"
fi

# ------------------------------------------------------------------------------
# 2. AI Provider & Vendor Secret Keys (Scanned across ALL tracked files)
# ------------------------------------------------------------------------------
echo "Step 2: Scanning for high-confidence AI provider & payment secret keys..."

# Groq API keys: gsk_ followed by 20+ chars (permits gsk_TEST_PLACEHOLDER)
GROQ_MATCHES=$(git grep -n -EI "gsk_[A-Za-z0-9]{20,}" || true)
if [ -n "$GROQ_MATCHES" ]; then
  while IFS= read -r line; do
    FILE=$(echo "$line" | cut -d: -f1)
    MATCH_LINE=$(echo "$line" | cut -d: -f3-)
    if [[ ! "$MATCH_LINE" =~ gsk_TEST_PLACEHOLDER ]]; then
      report_violation "$FILE" "Groq API Key (gsk_*)"
    fi
  done <<< "$GROQ_MATCHES"
fi

# Anthropic API keys: sk-ant- followed by 20+ chars (permits sk-ant-TEST_PLACEHOLDER)
ANTHROPIC_MATCHES=$(git grep -n -EI "sk-ant-[A-Za-z0-9_-]{20,}" || true)
if [ -n "$ANTHROPIC_MATCHES" ]; then
  while IFS= read -r line; do
    FILE=$(echo "$line" | cut -d: -f1)
    MATCH_LINE=$(echo "$line" | cut -d: -f3-)
    if [[ ! "$MATCH_LINE" =~ sk-ant-TEST_PLACEHOLDER ]]; then
      report_violation "$FILE" "Anthropic API Key (sk-ant-*)"
    fi
  done <<< "$ANTHROPIC_MATCHES"
fi

# Google / Gemini API keys: AIzaSy followed by 33 chars (permits AIzaSyTEST_PLACEHOLDER)
GOOGLE_MATCHES=$(git grep -n -EI "AIzaSy[A-Za-z0-9_-]{33}" || true)
if [ -n "$GOOGLE_MATCHES" ]; then
  while IFS= read -r line; do
    FILE=$(echo "$line" | cut -d: -f1)
    MATCH_LINE=$(echo "$line" | cut -d: -f3-)
    if [[ ! "$MATCH_LINE" =~ AIzaSyTEST_PLACEHOLDER ]]; then
      report_violation "$FILE" "Google API Key (AIzaSy*)"
    fi
  done <<< "$GOOGLE_MATCHES"
fi

# Stripe / RevenueCat live/test secret keys (permits sk_(live|test)_TEST_PLACEHOLDER)
RC_MATCHES=$(git grep -n -EI "sk_(live|test)_[A-Za-z0-9]{24,}" || true)
if [ -n "$RC_MATCHES" ]; then
  while IFS= read -r line; do
    FILE=$(echo "$line" | cut -d: -f1)
    MATCH_LINE=$(echo "$line" | cut -d: -f3-)
    if [[ ! "$MATCH_LINE" =~ sk_(live|test)_TEST_PLACEHOLDER ]]; then
      report_violation "$FILE" "Stripe/RevenueCat Secret Key (sk_live_* / sk_test_*)"
    fi
  done <<< "$RC_MATCHES"
fi

# ------------------------------------------------------------------------------
# 3. Credential-Bearing PostgreSQL Connection URLs
# ------------------------------------------------------------------------------
echo "Step 3: Scanning for credential-bearing PostgreSQL connection strings..."
# Detects postgres://user:password@host where password is not a placeholder template
PG_MATCHES=$(git grep -n -EI "postgres(ql)?://[a-zA-Z0-9_.-]+:[^@\s/]+@[a-zA-Z0-9_.-]+" || true)
if [ -n "$PG_MATCHES" ]; then
  while IFS= read -r line; do
    FILE=$(echo "$line" | cut -d: -f1)
    MATCH_LINE=$(echo "$line" | cut -d: -f3-)
    # Ignore safe template placeholders
    if [[ "$MATCH_LINE" =~ :(\[PASSWORD\]|PASSWORD|password|test|postgres|YOUR_PASSWORD)@ ]]; then
      continue
    fi
    report_violation "$FILE" "Credential-Bearing PostgreSQL Connection URI"
  done <<< "$PG_MATCHES"
fi

# ------------------------------------------------------------------------------
# 4. Supabase Service-Role Key Leakage in Client Code (src/)
# ------------------------------------------------------------------------------
echo "Step 4: Checking client code (src/) for service-role token exposure..."
CLIENT_SERVICE_ROLE=$(git grep -n -EI "SUPABASE_SERVICE_ROLE_KEY|service_role" src/ || true)
if [ -n "$CLIENT_SERVICE_ROLE" ]; then
  while IFS= read -r line; do
    FILE=$(echo "$line" | cut -d: -f1)
    MATCH_LINE=$(echo "$line" | cut -d: -f3-)
    if [[ "$MATCH_LINE" =~ \=.*service_role || "$MATCH_LINE" =~ \.service_role ]]; then
      report_violation "$FILE" "Client code references service-role key or role"
    fi
  done <<< "$CLIENT_SERVICE_ROLE"
fi

# ------------------------------------------------------------------------------
# 5. Android Native Package Identifier Integrity (com.edora.app)
# ------------------------------------------------------------------------------
echo "Step 5: Verifying Android package identifier consistency (com.edora.app)..."
if [ -f "capacitor.config.ts" ]; then
  if ! grep -q "appId: 'com.edora.app'" capacitor.config.ts && ! grep -q 'appId: "com.edora.app"' capacitor.config.ts; then
    report_violation "capacitor.config.ts" "appId does not match canonical package 'com.edora.app'"
  fi
fi

if [ -f "android/app/build.gradle" ]; then
  if ! grep -q "applicationId \"com.edora.app\"" android/app/build.gradle; then
    report_violation "android/app/build.gradle" "applicationId does not match canonical package 'com.edora.app'"
  fi
fi

# ------------------------------------------------------------------------------
# 6. Environment Template Parity (.env.example)
# ------------------------------------------------------------------------------
echo "Step 6: Verifying required environment keys in .env.example..."
if [ -f ".env.example" ]; then
  REQUIRED_VARS=("VITE_SUPABASE_URL" "VITE_SUPABASE_ANON_KEY")
  for VAR in "${REQUIRED_VARS[@]}"; do
    if ! grep -q "^$VAR=" .env.example; then
      report_violation ".env.example" "Missing required environment definition: $VAR"
    fi
  done
fi

# ------------------------------------------------------------------------------
# Summary and Exit
# ------------------------------------------------------------------------------
echo "=========================================================="
if [ "$VIOLATIONS" -gt 0 ]; then
  echo "❌ FAILED: Found $VIOLATIONS secret/environment violation(s)."
  echo "Review files listed above. Secrets must NEVER be checked into Git."
  exit 1
else
  echo "✓ PASSED: Zero secret leaks, valid package IDs, and compliant environment structure."
  echo "=========================================================="
  exit 0
fi
