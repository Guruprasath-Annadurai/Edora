import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ScanLine, Copy, Save, ArrowLeft, Sparkles, RotateCcw, Brain } from 'lucide-react';
import { CameraIcon, ImagesIcon } from '@/components/ui/icons';
import { Link } from 'react-router-dom';
import { Camera as CapCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { Toast } from '@capacitor/toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/lib/supabase';
import { withTimeout } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { geminiJSON } from '@/lib/gemini';
import { track } from '@/lib/analytics';
import { loadUnlockedIds, checkAchievements } from '@/lib/achievements';
import { indexUserItem } from '@/lib/userContentIndex';
import { getFeatureTheme } from '@/lib/featureTheme';

type Phase = 'idle' | 'scanning' | 'result' | 'saving' | 'generating';

interface ScanResult {
  scan_id:    string;
  full_text:  string;
  blocks:     { text: string; confidence: number }[];
  confidence: number | null;
  ocr_source?: 'cloud_vision' | 'gemini_vision';
}

// ── Resize + enhance for Indian textbook OCR ─────────────────────────────────
// Higher resolution (1600px) + contrast stretch improves accuracy on printed
// serif fonts, blurry phone shots, and mixed Hindi/English pages.
function resizeAndEnhance(dataUrl: string, maxDim = 1600): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      if (width > height && width > maxDim) {
        height = Math.round((height * maxDim) / width);
        width  = maxDim;
      } else if (height > maxDim) {
        width  = Math.round((width * maxDim) / height);
        height = maxDim;
      }
      canvas.width  = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);

      // Auto-contrast stretch — lifts shadow detail in dark/blurry photos
      const imageData = ctx.getImageData(0, 0, width, height);
      const data      = imageData.data;
      let min = 255, max = 0;
      for (let i = 0; i < data.length; i += 4) {
        // Luminance approx
        const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        if (lum < min) min = lum;
        if (lum > max) max = lum;
      }
      const range = max - min || 1;
      for (let i = 0; i < data.length; i += 4) {
        data[i]     = Math.min(255, Math.round(((data[i]     - min) / range) * 255));
        data[i + 1] = Math.min(255, Math.round(((data[i + 1] - min) / range) * 255));
        data[i + 2] = Math.min(255, Math.round(((data[i + 2] - min) / range) * 255));
      }
      ctx.putImageData(imageData, 0, 0);

      resolve(canvas.toDataURL('image/jpeg', 0.92).split(',')[1]);
    };
    img.src = dataUrl;
  });
}

