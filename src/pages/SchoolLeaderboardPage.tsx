// ═══════════════════════════════════════════════════════════════════════════
// SchoolLeaderboardPage — public, no-login school ranking page
// Route: /school/:schoolName (publicly shareable)
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Trophy, Users, Zap, Share2, School } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { Share } from '@capacitor/share';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';

interface LeaderRow { rank_pos: number; full_name: string; avatar_url: string | null; xp: number; streak_count: number; }
interface SchoolSummary { school_name: string; total_xp: number; student_count: number; school_rank: number; }

function Avatar({ url, name, size = 40 }: { url: string | null; name: string; size?: number }) {
  if (url) return <img src={url} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }} />;
  const initials = (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: 'linear-gradient(135deg,#5B6AF5,#8B5CF6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.36, fontWeight: 700, color: '#fff', flexShrink: 0,
    }}>{initials}</div>
  );
}

export default function SchoolLeaderboardPage() {
  const { schoolName } = useParams<{ schoolName: string }>();
  const decodedName = decodeURIComponent(schoolName ?? '');

  const [leaders, setLeaders] = useState<LeaderRow[]>([]);
  const [summary, setSummary] = useState<SchoolSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!decodedName) return;
    Promise.all([
      supabase.rpc('get_school_leaderboard', { p_school_name: decodedName }),
      supabase.rpc('get_school_summary', { p_school_name: decodedName }),
    ]).then(([lb, sm]) => {
      setLeaders((lb.data as LeaderRow[]) ?? []);
      setSummary(sm.data as SchoolSummary);
      setLoading(false);
      track('school_leaderboard_viewed', { school: decodedName });
    });
  }, [decodedName]);

  async function shareLink() {
    const link = window.location.href;
    try {
      await Share.share({
        title: `${decodedName} on Edora`,
        text: `${decodedName} is ranked #${summary?.school_rank ?? '?'} on Edora this week! Check the leaderboard 🏆`,
        url: link,
      });
    } catch { /* cancelled */ }
  }

  return (
    <div className="h-full flex flex-col" style={{ background: "transparent" }}>
      {/* Header */}
      <div className="px-5 pt-8 pb-6 text-center">
        <div className="w-16 h-16 rounded-3xl flex items-center justify-center text-3xl mx-auto mb-3" style={{ background: 'rgba(91,106,245,0.15)' }}>
          <School className="w-8 h-8" style={{ color: '#A0AEFF' }} />
        </div>
        <h1 className="font-heading text-xl font-bold text-white mb-1">{decodedName}</h1>
        <p className="text-sm text-white/40">Edora School Leaderboard</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" /></div>
      ) : (
        <div className="px-5 flex-1">
          {/* Summary cards */}
          {summary && (
            <div className="grid grid-cols-3 gap-2 mb-6">
              <div className="rounded-2xl p-2.5 text-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <Trophy className="w-4 h-4 mx-auto mb-1" style={{ color: '#FBBF24' }} />
                <p className="font-heading text-base font-bold text-white leading-tight">#{summary.school_rank}</p>
                <p className="text-[10px] text-white/40 mt-0.5">Nationwide</p>
              </div>
              <div className="rounded-2xl p-2.5 text-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <Zap className="w-4 h-4 mx-auto mb-1" style={{ color: '#A0AEFF' }} />
                <p className="font-heading text-base font-bold text-white leading-tight truncate">{summary.total_xp.toLocaleString()}</p>
                <p className="text-[10px] text-white/40 mt-0.5">Total XP</p>
              </div>
              <div className="rounded-2xl p-2.5 text-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <Users className="w-4 h-4 mx-auto mb-1" style={{ color: '#34D399' }} />
                <p className="font-heading text-base font-bold text-white leading-tight">{summary.student_count}</p>
                <p className="text-[10px] text-white/40 mt-0.5">Students</p>
              </div>
            </div>
          )}

          {/* Top 10 */}
          <p className="text-xs font-semibold text-white/40 uppercase tracking-wide mb-3">Top 10 Students</p>
          <div className="flex flex-col gap-2 mb-8">
            {leaders.length === 0 ? (
              <p className="text-sm text-white/40 text-center py-8">No students from this school yet.</p>
            ) : leaders.map((l, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                className="flex items-center gap-3 p-3 rounded-2xl"
                style={{ background: 'rgba(255,255,255,0.055)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="w-7 text-center font-heading font-bold text-sm" style={{ color: i < 3 ? '#FBBF24' : 'rgba(255,255,255,0.4)' }}>
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${l.rank_pos}`}
                </div>
                <Avatar url={l.avatar_url} name={l.full_name} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{l.full_name}</p>
                  <p className="text-xs text-white/40">🔥 {l.streak_count} day streak</p>
                </div>
                <p className="text-sm font-bold" style={{ color: '#A0AEFF' }}>{l.xp.toLocaleString()} XP</p>
              </motion.div>
            ))}
          </div>

          <button onClick={shareLink}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-semibold text-white mb-8"
            style={{ background: 'linear-gradient(135deg,#5B6AF5,#8B5CF6)' }}>
            <Share2 className="w-4 h-4" /> Share This Page
          </button>

          <p className="text-center text-xs text-white/30 pb-8">
            Want your school on this board? <a href="/" className="underline" style={{ color: '#A0AEFF' }}>Study free at edora.app</a>
          </p>
        </div>
      )}
    </div>
  );
}
