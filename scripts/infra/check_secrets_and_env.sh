#!/usr/bin/env bash
# ==============================================================================
# Edora — Environment & Secrets Static CI Guard
# ZERO-COST: Scans git-tracked files for committed secrets, credentials,
# and verifies environment variable structure and Android config integrity.
# ==============================================================================

set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

VIOLATIONS=0

report_violation() {
  echo "::error file=$1::Secret/Configuration Violation: $2"
  VIOLATIONS=$((VIOLATIONS + 1))
}

echo "=========================================================="
echo "EDORA ENVIRONMENT & SECRETS STATIC GUARD"
echo "Root: $ROOT_DIR"
echo "=========================================================="

# ------------------------------------------------------------------------------
# 1. Private Keys & High-Risk Certificates Scan
# ------------------------------------------------------------------------------
echo "Step 1: Scanning for unencrypted private keys and certificates..."
PRIVATE_KEYS=$(git grep -EI "BEGIN (RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY" || true)
if [ -n "$PRIVATE_KEYS" ]; then
  while IFS= read -r line; do
    FILE=$(echo "$line" | cut -d: -f1)
    MATCH_CONTENT=$(echo "$line" | cut -d: -f2-)
    # Exclude regex replacements, comments, and test fixtures
    if [[ "$MATCH_CONTENT" =~ \.replace\(.*BEGIN.*PRIVATE\ KEY ]] || [[ "$MATCH_CONTENT" =~ \/-----BEGIN.*PRIVATE\ KEY.*\/ ]]; then
      continue
    fi
    if [[ "$FILE" != *"/test/"* && "$FILE" != *"mock"* && "$FILE" != *".test."* && "$FILE" != *"docs/"* ]]; then
      report_violation "$FILE" "Unencrypted private key detected in repository source: $MATCH_CONTENT"
    fi
  done <<< "$PRIVATE_KEYS"
fi

# ------------------------------------------------------------------------------
# 2. AI Provider & Vendor Secret Keys Pattern Scan
# ------------------------------------------------------------------------------
echo "Step 2: Scanning for hardcoded provider API keys..."

# Groq API keys: gsk_ followed by alphanumeric characters
GROQ_KEYS=$(git grep -EI "gsk_[A-Za-z0-9]{20,}" || true)
if [ -n "$GROQ_KEYS" ]; then
  while IFS= read -r line; do
    FILE=$(echo "$line" | cut -d: -f1)
    if [[ "$FILE" != *".test."* && "$FILE" != *"mock"* && "$FILE" != *"docs/"* ]]; then
      report_violation "$FILE" "Potential hardcoded Groq API key detected."
    fi
  done <<< "$GROQ_KEYS"
fi

# Anthropic API keys: sk-ant- followed by alphanumeric characters
ANTHROPIC_KEYS=$(git grep -EI "sk-ant-[A-Za-z0-9_-]{20,}" || true)
if [ -n "$ANTHROPIC_KEYS" ]; then
  while IFS= read -r line; do
    FILE=$(echo "$line" | cut -d: -f1)
    if [[ "$FILE" != *".test."* && "$FILE" != *"mock"* && "$FILE" != *"docs/"* ]]; then
      report_violation "$FILE" "Potential hardcoded Anthropic API key detected."
    fi
  done <<< "$ANTHROPIC_KEYS"
fi

# Google / Gemini API keys: AIzaSy followed by 33 characters
GOOGLE_KEYS=$(git grep -EI "AIzaSy[A-Za-z0-9_-]{33}" || true)
if [ -n "$GOOGLE_KEYS" ]; then
  while IFS= read -r line; do
    FILE=$(echo "$line" | cut -d: -f1)
    if [[ "$FILE" != *".test."* && "$FILE" != *"mock"* && "$FILE" != *"docs/"* ]]; then
      report_violation "$FILE" "Potential hardcoded Google API key detected."
    fi
  done <<< "$GOOGLE_KEYS"
fi

# RevenueCat secret keys: sk_live_ or sk_test_
RC_KEYS=$(git grep -EI "sk_(live|test)_[A-Za-z0-9]{24,}" || true)
if [ -n "$RC_KEYS" ]; then
  while IFS= read -r line; do
    FILE=$(echo "$line" | cut -d: -f1)
    if [[ "$FILE" != *".test."* && "$FILE" != *"mock"* && "$FILE" != *"docs/"* ]]; then
      report_violation "$FILE" "Potential hardcoded Stripe/RevenueCat secret API key detected."
    fi
  done <<< "$RC_KEYS"
fi

# ------------------------------------------------------------------------------
# 3. Supabase Service-Role Key Leakage Scan in Client Source
# ------------------------------------------------------------------------------
echo "Step 3: Checking client code (src/) for service-role token exposure..."
CLIENT_SERVICE_ROLE=$(git grep -EI "SUPABASE_SERVICE_ROLE_KEY|service_role" src/ || true)
if [ -n "$CLIENT_SERVICE_ROLE" ]; then
  while IFS= read -r line; do
    FILE=$(echo "$line" | cut -d: -f1)
    if [[ "$line" =~ \=.*service_role || "$line" =~ \.service_role ]]; then
      report_violation "$FILE" "Client code references service-role key or role."
    fi
  done <<< "$CLIENT_SERVICE_ROLE"
fi

# ------------------------------------------------------------------------------
# 4. Android Native Package Identifier Integrity
# ------------------------------------------------------------------------------
echo "Step 4: Verifying Android package identifier consistency (com.edora.app)..."

if [ -f "capacitor.config.ts" ]; then
  if ! grep -q "appId: 'com.edora.app'" capacitor.config.ts && ! grep -q 'appId: "com.edora.app"' capacitor.config.ts; then
    report_violation "capacitor.config.ts" "appId does not match canonical package 'com.edora.app'."
  fi
fi

if [ -f "android/app/build.gradle" ]; then
  if ! grep -q "applicationId \"com.edora.app\"" android/app/build.gradle; then
    report_violation "android/app/build.gradle" "applicationId does not match canonical package 'com.edora.app'."
  fi
fi

# ------------------------------------------------------------------------------
# 5. Environment Template Manifest Parity (.env.example)
# ------------------------------------------------------------------------------
echo "Step 5: Verifying required environment keys in .env.example..."
if [ -f ".env.example" ]; then
  REQUIRED_VARS=(
    "VITE_SUPABASE_URL"
    "VITE_SUPABASE_ANON_KEY"
  )
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
