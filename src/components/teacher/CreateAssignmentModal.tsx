import { useState } from 'react';
import { motion } from 'framer-motion';
import { ClipboardList, Zap, BookOpen, FileText, CheckCircle2, Copy, Loader2, Plus } from 'lucide-react';
import type { ClassroomCourse, CreateAssignmentInput } from '@/hooks/useTeacher';
import { SUBJECTS, CLASS_NUMS } from '@/lib/teacherDashboardHelpers';

const ACTIVITY_TYPES: Array<{
  value: CreateAssignmentInput['edora_type'];
  label: string;
  icon:  React.ReactNode;
  color: string;
}> = [
  { value: 'quiz',      label: 'Quiz',      icon: <ClipboardList size={16} />, color: '#5B6AF5' },
  { value: 'sprint',    label: 'Sprint',    icon: <Zap size={16} />,           color: '#F59E0B' },
  { value: 'flashcard', label: 'Flashcards',icon: <BookOpen size={16} />,      color: '#10B981' },
  { value: 'exam',      label: 'Mock Exam', icon: <FileText size={16} />,      color: '#EF4444' },
];

interface CreateModalProps {
  courses:  ClassroomCourse[];
  creating: boolean;
  onSubmit: (input: CreateAssignmentInput) => Promise<unknown>;
  onClose:  () => void;
}

