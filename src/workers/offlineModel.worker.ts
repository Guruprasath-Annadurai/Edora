// ═══════════════════════════════════════════════════════════════════════════════
// offlineModel.worker — Transformers.js inference in a Web Worker
//
// Runs Xenova/flan-t5-small (text2text-generation, ~80MB ONNX quantized).
// Messages in:  { type: 'load' | 'infer' | 'cancel', payload }
// Messages out: { type: 'ready' | 'progress' | 'result' | 'error', payload }
// ═══════════════════════════════════════════════════════════════════════════════

import { pipeline, env, type ProgressCallback } from '@huggingface/transformers';

// Use CDN for model weights (browser Cache API auto-stores them)
env.allowLocalModels   = false;
env.useBrowserCache    = true;

const MODEL_ID = 'Xenova/flan-t5-small';

type Pipe = Awaited<ReturnType<typeof pipeline>>;
let pipe: Pipe | null = null;
let loading = false;

// ── Progress events → post to main thread ─────────────────────────────────────
const progressCallback: ProgressCallback = (info) => {
  if (info.status === 'progress') {
    self.postMessage({
      type: 'progress',
      payload: {
        file:     (info as { file?: string }).file ?? '',
        progress: Math.round((info as { progress?: number }).progress ?? 0),
      },
    });
  } else if (info.status === 'done') {
    self.postMessage({ type: 'progress', payload: { file: (info as { file?: string }).file ?? '', progress: 100 } });
  }
};

async function loadModel() {
  if (pipe || loading) return;
  loading = true;
  try {
    pipe = await pipeline('text2text-generation', MODEL_ID, {
      progress_callback: progressCallback,
      dtype: 'q8',
    });
    self.postMessage({ type: 'ready' });
  } catch (err) {
    self.postMessage({ type: 'error', payload: (err as Error).message });
  } finally {
    loading = false;
  }
}

async function runInference(prompt: string) {
  if (!pipe) {
    self.postMessage({ type: 'error', payload: 'Model not loaded' });
    return;
  }
  try {
    const result = await (pipe as (input: string, opts: Record<string, unknown>) => Promise<unknown>)(prompt, {
      max_new_tokens: 256,
      temperature: 0.7,
    });
    const output = Array.isArray(result) && result.length > 0
      ? (result[0] as { generated_text?: string }).generated_text ?? ''
      : String(result);
    self.postMessage({ type: 'result', payload: output });
  } catch (err) {
    self.postMessage({ type: 'error', payload: (err as Error).message });
  }
}

self.onmessage = (event: MessageEvent<{ type: string; payload?: string }>) => {
  const { type, payload } = event.data;
  if (type === 'load')  loadModel();
  else if (type === 'infer' && payload) runInference(payload);
};
