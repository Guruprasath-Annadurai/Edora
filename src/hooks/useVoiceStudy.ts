// ═══════════════════════════════════════════════════════════════
// Edora — useVoiceStudy hook
// Manages the full voice conversation loop:
//   permission → speech recognition → Gemini → ElevenLabs TTS → idle
//
// Enterprise-grade: typed state machine, stale-closure guards,
// proper cleanup on unmount, non-fatal TTS fallback, DB persistence.
// ═══════════════════════════════════════════════════════════════

import { useState, useRef, useCallback, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { supabase } from '@/lib/supabase';
import { geminiCall, GeminiMessage } from '@/lib/gemini';
import type { LanguageOption } from '@/hooks/useLanguage';
import { logAIInteraction } from '@/components/ui/AIFeedback';

// ── State machine phases ──────────────────────────────────────────────────────
export type VoicePhase =
  | 'idle'        // ready — show tap-to-speak prompt
  | 'requesting'  // asking OS for microphone permission
  | 'listening'   // mic active, showing live transcript
  | 'processing'  // transcript sent to Gemini, awaiting reply
  | 'speaking'    // ElevenLabs audio playing
  | 'error';      // unrecoverable — user must retry

export interface VoiceTurn {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface UseVoiceStudyReturn {
  phase: VoicePhase;
  transcript: string;
  currentResponse: string;
  turns: VoiceTurn[];
  error: string;
  isAvailable: boolean;
  isAvailabilityChecked: boolean; // true once the async check has completed
  startListening: () => Promise<void>;
  stopListening: () => Promise<void>;
  interrupt: () => void;    // stop TTS or recognition mid-stream
  reset: () => void;        // full reset (clear conversation)
}

// Auto-submit after this many ms of silence (no new partialResults)
const SILENCE_TIMEOUT_MS = 1800;
const MAX_TTS_CHARS = 2400;

// ── System prompts ────────────────────────────────────────────────────────────
export const VOICE_SYSTEM_PROMPTS = {
  teacher: 'You are Novo, an expert AI tutor in teacher mode. The student is talking to you by voice. Keep your answers clear and concise — no longer than 4 sentences — because they are listening, not reading. Use simple spoken language. No bullet points, no markdown. Focus purely on academic help.',
  friend: 'You are Novo, a friendly study buddy. The student is talking to you by voice. Keep responses short, casual, and warm — 2–3 sentences max. No markdown. Only study help.',
};

// ── GCP STT via novo-stt (for Indian languages) ──────────────────────────────
async function transcribeWithGCP(
  audioBase64: string,
  langCode: string,
): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await supabase.functions.invoke('novo-stt', {
    body: {
      action: 'transcribe',
      audio_base64: audioBase64,
      language: langCode,
      encoding: 'webm',
      sample_rate: 48000,
    },
    headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
  });
  if (res.error) throw new Error(res.error.message);
  return res.data?.transcript ?? '';
}

// ── MediaRecorder-based audio capture (for GCP STT) ──────────────────────────
async function recordAudio(
  onStop: (base64: string) => void,
): Promise<{ stop: () => void }> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mimeType =
    MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' :
    MediaRecorder.isTypeSupported('audio/webm')             ? 'audio/webm'             :
    MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')  ? 'audio/ogg;codecs=opus'  :
    '';
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: Blob[] = [];
  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
  recorder.onstop = () => {
    stream.getTracks().forEach(t => t.stop());
    const blob = new Blob(chunks, { type: 'audio/webm' });
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1];
      onStop(base64);
    };
    reader.readAsDataURL(blob);
  };
  recorder.start(250); // collect in 250ms chunks
  return { stop: () => recorder.stop() };
}