export function CreateAssignmentModal({ courses, creating, onSubmit, onClose }: CreateModalProps) {
  const [form, setForm] = useState<CreateAssignmentInput>({
    course_id:   courses[0]?.id ?? '',
    course_name: courses[0]?.name ?? '',
    title:       '',
    subject:     'Mathematics',
    class_num:   10,
    edora_type:  'quiz',
    max_points:  100,
    due_date:    '',
    description: '',
  });
  const [done, setDone] = useState<{ activity_url: string; classroom_synced: boolean } | null>(null);

  const set = (key: keyof CreateAssignmentInput, val: unknown) =>
    setForm(prev => ({ ...prev, [key]: val }));

  const handleSubmit = async () => {
    if (!form.title.trim() || !form.course_id) return;
    const result = await onSubmit({
      ...form,
      course_name: courses.find(c => c.id === form.course_id)?.name ?? form.course_name,
      due_date:    form.due_date || undefined,
    });
    if (result) {
      setDone(result as { activity_url: string; classroom_synced: boolean });
    }
  };

  const inputStyle: React.CSSProperties = {
    width:        '100%',
    background:   'var(--ink-050)',
    border:       '1.5px solid var(--ink-100)',
    borderRadius: '10px',
    color: 'var(--ink-950)',
    padding:      '10px 14px',
    fontSize:     '14px',
    outline:      'none',
  };

  const labelStyle: React.CSSProperties = {
    fontSize:     '12px',
    fontWeight:   600,
    color:        'var(--ink-500)',
    marginBottom: '6px',
    display:      'block',
  };

  return (
    <div
      style={{
        position:        'fixed',
        inset:           0,
        background:      'rgba(0,0,0,0.7)',
        zIndex:          200,
        display:         'flex',
        alignItems:      'flex-end',
        justifyContent:  'center',
        padding:         '16px',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        style={{
          background:   'var(--hdr-a-880)',
          border:       '1px solid var(--ink-100)',
          borderBottom: 'none',
          borderRadius: '20px 20px 0 0',
          padding:      '24px',
          width:        '100%',
          maxWidth:     '480px',
          maxHeight:    '85dvh',
          overflowY:    'auto',
        }}
      >
        {done ? (
          // ── Success state ──────────────────────────────────────────────────
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
              <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CheckCircle2 size={28} style={{ color: '#34D399' }} />
              </div>
            </div>
            <h3 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--ink-950)', marginBottom: '8px' }}>
              Assignment Created!
            </h3>
            <p style={{ fontSize: '14px', color: 'var(--ink-500)', marginBottom: '20px' }}>
              {done.classroom_synced
                ? 'Pushed to Google Classroom — students will see it in their Classwork.'
                : 'Saved in Edora. Share the link manually with students.'}
            </p>

            <div
              style={{
                background: 'var(--ink-060)',
                borderRadius: '12px',
                padding:      '12px 14px',
                marginBottom: '16px',
                display:      'flex',
                alignItems:   'center',
                gap:          '10px',
              }}
            >
              <input
                readOnly
                value={done.activity_url}
                style={{ ...inputStyle, background: 'transparent', border: 'none', padding: 0, fontSize: '12px', color: 'var(--ink-500)' }}
              />
              <button
                onClick={() => navigator.clipboard.writeText(done.activity_url)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5B6AF5', flexShrink: 0 }}
              >
                <Copy size={16} />
              </button>
            </div>

            {done.classroom_synced && (
              <div
                style={{
                  display:      'inline-flex',
                  alignItems:   'center',
                  gap:          '6px',
                  background:   'rgba(16,185,129,0.1)',
                  border:       '1px solid rgba(16,185,129,0.3)',
                  borderRadius: '20px',
                  padding:      '6px 14px',
                  fontSize:     '12px',
                  color:        '#10B981',
                  fontWeight:   600,
                  marginBottom: '20px',
                }}
              >
                <CheckCircle2 size={13} />
                Synced to Google Classroom
              </div>
            )}

            <button
              onClick={onClose}
              style={{
                background:   'linear-gradient(135deg,#5B6AF5,#8B5CF6)',
                color: 'var(--ink-950)',
                border:       'none',
                borderRadius: '12px',
                padding:      '12px',
                width:        '100%',
                fontSize:     '15px',
                fontWeight:   700,
                cursor:       'pointer',
              }}
            >
              Done
            </button>
          </div>
        ) : (
          // ── Form ───────────────────────────────────────────────────────────
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ink-950)' }}>New Assignment</h3>
              <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--ink-500)', cursor: 'pointer', fontSize: '20px' }}>×</button>
            </div>

            {/* Title */}
            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>ASSIGNMENT TITLE</label>
              <input
                value={form.title}
                onChange={e => set('title', e.target.value)}
                placeholder="e.g. Chapter 3 Newton's Laws Quiz"
                style={inputStyle}
              />
            </div>

            {/* Course */}
            {courses.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>GOOGLE CLASSROOM COURSE</label>
                <select
                  value={form.course_id}
                  onChange={e => set('course_id', e.target.value)}
                  style={{ ...inputStyle, appearance: 'none' }}
                >
                  {courses.map(c => (
                    <option key={c.id} value={c.id}>{c.name}{c.section ? ` — ${c.section}` : ''}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Subject + Class */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div>
                <label style={labelStyle}>SUBJECT</label>
                <select
                  value={form.subject}
                  onChange={e => set('subject', e.target.value)}
                  style={{ ...inputStyle, appearance: 'none' }}
                >
                  {SUBJECTS.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>CLASS</label>
                <select
                  value={form.class_num}
                  onChange={e => set('class_num', Number(e.target.value))}
                  style={{ ...inputStyle, appearance: 'none' }}
                >
                  {CLASS_NUMS.map(n => <option key={n} value={n}>Class {n}</option>)}
                </select>
              </div>
            </div>

            {/* Activity type */}
            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>ACTIVITY TYPE</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '8px' }}>
                {ACTIVITY_TYPES.map(t => (
                  <button
                    key={t.value}
                    onClick={() => set('edora_type', t.value)}
                    style={{
                      background: form.edora_type === t.value ? `${t.color}18` : 'var(--ink-040)',
                      border:       `1.5px solid ${form.edora_type === t.value ? t.color : 'var(--ink-100)'}`,
                      borderRadius: '10px',
                      padding:      '10px',
                      color:        form.edora_type === t.value ? t.color : 'var(--ink-500)',
                      fontSize:     '13px',
                      fontWeight:   600,
                      cursor:       'pointer',
                      display:      'flex',
                      alignItems:   'center',
                      gap:          '8px',
                    }}
                  >
                    {t.icon}
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Max points + Due date */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div>
                <label style={labelStyle}>MAX POINTS</label>
                <input
                  type="number"
                  value={form.max_points}
                  onChange={e => set('max_points', Number(e.target.value))}
                  min={10}
                  max={100}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>DUE DATE (OPTIONAL)</label>
                <input
                  type="date"
                  value={form.due_date ?? ''}
                  onChange={e => set('due_date', e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>

            {/* Description */}
            <div style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>INSTRUCTIONS (OPTIONAL)</label>
              <textarea
                value={form.description ?? ''}
                onChange={e => set('description', e.target.value)}
                rows={2}
                placeholder="What should students focus on?"
                style={{ ...inputStyle, resize: 'none' }}
              />
            </div>

            <button
              onClick={handleSubmit}
              disabled={creating || !form.title.trim()}
              style={{
                background:   'linear-gradient(135deg,#5B6AF5,#8B5CF6)',
                color: 'var(--ink-950)',
                border:       'none',
                borderRadius: '12px',
                padding:      '14px',
                width:        '100%',
                fontSize:     '15px',
                fontWeight:   700,
                cursor:       creating || !form.title.trim() ? 'not-allowed' : 'pointer',
                opacity:      creating || !form.title.trim() ? 0.6 : 1,
                display:      'flex',
                alignItems:   'center',
                justifyContent: 'center',
                gap:          '8px',
              }}
            >
              {creating ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={18} />}
              {creating ? 'Creating…' : 'Create & Push to Classroom'}
            </button>
          </>
        )}
      </motion.div>
    </div>
  );
}