export default function ScannerPage() {
  const ft = getFeatureTheme('scanner');
  const { user } = useAuth();
  const [phase, setPhase] = useState<Phase>('idle');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [editedText, setEditedText] = useState('');
  const [noteTitle, setNoteTitle] = useState('');
  const [error, setError] = useState('');
  const lastBase64Ref    = useRef<string>('');
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [showCameraRationale, setShowCameraRationale] = useState(false);
  const pendingSourceRef = useRef<'camera' | 'gallery' | null>(null);
  const skipRationaleRef = useRef(false);

  // ── Capture image from camera or gallery ──────────────────────
  async function captureImage(source: 'camera' | 'gallery') {
    try {
      setError('');

      // On web, use file input fallback
      if (!Capacitor.isNativePlatform()) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/jpeg,image/jpg,image/png,image/gif,image/webp,image/bmp,image/heic,image/heif';
        if (source === 'camera') input.capture = 'environment';
        input.onchange = async (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (!file) return;
          if (!file.type.startsWith('image/')) {
            setError('Please select an image file (JPEG, PNG, WebP, etc.).');
            return;
          }
          const reader = new FileReader();
          reader.onload = async (ev) => {
            const dataUrl = ev.target?.result as string;
            setPreviewUrl(dataUrl);
            const base64 = await resizeAndEnhance(dataUrl);
            lastBase64Ref.current = base64;
            await runOCR(base64);
          };
          reader.readAsDataURL(file);
        };
        input.click();
        return;
      }

      // Show in-app rationale before the system permission dialog
      if (!skipRationaleRef.current) {
        const perms = await CapCamera.checkPermissions();
        const perm  = source === 'camera' ? perms.camera : perms.photos;
        if (perm === 'denied') {
          setError('Camera access is disabled. Go to Settings → Apps → Edora → Permissions to enable it.');
          return;
        }
        if (perm !== 'granted') {
          pendingSourceRef.current = source;
          setShowCameraRationale(true);
          return;
        }
      }
      skipRationaleRef.current = false;

      const photo = await CapCamera.getPhoto({
        resultType: CameraResultType.DataUrl,
        source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
        quality: 90,
        allowEditing: false,
        correctOrientation: true,
      });

      if (!photo.dataUrl) return;
      setPreviewUrl(photo.dataUrl);

      // Resize before sending to API (saves bandwidth + cost)
      const base64 = await resizeAndEnhance(photo.dataUrl, 1024);
      lastBase64Ref.current = base64;
      await runOCR(base64);

    } catch (err) {
      const msg: string = ((err as Error)?.message ?? '').toLowerCase();
      if (msg.includes('cancel')) return;
      if (msg.includes('permission') || msg.includes('denied') || msg.includes('notallowed')) {
        setError('Camera access denied. Enable it in Settings → Apps → Edora → Permissions.');
      } else if (msg.includes('in use') || msg.includes('busy') || msg.includes('already')) {
        setError('Camera is in use by another app. Close it and try again.');
      } else if (msg.includes('no camera') || msg.includes('not available') || msg.includes('unavailable')) {
        setError('No camera found on this device.');
      } else {
        setError('Could not open camera. Please try again.');
      }
    }
  }

  async function proceedWithCamera() {
    const source = pendingSourceRef.current;
    if (source === null) return;
    pendingSourceRef.current = null;
    skipRationaleRef.current = true;
    setShowCameraRationale(false);
    await captureImage(source);
  }

  // ── Call the Supabase Edge Function ───────────────────────────
  async function runOCR(base64: string) {
    if (!user) { setError('Please sign in to use the scanner.'); return; }
    setPhase('scanning');
    try {
      const { data, error: fnError } = await withTimeout(
        supabase.functions.invoke('ocr', {
          body: { image_base64: base64, detection_type: 'DOCUMENT_TEXT_DETECTION' },
        }),
        30_000,
        'OCR timed out. Please try with a smaller or clearer image.',
      );

      if (fnError) throw new Error(fnError.message ?? 'OCR failed');
      if (!data) throw new Error('No response from OCR service');

      const result: ScanResult = data;
      setResult(result);
      setEditedText(result.full_text);
      setNoteTitle(`Scan — ${new Date().toLocaleDateString('en-IN')}`);
      setPhase('result');
      track('scan_complete', { word_count: result.full_text.split(/\s+/).filter(Boolean).length });
      const unlocked = await loadUnlockedIds(user.id);
      await checkAchievements({ userId: user.id, unlocked, profile: { xp: 0, streak_count: 0 }, extras: { isFirstScan: !unlocked.has('first_scan') } });

    } catch (err) {
      setError((err as Error).message ?? 'Scanning failed. Please try again.');
      setPhase('idle');
    }
  }

  // ── Save extracted text as a study note ───────────────────────
  async function saveAsNote() {
    if (!user || !editedText.trim()) return;
    setPhase('saving');
    try {
      const { data: scanNote, error: insertError } = await supabase.from('study_notes').insert({
        user_id: user.id,
        title: noteTitle || 'Scanned Note',
        content: editedText,
        ocr_text: result?.full_text,
        subject: '',
      }).select('id').single();
      if (insertError) throw new Error(insertError.message);
      if (scanNote?.id) indexUserItem('study_note', scanNote.id).catch(() => {});
      track('scan_saved_as_note', { word_count: editedText.split(/\s+/).filter(Boolean).length });
      await Toast.show({ text: 'Note saved!', duration: 'short', position: 'bottom' });
      reset();
    } catch (err) {
      setError((err as Error).message ?? 'Failed to save note.');
      setPhase('result');
    }
  }

  // ── Generate flashcards from OCR text via Gemini ───────────────
  async function generateFlashcards() {
    if (!user || !editedText.trim()) return;
    setPhase('generating');
    try {
      const cards = await geminiJSON<{ front: string; back: string }[]>(
        `Extract key concept-answer pairs from this study text and create flashcards.
Return ONLY a JSON array with 5 to 8 items, no markdown:
[{"front":"question or concept","back":"answer or explanation"}]

TEXT:
${editedText.slice(0, 3000)}`
      );

      if (!Array.isArray(cards) || cards.length === 0) throw new Error('No cards generated');

      const { data: scanCards, error: insertError } = await supabase.from('flashcards').insert(
        cards.map(c => ({
          user_id: user.id,
          front: c.front,
          back: c.back,
          subject: noteTitle || 'Scanned Note',
          topic: noteTitle || '',
          ease_factor: 2.5,
          interval: 1,
          repetitions: 0,
          next_review: new Date().toISOString(),
        }))
      ).select('id');
      if (insertError) throw new Error(insertError.message);
      (scanCards ?? []).forEach(fc => indexUserItem('flashcard', fc.id).catch(() => {}));

      track('ai_flashcards_generated', { count: cards.length, source: 'scanner' });
      await Toast.show({ text: `${cards.length} flashcards created!`, duration: 'long', position: 'bottom' });
      reset();
    } catch (err) {
      setError((err as Error).message ?? 'Could not generate flashcards. Please try again.');
      setPhase('result');
    }
  }

  async function copyText() {
    await navigator.clipboard.writeText(editedText);
    await Toast.show({ text: 'Copied to clipboard', duration: 'short', position: 'bottom' });
  }

  function reset() {
    setPhase('idle');
    setPreviewUrl(null);
    setResult(null);
    setEditedText('');
    setNoteTitle('');
    setError('');
    setShowManualEntry(false);
  }

  return (
    <div className="flex flex-col h-full bg-gradient-page"
      data-feature="scanner"
      style={{ backgroundImage: ft.meshGradient, backgroundAttachment: 'fixed' }}>
      {/* Header */}
      <div className="page-hero glass-strong border-b border-border px-4 py-3 flex items-center gap-3 shrink-0">
        <Link aria-label="Go back" to="/tools" className="touch-target">
          <ArrowLeft size={22} className="text-white" strokeWidth={1.75} />
        </Link>
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: ft.gradient, boxShadow: `0 4px 14px ${ft.glowRgba}` }}>
          <ScanLine size={20} className="text-white" />
        </div>
        <div className="flex-1">
          <h2 className="font-heading font-bold text-white text-sm">Notes Scanner</h2>
          <p className="text-xs text-muted-foreground">Cloud Vision OCR</p>
        </div>
        {phase !== 'idle' && (
          <button onClick={reset} className="touch-target">
            <RotateCcw size={18} className="text-muted-foreground" />
          </button>
        )}
      </div>

      <div className="flex-1 native-scroll pb-nav">
        <AnimatePresence mode="wait">

          {/* ── IDLE — pick source ── */}
          {phase === 'idle' && (
            <motion.div key="idle" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              className="flex flex-col gap-5 px-4 py-6">

              {/* Hero */}
              <div className="rounded-3xl p-6 flex flex-col items-center gap-4 text-center"
                style={{ background: 'linear-gradient(135deg, rgba(6,182,212,0.15), rgba(59,130,246,0.15))', border: '1px solid rgba(6,182,212,0.3)' }}>
                <div className="w-16 h-16 rounded-3xl flex items-center justify-center novo-glow"
                  style={{ background: 'linear-gradient(135deg, #06B6D4, #3B82F6)' }}>
                  <ScanLine size={32} className="text-white" />
                </div>
                <div>
                  <h3 className="font-heading text-xl font-bold text-white">Scan Handwriting</h3>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                    Capture your handwritten notes and convert them to digital text instantly using Google Cloud Vision
                  </p>
                </div>
              </div>

              {error && (
                <div className="glass rounded-2xl px-4 py-3 border border-red-500/30 flex items-start justify-between gap-3">
                  <p className="text-sm text-red-400 flex-1">{error}</p>
                  {lastBase64Ref.current && (
                    <button
                      onClick={() => { setError(''); runOCR(lastBase64Ref.current); }}
                      className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-xl active:scale-95 transition-all"
                      style={{ background: 'rgba(239,68,68,0.15)', color: '#F87171' }}>
                      Retry
                    </button>
                  )}
                </div>
              )}

              {/* Source buttons */}
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => captureImage('camera')}
                  className="flex flex-col items-center gap-3 p-5 rounded-3xl transition-all active:scale-95"
                  style={{ background: 'rgba(6,182,212,0.12)', border: '1px solid rgba(6,182,212,0.25)' }}>
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                    style={{ background: 'rgba(6,182,212,0.2)' }}>
                    <CameraIcon size={24} className="text-cyan-400" strokeWidth={1.75} />
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-white text-sm">Camera</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Take a photo</p>
                  </div>
                </button>

                <button onClick={() => captureImage('gallery')}
                  className="flex flex-col items-center gap-3 p-5 rounded-3xl transition-all active:scale-95"
                  style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)' }}>
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                    style={{ background: 'rgba(59,130,246,0.2)' }}>
                    <ImagesIcon size={24} className="text-blue-400" strokeWidth={1.75} />
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-white text-sm">Gallery</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Choose image</p>
                  </div>
                </button>
              </div>

              {/* Tips */}
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                    Tips for best results
                  </p>
                  {[
                    'Ensure good lighting — avoid shadows on the page',
                    'Hold camera flat and parallel to the paper',
                    'For blurry or low-confidence scans, use the "Type it manually" fallback',
                    'Supports English, Hindi, Tamil, Telugu + 7 more Indian scripts',
                  ].map((tip, i) => (
                    <div key={i} className="flex items-start gap-2 mb-2 last:mb-0">
                      <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <p className="text-sm text-white/80">{tip}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* ── SCANNING ── */}
          {phase === 'scanning' && (
            <motion.div key="scanning" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center h-full gap-8 px-4">

              {previewUrl && (
                <div className="w-full max-h-48 rounded-3xl overflow-hidden">
                  <img src={previewUrl} alt="Scan preview" className="w-full h-48 object-cover"
                    style={{ pointerEvents: 'auto' }} />
                </div>
              )}

              {/* Scanning animation */}
              <div className="relative w-32 h-32 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border-4 border-cyan-500/20" />
                <div className="absolute inset-0 rounded-full border-4 border-t-cyan-400 animate-spin" />
                <ScanLine size={36} className="text-cyan-400" />
                {/* Scan line sweep */}
                <motion.div className="absolute left-4 right-4 h-0.5 rounded-full"
                  style={{ background: 'linear-gradient(90deg, transparent, #06B6D4, transparent)' }}
                  animate={{ top: ['20%', '80%', '20%'] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'linear' }} />
              </div>

              <div className="text-center">
                <h3 className="font-heading text-xl font-bold text-white">Recognising Text…</h3>
                <p className="text-muted-foreground text-sm mt-1">Cloud Vision is processing your image</p>
              </div>
            </motion.div>
          )}

          {/* ── RESULT ── */}
          {phase === 'result' && result && (
            <motion.div key="result" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              className="flex flex-col gap-4 px-4 py-4">

              {error && (
                <div className="glass rounded-2xl px-4 py-3 border border-red-500/30 flex items-center justify-between gap-3">
                  <p className="text-sm text-red-400 flex-1">{error}</p>
                  <button onClick={() => setError('')}
                    className="text-xs font-bold text-red-400 shrink-0 px-2 py-1">✕</button>
                </div>
              )}

              {/* Preview thumbnail */}
              {previewUrl && (
                <div className="w-full h-36 rounded-3xl overflow-hidden">
                  <img src={previewUrl} alt="Scanned image" className="w-full h-36 object-cover"
                    style={{ pointerEvents: 'auto' }} />
                </div>
              )}

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-2">
                <Card>
                  <CardContent className="pt-3 pb-3 text-center">
                    <p className="font-heading font-bold text-foreground text-lg">
                      {result.full_text.split(/\s+/).filter(Boolean).length}
                    </p>
                    <p className="text-xs text-muted-foreground">Words</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-3 pb-3 text-center">
                    <p className="font-heading font-bold text-foreground text-lg">
                      {result.blocks.length}
                    </p>
                    <p className="text-xs text-muted-foreground">Blocks</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-3 pb-3 text-center">
                    <p className="font-heading font-bold text-foreground text-lg">
                      {result.confidence ? `${Math.round(result.confidence * 100)}%` : '—'}
                    </p>
                    <p className="text-xs text-muted-foreground">Confidence</p>
                  </CardContent>
                </Card>
              </div>

              {/* ── Low-confidence alert + manual type fallback ── */}
              {result.confidence !== null && result.confidence < 0.65 && (
                <div className="rounded-2xl px-4 py-3 flex items-start gap-3"
                  style={{ background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.25)' }}>
                  <span className="text-amber-400 text-base shrink-0 mt-0.5">⚠</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-amber-300">Low confidence scan ({Math.round(result.confidence * 100)}%)</p>
                    <p className="text-xs text-amber-200/60 mt-0.5 leading-snug">
                      Blurry image or mixed script detected. Edit the text below, or type your question directly.
                    </p>
                    {!showManualEntry && (
                      <button
                        onClick={() => { setShowManualEntry(true); setEditedText(''); }}
                        className="mt-2 text-xs font-bold px-3 py-1.5 rounded-xl active:scale-95 transition-transform"
                        style={{ background: 'rgba(251,191,36,0.15)', color: '#FCD34D' }}
                      >
                        Type it manually instead →
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* OCR source badge */}
              {result.ocr_source === 'gemini_vision' && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl self-start"
                  style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)' }}>
                  <Sparkles size={11} className="text-violet-400" />
                  <span className="text-xs font-semibold text-violet-300">Enhanced with Gemini Vision</span>
                </div>
              )}

              {/* Extracted text editor */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-white flex items-center gap-2">
                    <Sparkles size={14} className="text-cyan-400" />
                    {showManualEntry ? 'Type your text' : 'Extracted Text'}
                  </p>
                  <button onClick={copyText}
                    className="flex items-center gap-1.5 glass px-3 py-1.5 rounded-xl text-xs font-medium text-foreground active:scale-95 transition-all">
                    <Copy size={12} /> Copy
                  </button>
                </div>
                <textarea
                  value={editedText}
                  onChange={e => setEditedText(e.target.value)}
                  rows={10}
                  className="w-full glass rounded-2xl px-4 py-3 bg-transparent text-white text-sm outline-none resize-none leading-relaxed"
                  style={{ WebkitUserSelect: 'text', userSelect: 'text' }}
                  placeholder="No text detected. Try a clearer image."
                />
              </div>

              {/* Save as note + Generate flashcards */}
              {editedText.trim() && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-2">
                  <input
                    type="text"
                    placeholder="Note title (optional)"
                    value={noteTitle}
                    onChange={e => setNoteTitle(e.target.value)}
                    className="glass rounded-2xl px-4 h-11 bg-transparent text-white placeholder:text-white/30 text-sm outline-none w-full"
                    style={{ WebkitUserSelect: 'text', userSelect: 'text' }}
                  />
                  <Button onClick={saveAsNote} className="w-full">
                    <Save size={16} /> Save as Study Note
                  </Button>
                  {/* ── Flashcard generation from scanned text ── */}
                  <button onClick={generateFlashcards}
                    className="w-full h-12 rounded-2xl flex items-center justify-center gap-2 text-sm font-semibold border transition-all active:scale-98"
                    style={{ background: 'rgba(91,106,245,0.08)', borderColor: 'rgba(91,106,245,0.3)', color: '#5B6AF5' }}>
                    <Brain size={16} />
                    Generate Flashcards with AI
                  </button>
                </motion.div>
              )}

              <Button variant="secondary" onClick={reset} className="w-full">
                Scan Another
              </Button>
            </motion.div>
          )}

          {/* ── SAVING ── */}
          {phase === 'saving' && (
            <motion.div key="saving" className="flex flex-col items-center justify-center h-full gap-4">
              <div className="w-12 h-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
              <p className="text-white font-medium">Saving note…</p>
            </motion.div>
          )}

          {/* ── GENERATING FLASHCARDS ── */}
          {phase === 'generating' && (
            <motion.div key="generating" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center h-full gap-4 px-8 text-center">
              <div className="w-16 h-16 rounded-3xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}>
                <Brain size={32} className="text-white" />
              </div>
              <div className="w-12 h-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
              <div>
                <p className="text-white font-semibold">Generating Flashcards…</p>
                <p className="text-sm text-muted-foreground mt-1">AI is extracting key concepts from your notes</p>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* Camera permission rationale — shown before system dialog on native */}
      <AnimatePresence>
        {showCameraRationale && (
          <motion.div className="fixed inset-0 z-50 flex items-end"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowCameraRationale(false)} />
            <motion.div className="relative w-full rounded-t-3xl p-6 pb-10"
              style={{ background: 'var(--hdr-a-880)', backdropFilter: 'blur(20px)', borderTop: '1px solid var(--ink-100)' }}
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}>
              <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ background: 'var(--ink-200)' }} />
              <div className="flex items-start gap-3 mb-5">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(6,182,212,0.15)' }}>
                  <CameraIcon size={22} className="text-cyan-400" strokeWidth={1.75} />
                </div>
                <div>
                  <p className="font-bold text-white text-base">Allow camera access?</p>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                    Edora needs your camera to scan your handwritten notes and convert them to digital text.
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setShowCameraRationale(false)}>Not Now</Button>
                <Button className="flex-1" onClick={proceedWithCamera}>Continue</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
