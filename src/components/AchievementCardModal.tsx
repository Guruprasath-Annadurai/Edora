// ─────────────────────────────────────────────────────────────────────────────
// AchievementCardModal — shows a generated milestone card with one-tap
// download + share to Instagram Stories / WhatsApp
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, Share2 } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { renderAchievementCard, type AchievementCardData } from '@/lib/achievementCard';
import { track } from '@/lib/analytics';

export default function AchievementCardModal({ data, onClose }: { data: AchievementCardData; onClose: () => void }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    renderAchievementCard(data).then(setDataUrl);
  }, [data]);

  async function handleShare() {
    if (!dataUrl) return;
    setSharing(true);
    track('achievement_card_shared', { type: data.type });
    try {
      if (Capacitor.isNativePlatform()) {
        const base64 = dataUrl.split(',')[1];
        const fileName = `edora_achievement_${Date.now()}.png`;
        const result = await Filesystem.writeFile({ path: fileName, data: base64, directory: Directory.Cache });
        await Share.share({
          title: data.headline,
          text: `${data.headline} on Edora! Study free at edora.app 🔥`,
          url: result.uri,
          dialogTitle: 'Share your achievement',
        });
      } else if (navigator.share) {
        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], 'edora_achievement.png', { type: 'image/png' });
        await navigator.share({ title: data.headline, text: `${data.headline} on Edora!`, files: [file] });
      } else {
        downloadImage();
      }
    } catch { /* user cancelled share sheet */ } finally {
      setSharing(false);
    }
  }

  function downloadImage() {
    if (!dataUrl) return;
    track('achievement_card_downloaded', { type: data.type });
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `edora_${data.type}_${Date.now()}.png`;
    a.click();
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex flex-col items-center justify-center px-6"
        style={{ background: 'rgba(0,0,0,0.85)' }}
        onClick={onClose}
      >
        <button aria-label="Close" onClick={onClose} className="absolute top-6 right-6 w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.1)' }}>
          <X className="w-5 h-5 text-white" />
        </button>

        <motion.div
          initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          onClick={e => e.stopPropagation()}
          className="rounded-3xl overflow-hidden mb-6"
          style={{ width: '100%', maxWidth: 320, aspectRatio: '9/16', background: 'rgba(255,255,255,0.03)' }}
        >
          {dataUrl ? (
            <img src={dataUrl} alt="Achievement card" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            </div>
          )}
        </motion.div>

        <div className="flex gap-3 w-full max-w-xs" onClick={e => e.stopPropagation()}>
          <button onClick={downloadImage} disabled={!dataUrl}
            className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-semibold text-white disabled:opacity-40"
            style={{ background: 'rgba(255,255,255,0.1)' }}>
            <Download className="w-4 h-4" /> Save
          </button>
          <button onClick={handleShare} disabled={!dataUrl || sharing}
            className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-semibold text-white disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg,#5B6AF5,#8B5CF6)' }}>
            <Share2 className="w-4 h-4" /> {sharing ? 'Sharing...' : 'Share'}
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
