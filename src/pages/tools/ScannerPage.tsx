import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, ScanLine, Copy, Save, ArrowLeft, FileText, Sparkles, RotateCcw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Camera as CapCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { Toast } from '@capacitor/toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

type Phase = 'idle' | 'scanning' | 'result' | 'saving';

interface ScanResult {
  scan_id: string;
  full_text: string;
  blocks: { text: string; confidence: number }[];
  confidence: number | null;
}

// ── Resize image and convert to base64 ───────────────────────────────────────
function resizeImage(dataUrl: string, maxDim = 1024): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      if (width > height && width > maxDim) {
        height = Math.round((height * maxDim) / width);
        width = maxDim;
      } else if (height > maxDim) {
        width = Math.round((width * maxDim) / height);
        height = maxDim;
      }
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
      // Return only the base64 part (strip data:image/jpeg;base64,)
      const base64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
      resolve(base64);
    };
    img.src = dataUrl;
  });
}

export default function ScannerPage() {
  const { user } = useAuth();
  const [phase, setPhase] = useState<Phase>('idle');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [editedText, setEditedText] = useState('');
  const [noteTitle, setNoteTitle] = useState('');
  const [error, setError] = useState('');

  // ── Capture image from camera or gallery ──────────────────────
  async function captureImage(source: 'camera' | 'gallery') {
    try {
      setError('');

      // On web, use file input fallback
      if (!Capacitor.isNativePlatform()) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = async (ev) => {
            const dataUrl = ev.target?.result as string;
            setPreviewUrl(dataUrl);
            await runOCR(dataUrl.split(',')[1]);
          };
          reader.readAsDataURL(file);
        };
        input.click();
        return;
      }

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
      const base64 = await resizeImage(photo.dataUrl, 1024);
      await runOCR(base64);

    } catch (err: any) {
      if (!err.message?.includes('cancelled')) {
        setError('Could not access camera. Please check permissions.');
      }
    }
  }

  // ── Call the Supabase Edge Function ───────────────────────────
  async function runOCR(base64: string) {
    setPhase('scanning');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ocr`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            image_base64: base64,
            detection_type: 'DOCUMENT_TEXT_DETECTION',
          }),
        }
      );

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'OCR failed');
      }

      const data: ScanResult = await res.json();
      setResult(data);
      setEditedText(data.full_text);
      setNoteTitle(`Scan — ${new Date().toLocaleDateString('en-IN')}`);
      setPhase('result');

    } catch (err: any) {
      setError(err.message);
      setPhase('idle');
    }
  }

  // ── Save extracted text as a study note ───────────────────────
  async function saveAsNote() {
    if (!user || !editedText.trim()) return;
    setPhase('saving');
    try {
      await supabase.from('study_notes').insert({
        user_id: user.id,
        title: noteTitle || 'Scanned Note',
        content: editedText,
        ocr_text: result?.full_text,
        subject: '',
      });
      await Toast.show({ text: 'Note saved!', duration: 'short', position: 'bottom' });
      reset();
    } catch {
      setError('Failed to save note.');
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
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="glass-strong border-b border-border px-4 py-3 flex items-center gap-3 shrink-0">
        <Link to="/tools" className="touch-target">
          <ArrowLeft size={22} className="text-foreground" strokeWidth={1.75} />
        </Link>
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: 'linear-gradient(135deg, #06B6D4, #3B82F6)' }}>
          <ScanLine size={20} className="text-white" />
        </div>
        <div className="flex-1">
          <h2 className="font-heading font-bold text-foreground text-sm">Notes Scanner</h2>
          <p className="text-xs text-muted-foreground">Cloud Vision OCR</p>
        </div>
        {phase !== 'idle' && (
          <button onClick={reset} className="touch-target">
            <RotateCcw size={18} className="text-muted-foreground" />
          </button>
        )}
      </div>

      <div className="flex-1 native-scroll">
        <AnimatePresence mode="wait">

          {/* ── IDLE — pick source ── */}
          {phase === 'idle' && (
            <motion.div key="idle" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              className="flex flex-col gap-5 px-4 py-6">

              {/* Hero */}
              <div className="rounded-3xl p-6 flex flex-col items-center gap-4 text-center"
                style={{ background: 'linear-gradient(135deg, rgba(6,182,212,0.15), rgba(59,130,246,0.15))', border: '1px solid rgba(6,182,212,0.3)' }}>
                <div className="w-16 h-16 rounded-3xl flex items-center justify-center nova-glow"
                  style={{ background: 'linear-gradient(135deg, #06B6D4, #3B82F6)' }}>
                  <ScanLine size={32} className="text-white" />
                </div>
                <div>
                  <h3 className="font-heading text-xl font-bold text-foreground">Scan Handwriting</h3>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                    Capture your handwritten notes and convert them to digital text instantly using Google Cloud Vision
                  </p>
                </div>
              </div>

              {error && (
                <div className="glass rounded-2xl px-4 py-3 border border-red-500/30">
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              {/* Source buttons */}
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => captureImage('camera')}
                  className="flex flex-col items-center gap-3 p-5 rounded-3xl transition-all active:scale-95"
                  style={{ background: 'rgba(6,182,212,0.12)', border: '1px solid rgba(6,182,212,0.25)' }}>
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                    style={{ background: 'rgba(6,182,212,0.2)' }}>
                    <Camera size={24} className="text-cyan-400" strokeWidth={1.75} />
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-foreground text-sm">Camera</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Take a photo</p>
                  </div>
                </button>

                <button onClick={() => captureImage('gallery')}
                  className="flex flex-col items-center gap-3 p-5 rounded-3xl transition-all active:scale-95"
                  style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)' }}>
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                    style={{ background: 'rgba(59,130,246,0.2)' }}>
                    <FileText size={24} className="text-blue-400" strokeWidth={1.75} />
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-foreground text-sm">Gallery</p>
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
                    'Keep handwriting clear and not overlapping',
                    'Supports English + 9 Indian languages',
                  ].map((tip, i) => (
                    <div key={i} className="flex items-start gap-2 mb-2 last:mb-0">
                      <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <p className="text-sm text-foreground">{tip}</p>
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
                <h3 className="font-heading text-xl font-bold text-foreground">Recognising Text…</h3>
                <p className="text-muted-foreground text-sm mt-1">Cloud Vision is processing your image</p>
              </div>
            </motion.div>
          )}

          {/* ── RESULT ── */}
          {phase === 'result' && result && (
            <motion.div key="result" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              className="flex flex-col gap-4 px-4 py-4">

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
                    <p className="text-[10px] text-muted-foreground">Words</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-3 pb-3 text-center">
                    <p className="font-heading font-bold text-foreground text-lg">
                      {result.blocks.length}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Blocks</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-3 pb-3 text-center">
                    <p className="font-heading font-bold text-foreground text-lg">
                      {result.confidence ? `${Math.round(result.confidence * 100)}%` : '—'}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Confidence</p>
                  </CardContent>
                </Card>
              </div>

              {/* Extracted text editor */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Sparkles size={14} className="text-cyan-400" />
                    Extracted Text
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
                  className="w-full glass rounded-2xl px-4 py-3 bg-transparent text-foreground text-sm outline-none resize-none leading-relaxed"
                  style={{ WebkitUserSelect: 'text', userSelect: 'text' }}
                  placeholder="No text detected. Try a clearer image."
                />
              </div>

              {/* Save as note */}
              {editedText.trim() && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-2">
                  <input
                    type="text"
                    placeholder="Note title (optional)"
                    value={noteTitle}
                    onChange={e => setNoteTitle(e.target.value)}
                    className="glass rounded-2xl px-4 h-11 bg-transparent text-foreground placeholder:text-muted-foreground text-sm outline-none w-full"
                    style={{ WebkitUserSelect: 'text', userSelect: 'text' }}
                  />
                  <Button onClick={saveAsNote} className="w-full">
                    <Save size={16} /> Save as Study Note
                  </Button>
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
              <p className="text-foreground font-medium">Saving note…</p>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
