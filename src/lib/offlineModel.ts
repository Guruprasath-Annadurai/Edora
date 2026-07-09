// ═══════════════════════════════════════════════════════════════════════════════
// offlineModel — Tier 5 ONNX model manager
//
// Wraps the Web Worker lifecycle.
// Call init() when user opts in to download (~80MB).
// Call infer(prompt) for offline text generation.
// ═══════════════════════════════════════════════════════════════════════════════

export type ModelStatus = 'idle' | 'downloading' | 'ready' | 'error';

export interface DownloadProgress {
  file:     string;
  progress: number;
}

type ProgressListener = (p: DownloadProgress) => void;
type StatusListener   = (s: ModelStatus)       => void;

const STORAGE_KEY = 'edora_offline_model_ready';

let worker:          Worker | null = null;
let _status:         ModelStatus   = 'idle';
let _inferResolve:   ((text: string) => void) | null = null;
let _inferReject:    ((err: Error) => void)   | null = null;

const progressListeners: Set<ProgressListener> = new Set();
const statusListeners:   Set<StatusListener>   = new Set();

function setStatus(s: ModelStatus) {
  _status = s;
  statusListeners.forEach(fn => fn(s));
}

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(
      new URL('../workers/offlineModel.worker.ts', import.meta.url),
      { type: 'module' },
    );
    worker.onmessage = (e: MessageEvent<{ type: string; payload?: unknown }>) => {
      const { type, payload } = e.data;
      if (type === 'ready') {
        localStorage.setItem(STORAGE_KEY, '1');
        setStatus('ready');
      } else if (type === 'progress') {
        const p = payload as DownloadProgress;
        progressListeners.forEach(fn => fn(p));
      } else if (type === 'result') {
        _inferResolve?.(String(payload ?? ''));
        _inferResolve = null;
        _inferReject  = null;
      } else if (type === 'error') {
        const msg = String(payload ?? 'Offline model error');
        if (_inferReject) {
          _inferReject(new Error(msg));
          _inferResolve = null;
          _inferReject  = null;
        } else {
          setStatus('error');
        }
      }
    };
    worker.onerror = (e) => {
      setStatus('error');
      _inferReject?.(new Error(e.message));
      _inferResolve = null;
      _inferReject  = null;
    };
  }
  return worker;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function getModelStatus(): ModelStatus { return _status; }

export function isModelReady(): boolean {
  return _status === 'ready' || !!localStorage.getItem(STORAGE_KEY);
}

export function onProgress(fn: ProgressListener): () => void {
  progressListeners.add(fn);
  return () => progressListeners.delete(fn);
}

export function onStatusChange(fn: StatusListener): () => void {
  statusListeners.add(fn);
  return () => statusListeners.delete(fn);
}

export async function initOfflineModel(): Promise<void> {
  if (_status === 'ready' || _status === 'downloading') return;
  setStatus('downloading');
  try {
    getWorker().postMessage({ type: 'load' });
    // resolves when 'ready' event fires (no direct promise — event-driven)
  } catch (err) {
    setStatus('error');
    throw err;
  }
}

export async function inferOffline(userQuery: string, timeoutMs = 30_000): Promise<string> {
  if (_status !== 'ready') {
    // Attempt to re-wake worker if model was already downloaded
    if (localStorage.getItem(STORAGE_KEY)) {
      getWorker().postMessage({ type: 'load' });
      await new Promise<void>((res, rej) => {
        const t = setTimeout(() => rej(new Error('Model wake timeout')), 10_000);
        const unsub = onStatusChange((s) => {
          if (s === 'ready') { clearTimeout(t); unsub(); res(); }
          if (s === 'error') { clearTimeout(t); unsub(); rej(new Error('Model failed to load')); }
        });
      });
    } else {
      throw new Error('Offline model not downloaded');
    }
  }

  const prompt = buildOfflinePrompt(userQuery);

  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      _inferResolve = null;
      _inferReject  = null;
      reject(new Error('Inference timeout'));
    }, timeoutMs);

    _inferResolve = (text) => { clearTimeout(timer); resolve(text); };
    _inferReject  = (err)  => { clearTimeout(timer); reject(err);   };

    getWorker().postMessage({ type: 'infer', payload: prompt });
  });
}

function buildOfflinePrompt(query: string): string {
  return `You are Novo, an AI tutor for JEE and NEET. Answer this student's question briefly and accurately.\n\nQuestion: ${query}\n\nAnswer:`;
}

// Re-wake worker if model was previously downloaded (call on app start + offline detection)
export function autoWakeIfReady(): void {
  if (_status === 'ready' || _status === 'downloading') return;
  if (!localStorage.getItem(STORAGE_KEY)) return;
  setStatus('downloading');
  try {
    getWorker().postMessage({ type: 'load' });
  } catch {
    setStatus('error');
  }
}

export function terminateWorker(): void {
  worker?.terminate();
  worker = null;
  setStatus('idle');
}
