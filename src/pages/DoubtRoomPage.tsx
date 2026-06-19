// ═══════════════════════════════════════════════════════════════════════════
// DoubtRoomPage — Collaborative Doubt Room (Stack Overflow for JEE/NEET)
// Route: /doubt-room
//
// Students post doubts; peers answer + AI Novo auto-answers.
// Upvotes, accepted answers, subject filtering, real-time new answers.
//
// Views: 'feed' → list of doubts
//        'post' → view a single doubt + answers
//        'create' → post a new doubt
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Plus, Sparkles, Send, ThumbsUp,
  CheckCircle2, Loader2, ChevronUp, Clock,
  MessageSquare, Hash, Search, X, Filter,
  User, Zap,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { geminiJSON } from '@/lib/gemini';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DoubtPost {
  id: string;
  user_id: string;
  title: string;
  body: string;
  subject: string;
  chapter: string | null;
  tags: string[];
  views: number;
  is_solved: boolean;
  created_at: string;
  author_name?: string;
  answer_count?: number;
}

interface DoubtAnswer {
  id: string;
  post_id: string;
  user_id: string | null;
  body: string;
  is_accepted: boolean;
  is_ai: boolean;
  upvotes: number;
  created_at: string;
  author_name?: string;
  user_voted?: boolean;
}

