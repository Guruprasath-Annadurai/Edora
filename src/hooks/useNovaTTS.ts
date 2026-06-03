import { useRef, useState, useCallback } from 'react';

// ElevenLabs voice — "Rachel" (clear, friendly female voice)
const VOICE_ID = '21m00Tcm4TlvDq8ikWAM';
// eleven_flash_v2_5 = lowest latency model (~300ms)
const MODEL_ID  = 'eleven_flash_v2_5';

// ElevenLabs free tier limit is ~2,500 chars/request; paid tiers support more.
// We chunk at 2 400 chars to stay safely under any tier.
const MAX_CHARS = 2400;

export type TTSState = 'idle' | 'loading' | 'playing';

export function useNovaTTS() {
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [loadingId,  setLoadingId]  = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  // ── Cleanup helper ────────────────────────────────────────────────
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

  // ── Stop ─────────────────────────────────────────────────────────
  const stop = useCallback(() => {
    cleanup();
    setSpeakingId(null);
    setLoadingId(null);
  }, [cleanup]);

  // ── Speak ────────────────────────────────────────────────────────
  const speak = useCallback(async (text: string, messageId: string) => {
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
      const apiKey = import.meta.env.VITE_ELEVENLABS_API_KEY;
      if (!apiKey) throw new Error('ElevenLabs API key not set');

      const res = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`,
        {
          method: 'POST',
          headers: {
            'xi-api-key':   apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text:     text.slice(0, MAX_CHARS),
            model_id: MODEL_ID,
            voice_settings: {
              stability:        0.50,
              similarity_boost: 0.80,
              style:            0.20,
              use_speaker_boost: true,
            },
          }),
        }
      );

      if (!res.ok) {
        console.warn('[NovaTTS] ElevenLabs error:', res.status);
        setLoadingId(null);
        return;
      }

      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      objectUrlRef.current = url;

      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onended = () => {
        cleanup();
        setSpeakingId(null);
      };
      audio.onerror = () => {
        cleanup();
        setSpeakingId(null);
      };

      setLoadingId(null);
      setSpeakingId(messageId);
      await audio.play();

    } catch (err) {
      console.warn('[NovaTTS] Error:', err);
      cleanup();
      setLoadingId(null);
      setSpeakingId(null);
    }
  }, [speakingId, loadingId, stop, cleanup]);

  // ── Per-message state helper ──────────────────────────────────────
  const getState = useCallback((messageId: string): TTSState => {
    if (loadingId  === messageId) return 'loading';
    if (speakingId === messageId) return 'playing';
    return 'idle';
  }, [loadingId, speakingId]);

  return { speak, stop, getState, isSpeaking: speakingId !== null };
}
