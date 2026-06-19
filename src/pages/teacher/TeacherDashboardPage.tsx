// ═══════════════════════════════════════════════════════════════════════════
// TeacherDashboardPage — B2B teacher hub: Classroom connect + assignments
// Route: /teacher
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, GraduationCap, Link2, Link2Off, RefreshCw,
  Plus, BookOpen, Zap, ClipboardList, FileText, Users,
  CheckCircle2, AlertCircle, ExternalLink, Copy, Trash2,
  BarChart2, ChevronRight, School, Loader2,
  Calendar, Mail, HardDrive, Video, Send, Bell,
  FolderOpen, CalendarPlus, X,
  AlertTriangle, Brain, Flame, Target,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useTeacher, type ClassroomCourse, type CreateAssignmentInput } from '@/hooks/useTeacher';
import { useGoogleServices } from '@/hooks/useGoogleServices';
import { supabase } from '@/lib/supabase';

// ── Constants ─────────────────────────────────────────────────────────────────
const SUBJECTS = [
  'Mathematics', 'Physics', 'Chemistry', 'Biology',
  'History', 'Geography', 'English', 'Computer Science',
  'Economics', 'Hindi', 'Civics', 'Science',
];

const CLASS_NUMS = [6, 7, 8, 9, 10, 11, 12];

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

// ── Colour helpers ─────────────────────────────────────────────────────────────
function scoreColor(score: number | null) {
  if (score === null) return '#6B7280';
  if (score >= 80) return '#10B981';
  if (score >= 60) return '#F59E0B';
  return '#EF4444';
}

