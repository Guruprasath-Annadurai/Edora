// ─────────────────────────────────────────────────────────────────────────────
// useGeminiStream — Server-Sent Events streaming hook for Novo chat
//
// Words appear token-by-token as Gemini generates them (OpenAI-style).
// Falls back to non-streaming geminiCall on browsers that don't support
// ReadableStream body (very old WebViews).
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { geminiCall } from '@/lib/gemini';
import type { GeminiMessage } from '@/lib/gemini';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

export interface StreamOptions {
  systemInstruction?: string;
  history?: GeminiMessage[];
  personality?: string;
}

export interface UseGeminiStreamReturn {
  streamingText: string;
  isStreaming:   boolean;
  streamMessage: (prompt: string, opts?: StreamOptions) => Promise<string>;
  cancelStream:  () => void;
}

export function useGeminiStream(): UseGeminiStreamReturn {
  const [streamingText, setStreamingText] = useState('');
  const [isStreaming,   setIsStreaming]   = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const cancelStream = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, []);

  const streamMessage = useCallback(async (
    prompt: string,
    opts: StreamOptions = {},
  ): Promise<string> => {
    // Cancel any in-flight stream
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStreamingText('');
    setIsStreaming(true);

    // Feature-detect ReadableStream body (not available in very old WebViews)
    const supportsStreamingBody = typeof ReadableStream !== 'undefined' &&
      typeof TextDecoder !== 'undefined';

    if (!supportsStreamingBody) {
      // Graceful fallback — non-streaming
      const text = await geminiCall(prompt, opts);
      setStreamingText(text);
      setIsStreaming(false);
      return text;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const res = await fetch(`${SUPABASE_URL}/functions/v1/gemini-chat`, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          Authorization:   `Bearer ${session.access_token}`,
          'apikey':        import.meta.env.VITE_SUPABASE_ANON_KEY as string,
        },
        body:   JSON.stringify({ prompt, stream: true, ...opts }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const errBody = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as { error?: string; _debug?: string; message?: string };
        console.error('[useGeminiStream] edge error:', res.status, errBody);
        if (res.status === 429 || errBody.error === 'rate_limit') {
          throw new Error(errBody.message ?? '⏳ Too many requests. Please wait a moment.');
        }
        const errMsg = errBody._debug ?? errBody.message ?? errBody.error ?? `HTTP ${res.status}`;
        throw new Error(errMsg);
      }

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer    = '';
      let fullText  = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (!payload || payload === '[DONE]') continue;

          try {
            const parsed = JSON.parse(payload) as { chunk?: string; image_url?: string };
            if (parsed.chunk) {
              fullText += parsed.chunk;
              setStreamingText(fullText);
            } else if (parsed.image_url) {
              // Image URL resolved by backend — append as markdown image
              fullText += `\n![diagram](${parsed.image_url})\n`;
              setStreamingText(fullText);
            }
          } catch { /* malformed chunk — skip */ }
        }
      }

      setIsStreaming(false);
      return fullText;

    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setIsStreaming(false);
        return streamingText;
      }
      const errMsg = (err as Error).message ?? '';
      // Network errors — fall back to non-streaming (connectivity might recover)
      const isNetworkError = errMsg === 'Failed to fetch' || errMsg === 'NetworkError when attempting to fetch resource.' || errMsg.startsWith('Load failed');
      if (isNetworkError) {
        console.warn('[useGeminiStream] network error, falling back:', errMsg);
        const fallback = await geminiCall(prompt, opts);
        setStreamingText(fallback);
        setIsStreaming(false);
        return fallback;
      }
      // Server error (HTTP 4xx/5xx with a real message) — rethrow so caller sees actual error
      console.warn('[useGeminiStream] server error, not falling back:', errMsg);
      setIsStreaming(false);
      throw err;
    }
  }, [streamingText]);

  return { streamingText, isStreaming, streamMessage, cancelStream };
}
