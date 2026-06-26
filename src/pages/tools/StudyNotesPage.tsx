import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Plus, Trash2, Loader2, X, WifiOff } from 'lucide-react';
import { FileDownloadIcon } from '@/components/ui/icons';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { OfflineCache } from '@/lib/offlineCache';

interface Note {
  id: string;
  title: string;
  content: string;
  subject: string;
  created_at: string;
}

export default function StudyNotesPage() {
  const { user } = useAuth();
  const [notes, setNotes]         = useState<Note[]>([]);
  const [loading, setLoading]     = useState(true);
  const [viewing, setViewing]     = useState<Note | null>(null);
  const [deleting, setDeleting]   = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetchNotes();
  }, [user]);

  async function fetchNotes() {
    if (!user) return;
    setIsOffline(false);
    try {
      const { data, error } = await supabase
        .from('study_notes')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const loaded = (data as Note[]) ?? [];
      setNotes(loaded);
      // Persist to offline cache
      OfflineCache.cacheNotes(user.id, loaded.map(n => ({
        id: n.id, subject: n.subject ?? '', topic: n.title, content: n.content, created_at: n.created_at,
      }))).catch(() => {});
    } catch {
      // Network failure — try offline cache
      const cached = await OfflineCache.getCachedNotes(user.id);
      if (cached) {
        setNotes(cached.notes.map(n => ({
          id: n.id, title: n.topic, content: n.content,
          subject: n.subject, created_at: n.created_at,
        })));
        setIsOffline(true);
      }
    } finally {
      setLoading(false);
    }
  }

  async function deleteNote(id: string) {
    setDeleting(id);
    const { error } = await supabase.from('study_notes').delete().eq('id', id);
    if (!error) {
      setNotes(prev => prev.filter(n => n.id !== id));
      if (viewing?.id === id) setViewing(null);
    } else {
      console.error('[StudyNotes] deleteNote error:', error.message);
    }
    setDeleting(null);
  }

  const dateStr = (iso: string) =>
    new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className="flex flex-col h-full bg-gradient-page">
      <div className="px-4 py-3 flex items-center gap-3 shrink-0"
        style={{ background: 'rgba(8,6,20,0.82)', borderBottom: '1px solid rgba(255,255,255,0.10)', backdropFilter: 'blur(64px) saturate(220%) brightness(1.04)', WebkitBackdropFilter: 'blur(64px) saturate(220%) brightness(1.04)' }}>
        <Link aria-label="Go back" to="/tools"
          className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <ChevronLeft size={18} className="text-white" />
        </Link>
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: 'linear-gradient(135deg, #10B981, #06B6D4)' }}>
          <FileDownloadIcon size={20} className="text-white" />
        </div>
        <div className="flex-1">
          <h2 className="font-heading font-bold text-white text-sm">Study Notes</h2>
          <p className="text-xs text-muted-foreground">{notes.length} notes</p>
        </div>
        <Link to="/scanner">
          <Button size="sm"><Plus size={15} /> Scan</Button>
        </Link>
      </div>

      {/* Note viewer overlay */}
      <AnimatePresence>
        {viewing && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className="absolute inset-0 z-50 bg-gradient-page flex flex-col">
            <div className="px-4 py-3 flex items-center gap-3 shrink-0"
              style={{ background: 'rgba(8,6,20,0.82)', borderBottom: '1px solid rgba(255,255,255,0.10)', backdropFilter: 'blur(64px) saturate(220%) brightness(1.04)', WebkitBackdropFilter: 'blur(64px) saturate(220%) brightness(1.04)' }}>
              <button onClick={() => setViewing(null)}
                className="w-9 h-9 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <X size={18} className="text-white" />
              </button>
              <p className="flex-1 font-heading font-bold text-white text-sm truncate">{viewing.title}</p>
              <button onClick={() => deleteNote(viewing.id)} disabled={deleting === viewing.id}
                className="p-2 rounded-xl"
                style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)' }}>
                <Trash2 size={15} className="text-red-400" />
              </button>
            </div>
            <div className="flex-1 native-scroll pb-nav px-4 py-4">
              <p className="text-xs text-muted-foreground mb-3">{dateStr(viewing.created_at)} · {wordCount(viewing.content)} words</p>
              <p className="text-sm text-white/85 leading-relaxed whitespace-pre-wrap">{viewing.content}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 native-scroll pb-nav px-4 py-4 flex flex-col gap-3">
        {isOffline && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-2xl text-xs font-medium"
            style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color: '#FBBF24' }}>
            <WifiOff size={14} />
            Offline — showing cached notes
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-10">
            <Loader2 size={24} className="animate-spin text-primary" />
          </div>
        )}

        {!loading && notes.length === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-16 gap-4 text-center">
            <FileDownloadIcon size={56} className="text-muted-foreground" strokeWidth={1.25} />
            <div>
              <p className="font-heading text-lg font-bold text-white">No notes yet</p>
              <p className="text-sm text-muted-foreground mt-1">Scan your handwritten notes to save them here.</p>
            </div>
            <Link to="/scanner"><Button>Scan Notes</Button></Link>
          </motion.div>
        )}

        {!loading && notes.map((note, i) => (
          <motion.div key={note.id}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
            <div className="rounded-3xl p-4 flex items-start gap-3 active:scale-98 transition-all"
              style={{ background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <button className="flex-1 min-w-0 text-left" onClick={() => setViewing(note)}>
                <p className="font-semibold text-white text-sm truncate">{note.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{dateStr(note.created_at)} · {wordCount(note.content)} words</p>
                <p className="text-xs text-white/55 mt-1.5 line-clamp-2 leading-relaxed">{note.content}</p>
              </button>
              <button onClick={() => deleteNote(note.id)} disabled={deleting === note.id}
                className="shrink-0 p-2 rounded-xl mt-0.5"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
                {deleting === note.id
                  ? <Loader2 size={14} className="animate-spin text-red-400" />
                  : <Trash2 size={14} className="text-red-400" />}
              </button>
            </div>
          </motion.div>
        ))}
        <div className="h-4" />
      </div>
    </div>
  );
}
