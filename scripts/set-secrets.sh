#!/bin/bash
# Run this ONCE after `supabase login` to set production secrets for Edge Functions
# Usage: ./scripts/set-secrets.sh

set -e

# Read keys from .env
source .env 2>/dev/null || true

if [ -z "$VITE_GEMINI_API_KEY" ] || [ -z "$VITE_ELEVENLABS_API_KEY" ]; then
  echo "ERROR: VITE_GEMINI_API_KEY or VITE_ELEVENLABS_API_KEY not found in .env"
  exit 1
fi

echo "Setting Gemini API key..."
supabase secrets set GEMINI_API_KEY="$VITE_GEMINI_API_KEY"

echo "Setting ElevenLabs API key..."
supabase secrets set ELEVENLABS_API_KEY="$VITE_ELEVENLABS_API_KEY"

echo ""
echo "✅ Done! Secrets set for project: $(cat supabase/.temp/project-ref)"
echo "   • gemini-chat function: GEMINI_API_KEY ✓"
echo "   • elevenlabs-tts function: ELEVENLABS_API_KEY ✓"
echo ""
echo "You can verify at:"
echo "   https://supabase.com/dashboard/project/$(cat supabase/.temp/project-ref)/settings/functions"
