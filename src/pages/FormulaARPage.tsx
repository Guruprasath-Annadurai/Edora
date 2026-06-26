// ═══════════════════════════════════════════════════════════════════════════
// FormulaARPage — Formula AR Overlay
// Route: /formula-ar
//
// Point camera at any textbook page or written formula → Novo detects
// all formulas/equations and overlays explanations in AR style.
//
// Flow:
//   1. Camera feed (getUserMedia, back camera on mobile)
//   2. Capture frame → canvas → base64
//   3. Send to gemini-vision (formula_scan action)
//   4. Overlay detected formula cards on the frozen frame
//   5. Tap a card for full Novo explanation
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Camera, Scan, RotateCcw, Loader2,
  Sparkles, ChevronDown, ChevronUp, BookOpen,
  ZoomIn, AlertCircle,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DetectedFormula {
  formula: string;
  name: string;
  subject: string;
  explanation: string;
  variables: Array<{ symbol: string; meaning: string }>;
  application: string;
}

interface ScanResult {
  formulas: DetectedFormula[];
  summary: string;
  topic: string;
}

type ScanState = 'idle' | 'capturing' | 'analyzing' | 'result' | 'error';

// ── Constants ─────────────────────────────────────────────────────────────────

const SUBJECT_COLORS: Record<string, string> = {
  Physics:     '#5B6AF5',
  Chemistry:   '#10B981',
  Mathematics: '#F59E0B',
  Biology:     '#EC4899',
  General:     '#8B5CF6',
};

// ── FormulaCard ───────────────────────────────────────────────────────────────