// ── Hook ─────────────────────────────────────────────────────────────────────
export function useVoiceStudy(
  systemInstruction: string,
  userId: string | null,
  langOption?: LanguageOption,
  voiceSpeed: 'slow' | 'normal' | 'fast' = 'normal',
): UseVoiceStudyReturn {
  const [phase, setPhase]                 = useState<VoicePhase>('idle');
  const [transcript, setTranscript]       = useState('');
  const [currentResponse, setCurrentResponse] = useState('');
  const [turns, setTurns]                 = useState<VoiceTurn[]>([]);
  const [error, setError]                 = useState('');
  const [isAvailable, setIsAvailable]           = useState(false);
  const [isAvailabilityChecked, setIsAvailabilityChecked] = useState(false);

  // Refs — avoid stale closures inside async callbacks
  const phaseRef        = useRef<VoicePhase>('idle');
  const transcriptRef   = useRef('');
  const turnsRef        = useRef<VoiceTurn[]>([]);
  const audioRef        = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef    = useRef<string | null>(null);
  const silenceTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listenerRef     = useRef<{ remove: () => Promise<void> } | null>(null);
  const gcpRecorderRef  = useRef<{ stop: () => void } | null>(null);

  // Keep refs in sync with state
  useEffect(() => { phaseRef.current      = phase;   }, [phase]);
  useEffect(() => { transcriptRef.current = transcript; }, [transcript]);
  useEffect(() => { turnsRef.current      = turns;   }, [turns]);

  // Check device support on mount
  useEffect(() => {
    checkAvailability();
    return () => {
      cleanupAudio();
      cleanupListener();
      clearSilenceTimer();
    };
  }, []);

  // True if language requires GCP STT (non-English)
  const useGcpStt = langOption && langOption.code !== 'en';

  // ── Availability check ──────────────────────────────────────────────────────
  async function checkAvailability() {
    if (!Capacitor.isNativePlatform()) {
      const hasSpeech = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
      const hasMedia  = !!(navigator.mediaDevices?.getUserMedia);
      setIsAvailable(hasSpeech || hasMedia);
      setIsAvailabilityChecked(true);
      return;
    }
    try {
      const { available } = await SpeechRecognition.available();
      setIsAvailable(available);
    } catch {
      setIsAvailable(false);
    } finally {
      setIsAvailabilityChecked(true);
    }
  }

  // ── Cleanup helpers ─────────────────────────────────────────────────────────
  function cleanupAudio() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }

  async function cleanupListener() {
    if (listenerRef.current) {
      await listenerRef.current.remove().catch(() => {});
      listenerRef.current = null;
    }
  }

  function clearSilenceTimer() {
    if (silenceTimer.current) {
      clearTimeout(silenceTimer.current);
      silenceTimer.current = null;
    }
  }

  // ── Permission request ──────────────────────────────────────────────────────
  async function requestPermission(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) return true; // Web Speech API self-manages permissions
    try {
      const { speechRecognition } = await SpeechRecognition.requestPermissions();
      return speechRecognition === 'granted';
    } catch {
      return false;
    }
  }

  // ── Start listening ─────────────────────────────────────────────────────────
  const startListening = useCallback(async () => {
    const current = phaseRef.current;
    if (current !== 'idle' && current !== 'error') return;

    setError('');
    setTranscript('');
    transcriptRef.current = '';
    setPhase('requesting');

    const granted = await requestPermission();
    if (!granted) {
      setError('Microphone access denied. Please enable it in your device Settings and try again.');
      setPhase('error');
      return;
    }

    await cleanupListener();
    setPhase('listening');

    // ── GCP STT path (Indian languages) ────────────────────────────────────
    if (useGcpStt) {
      try {
        setTranscript('🎤 Recording… tap mic to send');
        gcpRecorderRef.current = await recordAudio(async (base64: string) => {
          gcpRecorderRef.current = null;
          if (phaseRef.current !== 'listening') return;
          setPhase('processing');
          setTranscript('');
          try {
            const transcript = await transcribeWithGCP(base64, langOption!.code);
            if (transcript.trim()) {
              await processTranscript(transcript);
            } else {
              setError('Could not detect speech. Please try again.');
              setPhase('error');
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error('[VoiceStudy] GCP STT error:', msg);
            setError('Speech recognition failed. Please try again.');
            setPhase('error');
          }
        });
        // Auto-stop after 15s to prevent runaway recording
        silenceTimer.current = setTimeout(() => {
          if (phaseRef.current === 'listening' && gcpRecorderRef.current) {
            gcpRecorderRef.current.stop();
            gcpRecorderRef.current = null;
          }
        }, 15000);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[VoiceStudy] GCP recorder start error:', msg);
        setError('Could not access microphone. Please try again.');
        setPhase('error');
      }
      return;
    }

    // ── Native STT path (English) ───────────────────────────────────────────
    try {
      // Attach partialResults listener
      const handle = await SpeechRecognition.addListener(
        'partialResults',
        (data: { matches: string[] }) => {
          const text = data.matches?.[0];
          if (!text) return;

          // Update live transcript display
          setTranscript(text);
          transcriptRef.current = text;

          // Reset silence timer — auto-submit when speech stops
          clearSilenceTimer();
          silenceTimer.current = setTimeout(() => {
            if (transcriptRef.current.trim() && phaseRef.current === 'listening') {
              void handleAutoSubmit();
            }
          }, SILENCE_TIMEOUT_MS);
        },
      );
      listenerRef.current = handle;

      await SpeechRecognition.start({
        language: 'en-US',
        maxResults: 1,
        partialResults: true,
        popup: false, // Android: suppress Google's dialog UI
      });

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[VoiceStudy] startListening error:', msg);
      setError('Could not start voice recognition. Please try again.');
      setPhase('error');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useGcpStt, langOption]);

  // ── Manual stop (user taps mic while listening) ─────────────────────────────
  const stopListening = useCallback(async () => {
    if (phaseRef.current !== 'listening') return;
    clearSilenceTimer();

    // GCP path: stop recorder (callback will handle transcription)
    if (gcpRecorderRef.current) {
      gcpRecorderRef.current.stop();
      gcpRecorderRef.current = null;
      return; // recorder's onstop callback takes it from here
    }

    // Native path
    try { await SpeechRecognition.stop(); } catch { /* ignore — we're stopping anyway */ }
    await cleanupListener();

    const text = transcriptRef.current.trim();
    if (text) {
      await processTranscript(text);
    } else {
      setPhase('idle'); // nothing was said — just go back to idle
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-submit after silence ───────────────────────────────────────────────
  async function handleAutoSubmit() {
    clearSilenceTimer();
    try { await SpeechRecognition.stop(); } catch { /* ignore */ }
    await cleanupListener();
    const text = transcriptRef.current.trim();
    if (text) await processTranscript(text);
    else setPhase('idle');
  }

  // ── Core processing: transcript → Gemini → TTS ─────────────────────────────
  async function processTranscript(text: string) {
    setPhase('processing');

    // Snapshot turns before mutation
    const existingTurns = turnsRef.current;

    // Append user turn
    const userTurn: VoiceTurn = { id: `u-${Date.now()}`, role: 'user', content: text };
    const withUser = [...existingTurns, userTurn];
    setTurns(withUser);
    turnsRef.current = withUser;

    // Persist to DB (fire-and-forget, non-blocking)
    if (userId) {
      supabase.from('tutor_chats')
        .insert({ user_id: userId, role: 'user', content: text, mode: 'teacher' })
        .then(({ error: e }) => { if (e) console.error('[VoiceStudy] persist user msg:', e.message); });
    }

    try {
      // Build Gemini history from last 6 turns (excluding the new user turn)
      const history: GeminiMessage[] = existingTurns
        .slice(-6)
        .map(t => ({
          role: (t.role === 'user' ? 'user' : 'model') as 'user' | 'model',
          text: t.content,
        }));

      const replyStartMs = Date.now();
      const response = await geminiCall(text, { systemInstruction, history });
      const responseMs = Date.now() - replyStartMs;

      // Append assistant turn
      const assistantTurn: VoiceTurn = { id: `a-${Date.now()}`, role: 'assistant', content: response };
      const withBoth = [...turnsRef.current, assistantTurn];
      setTurns(withBoth);
      turnsRef.current = withBoth;
      setCurrentResponse(response);

      // Persist assistant reply
      if (userId) {
        supabase.from('tutor_chats')
          .insert({ user_id: userId, role: 'assistant', content: response, mode: 'teacher' })
          .then(({ error: e }) => { if (e) console.error('[VoiceStudy] persist assistant msg:', e.message); });

        // Log to AI flywheel — non-blocking
        logAIInteraction({
          userId,
          sessionType: 'voice',
          userQuery:   text,
          aiResponse:  response,
          modelUsed:   'gemini-2.0-flash',
          responseMs,
        }).catch(() => {});
      }

      // Play TTS — non-fatal: if audio fails, user still sees text response
      await playTTS(response);

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      console.error('[VoiceStudy] processTranscript error:', msg);
      const userFacing = msg.toLowerCase().includes('rate')
        ? 'Too many requests — please wait a moment.'
        : "Novo couldn't respond. Please try again.";
      setError(userFacing);
      setPhase('error');
    }
  }

  // ── TTS playback ────────────────────────────────────────────────────────────
  async function playTTS(text: string) {
    setPhase('speaking');
    cleanupAudio();

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const res = await fetch(`${supabaseUrl}/functions/v1/elevenlabs-tts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY as string,
        },
        body: JSON.stringify({ text: text.slice(0, MAX_TTS_CHARS), speed: voiceSpeed }),
      });

      if (!res.ok) {
        // TTS failure is non-fatal — user already sees the text response
        console.warn('[VoiceStudy] TTS non-ok status:', res.status);
        setPhase('idle');
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;

      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onended = () => {
        cleanupAudio();
        // Only transition to idle if we haven't been interrupted
        if (phaseRef.current === 'speaking') setPhase('idle');
      };

      audio.onerror = () => {
        cleanupAudio();
        if (phaseRef.current === 'speaking') setPhase('idle');
      };

      await audio.play();

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[VoiceStudy] playTTS error:', msg);
      // Non-fatal: text response is already visible, just go idle
      cleanupAudio();
      setPhase('idle');
    }
  }

  // ── Interrupt (stop TTS or recognition mid-stream) ──────────────────────────
  const interrupt = useCallback(() => {
    clearSilenceTimer();
    cleanupAudio();
    const p = phaseRef.current;
    if (p === 'listening' || p === 'requesting') {
      if (gcpRecorderRef.current) {
        gcpRecorderRef.current.stop();
        gcpRecorderRef.current = null;
      }
      SpeechRecognition.stop().catch(() => {});
      void cleanupListener();
    }
    setPhase('idle');
  }, []);

  // ── Full reset (new conversation) ───────────────────────────────────────────
  const reset = useCallback(() => {
    clearSilenceTimer();
    cleanupAudio();
    if (gcpRecorderRef.current) {
      gcpRecorderRef.current.stop();
      gcpRecorderRef.current = null;
    }
    SpeechRecognition.stop().catch(() => {});
    void cleanupListener();
    setPhase('idle');
    setTranscript('');
    setCurrentResponse('');
    setTurns([]);
    turnsRef.current = [];
    setError('');
  }, []);

  return {
    phase,
    transcript,
    currentResponse,
    turns,
    error,
    isAvailable,
    isAvailabilityChecked,
    startListening,
    stopListening,
    interrupt,
    reset,
  };
}