interface AIAnswerPayload {
  answer: string;
  step_by_step: string[];
  key_concept: string;
  common_mistake: string;
  memory_tip: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SUBJECTS = ['All', 'Physics', 'Chemistry', 'Mathematics', 'Biology'];

const SUBJECT_COLORS: Record<string, string> = {
  Physics:     '#5B6AF5',
  Chemistry:   '#10B981',
  Mathematics: '#F59E0B',
  Biology:     '#EC4899',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function DoubtRoomPage() {
  const { user, profile } = useAuth();

  const [view, setView] = useState<'feed' | 'post' | 'create'>('feed');

  // Feed
  const [posts, setPosts]           = useState<DoubtPost[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [subjectFilter, setSubjectFilter] = useState('All');
  const [searchQuery, setSearchQuery]     = useState('');

  // Single post view
  const [activePost, setActivePost]   = useState<DoubtPost | null>(null);
  const [answers, setAnswers]         = useState<DoubtAnswer[]>([]);
  const [answersLoading, setAnswersLoading] = useState(false);
  const [answerInput, setAnswerInput] = useState('');
  const [submittingAnswer, setSubmittingAnswer] = useState(false);
  const [aiAnswering, setAiAnswering]   = useState(false);

  // Create
  const [newTitle, setNewTitle]     = useState('');
  const [newBody, setNewBody]       = useState('');
  const [newSubject, setNewSubject] = useState('Physics');
  const [newChapter, setNewChapter] = useState('');
  const [newTags, setNewTags]       = useState('');
  const [creating, setCreating]     = useState(false);

  const answerEndRef = useRef<HTMLDivElement>(null);

  // ── Scroll to bottom of answers ───────────────────────────────────────────
  useEffect(() => {
    answerEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [answers]);

  // ── Fetch feed ────────────────────────────────────────────────────────────
  const fetchFeed = useCallback(async () => {
    setFeedLoading(true);
    let q = supabase
      .from('doubt_room_posts')
      .select('*, profiles!user_id(full_name)')
      .order('created_at', { ascending: false })
      .limit(30);

    if (subjectFilter !== 'All') q = q.eq('subject', subjectFilter);

    const { data } = await q;
    if (data) {
      setPosts(
        data.map((p) => ({
          ...p,
          author_name: (p.profiles as { full_name: string } | null)?.full_name ?? 'Student',
        }))
      );
    }
    setFeedLoading(false);
  }, [subjectFilter]);

  useEffect(() => { fetchFeed(); }, [fetchFeed]);

  // ── Open post ─────────────────────────────────────────────────────────────
  const openPost = useCallback(async (post: DoubtPost) => {
    setActivePost(post);
    setView('post');
    setAnswersLoading(true);

    // Increment views
    supabase.from('doubt_room_posts')
      .update({ views: post.views + 1 })
      .eq('id', post.id)
      .then(() => {});

    const { data } = await supabase
      .from('doubt_room_answers')
      .select('*, profiles!user_id(full_name)')
      .eq('post_id', post.id)
      .order('is_accepted', { ascending: false })
      .order('upvotes', { ascending: false })
      .order('created_at', { ascending: true });

    if (data && user) {
      const { data: votes } = await supabase
        .from('doubt_room_votes')
        .select('answer_id')
        .eq('user_id', user.id)
        .in('answer_id', data.map((a) => a.id));

      const votedIds = new Set((votes ?? []).map((v) => v.answer_id));
      setAnswers(
        data.map((a) => ({
          ...a,
          author_name: a.is_ai
            ? 'Novo AI'
            : (a.profiles as { full_name: string } | null)?.full_name ?? 'Student',
          user_voted: votedIds.has(a.id),
        }))
      );
    } else if (data) {
      setAnswers(data.map((a) => ({
        ...a,
        author_name: a.is_ai ? 'Novo AI' : 'Student',
        user_voted: false,
      })));
    }

    setAnswersLoading(false);
  }, [user]);

  // ── Submit human answer ───────────────────────────────────────────────────
  const submitAnswer = async () => {
    if (!answerInput.trim() || !activePost || !user) return;
    setSubmittingAnswer(true);
    const name = (profile as { full_name?: string } | null)?.full_name ?? 'Student';
    const body = answerInput.trim();
    setAnswerInput('');

    const { data } = await supabase
      .from('doubt_room_answers')
      .insert({ post_id: activePost.id, user_id: user.id, body, is_ai: false })
      .select()
      .single();

    if (data) {
      setAnswers((prev) => [...prev, { ...data, author_name: name, user_voted: false }]);
    }
    setSubmittingAnswer(false);
  };

  // ── Get AI answer ─────────────────────────────────────────────────────────
  const getAiAnswer = async () => {
    if (!activePost || aiAnswering) return;
    setAiAnswering(true);

    try {
      const resp = await geminiJSON<AIAnswerPayload>(`
You are Novo, an expert JEE/NEET tutor answering a student's doubt.
Subject: ${activePost.subject}${activePost.chapter ? `. Chapter: ${activePost.chapter}` : ''}.
Question: "${activePost.title}"
Details: "${activePost.body}"

Provide a clear, comprehensive answer for a competitive exam student.
Return ONLY valid JSON:
{
  "answer": "Main answer (clear, 2-4 sentences)",
  "step_by_step": ["Step 1: ...", "Step 2: ...", "Step 3: ..."],
  "key_concept": "The core concept: ...",
  "common_mistake": "Students often confuse this with: ...",
  "memory_tip": "Remember this as: ..."
}
`);

      let body = resp.answer ?? '';
      if (resp.step_by_step?.length) {
        body += '\n\n**Steps:**\n' + resp.step_by_step.map((s, i) => `${i + 1}. ${s}`).join('\n');
      }
      if (resp.key_concept) body += `\n\n💡 ${resp.key_concept}`;
      if (resp.common_mistake) body += `\n\n⚠️ ${resp.common_mistake}`;
      if (resp.memory_tip) body += `\n\n🎯 ${resp.memory_tip}`;

      const { data } = await supabase
        .from('doubt_room_answers')
        .insert({ post_id: activePost.id, user_id: null, body, is_ai: true })
        .select()
        .single();

      if (data) {
        setAnswers((prev) => [...prev, { ...data, author_name: 'Novo AI', user_voted: false }]);
      }
    } catch {
      // Silently fail — user can retry
    } finally {
      setAiAnswering(false);
    }
  };

  // ── Upvote answer ─────────────────────────────────────────────────────────
  const upvoteAnswer = async (answer: DoubtAnswer) => {
    if (!user || answer.user_voted) return;

    setAnswers((prev) =>
      prev.map((a) =>
        a.id === answer.id ? { ...a, upvotes: a.upvotes + 1, user_voted: true } : a
      )
    );

    supabase.from('doubt_room_votes')
      .insert({ answer_id: answer.id, user_id: user.id })
      .then(() => {});

    supabase.from('doubt_room_answers')
      .update({ upvotes: answer.upvotes + 1 })
      .eq('id', answer.id)
      .then(() => {});
  };

  // ── Accept answer ─────────────────────────────────────────────────────────
  const acceptAnswer = async (answerId: string) => {
    if (!activePost || activePost.user_id !== user?.id) return;

    setAnswers((prev) => prev.map((a) => ({ ...a, is_accepted: a.id === answerId })));

    supabase.from('doubt_room_answers')
      .update({ is_accepted: false })
      .eq('post_id', activePost.id)
      .then(() => {});

    supabase.from('doubt_room_answers')
      .update({ is_accepted: true })
      .eq('id', answerId)
      .then(() => {});

    supabase.from('doubt_room_posts')
      .update({ is_solved: true })
      .eq('id', activePost.id)
      .then(() => {});

    setActivePost((prev) => prev ? { ...prev, is_solved: true } : null);
  };

  // ── Create doubt ──────────────────────────────────────────────────────────
  const createDoubt = async () => {
    if (!newTitle.trim() || !newBody.trim() || !user) return;
    setCreating(true);

    const tags = newTags.split(',').map((t) => t.trim()).filter(Boolean);
    const { data, error } = await supabase
      .from('doubt_room_posts')
      .insert({
        user_id: user.id,
        title:   newTitle.trim(),
        body:    newBody.trim(),
        subject: newSubject,
        chapter: newChapter.trim() || null,
        tags,
      })
      .select()
      .single();

    if (!error && data) {
      const post: DoubtPost = {
        ...data,
        author_name:  (profile as { full_name?: string } | null)?.full_name ?? 'Student',
        answer_count: 0,
      };

      // Reset form
      setNewTitle(''); setNewBody(''); setNewChapter(''); setNewTags('');
      setCreating(false);

      // Open the post and trigger AI answer
      await openPost(post);
      setTimeout(() => getAiAnswer(), 500);
    } else {
      setCreating(false);
    }
  };

  // ── Filtered posts ────────────────────────────────────────────────────────
  const filteredPosts = posts.filter((p) =>
    !searchQuery || p.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // ── Feed view ─────────────────────────────────────────────────────────────
  if (view === 'feed') {
    return (
      <div className="min-h-screen bg-[#0A0A0F] text-white">
        <div className="sticky top-0 z-20 bg-[#0A0A0F]/90 backdrop-blur border-b border-white/5 px-4 py-3 flex items-center gap-3">
          <Link to="/home" className="p-2 rounded-xl hover:bg-white/5 transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-400" />
          </Link>
          <div className="flex-1">
            <h1 className="font-bold text-white">Doubt Room</h1>
            <p className="text-xs text-gray-400">Ask. Answer. Understand.</p>
          </div>
          <button
            onClick={() => setView('create')}
            className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-medium transition-colors flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Ask
          </button>
        </div>

        <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search doubts…"
              className="w-full pl-9 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Subject filter */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {SUBJECTS.map((s) => (
              <button
                key={s}
                onClick={() => setSubjectFilter(s)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-colors ${
                  subjectFilter === s ? 'bg-indigo-600 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Posts */}
          {feedLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-indigo-400 animate-spin" /></div>
          ) : filteredPosts.length === 0 ? (
            <div className="text-center py-16 space-y-3">
              <div className="text-4xl">🤔</div>
              <p className="text-gray-400">No doubts yet</p>
              <button
                onClick={() => setView('create')}
                className="px-4 py-2 rounded-xl bg-indigo-600 text-sm font-medium hover:bg-indigo-500 transition-colors"
              >
                Post the first doubt
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredPosts.map((post) => (
                <motion.button
                  key={post.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={() => openPost(post)}
                  className="w-full text-left p-4 rounded-2xl bg-white/5 border border-white/10 hover:border-indigo-500/40 hover:bg-white/8 transition-all space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-white text-sm leading-snug flex-1">{post.title}</h3>
                    {post.is_solved && (
                      <span className="flex-shrink-0 px-2 py-0.5 rounded-full bg-emerald-900/40 text-emerald-400 text-[10px] font-medium">
                        Solved
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 line-clamp-2">{post.body}</p>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span
                      className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                      style={{
                        background: `${SUBJECT_COLORS[post.subject] ?? '#6B7280'}20`,
                        color: SUBJECT_COLORS[post.subject] ?? '#9CA3AF',
                      }}
                    >
                      {post.subject}
                    </span>
                    <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" /> {post.answer_count ?? 0}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {timeAgo(post.created_at)}</span>
                    <span className="flex items-center gap-1 ml-auto"><User className="w-3 h-3" /> {post.author_name}</span>
                  </div>
                </motion.button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Create view ───────────────────────────────────────────────────────────
  if (view === 'create') {
    return (
      <div className="min-h-screen bg-[#0A0A0F] text-white">
        <div className="sticky top-0 z-20 bg-[#0A0A0F]/90 backdrop-blur border-b border-white/5 px-4 py-3 flex items-center gap-3">
          <button onClick={() => setView('feed')} className="p-2 rounded-xl hover:bg-white/5">
            <X className="w-5 h-5 text-gray-400" />
          </button>
          <h1 className="font-bold text-white flex-1">Post a Doubt</h1>
          <button
            onClick={createDoubt}
            disabled={!newTitle.trim() || !newBody.trim() || creating}
            className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-sm font-medium transition-colors flex items-center gap-1.5"
          >
            {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
            {creating ? 'Posting…' : 'Post'}
          </button>
        </div>

        <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
          {/* Subject */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {['Physics', 'Chemistry', 'Mathematics', 'Biology'].map((s) => (
              <button
                key={s}
                onClick={() => setNewSubject(s)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-colors ${
                  newSubject === s
                    ? 'text-white'
                    : 'bg-white/5 text-gray-400 hover:bg-white/10'
                }`}
                style={newSubject === s ? {
                  background: `${SUBJECT_COLORS[s]}30`,
                  color: SUBJECT_COLORS[s],
                  borderColor: `${SUBJECT_COLORS[s]}40`,
                  border: '1px solid',
                } : {}}
              >
                {s}
              </button>
            ))}
          </div>

          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="What's your doubt? (be specific)"
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-indigo-500"
          />

          <textarea
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
            placeholder="Explain the context, what you tried, where you're stuck…"
            rows={6}
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-indigo-500 resize-none"
          />

          <div className="grid grid-cols-2 gap-3">
            <input
              value={newChapter}
              onChange={(e) => setNewChapter(e.target.value)}
              placeholder="Chapter (optional)"
              className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-indigo-500"
            />
            <div className="relative">
              <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
              <input
                value={newTags}
                onChange={(e) => setNewTags(e.target.value)}
                placeholder="tags, comma-separated"
                className="w-full pl-8 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-indigo-900/20 border border-indigo-500/20 text-xs text-indigo-300">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
            Novo AI will answer automatically after you post.
          </div>
        </div>
      </div>
    );
  }

  // ── Post view ─────────────────────────────────────────────────────────────
  if (!activePost) return null;
  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white flex flex-col">
      <div className="sticky top-0 z-20 bg-[#0A0A0F]/90 backdrop-blur border-b border-white/5 px-4 py-3 flex items-center gap-3">
        <button onClick={() => { setView('feed'); setActivePost(null); setAnswers([]); }}
          className="p-2 rounded-xl hover:bg-white/5">
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-white text-sm truncate">{activePost.title}</div>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span style={{ color: SUBJECT_COLORS[activePost.subject] }}>{activePost.subject}</span>
            {activePost.is_solved && <span className="text-emerald-400">✓ Solved</span>}
          </div>
        </div>
        {!answers.some((a) => a.is_ai) && (
          <button
            onClick={getAiAnswer}
            disabled={aiAnswering}
            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-xs font-medium flex items-center gap-1.5"
          >
            {aiAnswering ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            Ask Novo
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-5 space-y-5">
          {/* Question body */}
          <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
            <h2 className="font-bold text-white">{activePost.title}</h2>
            <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">{activePost.body}</p>
            <div className="flex items-center gap-3 text-xs text-gray-500 pt-1">
              {activePost.tags.map((tag) => (
                <span key={tag} className="px-2 py-0.5 rounded-full bg-white/8 text-gray-400">#{tag}</span>
              ))}
              <span className="ml-auto">{timeAgo(activePost.created_at)} · {activePost.author_name}</span>
            </div>
          </div>

          {/* Answers */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider px-1">
              {answers.length} {answers.length === 1 ? 'Answer' : 'Answers'}
            </p>
          </div>

          {answersLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 text-indigo-400 animate-spin" /></div>
          ) : (
            <AnimatePresence initial={false}>
              {answers.map((ans) => (
                <motion.div
                  key={ans.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`p-4 rounded-2xl border space-y-3 ${
                    ans.is_accepted
                      ? 'bg-emerald-900/15 border-emerald-500/30'
                      : ans.is_ai
                      ? 'bg-indigo-950/40 border-indigo-500/20'
                      : 'bg-white/5 border-white/10'
                  }`}
                >
                  {/* Answer header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                        ans.is_ai ? 'bg-gradient-to-br from-indigo-600 to-purple-600' : 'bg-white/10'
                      }`}>
                        {ans.is_ai ? <Sparkles className="w-3.5 h-3.5" /> : (ans.author_name?.[0]?.toUpperCase() ?? 'S')}
                      </div>
                      <span className={`text-xs font-medium ${ans.is_ai ? 'text-indigo-400' : 'text-gray-400'}`}>
                        {ans.is_ai ? '✨ Novo AI' : ans.author_name}
                      </span>
                      {ans.is_accepted && (
                        <span className="flex items-center gap-1 text-emerald-400 text-[10px] font-medium">
                          <CheckCircle2 className="w-3 h-3" /> Accepted
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-gray-600">{timeAgo(ans.created_at)}</span>
                  </div>

                  {/* Answer body */}
                  <p className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">{ans.body}</p>

                  {/* Actions */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => upvoteAnswer(ans)}
                      disabled={ans.user_voted || ans.user_id === user?.id}
                      className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg transition-colors ${
                        ans.user_voted
                          ? 'bg-indigo-900/40 text-indigo-400'
                          : 'bg-white/5 text-gray-500 hover:bg-white/10 hover:text-gray-300 disabled:opacity-40'
                      }`}
                    >
                      <ChevronUp className="w-3.5 h-3.5" /> {ans.upvotes}
                    </button>

                    {activePost.user_id === user?.id && !ans.is_accepted && (
                      <button
                        onClick={() => acceptAnswer(ans.id)}
                        className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-white/5 text-gray-500 hover:bg-emerald-900/30 hover:text-emerald-400 transition-colors"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Accept
                      </button>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          )}

          {aiAnswering && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="p-4 rounded-2xl bg-indigo-950/40 border border-indigo-500/20 flex items-center gap-3"
            >
              <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
              <span className="text-sm text-indigo-300">Novo is preparing an answer…</span>
            </motion.div>
          )}

          <div ref={answerEndRef} className="pb-4" />
        </div>
      </div>

      {/* Answer input */}
      <div className="sticky bottom-0 bg-[#0A0A0F]/95 backdrop-blur border-t border-white/5 px-4 py-3 space-y-2">
        <div className="flex gap-2">
          <input
            value={answerInput}
            onChange={(e) => setAnswerInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && submitAnswer()}
            placeholder="Write your answer…"
            className="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-indigo-500"
          />
          <button
            onClick={submitAnswer}
            disabled={!answerInput.trim() || submittingAnswer}
            className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 transition-colors"
          >
            {submittingAnswer ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

// suppress
void ThumbsUp; void Filter; void Zap;