function FormulaCard({ formula, index }: { formula: DetectedFormula; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const color = SUBJECT_COLORS[formula.subject] ?? SUBJECT_COLORS.General;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.1 }}
      className="rounded-2xl overflow-hidden border"
      style={{ borderColor: `${color}30`, background: `${color}0A` }}
    >
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-start gap-3 p-4 text-left"
      >
        {/* Formula badge */}
        <div
          className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold"
          style={{ background: `${color}20`, color }}
        >
          {index + 1}
        </div>

        <div className="flex-1 min-w-0 space-y-1">
          {/* Formula */}
          <div
            className="font-mono text-base font-bold tracking-wide"
            style={{ color }}
          >
            {formula.formula}
          </div>
          <div className="text-sm font-semibold text-white">{formula.name}</div>
          <div
            className="text-[10px] px-2 py-0.5 rounded-full inline-block font-medium"
            style={{ background: `${color}20`, color }}
          >
            {formula.subject}
          </div>
        </div>

        <div className="text-gray-500 flex-shrink-0 mt-1">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-4 border-t border-white/5 pt-3">
              {/* Explanation */}
              <div className="space-y-1">
                <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Explanation</p>
                <p className="text-sm text-gray-300 leading-relaxed">{formula.explanation}</p>
              </div>

              {/* Variables */}
              {formula.variables?.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Variables</p>
                  <div className="flex flex-wrap gap-2">
                    {formula.variables.map((v, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs"
                        style={{ background: `${color}15` }}
                      >
                        <span className="font-mono font-bold" style={{ color }}>{v.symbol}</span>
                        <span className="text-gray-400">{v.meaning}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Application */}
              {formula.application && (
                <div className="space-y-1">
                  <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">When to use</p>
                  <p className="text-sm text-gray-400 leading-relaxed">{formula.application}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── ScanningOverlay ───────────────────────────────────────────────────────────

function ScanningOverlay() {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      {/* Corner brackets */}
      <div className="relative w-64 h-64">
        {[
          'top-0 left-0 border-t-2 border-l-2 rounded-tl-lg',
          'top-0 right-0 border-t-2 border-r-2 rounded-tr-lg',
          'bottom-0 left-0 border-b-2 border-l-2 rounded-bl-lg',
          'bottom-0 right-0 border-b-2 border-r-2 rounded-br-lg',
        ].map((cls, i) => (
          <div key={i} className={`absolute w-8 h-8 border-indigo-400 ${cls}`} />
        ))}
        {/* Scanning line */}
        <motion.div
          className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-indigo-400 to-transparent"
          animate={{ top: ['10%', '90%', '10%'] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
        />
      </div>
      <div className="absolute bottom-1/4 text-center space-y-1">
        <p className="text-indigo-300 text-sm font-medium">Analysing formulas…</p>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function FormulaARPage() {
  const { user } = useAuth();

  const [scanState, setScanState]     = useState<ScanState>('idle');
  const [scanResult, setScanResult]   = useState<ScanResult | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg]       = useState('');
  const [cameraError, setCameraError] = useState('');
  const [flashColor, setFlashColor]   = useState<string | null>(null);

  const videoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // ── Start camera ──────────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    setCameraError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Camera access denied';
      setCameraError(msg.includes('denied') || msg.includes('NotAllowed')
        ? 'Camera permission denied. Please allow camera access and reload.'
        : 'Could not access camera. Make sure no other app is using it.');
    }
  }, []);

  // ── Stop camera ───────────────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    startCamera();
    return () => { stopCamera(); };
  }, [startCamera, stopCamera]);

  // ── Capture & scan ────────────────────────────────────────────────────────
  const capture = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !user) return;
    setScanState('capturing');

    // Flash effect
    setFlashColor('white');
    setTimeout(() => setFlashColor(null), 150);

    const video  = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width  = video.videoWidth  || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Get JPEG base64 (strip data: prefix)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    const base64  = dataUrl.split(',')[1] ?? '';
    setCapturedImage(dataUrl);
    stopCamera();

    setScanState('analyzing');

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token ?? '';

      const supabaseUrl = (import.meta as { env: Record<string, string> }).env.VITE_SUPABASE_URL;

      const res = await fetch(`${supabaseUrl}/functions/v1/gemini-vision`, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          action:       'formula_scan',
          image_base64: base64,
          mime_type:    'image/jpeg',
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as { result?: ScanResult; error?: string };

      if (json.error) throw new Error(json.error);

      const result = json.result ?? { formulas: [], summary: 'No formulas detected.', topic: '' };
      setScanResult(result);
      setScanState('result');

      if (result.formulas.length === 0) {
        setErrorMsg('No formulas detected. Try pointing at a formula-dense page.');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to analyse image. Please try again.');
      setScanState('error');
    }
  }, [user, stopCamera]);

  // ── Reset ─────────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    setScanState('idle');
    setScanResult(null);
    setCapturedImage(null);
    setErrorMsg('');
    startCamera();
  }, [startCamera]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="h-full text-white flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-20 border-b border-white/10 px-4 py-3 flex items-center gap-3" style={{ background: 'rgba(8,6,20,0.82)', backdropFilter: 'blur(48px) saturate(200%) brightness(1.04)', WebkitBackdropFilter: 'blur(48px) saturate(200%) brightness(1.04)' }}>
        <Link to="/home" className="p-2 rounded-xl hover:bg-white/5 transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </Link>
        <div className="flex-1">
          <h1 className="font-bold text-white">Formula AR</h1>
          <p className="text-xs text-gray-400">Point camera at formulas → instant explanation</p>
        </div>
        {(scanState === 'result' || scanState === 'error') && (
          <button
            onClick={reset}
            className="p-2 rounded-xl hover:bg-white/5 transition-colors"
          >
            <RotateCcw className="w-5 h-5 text-gray-400" />
          </button>
        )}
      </div>

      {/* Camera / Result area */}
      <div className="relative">
        {/* Camera preview */}
        {(scanState === 'idle' || scanState === 'capturing') && (
          <div className="relative bg-black overflow-hidden" style={{ aspectRatio: '4/3' }}>
            {cameraError ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center"
                style={{ background: 'rgba(10,8,24,0.95)' }}>
                <div className="w-16 h-16 rounded-3xl flex items-center justify-center"
                  style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)' }}>
                  <Camera className="w-7 h-7 text-red-400" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white mb-1">
                    {cameraError.includes('denied') || cameraError.includes('NotAllowed')
                      ? 'Camera Permission Denied'
                      : 'Camera Unavailable'}
                  </p>
                  <p className="text-xs text-gray-400 leading-relaxed max-w-xs mx-auto">{cameraError}</p>
                </div>
                {(cameraError.includes('denied') || cameraError.includes('NotAllowed')) ? (
                  <p className="text-xs text-gray-500 px-2">
                    Go to your device Settings → App → Camera and allow access, then come back.
                  </p>
                ) : (
                  <button
                    onClick={startCamera}
                    className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all active:scale-95"
                    style={{ background: 'linear-gradient(135deg,#5B6AF5,#8B5CF6)' }}
                  >
                    Retry
                  </button>
                )}
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  autoPlay
                  className="w-full h-full object-cover"
                />
                {/* Flash overlay */}
                <AnimatePresence>
                  {flashColor && (
                    <motion.div
                      initial={{ opacity: 0.8 }}
                      animate={{ opacity: 0 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 bg-white pointer-events-none"
                    />
                  )}
                </AnimatePresence>
                {/* AR corners */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="relative w-56 h-56">
                    {[
                      'top-0 left-0 border-t-2 border-l-2 rounded-tl-lg',
                      'top-0 right-0 border-t-2 border-r-2 rounded-tr-lg',
                      'bottom-0 left-0 border-b-2 border-l-2 rounded-bl-lg',
                      'bottom-0 right-0 border-b-2 border-r-2 rounded-br-lg',
                    ].map((cls, i) => (
                      <div key={i} className={`absolute w-8 h-8 border-indigo-400/70 ${cls}`} />
                    ))}
                  </div>
                </div>
                {/* Hint */}
                <div className="absolute bottom-4 left-0 right-0 text-center">
                  <p className="text-xs text-white/60">Point at formulas or equations</p>
                </div>
              </>
            )}
          </div>
        )}

        {/* Analyzing state */}
        {scanState === 'analyzing' && capturedImage && (
          <div className="relative overflow-hidden" style={{ aspectRatio: '4/3' }}>
            <img src={capturedImage} alt="captured" className="w-full h-full object-cover opacity-60" />
            <ScanningOverlay />
          </div>
        )}

        {/* Result image */}
        {(scanState === 'result' || scanState === 'error') && capturedImage && (
          <div className="relative overflow-hidden" style={{ aspectRatio: '4/3' }}>
            <img src={capturedImage} alt="scanned" className="w-full h-full object-cover" />
            {/* Formula count badge */}
            {scanState === 'result' && scanResult && scanResult.formulas.length > 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="absolute top-3 right-3 px-3 py-1.5 rounded-full bg-indigo-600/90 backdrop-blur text-xs font-bold flex items-center gap-1.5"
              >
                <Sparkles className="w-3 h-3" />
                {scanResult.formulas.length} formula{scanResult.formulas.length !== 1 ? 's' : ''} found
              </motion.div>
            )}
          </div>
        )}

        {/* Capture button */}
        {scanState === 'idle' && !cameraError && (
          <div className="absolute bottom-4 left-0 right-0 flex justify-center">
            <button
              onClick={capture}
              className="w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-2xl active:scale-95 transition-transform"
            >
              <Camera className="w-7 h-7 text-black" />
            </button>
          </div>
        )}

        {scanState === 'capturing' && (
          <div className="absolute bottom-4 left-0 right-0 flex justify-center">
            <div className="w-16 h-16 rounded-full bg-indigo-600/60 flex items-center justify-center">
              <Loader2 className="w-7 h-7 text-white animate-spin" />
            </div>
          </div>
        )}
      </div>

      {/* Hidden canvas for capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Results */}
      <div className="flex-1 px-4 py-5 space-y-4">
        {/* Analyzing progress */}
        {scanState === 'analyzing' && (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
            <p className="text-gray-300 font-medium">Detecting formulas…</p>
            <p className="text-xs text-gray-500">This takes 3-5 seconds</p>
          </div>
        )}

        {/* Error */}
        {scanState === 'error' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 rounded-2xl bg-red-900/20 border border-red-500/20 space-y-3"
          >
            <div className="flex items-center gap-2 text-red-400 font-semibold text-sm">
              <AlertCircle className="w-4 h-4" /> {errorMsg || 'Something went wrong'}
            </div>
            <button
              onClick={reset}
              className="px-4 py-2 rounded-xl bg-white/5 text-sm hover:bg-white/10 transition-colors flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" /> Try Again
            </button>
          </motion.div>
        )}

        {/* Results */}
        {scanState === 'result' && scanResult && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-4"
          >
            {/* Summary */}
            {scanResult.topic && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/8">
                <BookOpen className="w-4 h-4 text-gray-500 flex-shrink-0" />
                <div>
                  <p className="text-xs text-gray-500">Detected topic</p>
                  <p className="text-sm text-white font-medium">{scanResult.topic}</p>
                </div>
              </div>
            )}

            {scanResult.formulas.length === 0 ? (
              <div className="text-center py-10 space-y-3">
                <div className="text-4xl">🔍</div>
                <p className="text-gray-400 text-sm">{errorMsg || 'No formulas detected in this image.'}</p>
                <p className="text-xs text-gray-600">Try a cleaner shot of a formula-heavy page.</p>
                <button onClick={reset} className="px-4 py-2 rounded-xl bg-white/5 text-sm hover:bg-white/10 transition-colors flex items-center gap-2 mx-auto">
                  <RotateCcw className="w-4 h-4" /> Scan again
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Detected Formulas</p>
                {scanResult.formulas.map((f, i) => (
                  <FormulaCard key={i} formula={f} index={i} />
                ))}
              </div>
            )}

            {/* Scan again */}
            {scanResult.formulas.length > 0 && (
              <button
                onClick={reset}
                className="w-full py-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                <Scan className="w-4 h-4" /> Scan Another Page
              </button>
            )}
          </motion.div>
        )}

        {/* Idle tip */}
        {scanState === 'idle' && !cameraError && (
          <div className="space-y-3">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider text-center">How to use</p>
            <div className="grid grid-cols-3 gap-3">
              {[
                { icon: Camera, label: 'Point at a formula' },
                { icon: ZoomIn, label: 'Press capture' },
                { icon: Sparkles, label: 'Novo explains it' },
              ].map(({ icon: Icon, label }, i) => (
                <div key={i} className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-white/4 border border-white/8 text-center">
                  <div className="w-9 h-9 rounded-xl bg-indigo-900/40 flex items-center justify-center">
                    <Icon className="w-4 h-4 text-indigo-400" />
                  </div>
                  <p className="text-xs text-gray-500">{label}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
