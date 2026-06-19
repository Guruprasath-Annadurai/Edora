// Bottom sheet to confirm + save a chat explanation as a flashcard

import { useState } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, Check, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Props {
  messageId: string;
  front: string;       // pre-filled from previous user message
  back: string;        // Novo's explanation
  userId: string;
  onClose: () => void;
  onSaved: () => void;
}

export function FlashcardSaveSheet({ messageId, front, back, userId, onClose, onSaved }: Props) {
  const [editFront, setEditFront] = useState(front.slice(0, 200));
  const [editBack,  setEditBack]  = useState(back.slice(0, 600));
  const [saving, setSaving]       = useState(false);
  const [addToDeck, setAddToDeck] = useState(true);

  async function save() {
    setSaving(true);
    // Save to chat_flashcards
    await supabase.from('chat_flashcards').insert({
      user_id: userId, message_id: messageId,
      front: editFront.trim(), back: editBack.trim(),
      added_to_deck: addToDeck,
    });

    // If adding to spaced-repetition deck, also insert into flashcards table
    if (addToDeck) {
      await supabase.from('flashcards').insert({
        user_id: userId,
        front: editFront.trim(),
        back: editBack.trim(),
        source: 'chat',
      });
    }
    setSaving(false);
    onSaved();
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 320 }}
        animate={{ y: 0 }}
        exit={{ y: 320 }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        style={{
          width: '100%', background: 'rgba(12,14,30,0.98)',
          border: '1px solid rgba(255,255,255,0.08)', borderBottom: 'none',
          borderRadius: '20px 20px 0 0', padding: '24px 20px 40px',
          maxWidth: 520, margin: '0 auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)', margin: '0 auto 20px' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <BookOpen size={18} color="#10B981" />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#fff' }}>Save as Flashcard</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Edit before saving</div>
          </div>
          <button aria-label="Close" onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)' }}>
            <X size={20} />
          </button>
        </div>

        {/* Front */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 6, letterSpacing: 0.5 }}>FRONT — QUESTION / CONCEPT</label>
          <textarea
            value={editFront}
            onChange={e => setEditFront(e.target.value)}
            rows={2}
            style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#fff', padding: '10px 12px', fontSize: 14, resize: 'none', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>

        {/* Back */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 6, letterSpacing: 0.5 }}>BACK — NOVO'S EXPLANATION</label>
          <textarea
            value={editBack}
            onChange={e => setEditBack(e.target.value)}
            rows={4}
            style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#fff', padding: '10px 12px', fontSize: 13, resize: 'none', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>

        {/* Add to deck toggle */}
        <button
          onClick={() => setAddToDeck(v => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '11px 14px', cursor: 'pointer', marginBottom: 16 }}
        >
          <div style={{
            width: 20, height: 20, borderRadius: 6, border: `2px solid ${addToDeck ? '#10B981' : 'rgba(255,255,255,0.2)'}`,
            background: addToDeck ? '#10B981' : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s',
          }}>
            {addToDeck && <Check size={12} color="#fff" strokeWidth={3} />}
          </div>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>Add to spaced-repetition deck</span>
        </button>

        <button
          onClick={save}
          disabled={saving || !editFront.trim() || !editBack.trim()}
          style={{
            width: '100%', padding: '14px', borderRadius: 14, border: 'none',
            background: 'linear-gradient(135deg,#10B981,#059669)',
            color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer',
            opacity: saving || !editFront.trim() ? 0.6 : 1,
          }}
        >
          {saving ? 'Saving…' : '💾 Save Flashcard'}
        </button>
      </motion.div>
    </motion.div>
  );
}
