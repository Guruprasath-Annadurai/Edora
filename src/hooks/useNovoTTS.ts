// ELEVENLABS_API_KEY is NO LONGER in the client bundle.
// All TTS calls are proxied through /functions/v1/elevenlabs-tts
// which verifies the user's session before forwarding to ElevenLabs.

import { useRef, useState, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { Toast } from '@capacitor/toast';
import { supabase } from '@/lib/supabase';

// ElevenLabs free tier limit — we chunk at 2400 chars to stay safely under any tier.
const MAX_CHARS = 2400;

export type TTSState = 'idle' | 'loading' | 'playing';

export function useNovoTTS() {
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [loadingId,  setLoadingId]  = useState<string | null>(null);
  const audioRef     = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  // ── Cleanup helper ────────────────────────────────────────────
  const cleanup = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current.onerror  = null;
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  // ── Stop ─────────────────────────────────────────────────────
  const stop = useCallback(() => {
    cleanup();
    setSpeakingId(null);
    setLoadingId(null);
  }, [cleanup]);

  // ── Speak ────────────────────────────────────────────────────
  const speak = useCallback(async (text: string, messageId: string, speed: 'slow' | 'normal' | 'fast' = 'normal') => {
    // Toggle off if already playing this message
    if (speakingId === messageId || loadingId === messageId) {
      stop();
      return;
    }

    // Stop any existing audio first
    cleanup();
    setSpeakingId(null);
    setLoadingId(messageId);

    try {
      // Get the user's session token — the Edge Function validates it
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      // Call the Edge Function — ElevenLabs API key stays server-side
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const res = await fetch(
        `${supabaseUrl}/functions/v1/elevenlabs-tts`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            // VITE_SUPABASE_ANON_KEY is intentionally public — needed by edge runtime
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY as string,
          },
          body: JSON.stringify({ text: text.slice(0, MAX_CHARS), speed }),
        }
      );

      if (!res.ok) {
        let errCode = '';
        try { const j = await res.json(); errCode = j.error ?? ''; } catch { /* ignore */ }

        setLoadingId(null);
        const msg = res.status === 401 || errCode === 'invalid_key'
          ? 'Audio unavailable: service issue'
          : res.status === 429 || errCode === 'rate_limit'
          ? 'Audio limit reached. Try again later.'
          : 'Audio playback failed. Please try again.';

        if (Capacitor.isNativePlatform()) {
          await Toast.show({ text: msg, duration: 'short', position: 'bottom' });
        }
        return;
      }

      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      objectUrlRef.current = url;

      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onended = () => { cleanup(); setSpeakingId(null); };
      audio.onerror = () => { cleanup(); setSpeakingId(null); };

      setLoadingId(null);
      setSpeakingId(messageId);
      await audio.play();

    } catch (err) {
      console.warn('[NovoTTS] Error:', err);
      cleanup();
      setLoadingId(null);
      setSpeakingId(null);
      if (Capacitor.isNativePlatform()) {
        await Toast.show({ text: 'Audio playback failed. Please try again.', duration: 'short', position: 'bottom' });
      }
    }
  }, [speakingId, loadingId, stop, cleanup]);

  // ── Per-message state helper ──────────────────────────────────
  const getState = useCallback((messageId: string): TTSState => {
    if (loadingId  === messageId) return 'loading';
    if (speakingId === messageId) return 'playing';
    return 'idle';
  }, [loadingId, speakingId]);

  return { speak, stop, getState, isSpeaking: speakingId !== null };
}