function gradeLetter(score: number | null) {
  if (score === null) return '—';
  if (score >= 90) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  if (score >= 50) return 'D';
  return 'F';
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ConnectBanner({
  connected, googleEmail, loading, onConnect, onDisconnect,
}: {
  connected: boolean;
  googleEmail: string | null;
  loading: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  return (
    <div
      style={{
        background:   connected
          ? 'linear-gradient(135deg,rgba(16,185,129,0.15),rgba(5,150,105,0.1))'
          : 'linear-gradient(135deg,rgba(91,106,245,0.15),rgba(139,92,246,0.1))',
        border:       `1px solid ${connected ? 'rgba(16,185,129,0.3)' : 'rgba(91,106,245,0.3)'}`,
        borderRadius: '16px',
        padding:      '20px',
        marginBottom: '20px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
          <div
            style={{
              width:        '44px',
              height:       '44px',
              borderRadius: '12px',
              background:   connected ? 'rgba(16,185,129,0.2)' : 'rgba(91,106,245,0.2)',
              display:      'flex',
              alignItems:   'center',
              justifyContent: 'center',
              flexShrink:   0,
            }}
          >
            {connected
              ? <CheckCircle2 size={22} style={{ color: '#10B981' }} />
              : <Link2 size={22} style={{ color: '#5B6AF5' }} />}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '14px', color: 'white' }}>
              {connected ? 'Google Classroom Connected' : 'Connect Google Classroom'}
            </div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {connected
                ? googleEmail
                : 'Teachers assign Edora activities directly in Classroom'}
            </div>
          </div>
        </div>

        {loading ? (
          <Loader2 size={20} style={{ color: 'rgba(255,255,255,0.5)', animation: 'spin 1s linear infinite', flexShrink: 0 }} />
        ) : connected ? (
          <button
            onClick={onDisconnect}
            style={{
              background:   'rgba(239,68,68,0.15)',
              border:       '1px solid rgba(239,68,68,0.3)',
              color:        '#EF4444',
              borderRadius: '10px',
              padding:      '8px 14px',
              fontSize:     '12px',
              fontWeight:   600,
              cursor:       'pointer',
              display:      'flex',
              alignItems:   'center',
              gap:          '6px',
              flexShrink:   0,
            }}
          >
            <Link2Off size={14} />
            Disconnect
          </button>
        ) : (
          <button
            onClick={onConnect}
            style={{
              background:   'linear-gradient(135deg,#5B6AF5,#8B5CF6)',
              color:        '#fff',
              border:       'none',
              borderRadius: '10px',
              padding:      '10px 18px',
              fontSize:     '13px',
              fontWeight:   700,
              cursor:       'pointer',
              display:      'flex',
              alignItems:   'center',
              gap:          '8px',
              flexShrink:   0,
            }}
          >
            <Link2 size={15} />
            Connect
          </button>
        )}
      </div>
    </div>
  );
}

interface CreateModalProps {
  courses:  ClassroomCourse[];
  creating: boolean;
  onSubmit: (input: CreateAssignmentInput) => Promise<unknown>;
  onClose:  () => void;
}

function CreateAssignmentModal({ courses, creating, onSubmit, onClose }: CreateModalProps) {
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
    background:   'rgba(255,255,255,0.05)',
    border:       '1.5px solid rgba(255,255,255,0.1)',
    borderRadius: '10px',
    color:        'white',
    padding:      '10px 14px',
    fontSize:     '14px',
    outline:      'none',
  };

  const labelStyle: React.CSSProperties = {
    fontSize:     '12px',
    fontWeight:   600,
    color:        'rgba(255,255,255,0.5)',
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
          background:   'rgba(10,12,28,0.98)',
          border:       '1px solid rgba(255,255,255,0.1)',
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
            <h3 style={{ fontSize: '20px', fontWeight: 800, color: 'white', marginBottom: '8px' }}>
              Assignment Created!
            </h3>
            <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)', marginBottom: '20px' }}>
              {done.classroom_synced
                ? 'Pushed to Google Classroom — students will see it in their Classwork.'
                : 'Saved in Edora. Share the link manually with students.'}
            </p>

            <div
              style={{
                background: 'rgba(15,20,45,0.85)',
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
                style={{ ...inputStyle, background: 'transparent', border: 'none', padding: 0, fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}
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
                color:        '#fff',
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
              <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'white' }}>New Assignment</h3>
              <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '20px' }}>×</button>
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
                      background: form.edora_type === t.value ? `${t.color}18` : 'rgba(255,255,255,0.04)',
                      border:       `1.5px solid ${form.edora_type === t.value ? t.color : 'rgba(255,255,255,0.1)'}`,
                      borderRadius: '10px',
                      padding:      '10px',
                      color:        form.edora_type === t.value ? t.color : 'rgba(255,255,255,0.5)',
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
                color:        '#fff',
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

// ── Main page ──────────────────────────────────────────────────────────────────
export default function TeacherDashboardPage() {
  const { profile } = useAuth();
  const teacher     = useTeacher();

  const gs = useGoogleServices();

  const [tab, setTab]             = useState<'assignments' | 'analytics' | 'services'>('assignments');
  const [showCreate, setShowCreate] = useState(false);
  const [syncingGrades, setSyncingGrades] = useState(false);
  const [syncResult, setSyncResult] = useState<{ synced: number; failed: number } | null>(null);
  const [becomingTeacher, setBecomingTeacher] = useState(false);
  const [isTeacher, setIsTeacher] = useState(profile?.is_teacher ?? false);
  const [setupSchool, setSetupSchool] = useState(false);
  const [schoolName, setSchoolName]   = useState('');
  const [schoolBoard, setSchoolBoard] = useState('CBSE');

  // Google Services state
  const [showMeetModal,  setShowMeetModal]  = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailAssignmentId, setEmailAssignmentId] = useState('');
  const [emailAction, setEmailAction] = useState<'notify' | 'remind'>('notify');
  const [emailRecipients, setEmailRecipients] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailResult, setEmailResult] = useState<string | null>(null);
  const [meetForm, setMeetForm] = useState({ title: '', date: '', startTime: '09:00', endTime: '10:00', attendees: '' });
  const [meetResult, setMeetResult] = useState<{ html_link: string; meet_link: string | null } | null>(null);

  // Check status on mount
  useEffect(() => {
    if (isTeacher) {
      teacher.checkStatus();
      teacher.loadAssignments();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTeacher]);

  // Load Calendar events when services tab is opened
  useEffect(() => {
    if (tab === 'services' && teacher.connected) {
      gs.loadCalendarEvents();
      gs.loadDriveFiles();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, teacher.connected]);

  // Load courses when connected
  useEffect(() => {
    if (teacher.connected === true) {
      teacher.loadCourses();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacher.connected]);

  // ── Become teacher ────────────────────────────────────────────────────────
  const becomeTeacher = useCallback(async () => {
    setBecomingTeacher(true);
    try {
      // Create teacher_profile + set is_teacher
      await supabase.from('teacher_profiles').upsert({ id: profile?.id }, { onConflict: 'id' });
      await supabase.from('profiles').update({ is_teacher: true }).eq('id', profile?.id);
      setIsTeacher(true);
      teacher.checkStatus();
    } catch (err) {
      console.error('Failed to become teacher:', err);
    }
    setBecomingTeacher(false);
  }, [profile?.id, teacher]);

  // ── Setup school ──────────────────────────────────────────────────────────
  const saveSchool = useCallback(async () => {
    if (!schoolName.trim()) return;
    const { data } = await supabase
      .from('school_profiles')
      .insert({ name: schoolName, board: schoolBoard })
      .select('id')
      .single();

    if (data?.id) {
      await supabase.from('profiles').update({ school_id: data.id }).eq('id', profile?.id);
    }
    setSetupSchool(false);
  }, [schoolName, schoolBoard, profile?.id]);

  // ── Sync grades ────────────────────────────────────────────────────────────
  const handleSyncGrades = useCallback(async () => {
    setSyncingGrades(true);
    const result = await teacher.syncGrades();
    setSyncResult(result);
    setSyncingGrades(false);
    setTimeout(() => setSyncResult(null), 4000);
  }, [teacher]);

  // ── Create assignment ──────────────────────────────────────────────────────
  const handleCreate = useCallback(async (input: CreateAssignmentInput) => {
    return await teacher.createAssignment(input);
  }, [teacher]);

  // ── Send email notification ────────────────────────────────────────────────
  const handleSendEmail = useCallback(async () => {
    const recipients = emailRecipients.split(/[\n,;]+/).map(e => e.trim()).filter(Boolean);
    if (!recipients.length || !emailAssignmentId) return;
    setEmailSending(true);
    const result = emailAction === 'notify'
      ? await gs.sendAssignmentNotification(emailAssignmentId, recipients)
      : await gs.sendDueDateReminder(emailAssignmentId, recipients);
    setEmailSending(false);
    if (result) {
      setEmailResult(`Sent to ${result.sent} of ${result.total} recipients`);
      setTimeout(() => { setEmailResult(null); setShowEmailModal(false); setEmailRecipients(''); }, 3000);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailAssignmentId, emailAction, emailRecipients]);

  // ── Create Meet session ────────────────────────────────────────────────────
  const handleCreateMeet = useCallback(async () => {
    if (!meetForm.title || !meetForm.date) return;
    const start = `${meetForm.date}T${meetForm.startTime}:00`;
    const end   = `${meetForm.date}T${meetForm.endTime}:00`;
    const attendees = meetForm.attendees.split(/[\n,;]+/).map(e => e.trim()).filter(Boolean);
    const result = await gs.createMeet({ title: meetForm.title, start_datetime: start, end_datetime: end, attendee_emails: attendees });
    if (result) setMeetResult({ html_link: result.html_link, meet_link: result.meet_link });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetForm]);

  // ── "Not a teacher yet" screen ────────────────────────────────────────────
  if (!isTeacher) {
    return (
      <div
        style={{
          minHeight:      '100dvh',
          padding:        '24px',
          background:     'linear-gradient(180deg, #0A0F25 0%, #080C1A 100%)',
          display:        'flex',
          flexDirection:  'column',
        }}
      >
        <Link to="/home" style={{ color: 'rgba(255,255,255,0.5)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', marginBottom: '24px' }}>
          <ArrowLeft size={16} /> Home
        </Link>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: '20px' }}>
          <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(91,106,245,0.12)', border: '1px solid rgba(91,106,245,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <School size={36} style={{ color: '#8B9BFA' }} />
            </div>
          <div>
            <h1 style={{ fontSize: '26px', fontWeight: 800, color: 'white', marginBottom: '8px' }}>
              Teacher Dashboard
            </h1>
            <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.5)', maxWidth: '320px', lineHeight: 1.6 }}>
              Assign Edora activities to your Google Classroom students. Grades sync automatically.
            </p>
          </div>
          <div style={{ background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '16px', padding: '20px', maxWidth: '320px', width: '100%', textAlign: 'left' }}>
            {['Assign quizzes directly from Google Classroom', 'Student grades sync to your gradebook automatically', 'School dashboard for principals + parent reports'].map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: i < 2 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                <CheckCircle2 size={16} style={{ color: '#34D399', flexShrink: 0 }} />
                <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)' }}>{item}</span>
              </div>
            ))}
          </div>
          <button
            onClick={becomeTeacher}
            disabled={becomingTeacher}
            style={{
              background:   'linear-gradient(135deg,#5B6AF5,#8B5CF6)',
              color:        '#fff',
              border:       'none',
              borderRadius: '14px',
              padding:      '14px 32px',
              fontSize:     '16px',
              fontWeight:   700,
              cursor:       'pointer',
              display:      'flex',
              alignItems:   'center',
              gap:          '10px',
              opacity:      becomingTeacher ? 0.7 : 1,
            }}
          >
            {becomingTeacher ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <GraduationCap size={18} />}
            Set Up Teacher Account
          </button>
        </div>
        <style>{`@keyframes spin { from{transform:rotate(0)} to{transform:rotate(360deg)} }`}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100dvh', background: 'linear-gradient(180deg, #0A0F25 0%, #080C1A 100%)', paddingBottom: '32px' }}>
      {/* Header */}
      <div style={{ padding: '20px 20px 0', maxWidth: '640px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
          <Link to="/home" style={{ color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center' }}>
            <ArrowLeft size={20} />
          </Link>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'white' }}>Teacher Dashboard</h1>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>{profile?.email}</div>
          </div>
          {/* Sync button */}
          {teacher.connected && (
            <button
              onClick={handleSyncGrades}
              disabled={syncingGrades}
              title="Sync grades to Google Classroom"
              style={{
                background:   'rgba(91,106,245,0.15)',
                border:       '1px solid rgba(91,106,245,0.3)',
                borderRadius: '10px',
                padding:      '8px 12px',
                color:        '#5B6AF5',
                fontSize:     '12px',
                fontWeight:   600,
                cursor:       'pointer',
                display:      'flex',
                alignItems:   'center',
                gap:          '6px',
              }}
            >
              {syncingGrades
                ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                : <RefreshCw size={14} />}
              Sync
            </button>
          )}
        </div>

        {/* Sync result toast */}
        <AnimatePresence>
          {syncResult && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              style={{
                background:   syncResult.failed === 0 ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                border:       `1px solid ${syncResult.failed === 0 ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}`,
                borderRadius: '12px',
                padding:      '10px 14px',
                marginBottom: '12px',
                fontSize:     '13px',
                color:        syncResult.failed === 0 ? '#10B981' : '#F59E0B',
                fontWeight:   600,
              }}
            >
              {syncResult.failed === 0
                ? `${syncResult.synced} grade${syncResult.synced !== 1 ? 's' : ''} synced to Classroom`
                : `${syncResult.synced} synced, ${syncResult.failed} failed`}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Classroom connection banner */}
        <ConnectBanner
          connected={!!teacher.connected}
          googleEmail={teacher.googleEmail}
          loading={teacher.connected === null}
          onConnect={teacher.connectClassroom}
          onDisconnect={teacher.disconnect}
        />

        {/* Error */}
        {teacher.error && (
          <div
            style={{
              background:   'rgba(239,68,68,0.1)',
              border:       '1px solid rgba(239,68,68,0.3)',
              borderRadius: '12px',
              padding:      '12px 14px',
              marginBottom: '16px',
              fontSize:     '13px',
              color:        '#EF4444',
              display:      'flex',
              alignItems:   'center',
              gap:          '8px',
            }}
          >
            <AlertCircle size={16} />
            {teacher.error}
          </div>
        )}

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '12px', marginBottom: '20px' }}>
          {[
            { label: 'Assignments', value: teacher.assignments.length, color: '#5B6AF5', icon: <ClipboardList size={16} /> },
            { label: 'Submissions', value: teacher.assignments.reduce((a, b) => a + b.submission_count, 0), color: '#10B981', icon: <Users size={16} /> },
            { label: 'Avg Score', value: (() => {
              const scored = teacher.assignments.filter(a => a.avg_score !== null);
              return scored.length ? `${Math.round(scored.reduce((a, b) => a + (b.avg_score ?? 0), 0) / scored.length)}%` : '—';
            })(), color: '#F59E0B', icon: <BarChart2 size={16} /> },
          ].map(stat => (
            <div
              key={stat.label}
              style={{
                background:   'rgba(15,20,45,0.85)',
                border:       '1px solid rgba(255,255,255,0.06)',
                borderRadius: '14px',
                padding:      '14px',
                textAlign:    'center',
              }}
            >
              <div style={{ color: stat.color, marginBottom: '6px' }}>{stat.icon}</div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: 'white' }}>{stat.value}</div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', background: 'rgba(15,20,45,0.85)', borderRadius: '12px', padding: '4px', marginBottom: '20px' }}>
          {([
            ['assignments', 'Assignments', <ClipboardList size={14} />],
            ['analytics',   'Reports',     <BarChart2 size={14} />],
            ['services',    'Services',    <Calendar size={14} />],
          ] as const).map(([id, label, icon]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                flex:         1,
                background:   tab === id ? 'rgba(91,106,245,0.2)' : 'transparent',
                border:       'none',
                borderRadius: '10px',
                padding:      '9px 6px',
                color:        tab === id ? 'white' : 'rgba(255,255,255,0.4)',
                fontSize:     '12px',
                fontWeight:   700,
                cursor:       'pointer',
                display:      'flex',
                alignItems:   'center',
                justifyContent: 'center',
                gap:          '5px',
                transition:   'all 0.2s',
              }}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>

        {/* ── Assignments tab ──────────────────────────────────────────────── */}
        <AnimatePresence mode="wait">
          {tab === 'assignments' && (
            <motion.div key="assignments" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {/* Create button */}
              <button
                onClick={() => {
                  if (!teacher.connected) { teacher.connectClassroom(); return; }
                  setShowCreate(true);
                }}
                style={{
                  width:          '100%',
                  background:     'linear-gradient(135deg,#5B6AF5,#8B5CF6)',
                  border:         'none',
                  borderRadius:   '14px',
                  padding:        '14px',
                  color:          '#fff',
                  fontSize:       '15px',
                  fontWeight:     700,
                  cursor:         'pointer',
                  display:        'flex',
                  alignItems:     'center',
                  justifyContent: 'center',
                  gap:            '8px',
                  marginBottom:   '16px',
                }}
              >
                <Plus size={18} />
                {teacher.connected ? 'New Assignment' : 'Connect Classroom to Create Assignment'}
              </button>

              {/* Assignment cards */}
              {teacher.loadingAssignments ? (
                <div style={{ textAlign: 'center', padding: '32px', color: 'rgba(255,255,255,0.5)' }}>
                  <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
                  <div style={{ fontSize: '14px' }}>Loading assignments…</div>
                </div>
              ) : teacher.assignments.length === 0 ? (
                <div
                  style={{
                    background:   'rgba(15,20,45,0.75)',
                    borderRadius: '16px',
                    padding:      '40px 24px',
                    textAlign:    'center',
                    border: '2px dashed rgba(91,106,245,0.25)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
                    <div style={{ width: '52px', height: '52px', borderRadius: '14px', background: 'rgba(91,106,245,0.12)', border: '1px solid rgba(91,106,245,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <ClipboardList size={24} style={{ color: '#8B9BFA' }} />
                    </div>
                  </div>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: 'white', marginBottom: '6px' }}>No assignments yet</div>
                  <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>
                    Create your first assignment to push Edora activities directly into Google Classroom.
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {teacher.assignments.map(assignment => (
                    <motion.div
                      key={assignment.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      style={{
                        background:   'rgba(15,20,45,0.75)',
                        borderRadius: '16px',
                        padding:      '16px',
                        border:       '1px solid rgba(255,255,255,0.07)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '12px' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: '15px', color: 'white', marginBottom: '4px' }}>{assignment.title}</div>
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{ background: 'rgba(91,106,245,0.15)', color: '#818CF8', borderRadius: '6px', padding: '2px 8px', fontSize: '11px', fontWeight: 600 }}>
                              {assignment.subject}
                            </span>
                            <span style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)', borderRadius: '6px', padding: '2px 8px', fontSize: '11px' }}>
                              Class {assignment.class_num}
                            </span>
                            <span style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)', borderRadius: '6px', padding: '2px 8px', fontSize: '11px' }}>
                              {assignment.course_name}
                            </span>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: '22px', fontWeight: 800, color: scoreColor(assignment.avg_score) }}>
                            {gradeLetter(assignment.avg_score)}
                          </div>
                          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>avg grade</div>
                        </div>
                      </div>

                      {/* Stats row */}
                      <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>
                          <Users size={13} />
                          {assignment.submission_count} submitted
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>
                          <CheckCircle2 size={13} />
                          {assignment.synced_count} synced
                        </div>
                        {assignment.due_date && (
                          <div style={{ fontSize: '12px', color: '#F59E0B' }}>
                            Due {new Date(assignment.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                          </div>
                        )}
                      </div>

                      {/* Actions row 1 */}
                      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                        <button
                          onClick={() => navigator.clipboard.writeText(assignment.activity_url)}
                          style={{
                            flex:         1,
                            background:   'rgba(91,106,245,0.1)',
                            border:       '1px solid rgba(91,106,245,0.2)',
                            borderRadius: '8px',
                            padding:      '8px',
                            color:        '#818CF8',
                            fontSize:     '12px',
                            fontWeight:   600,
                            cursor:       'pointer',
                            display:      'flex',
                            alignItems:   'center',
                            justifyContent: 'center',
                            gap:          '5px',
                          }}
                        >
                          <Copy size={13} />
                          Copy Link
                        </button>
                        {assignment.coursework_id && (
                          <a
                            href={`https://classroom.google.com`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              flex:           1,
                              background:     'rgba(16,185,129,0.1)',
                              border:         '1px solid rgba(16,185,129,0.2)',
                              borderRadius:   '8px',
                              padding:        '8px',
                              color:          '#10B981',
                              fontSize:       '12px',
                              fontWeight:     600,
                              cursor:         'pointer',
                              display:        'flex',
                              alignItems:     'center',
                              justifyContent: 'center',
                              gap:            '5px',
                              textDecoration: 'none',
                            }}
                          >
                            <ExternalLink size={13} />
                            Classroom
                          </a>
                        )}
                        <button
                          onClick={() => teacher.archiveAssignment(assignment.id)}
                          style={{
                            background:   'rgba(239,68,68,0.1)',
                            border:       '1px solid rgba(239,68,68,0.2)',
                            borderRadius: '8px',
                            padding:      '8px 10px',
                            color:        '#EF4444',
                            cursor:       'pointer',
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      {/* Actions row 2 — Google Services */}
                      {teacher.connected && (
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={() => {
                              setEmailAssignmentId(assignment.id);
                              setEmailAction('notify');
                              setShowEmailModal(true);
                            }}
                            style={{
                              flex:         1,
                              background:   'rgba(6,182,212,0.08)',
                              border:       '1px solid rgba(6,182,212,0.2)',
                              borderRadius: '8px',
                              padding:      '7px',
                              color:        '#06B6D4',
                              fontSize:     '11px',
                              fontWeight:   600,
                              cursor:       'pointer',
                              display:      'flex',
                              alignItems:   'center',
                              justifyContent: 'center',
                              gap:          '4px',
                            }}
                          >
                            <Mail size={12} />
                            Notify Students
                          </button>
                          {assignment.due_date && (
                            <button
                              onClick={() => gs.addAssignmentDue(assignment.id)}
                              style={{
                                flex:         1,
                                background:   'rgba(245,158,11,0.08)',
                                border:       '1px solid rgba(245,158,11,0.2)',
                                borderRadius: '8px',
                                padding:      '7px',
                                color:        '#F59E0B',
                                fontSize:     '11px',
                                fontWeight:   600,
                                cursor:       'pointer',
                                display:      'flex',
                                alignItems:   'center',
                                justifyContent: 'center',
                                gap:          '4px',
                              }}
                            >
                              <CalendarPlus size={12} />
                              Add to Calendar
                            </button>
                          )}
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* ── Reports tab ───────────────────────────────────────────────── */}
          {tab === 'analytics' && (
            <motion.div key="analytics" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {/* At-risk students + AI test scheduler */}
              <AtRiskPanel />
              <AITestScheduler courses={teacher.courses} />

              {/* School setup card */}
              {!setupSchool ? (
                <>
                  <ReportCard
                    icon={Users}
                    title="Parent Weekly Report"
                    subtitle="Beautiful HTML report card — share with parents or print as PDF"
                    color="#5B6AF5"
                    onClick={() => {
                      const url = `${window.location.origin}/teacher/parent-report`;
                      window.open(url, '_blank', 'noopener,noreferrer');
                    }}
                  />
                  <ReportCard
                    icon={School}
                    title="School Principal Dashboard"
                    subtitle="School-wide engagement, subject breakdown, top students"
                    color="#10B981"
                    onClick={() => {
                      const url = `${window.location.origin}/teacher/school-report`;
                      window.open(url, '_blank', 'noopener,noreferrer');
                    }}
                  />
                  <ReportCard
                    icon={BarChart2}
                    title="Looker Studio Live Dashboard"
                    subtitle="Connect BigQuery → Looker Studio for always-on school analytics"
                    color="#F59E0B"
                    onClick={async () => {
                      const { data: { session } } = await supabase.auth.getSession();
                      const res = await supabase.functions.invoke('school-report', {
                        body: { action: 'setup_bq_views' },
                        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
                      });
                      if (res.data?.looker_studio_url) {
                        window.open(res.data.looker_studio_url as string, '_blank', 'noopener,noreferrer');
                      }
                    }}
                  />
                  <div
                    style={{
                      background:   'rgba(91,106,245,0.08)',
                      border:       '1px solid rgba(91,106,245,0.2)',
                      borderRadius: '14px',
                      padding:      '16px',
                      marginTop:    '8px',
                    }}
                  >
                    <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.7 }}>
                      <div style={{ fontWeight: 700, color: '#818CF8', marginBottom: '8px' }}>Looker Studio Setup (one-time)</div>
                      <ol style={{ paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <li>Click "Looker Studio Live Dashboard" above to create BQ views</li>
                        <li>Open the generated Looker Studio URL</li>
                        <li>Select your BigQuery project → edora_analytics dataset</li>
                        <li>Build your school dashboard with drag-and-drop charts</li>
                        <li>Share view-only link with your school principal</li>
                      </ol>
                    </div>
                  </div>
                </>
              ) : (
                // School setup form
                <div style={{ background: 'rgba(15,20,45,0.85)', borderRadius: '16px', padding: '20px' }}>
                  <div style={{ fontWeight: 700, color: 'white', marginBottom: '16px' }}>Add Your School</div>
                  <input
                    value={schoolName}
                    onChange={e => setSchoolName(e.target.value)}
                    placeholder="School name"
                    style={{ width: '100%', background: 'rgba(15,20,45,0.85)', border: '1.5px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: 'white', padding: '10px 14px', fontSize: '14px', outline: 'none', marginBottom: '12px' }}
                  />
                  <select
                    value={schoolBoard}
                    onChange={e => setSchoolBoard(e.target.value)}
                    style={{ width: '100%', background: 'rgba(15,20,45,0.85)', border: '1.5px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: 'white', padding: '10px 14px', fontSize: '14px', outline: 'none', marginBottom: '16px', appearance: 'none' }}
                  >
                    {['CBSE','ICSE','State','IB','IGCSE','Other'].map(b => <option key={b}>{b}</option>)}
                  </select>
                  <button onClick={saveSchool} style={{ width: '100%', background: 'linear-gradient(135deg,#5B6AF5,#8B5CF6)', color: '#fff', border: 'none', borderRadius: '10px', padding: '12px', fontWeight: 700, cursor: 'pointer' }}>
                    Save School
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {/* ── Services tab ──────────────────────────────────────────────── */}
          {tab === 'services' && (
            <motion.div key="services" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {!teacher.connected ? (
                <div style={{ background: 'rgba(15,20,45,0.75)', borderRadius: '16px', padding: '32px 20px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <Link2 size={36} style={{ color: '#5B6AF5', margin: '0 auto 12px' }} />
                  <div style={{ fontSize: '16px', fontWeight: 700, color: 'white', marginBottom: '6px' }}>Connect Google first</div>
                  <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', marginBottom: '20px' }}>Google Calendar, Gmail, and Drive are available once you connect your Google account.</div>
                  <button onClick={teacher.connectClassroom} style={{ background: 'linear-gradient(135deg,#5B6AF5,#8B5CF6)', color: '#fff', border: 'none', borderRadius: '12px', padding: '12px 28px', fontWeight: 700, cursor: 'pointer' }}>
                    Connect Google
                  </button>
                </div>
              ) : (
                <>
                  {gs.error && (
                    <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '12px', padding: '12px 14px', marginBottom: '16px', fontSize: '13px', color: '#EF4444', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <AlertCircle size={16} />{gs.error}
                      <button aria-label="Dismiss error" onClick={gs.clearError} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', marginLeft: 'auto' }}><X size={14} /></button>
                    </div>
                  )}

                  {/* Google Meet */}
                  <div style={{ background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '16px', padding: '16px', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(6,182,212,0.12)', border: '1px solid rgba(6,182,212,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Video size={18} style={{ color: '#06B6D4' }} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '14px', color: 'white' }}>Google Meet</div>
                        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>Schedule live class sessions with Meet links</div>
                      </div>
                    </div>
                    <button
                      onClick={() => { setMeetResult(null); setShowMeetModal(true); }}
                      style={{ width: '100%', background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.25)', borderRadius: '10px', padding: '10px', color: '#06B6D4', fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px' }}
                    >
                      <CalendarPlus size={15} />
                      Schedule New Meet Session
                    </button>

                    {/* Upcoming calendar events */}
                    {gs.calendarEvents.filter(e => e.event_type === 'meet_session').length > 0 && (
                      <div style={{ marginTop: '12px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Upcoming</div>
                        {gs.calendarEvents.filter(e => e.event_type === 'meet_session').slice(0, 3).map(ev => (
                          <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                            <Calendar size={13} style={{ color: 'rgba(255,255,255,0.4)', flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '13px', color: 'white', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.event_title}</div>
                              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>{new Date(ev.event_start).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                            </div>
                            {ev.meet_link && (
                              <a href={ev.meet_link} target="_blank" rel="noopener noreferrer" style={{ fontSize: '11px', color: '#06B6D4', fontWeight: 600, textDecoration: 'none' }}>Join</a>
                            )}
                            <button aria-label="Delete event" onClick={() => gs.deleteCalendarEvent(ev.id)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', padding: '0' }}><X size={14} /></button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Gmail */}
                  <div style={{ background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '16px', padding: '16px', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Mail size={18} style={{ color: '#EF4444' }} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '14px', color: 'white' }}>Gmail</div>
                        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>Notify students and parents via your Gmail account</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {teacher.assignments.slice(0, 5).map(a => (
                        <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '12px', color: 'white', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</div>
                            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>{a.subject} · {a.course_name}</div>
                          </div>
                          <button
                            onClick={() => { setEmailAssignmentId(a.id); setEmailAction('notify'); setShowEmailModal(true); }}
                            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '5px 10px', color: '#EF4444', fontSize: '11px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}
                          >
                            <Send size={11} />
                            Notify
                          </button>
                          {a.due_date && (
                            <button
                              onClick={() => { setEmailAssignmentId(a.id); setEmailAction('remind'); setShowEmailModal(true); }}
                              style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '8px', padding: '5px 10px', color: '#F59E0B', fontSize: '11px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}
                            >
                              <Bell size={11} />
                              Remind
                            </button>
                          )}
                        </div>
                      ))}
                      {teacher.assignments.length === 0 && (
                        <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: '12px 0' }}>Create assignments first to send notifications</div>
                      )}
                    </div>
                  </div>

                  {/* Google Calendar — due date events */}
                  <div style={{ background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '16px', padding: '16px', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(91,106,245,0.12)', border: '1px solid rgba(91,106,245,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Calendar size={18} style={{ color: '#5B6AF5' }} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '14px', color: 'white' }}>Google Calendar</div>
                        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>Add assignment due dates to your calendar</div>
                      </div>
                    </div>
                    {gs.loadingCalendar ? (
                      <div style={{ textAlign: 'center', padding: '20px' }}>
                        <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: 'rgba(255,255,255,0.4)', margin: '0 auto' }} />
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {teacher.assignments.filter(a => a.due_date).map(a => (
                          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px' }}>
                            <Calendar size={13} style={{ color: '#5B6AF5', flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '12px', color: 'white', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</div>
                              <div style={{ fontSize: '10px', color: '#F59E0B' }}>Due {new Date(a.due_date!).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                            </div>
                            <button
                              onClick={() => gs.addAssignmentDue(a.id)}
                              disabled={gs.loadingCalendar}
                              style={{ background: 'rgba(91,106,245,0.1)', border: '1px solid rgba(91,106,245,0.2)', borderRadius: '8px', padding: '5px 10px', color: '#818CF8', fontSize: '11px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}
                            >
                              <CalendarPlus size={11} />
                              Add
                            </button>
                          </div>
                        ))}
                        {teacher.assignments.filter(a => a.due_date).length === 0 && (
                          <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: '12px 0' }}>Assignments with due dates will appear here</div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Google Drive */}
                  <div style={{ background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '16px', padding: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <HardDrive size={18} style={{ color: '#10B981' }} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '14px', color: 'white' }}>Google Drive</div>
                        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>Files uploaded to your Drive via Edora</div>
                      </div>
                    </div>
                    {gs.loadingDrive ? (
                      <div style={{ textAlign: 'center', padding: '20px' }}>
                        <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: 'rgba(255,255,255,0.4)', margin: '0 auto' }} />
                      </div>
                    ) : gs.driveFiles.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '20px 12px' }}>
                        <FolderOpen size={28} style={{ color: 'rgba(255,255,255,0.2)', margin: '0 auto 8px' }} />
                        <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>No files yet. Reports uploaded via Edora appear here.</div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {gs.driveFiles.slice(0, 10).map(f => (
                          <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px' }}>
                            <FileText size={13} style={{ color: '#10B981', flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '12px', color: 'white', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.drive_file_name}</div>
                              {f.file_size_bytes && <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>{Math.round(f.file_size_bytes / 1024)} KB</div>}
                            </div>
                            <a href={f.web_view_link} target="_blank" rel="noopener noreferrer" style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '8px', padding: '5px 10px', color: '#10B981', fontSize: '11px', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <ExternalLink size={11} />
                              Open
                            </a>
                            <button onClick={() => gs.deleteDriveFile(f.id)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', padding: '0' }}><Trash2 size={14} /></button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Create assignment modal */}
      <AnimatePresence>
        {showCreate && (
          <CreateAssignmentModal
            courses={teacher.courses}
            creating={teacher.creating}
            onSubmit={handleCreate}
            onClose={() => setShowCreate(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Create Meet modal ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {showMeetModal && (
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
            onClick={e => { if (e.target === e.currentTarget) { setShowMeetModal(false); setMeetResult(null); } }}
          >
            <motion.div
              initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }}
              style={{ background: 'rgba(10,12,28,0.98)', border: '1px solid rgba(255,255,255,0.1)', borderBottom: 'none', borderRadius: '20px 20px 0 0', padding: '24px', width: '100%', maxWidth: '480px', maxHeight: '80dvh', overflowY: 'auto' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Video size={20} style={{ color: '#06B6D4' }} />
                  <h3 style={{ fontSize: '17px', fontWeight: 800, color: 'white' }}>Schedule Meet Session</h3>
                </div>
                <button onClick={() => { setShowMeetModal(false); setMeetResult(null); }} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}><X size={20} /></button>
              </div>

              {meetResult ? (
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(6,182,212,0.15)', border: '1px solid rgba(6,182,212,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                    <Video size={26} style={{ color: '#06B6D4' }} />
                  </div>
                  <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'white', marginBottom: '8px' }}>Meet Created!</h3>
                  {meetResult.meet_link && (
                    <div style={{ background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.25)', borderRadius: '12px', padding: '12px', marginBottom: '16px' }}>
                      <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginBottom: '4px' }}>MEET LINK</div>
                      <div style={{ fontSize: '13px', color: '#06B6D4', fontWeight: 600, wordBreak: 'break-all' }}>{meetResult.meet_link}</div>
                      <button onClick={() => navigator.clipboard.writeText(meetResult.meet_link!)} style={{ marginTop: '8px', background: 'none', border: 'none', color: '#06B6D4', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', margin: '8px auto 0' }}>
                        <Copy size={13} /> Copy link
                      </button>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <a href={meetResult.html_link} target="_blank" rel="noopener noreferrer" style={{ flex: 1, background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.25)', borderRadius: '12px', padding: '12px', color: '#06B6D4', fontSize: '14px', fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px' }}>
                      <ExternalLink size={16} /> View in Calendar
                    </a>
                    <button onClick={() => { setShowMeetModal(false); setMeetResult(null); setMeetForm({ title: '', date: '', startTime: '09:00', endTime: '10:00', attendees: '' }); }} style={{ flex: 1, background: 'linear-gradient(135deg,#5B6AF5,#8B5CF6)', border: 'none', borderRadius: '12px', padding: '12px', color: '#fff', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {[
                    { label: 'SESSION TITLE', type: 'text', key: 'title', placeholder: 'e.g. Class 10 Physics Doubt Session' },
                    { label: 'DATE', type: 'date', key: 'date', placeholder: '' },
                  ].map(f => (
                    <div key={f.key} style={{ marginBottom: '14px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '6px' }}>{f.label}</label>
                      <input
                        type={f.type}
                        value={meetForm[f.key as keyof typeof meetForm]}
                        onChange={e => setMeetForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                        placeholder={f.placeholder}
                        style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1.5px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: 'white', padding: '10px 14px', fontSize: '14px', outline: 'none' }}
                      />
                    </div>
                  ))}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                    {[['START TIME', 'startTime'], ['END TIME', 'endTime']].map(([label, key]) => (
                      <div key={key}>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '6px' }}>{label}</label>
                        <input
                          type="time"
                          value={meetForm[key as keyof typeof meetForm]}
                          onChange={e => setMeetForm(prev => ({ ...prev, [key]: e.target.value }))}
                          style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1.5px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: 'white', padding: '10px 14px', fontSize: '14px', outline: 'none' }}
                        />
                      </div>
                    ))}
                  </div>
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '6px' }}>STUDENT EMAILS (OPTIONAL, ONE PER LINE)</label>
                    <textarea
                      value={meetForm.attendees}
                      onChange={e => setMeetForm(prev => ({ ...prev, attendees: e.target.value }))}
                      rows={3}
                      placeholder="student1@school.edu&#10;student2@school.edu"
                      style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1.5px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: 'white', padding: '10px 14px', fontSize: '13px', outline: 'none', resize: 'none' }}
                    />
                  </div>
                  <button
                    onClick={handleCreateMeet}
                    disabled={gs.loadingCalendar || !meetForm.title || !meetForm.date}
                    style={{ width: '100%', background: 'linear-gradient(135deg,#06B6D4,#0891B2)', border: 'none', borderRadius: '12px', padding: '14px', color: '#fff', fontSize: '15px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: gs.loadingCalendar || !meetForm.title || !meetForm.date ? 0.6 : 1 }}
                  >
                    {gs.loadingCalendar ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <Video size={18} />}
                    {gs.loadingCalendar ? 'Creating…' : 'Create Meet Session'}
                  </button>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Send Email modal ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {showEmailModal && (
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
            onClick={e => { if (e.target === e.currentTarget) { setShowEmailModal(false); setEmailRecipients(''); setEmailResult(null); } }}
          >
            <motion.div
              initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }}
              style={{ background: 'rgba(10,12,28,0.98)', border: '1px solid rgba(255,255,255,0.1)', borderBottom: 'none', borderRadius: '20px 20px 0 0', padding: '24px', width: '100%', maxWidth: '480px', maxHeight: '70dvh', overflowY: 'auto' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Mail size={20} style={{ color: emailAction === 'notify' ? '#EF4444' : '#F59E0B' }} />
                  <h3 style={{ fontSize: '17px', fontWeight: 800, color: 'white' }}>
                    {emailAction === 'notify' ? 'Notify Students' : 'Send Reminder'}
                  </h3>
                </div>
                <button onClick={() => { setShowEmailModal(false); setEmailRecipients(''); setEmailResult(null); }} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}><X size={20} /></button>
              </div>

              {emailResult ? (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <CheckCircle2 size={40} style={{ color: '#34D399', margin: '0 auto 12px' }} />
                  <div style={{ fontSize: '16px', fontWeight: 700, color: 'white', marginBottom: '6px' }}>{emailResult}</div>
                  <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>Email sent via your Gmail account</div>
                </div>
              ) : (
                <>
                  <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '10px', padding: '10px 12px', marginBottom: '16px' }}>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginBottom: '2px' }}>ASSIGNMENT</div>
                    <div style={{ fontSize: '13px', color: 'white', fontWeight: 600 }}>
                      {teacher.assignments.find(a => a.id === emailAssignmentId)?.title ?? '—'}
                    </div>
                  </div>
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '6px' }}>RECIPIENT EMAILS (ONE PER LINE OR COMMA-SEPARATED)</label>
                    <textarea
                      value={emailRecipients}
                      onChange={e => setEmailRecipients(e.target.value)}
                      rows={4}
                      placeholder="student1@school.edu&#10;student2@school.edu"
                      style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1.5px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: 'white', padding: '10px 14px', fontSize: '13px', outline: 'none', resize: 'none' }}
                    />
                  </div>
                  <button
                    onClick={handleSendEmail}
                    disabled={emailSending || !emailRecipients.trim()}
                    style={{ width: '100%', background: emailAction === 'notify' ? 'linear-gradient(135deg,#EF4444,#DC2626)' : 'linear-gradient(135deg,#F59E0B,#D97706)', border: 'none', borderRadius: '12px', padding: '14px', color: '#fff', fontSize: '15px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: emailSending || !emailRecipients.trim() ? 0.6 : 1 }}
                  >
                    {emailSending ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={18} />}
                    {emailSending ? 'Sending…' : emailAction === 'notify' ? 'Send Notification' : 'Send Reminder'}
                  </button>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style>{`@keyframes spin { from{transform:rotate(0)} to{transform:rotate(360deg)} }`}</style>
    </div>
  );
}

// ── At-Risk Students Panel ────────────────────────────────────────────────────
interface AtRiskStudent {
  student_id: string;
  full_name: string;
  avatar_url: string | null;
  xp: number;
  current_streak: number;
  risk_level: 'no_streak' | 'low_xp' | 'ok';
}

function AtRiskPanel() {
  const [students, setStudents] = useState<AtRiskStudent[]>([]);
  const [loading, setLoading]   = useState(true);
  const [open, setOpen]         = useState(true);

  useEffect(() => {
    supabase.from('at_risk_students').select('*').limit(10).then(({ data }) => {
      setStudents((data ?? []) as AtRiskStudent[]);
      setLoading(false);
    });
  }, []);

  if (!loading && students.length === 0) return null;

  return (
    <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 16, padding: '14px 16px', marginBottom: 16 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', background: 'none', border: 'none', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: 0, marginBottom: open ? 12 : 0 }}
      >
        <AlertTriangle size={16} color="#EF4444" />
        <span style={{ fontWeight: 700, fontSize: 14, color: '#EF4444', flex: 1, textAlign: 'left' }}>
          At-Risk Students {students.length > 0 && `(${students.length})`}
        </span>
        <ChevronRight size={16} color="rgba(239,68,68,0.6)" style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
            {loading ? (
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Loading…</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {students.map(s => (
                  <div key={s.student_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'rgba(0,0,0,0.2)', borderRadius: 10 }}>
                    <div style={{
                      width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                      background: 'linear-gradient(135deg,#7C3AED,#A78BFA)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 700, color: '#fff', overflow: 'hidden',
                    }}>
                      {s.avatar_url ? <img src={s.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : s.full_name.split(' ').map(w => w[0]).join('').slice(0,2)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.full_name}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                        {s.current_streak === 0 ? '🔥 No streak' : `🔥 ${s.current_streak}d`} · {s.xp} XP
                      </div>
                    </div>
                    <div style={{
                      padding: '3px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700,
                      background: s.risk_level === 'no_streak' ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)',
                      color: s.risk_level === 'no_streak' ? '#EF4444' : '#F59E0B',
                    }}>
                      {s.risk_level === 'no_streak' ? 'No Streak' : 'Low XP'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── AI Test Scheduler ─────────────────────────────────────────────────────────
function AITestScheduler({ courses }: { courses: Array<{ id: string; name: string }> }) {
  const [open, setOpen]         = useState(false);
  const [subject, setSubject]   = useState('Mathematics');
  const [topic, setTopic]       = useState('');
  const [qCount, setQCount]     = useState(10);
  const [dueDate, setDueDate]   = useState('');
  const [loading, setLoading]   = useState(false);
  const [success, setSuccess]   = useState(false);

  const SUBJECTS = ['Mathematics', 'Physics', 'Chemistry', 'Biology', 'History', 'Geography', 'English'];

  async function scheduleTest() {
    if (!topic.trim()) return;
    setLoading(true);
    // Call the ai-question-gen edge function and create a teacher_assignment
    const { data: { session } } = await supabase.auth.getSession();
    const res = await supabase.functions.invoke('ai-question-gen', {
      body: { subject, chapter: topic, count: qCount, ability_score: 0 },
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
    });

    const questions = res.data?.questions ?? [];
    const qIds = questions.map((q: { id?: string }) => q.id).filter(Boolean);

    await supabase.from('teacher_assignments').insert({
      teacher_id:    session?.user?.id,
      title:         `${subject} — ${topic}`,
      subject,
      topic,
      activity_type: 'quiz',
      due_date:      dueDate || null,
      question_ids:  qIds,
      xp_bonus:      50,
    });

    setLoading(false);
    setSuccess(true);
    setTimeout(() => { setSuccess(false); setOpen(false); setTopic(''); }, 2000);
  }

  return (
    <div style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.25)', borderRadius: 16, padding: '14px 16px', marginBottom: 16 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', background: 'none', border: 'none', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: 0 }}
      >
        <Brain size={16} color="#A78BFA" />
        <span style={{ fontWeight: 700, fontSize: 14, color: '#A78BFA', flex: 1, textAlign: 'left' }}>
          AI Test Scheduler
        </span>
        <span style={{ fontSize: 10, fontWeight: 700, background: 'rgba(124,58,237,0.3)', color: '#C4B5FD', padding: '2px 6px', borderRadius: 10 }}>1-CLICK</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ marginTop: 12 }}>
            {success ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#10B981', fontWeight: 700, fontSize: 14 }}>
                <CheckCircle2 size={18} />Test scheduled and assigned!
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4, fontWeight: 600 }}>SUBJECT</div>
                  <select value={subject} onChange={e => setSubject(e.target.value)}
                    style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'white', padding: '8px 10px', fontSize: 13 }}>
                    {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4, fontWeight: 600 }}>TOPIC / CHAPTER</div>
                  <input value={topic} onChange={e => setTopic(e.target.value)} placeholder="e.g. Newton's Laws of Motion"
                    style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'white', padding: '8px 10px', fontSize: 13 }} />
                </div>
                <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4, fontWeight: 600 }}>QUESTIONS</div>
                    <select value={qCount} onChange={e => setQCount(Number(e.target.value))}
                      style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'white', padding: '8px 10px', fontSize: 13 }}>
                      {[5, 10, 15, 20].map(n => <option key={n} value={n}>{n} MCQs</option>)}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4, fontWeight: 600 }}>DUE DATE</div>
                    <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                      style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'white', padding: '8px 10px', fontSize: 13 }} />
                  </div>
                </div>
                <button
                  onClick={scheduleTest}
                  disabled={loading || !topic.trim()}
                  style={{
                    width: '100%', padding: '10px', borderRadius: 10,
                    background: 'linear-gradient(135deg,#7C3AED,#A78BFA)', border: 'none',
                    color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    opacity: loading || !topic.trim() ? 0.6 : 1,
                  }}
                >
                  {loading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Brain size={16} />}
                  {loading ? 'Generating AI test…' : 'Generate & Assign Test'}
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ReportCard({
  icon: Icon, title, subtitle, color, onClick,
}: {
  icon: React.ComponentType<{size?: number | string; style?: React.CSSProperties}>; title: string; subtitle: string; color: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width:          '100%',
        background:     'rgba(15,20,45,0.75)',
        border:         '1px solid rgba(255,255,255,0.07)',
        borderRadius:   '16px',
        padding:        '16px',
        cursor:         'pointer',
        display:        'flex',
        alignItems:     'center',
        gap:            '14px',
        marginBottom:   '12px',
        textAlign:      'left',
      }}
    >
      <div
        style={{
          width:          '44px',
          height:         '44px',
          borderRadius:   '12px',
          background:     `${color}20`,
          border:         `1px solid ${color}40`,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          flexShrink:     0,
        }}
      >
        <Icon size={22} style={{ color }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '14px', fontWeight: 700, color: 'white', marginBottom: '2px' }}>{title}</div>
        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>{subtitle}</div>
      </div>
      <ChevronRight size={18} style={{ color: 'rgba(255,255,255,0.5)', flexShrink: 0 }} />
    </button>
  );
}
