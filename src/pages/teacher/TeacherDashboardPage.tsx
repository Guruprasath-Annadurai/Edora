// ═══════════════════════════════════════════════════════════════════════════
// TeacherDashboardPage — B2B teacher hub: Classroom connect + assignments
// Route: /teacher
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, GraduationCap, Link2, RefreshCw,
  Plus, ClipboardList, FileText, Users,
  CheckCircle2, AlertCircle, ExternalLink, Copy, Trash2,
  BarChart2, School, Loader2,
  Calendar, Mail, HardDrive, Video, Send, Bell,
  FolderOpen, CalendarPlus, X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useTeacher, type CreateAssignmentInput } from '@/hooks/useTeacher';
import { useGoogleServices } from '@/hooks/useGoogleServices';
import { supabase } from '@/lib/supabase';
import { scoreColor, gradeLetter } from '@/lib/teacherDashboardHelpers';
import { ConnectBanner } from '@/components/teacher/ConnectBanner';
import { CreateAssignmentModal } from '@/components/teacher/CreateAssignmentModal';
import { AtRiskPanel } from '@/components/teacher/AtRiskPanel';
import { AITestScheduler } from '@/components/teacher/AITestScheduler';
import { ReportCard } from '@/components/teacher/ReportCard';

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
          background:     'linear-gradient(180deg, var(--page-bg-start) 0%, var(--page-bg-end) 100%)',
          display:        'flex',
          flexDirection:  'column',
        }}
      >
        <Link aria-label="Go back" to="/home" style={{ color: 'var(--ink-500)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', marginBottom: '24px' }}>
          <ArrowLeft size={16} /> Home
        </Link>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: '20px' }}>
          <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(91,106,245,0.12)', border: '1px solid rgba(91,106,245,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <School size={36} style={{ color: '#8B9BFA' }} />
            </div>
          <div>
            <h1 style={{ fontSize: '26px', fontWeight: 800, color: 'var(--ink-950)', marginBottom: '8px' }}>
              Teacher Dashboard
            </h1>
            <p style={{ fontSize: '15px', color: 'var(--ink-500)', maxWidth: '320px', lineHeight: 1.6 }}>
              Assign Edora activities to your Google Classroom students. Grades sync automatically.
            </p>
          </div>
          <div style={{ background: 'var(--hdr-b-750)', border: '1px solid var(--ink-070)', borderRadius: '16px', padding: '20px', maxWidth: '320px', width: '100%', textAlign: 'left' }}>
            {['Assign quizzes directly from Google Classroom', 'Student grades sync to your gradebook automatically', 'School dashboard for principals + parent reports'].map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: i < 2 ? '1px solid var(--ink-060)' : 'none' }}>
                <CheckCircle2 size={16} style={{ color: '#34D399', flexShrink: 0 }} />
                <span style={{ fontSize: '13px', color: 'var(--ink-700)' }}>{item}</span>
              </div>
            ))}
          </div>
          <button
            onClick={becomeTeacher}
            disabled={becomingTeacher}
            style={{
              background:   'linear-gradient(135deg,#5B6AF5,#8B5CF6)',
              color: 'var(--ink-950)',
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
    <div style={{ minHeight: '100dvh', background: 'transparent', paddingBottom: '32px' }}>
      {/* Header */}
      <div style={{ padding: '20px 20px 0', maxWidth: '640px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
          <Link aria-label="Go back" to="/home" style={{ color: 'var(--ink-500)', display: 'flex', alignItems: 'center' }}>
            <ArrowLeft size={20} />
          </Link>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--ink-950)' }}>Teacher Dashboard</h1>
            <div style={{ fontSize: '12px', color: 'var(--ink-500)' }}>{profile?.email}</div>
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
                background:   'var(--v2-card)',
                border:       '1px solid var(--v2-border)',
                borderRadius: '14px',
                padding:      '14px',
                textAlign:    'center',
              }}
            >
              <div style={{ color: stat.color, marginBottom: '6px' }}>{stat.icon}</div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--v2-text-1)' }} className="v2-tnum">{stat.value}</div>
              <div style={{ fontSize: '11px', color: 'var(--v2-text-4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', background: 'var(--v2-elevated)', borderRadius: '12px', padding: '4px', marginBottom: '20px' }}>
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
                background:   tab === id ? 'var(--v2-primary)' : 'transparent',
                border:       'none',
                borderRadius: '10px',
                padding:      '9px 6px',
                color:        tab === id ? '#fff' : 'var(--v2-text-4)',
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
                  background:     'var(--v2-primary)',
                  border:         'none',
                  borderRadius:   '14px',
                  padding:        '14px',
                  color: '#fff',
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
                <div style={{ textAlign: 'center', padding: '32px', color: 'var(--ink-500)' }}>
                  <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
                  <div style={{ fontSize: '14px' }}>Loading assignments…</div>
                </div>
              ) : teacher.assignments.length === 0 ? (
                <div
                  style={{
                    background:   'var(--v2-card)',
                    borderRadius: '16px',
                    padding:      '40px 24px',
                    textAlign:    'center',
                    border: '2px dashed var(--v2-border)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
                    <div style={{ width: '52px', height: '52px', borderRadius: '14px', background: 'var(--v2-primary-tint-2)', border: '1px solid var(--v2-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <ClipboardList size={24} style={{ color: 'var(--v2-primary)' }} />
                    </div>
                  </div>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--v2-text-1)', marginBottom: '6px' }}>No assignments yet</div>
                  <div style={{ fontSize: '13px', color: 'var(--v2-text-4)', lineHeight: 1.6 }}>
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
                        background:   'var(--v2-card)',
                        borderRadius: '16px',
                        padding:      '16px',
                        border:       '1px solid var(--v2-border)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '12px' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--v2-text-1)', marginBottom: '4px' }}>{assignment.title}</div>
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{ background: 'var(--v2-primary-tint-2)', color: 'var(--v2-primary)', borderRadius: '6px', padding: '2px 8px', fontSize: '11px', fontWeight: 600 }}>
                              {assignment.subject}
                            </span>
                            <span style={{ background: 'var(--v2-elevated)', color: 'var(--v2-text-4)', borderRadius: '6px', padding: '2px 8px', fontSize: '11px' }}>
                              Class {assignment.class_num}
                            </span>
                            <span style={{ background: 'var(--v2-elevated)', color: 'var(--v2-text-4)', borderRadius: '6px', padding: '2px 8px', fontSize: '11px' }}>
                              {assignment.course_name}
                            </span>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: '22px', fontWeight: 800, color: scoreColor(assignment.avg_score) }}>
                            {gradeLetter(assignment.avg_score)}
                          </div>
                          <div style={{ fontSize: '10px', color: 'var(--ink-500)' }}>avg grade</div>
                        </div>
                      </div>

                      {/* Stats row */}
                      <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: 'var(--ink-500)' }}>
                          <Users size={13} />
                          {assignment.submission_count} submitted
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: 'var(--ink-500)' }}>
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
                    <div style={{ fontSize: '13px', color: 'var(--ink-500)', lineHeight: 1.7 }}>
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
                <div style={{ background: 'var(--ink-060)', borderRadius: '16px', padding: '20px' }}>
                  <div style={{ fontWeight: 700, color: 'var(--ink-950)', marginBottom: '16px' }}>Add Your School</div>
                  <input
                    value={schoolName}
                    onChange={e => setSchoolName(e.target.value)}
                    placeholder="School name"
                    style={{ width: '100%', background: 'var(--ink-060)', border: '1.5px solid var(--ink-100)', borderRadius: '10px', color: 'var(--ink-950)', padding: '10px 14px', fontSize: '14px', outline: 'none', marginBottom: '12px' }}
                  />
                  <select
                    value={schoolBoard}
                    onChange={e => setSchoolBoard(e.target.value)}
                    style={{ width: '100%', background: 'var(--ink-060)', border: '1.5px solid var(--ink-100)', borderRadius: '10px', color: 'var(--ink-950)', padding: '10px 14px', fontSize: '14px', outline: 'none', marginBottom: '16px', appearance: 'none' }}
                  >
                    {['CBSE','ICSE','State','IB','IGCSE','Other'].map(b => <option key={b}>{b}</option>)}
                  </select>
                  <button onClick={saveSchool} style={{ width: '100%', background: 'linear-gradient(135deg,#5B6AF5,#8B5CF6)', color: 'var(--ink-950)', border: 'none', borderRadius: '10px', padding: '12px', fontWeight: 700, cursor: 'pointer' }}>
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
                <div style={{ background: 'var(--hdr-b-750)', borderRadius: '16px', padding: '32px 20px', textAlign: 'center', border: '1px solid var(--ink-070)' }}>
                  <Link2 size={36} style={{ color: '#5B6AF5', margin: '0 auto 12px' }} />
                  <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--ink-950)', marginBottom: '6px' }}>Connect Google first</div>
                  <div style={{ fontSize: '13px', color: 'var(--ink-500)', marginBottom: '20px' }}>Google Calendar, Gmail, and Drive are available once you connect your Google account.</div>
                  <button onClick={teacher.connectClassroom} style={{ background: 'linear-gradient(135deg,#5B6AF5,#8B5CF6)', color: 'var(--ink-950)', border: 'none', borderRadius: '12px', padding: '12px 28px', fontWeight: 700, cursor: 'pointer' }}>
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
                  <div style={{ background: 'var(--hdr-b-750)', border: '1px solid var(--ink-070)', borderRadius: '16px', padding: '16px', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(6,182,212,0.12)', border: '1px solid rgba(6,182,212,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Video size={18} style={{ color: '#06B6D4' }} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--ink-950)' }}>Google Meet</div>
                        <div style={{ fontSize: '11px', color: 'var(--ink-400)' }}>Schedule live class sessions with Meet links</div>
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
                        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink-400)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Upcoming</div>
                        {gs.calendarEvents.filter(e => e.event_type === 'meet_session').slice(0, 3).map(ev => (
                          <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderTop: '1px solid var(--ink-050)' }}>
                            <Calendar size={13} style={{ color: 'var(--ink-400)', flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '13px', color: 'var(--ink-950)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.event_title}</div>
                              <div style={{ fontSize: '11px', color: 'var(--ink-400)' }}>{new Date(ev.event_start).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                            </div>
                            {ev.meet_link && (
                              <a href={ev.meet_link} target="_blank" rel="noopener noreferrer" style={{ fontSize: '11px', color: '#06B6D4', fontWeight: 600, textDecoration: 'none' }}>Join</a>
                            )}
                            <button aria-label="Delete event" onClick={() => gs.deleteCalendarEvent(ev.id)} style={{ background: 'none', border: 'none', color: 'var(--ink-500)', cursor: 'pointer', padding: '0' }}><X size={14} /></button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Gmail */}
                  <div style={{ background: 'var(--hdr-b-750)', border: '1px solid var(--ink-070)', borderRadius: '16px', padding: '16px', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Mail size={18} style={{ color: '#EF4444' }} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--ink-950)' }}>Gmail</div>
                        <div style={{ fontSize: '11px', color: 'var(--ink-400)' }}>Notify students and parents via your Gmail account</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {teacher.assignments.slice(0, 5).map(a => (
                        <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', background: 'var(--ink-030)', borderRadius: '10px' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '12px', color: 'var(--ink-950)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</div>
                            <div style={{ fontSize: '10px', color: 'var(--ink-400)' }}>{a.subject} · {a.course_name}</div>
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
                        <div style={{ fontSize: '13px', color: 'var(--ink-400)', textAlign: 'center', padding: '12px 0' }}>Create assignments first to send notifications</div>
                      )}
                    </div>
                  </div>

                  {/* Google Calendar — due date events */}
                  <div style={{ background: 'var(--hdr-b-750)', border: '1px solid var(--ink-070)', borderRadius: '16px', padding: '16px', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(91,106,245,0.12)', border: '1px solid rgba(91,106,245,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Calendar size={18} style={{ color: '#5B6AF5' }} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--ink-950)' }}>Google Calendar</div>
                        <div style={{ fontSize: '11px', color: 'var(--ink-400)' }}>Add assignment due dates to your calendar</div>
                      </div>
                    </div>
                    {gs.loadingCalendar ? (
                      <div style={{ textAlign: 'center', padding: '20px' }}>
                        <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: 'var(--ink-400)', margin: '0 auto' }} />
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {teacher.assignments.filter(a => a.due_date).map(a => (
                          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', background: 'var(--ink-030)', borderRadius: '10px' }}>
                            <Calendar size={13} style={{ color: '#5B6AF5', flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '12px', color: 'var(--ink-950)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</div>
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
                          <div style={{ fontSize: '13px', color: 'var(--ink-400)', textAlign: 'center', padding: '12px 0' }}>Assignments with due dates will appear here</div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Google Drive */}
                  <div style={{ background: 'var(--hdr-b-750)', border: '1px solid var(--ink-070)', borderRadius: '16px', padding: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <HardDrive size={18} style={{ color: '#10B981' }} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--ink-950)' }}>Google Drive</div>
                        <div style={{ fontSize: '11px', color: 'var(--ink-400)' }}>Files uploaded to your Drive via Edora</div>
                      </div>
                    </div>
                    {gs.loadingDrive ? (
                      <div style={{ textAlign: 'center', padding: '20px' }}>
                        <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: 'var(--ink-400)', margin: '0 auto' }} />
                      </div>
                    ) : gs.driveFiles.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '20px 12px' }}>
                        <FolderOpen size={28} style={{ color: 'var(--ink-200)', margin: '0 auto 8px' }} />
                        <div style={{ fontSize: '13px', color: 'var(--ink-400)' }}>No files yet. Reports uploaded via Edora appear here.</div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {gs.driveFiles.slice(0, 10).map(f => (
                          <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', background: 'var(--ink-030)', borderRadius: '10px' }}>
                            <FileText size={13} style={{ color: '#10B981', flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '12px', color: 'var(--ink-950)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.drive_file_name}</div>
                              {f.file_size_bytes && <div style={{ fontSize: '10px', color: 'var(--ink-400)' }}>{Math.round(f.file_size_bytes / 1024)} KB</div>}
                            </div>
                            <a href={f.web_view_link} target="_blank" rel="noopener noreferrer" style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '8px', padding: '5px 10px', color: '#10B981', fontSize: '11px', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <ExternalLink size={11} />
                              Open
                            </a>
                            <button onClick={() => gs.deleteDriveFile(f.id)} style={{ background: 'none', border: 'none', color: 'var(--ink-500)', cursor: 'pointer', padding: '0' }}><Trash2 size={14} /></button>
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
              style={{ background: 'var(--hdr-a-880)', border: '1px solid var(--ink-100)', borderBottom: 'none', borderRadius: '20px 20px 0 0', padding: '24px', width: '100%', maxWidth: '480px', maxHeight: '80dvh', overflowY: 'auto' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Video size={20} style={{ color: '#06B6D4' }} />
                  <h3 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--ink-950)' }}>Schedule Meet Session</h3>
                </div>
                <button aria-label="Close" onClick={() => { setShowMeetModal(false); setMeetResult(null); }} style={{ background: 'none', border: 'none', color: 'var(--ink-500)', cursor: 'pointer' }}><X size={20} /></button>
              </div>

              {meetResult ? (
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(6,182,212,0.15)', border: '1px solid rgba(6,182,212,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                    <Video size={26} style={{ color: '#06B6D4' }} />
                  </div>
                  <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ink-950)', marginBottom: '8px' }}>Meet Created!</h3>
                  {meetResult.meet_link && (
                    <div style={{ background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.25)', borderRadius: '12px', padding: '12px', marginBottom: '16px' }}>
                      <div style={{ fontSize: '11px', color: 'var(--ink-400)', marginBottom: '4px' }}>MEET LINK</div>
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
                    <button onClick={() => { setShowMeetModal(false); setMeetResult(null); setMeetForm({ title: '', date: '', startTime: '09:00', endTime: '10:00', attendees: '' }); }} style={{ flex: 1, background: 'linear-gradient(135deg,#5B6AF5,#8B5CF6)', border: 'none', borderRadius: '12px', padding: '12px', color: 'var(--ink-950)', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>
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
                      <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink-500)', display: 'block', marginBottom: '6px' }}>{f.label}</label>
                      <input
                        type={f.type}
                        value={meetForm[f.key as keyof typeof meetForm]}
                        onChange={e => setMeetForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                        placeholder={f.placeholder}
                        style={{ width: '100%', background: 'var(--ink-050)', border: '1.5px solid var(--ink-100)', borderRadius: '10px', color: 'var(--ink-950)', padding: '10px 14px', fontSize: '14px', outline: 'none' }}
                      />
                    </div>
                  ))}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                    {[['START TIME', 'startTime'], ['END TIME', 'endTime']].map(([label, key]) => (
                      <div key={key}>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink-500)', display: 'block', marginBottom: '6px' }}>{label}</label>
                        <input
                          type="time"
                          value={meetForm[key as keyof typeof meetForm]}
                          onChange={e => setMeetForm(prev => ({ ...prev, [key]: e.target.value }))}
                          style={{ width: '100%', background: 'var(--ink-050)', border: '1.5px solid var(--ink-100)', borderRadius: '10px', color: 'var(--ink-950)', padding: '10px 14px', fontSize: '14px', outline: 'none' }}
                        />
                      </div>
                    ))}
                  </div>
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink-500)', display: 'block', marginBottom: '6px' }}>STUDENT EMAILS (OPTIONAL, ONE PER LINE)</label>
                    <textarea
                      value={meetForm.attendees}
                      onChange={e => setMeetForm(prev => ({ ...prev, attendees: e.target.value }))}
                      rows={3}
                      placeholder="student1@school.edu&#10;student2@school.edu"
                      style={{ width: '100%', background: 'var(--ink-050)', border: '1.5px solid var(--ink-100)', borderRadius: '10px', color: 'var(--ink-950)', padding: '10px 14px', fontSize: '13px', outline: 'none', resize: 'none' }}
                    />
                  </div>
                  <button
                    onClick={handleCreateMeet}
                    disabled={gs.loadingCalendar || !meetForm.title || !meetForm.date}
                    style={{ width: '100%', background: 'linear-gradient(135deg,#06B6D4,#0891B2)', border: 'none', borderRadius: '12px', padding: '14px', color: 'var(--ink-950)', fontSize: '15px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: gs.loadingCalendar || !meetForm.title || !meetForm.date ? 0.6 : 1 }}
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
              style={{ background: 'var(--hdr-a-880)', border: '1px solid var(--ink-100)', borderBottom: 'none', borderRadius: '20px 20px 0 0', padding: '24px', width: '100%', maxWidth: '480px', maxHeight: '70dvh', overflowY: 'auto' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Mail size={20} style={{ color: emailAction === 'notify' ? '#EF4444' : '#F59E0B' }} />
                  <h3 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--ink-950)' }}>
                    {emailAction === 'notify' ? 'Notify Students' : 'Send Reminder'}
                  </h3>
                </div>
                <button aria-label="Close" onClick={() => { setShowEmailModal(false); setEmailRecipients(''); setEmailResult(null); }} style={{ background: 'none', border: 'none', color: 'var(--ink-500)', cursor: 'pointer' }}><X size={20} /></button>
              </div>

              {emailResult ? (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <CheckCircle2 size={40} style={{ color: '#34D399', margin: '0 auto 12px' }} />
                  <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--ink-950)', marginBottom: '6px' }}>{emailResult}</div>
                  <div style={{ fontSize: '13px', color: 'var(--ink-500)' }}>Email sent via your Gmail account</div>
                </div>
              ) : (
                <>
                  <div style={{ background: 'var(--ink-040)', borderRadius: '10px', padding: '10px 12px', marginBottom: '16px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--ink-400)', marginBottom: '2px' }}>ASSIGNMENT</div>
                    <div style={{ fontSize: '13px', color: 'var(--ink-950)', fontWeight: 600 }}>
                      {teacher.assignments.find(a => a.id === emailAssignmentId)?.title ?? '—'}
                    </div>
                  </div>
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink-500)', display: 'block', marginBottom: '6px' }}>RECIPIENT EMAILS (ONE PER LINE OR COMMA-SEPARATED)</label>
                    <textarea
                      value={emailRecipients}
                      onChange={e => setEmailRecipients(e.target.value)}
                      rows={4}
                      placeholder="student1@school.edu&#10;student2@school.edu"
                      style={{ width: '100%', background: 'var(--ink-050)', border: '1.5px solid var(--ink-100)', borderRadius: '10px', color: 'var(--ink-950)', padding: '10px 14px', fontSize: '13px', outline: 'none', resize: 'none' }}
                    />
                  </div>
                  <button
                    onClick={handleSendEmail}
                    disabled={emailSending || !emailRecipients.trim()}
                    style={{ width: '100%', background: emailAction === 'notify' ? 'linear-gradient(135deg,#EF4444,#DC2626)' : 'linear-gradient(135deg,#F59E0B,#D97706)', border: 'none', borderRadius: '12px', padding: '14px', color: 'var(--ink-950)', fontSize: '15px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: emailSending || !emailRecipients.trim() ? 0.6 : 1 }}
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

