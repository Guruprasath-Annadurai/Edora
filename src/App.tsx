import React, { useEffect, useRef, lazy, Suspense } from 'react';
import { AlertTriangle, Lock as LockIcon } from 'lucide-react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { StatusBar, Style } from '@capacitor/status-bar';

import { supabase } from '@/lib/supabase';
import { screenView, identify, resetAnalytics, Events } from '@/lib/analytics';
import { ErrorBoundary, RouteErrorBoundary } from '@/components/ErrorBoundary';
import { AppShell } from '@/components/layout/AppShell';
import { ConnectionGuard } from '@/components/guards/ConnectionGuard';
import { TeacherBroadcastBanner } from '@/components/realtime/TeacherBroadcastBanner';
import { useAuth } from '@/hooks/useAuth';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import DPDPConsentModal from '@/components/consent/DPDPConsentModal';
import { PermissionRationale } from '@/components/ui/PermissionRationale';
import { Bell } from 'lucide-react';
import { useTeacherBroadcast } from '@/hooks/useRealtime';
import { useLocation } from 'react-router-dom';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { usePerformanceTier } from '@/hooks/usePerformanceTier';

// Core shell pages — eager so the first paint after login is instant
import LoginPage              from '@/pages/auth/LoginPage';
import OnboardingPage         from '@/pages/OnboardingPage';
import PrivacyPolicyPage      from '@/pages/PrivacyPolicyPage';
import TermsOfServicePage     from '@/pages/TermsOfServicePage';
import HomePage               from '@/pages/HomePage';
import SprintPage             from '@/pages/SprintPage';
import LearningPage           from '@/pages/LearningPage';
import ToolsPage              from '@/pages/ToolsPage';
import ProfilePage            from '@/pages/ProfilePage';

// Everything else is lazy-loaded — keeps the main bundle small
const ChatPage              = lazy(() => import('@/pages/ChatPage'));
const FlashcardPage         = lazy(() => import('@/pages/FlashcardPage'));
const QuizPage              = lazy(() => import('@/pages/QuizPage'));
const ScannerPage           = lazy(() => import('@/pages/tools/ScannerPage'));
const ExamSimulatorPage     = lazy(() => import('@/pages/tools/ExamSimulatorPage'));
const MistakeJournalPage    = lazy(() => import('@/pages/tools/MistakeJournalPage'));
const StudyNotesPage        = lazy(() => import('@/pages/tools/StudyNotesPage'));
const MnemonicPage          = lazy(() => import('@/pages/tools/MnemonicPage'));
const BrowserPage           = lazy(() => import('@/pages/tools/BrowserPage'));
// StudyPackPage keeps pdfjs-dist out of the initial bundle
const StudyPackPage         = lazy(() => import('@/pages/tools/StudyPackPage'));
const StudyRoomPage         = lazy(() => import('@/pages/StudyRoomPage'));
const NovoInsightsPage      = lazy(() => import('@/pages/NovoInsightsPage'));
const RoadmapPage           = lazy(() => import('@/pages/RoadmapPage'));
const StudyRemindersPage    = lazy(() => import('@/pages/settings/StudyRemindersPage'));
const AccountSettingsPage   = lazy(() => import('@/pages/settings/AccountSettingsPage'));
const ParentDashboardPage   = lazy(() => import('@/pages/settings/ParentDashboardPage'));
const DataRightsPage        = lazy(() => import('@/pages/settings/DataRightsPage'));
const AchievementsPage      = lazy(() => import('@/pages/AchievementsPage'));
const TutoringSessionPage   = lazy(() => import('@/pages/TutoringSessionPage'));
const ConceptMapPage        = lazy(() => import('@/pages/ConceptMapPage'));
const ErrorPatternsPage     = lazy(() => import('@/pages/ErrorPatternsPage'));
const CurriculumPage        = lazy(() => import('@/pages/CurriculumPage'));
const CurriculumDetailPage  = lazy(() => import('@/pages/CurriculumDetailPage'));
const SpacedRepetitionPage  = lazy(() => import('@/pages/SpacedRepetitionPage'));
const LearningStylePage     = lazy(() => import('@/pages/LearningStylePage'));
const SubjectDependencyPage = lazy(() => import('@/pages/SubjectDependencyPage'));
// Tier 6 — Independent AI Tutor Identity
const LessonPlanPage        = lazy(() => import('@/pages/LessonPlanPage'));
const CertificationsPage    = lazy(() => import('@/pages/CertificationsPage'));
const NovoProactivePage     = lazy(() => import('@/pages/NovoProactivePage'));
// Tier 7 — Engagement, Social & Monetization
const StudyGroupsPage        = lazy(() => import('@/pages/StudyGroupsPage'));
const GroupDetailPage        = lazy(() => import('@/pages/GroupDetailPage'));
const AnalyticsDashboardPage = lazy(() => import('@/pages/AnalyticsDashboardPage'));
const EvalDashboardPage      = lazy(() => import('@/pages/EvalDashboardPage'));
const _ProSubscriptionPage    = lazy(() => import('@/pages/ProSubscriptionPage'));
// Tier 3 — Voice & Multimodal (lazy-loaded — heavy canvas/camera/video deps)
const NovoLivePage        = lazy(() => import('@/pages/NovoLivePage'));
const WhiteboardPage      = lazy(() => import('@/pages/WhiteboardPage'));
const PhotoSolverPage     = lazy(() => import('@/pages/PhotoSolverPage'));
const NovoReadsPage       = lazy(() => import('@/pages/NovoReadsPage'));
const VideoCompanionPage  = lazy(() => import('@/pages/VideoCompanionPage'));
// Tier 4 — Gamified & Social (lazy-loaded)
const NovoChallengesPage  = lazy(() => import('@/pages/NovoChallengesPage'));
const DebateModePage      = lazy(() => import('@/pages/DebateModePage'));
const TournamentPage      = lazy(() => import('@/pages/TournamentPage'));
const StoryModePage       = lazy(() => import('@/pages/StoryModePage'));
const StreakChallengePage  = lazy(() => import('@/pages/StreakChallengePage'));
// Tier 5 — Analytics & Reporting (lazy-loaded)
const ExamPredictionPage  = lazy(() => import('@/pages/ExamPredictionPage'));
const AttentionHeatmapPage = lazy(() => import('@/pages/AttentionHeatmapPage'));
const ConfidenceScorePage  = lazy(() => import('@/pages/ConfidenceScorePage'));
const TeacherExportPage    = lazy(() => import('@/pages/TeacherExportPage'));
// Enterprise Feature Pack
const WeaknessRadarPage   = lazy(() => import('@/pages/WeaknessRadarPage'));
// Enterprise Pack 2 — NCERT · PYQ · Mock Tests · Concept Videos · AI Questions
const PYQBankPage         = lazy(() => import('@/pages/PYQBankPage'));
const MockTestPage        = lazy(() => import('@/pages/MockTestPage'));
const UPSCMainsPage       = lazy(() => import('@/pages/UPSCMainsPage'));
const ConceptVideosPage   = lazy(() => import('@/pages/ConceptVideosPage'));
const NCERTChaptersPage   = lazy(() => import('@/pages/NCERTChaptersPage'));
const AIQuizBankPage      = lazy(() => import('@/pages/AIQuizBankPage'));
// Habit Architecture
const DailyPowerSessionPage = lazy(() => import('@/pages/DailyPowerSessionPage'));
const SleepReviewPage       = lazy(() => import('@/pages/SleepReviewPage'));
// Content Moat — Deep reference & regional
const FormulaSheetPage      = lazy(() => import('@/pages/FormulaSheetPage'));
const RevisionPlannerPage   = lazy(() => import('@/pages/RevisionPlannerPage'));
const ConceptReelsPage      = lazy(() => import('@/pages/ConceptReelsPage'));
const SolvedExamplesPage    = lazy(() => import('@/pages/SolvedExamplesPage'));
const NcertDeepPage         = lazy(() => import('@/pages/NcertDeepPage'));
const RegionalLanguagePage  = lazy(() => import('@/pages/RegionalLanguagePage'));
// Social & Competitive Pack
const LeaderboardPage     = lazy(() => import('@/pages/LeaderboardPage'));
const BattlePage          = lazy(() => import('@/pages/BattlePage'));
const StudyCirclePage     = lazy(() => import('@/pages/StudyCirclePage'));
const AchievementFeedPage = lazy(() => import('@/pages/AchievementFeedPage'));
// Network Effects Pack
const FriendsPage           = lazy(() => import('@/pages/FriendsPage'));
const ReferralPage          = lazy(() => import('@/pages/ReferralPage'));
const StudyBuddyPage        = lazy(() => import('@/pages/StudyBuddyPage'));
const SchoolLeaderboardPage = lazy(() => import('@/pages/SchoolLeaderboardPage'));
const LiveEventPage         = lazy(() => import('@/pages/LiveEventPage'));
// Tier 3 B2B — Google Classroom + School Dashboards
const SchoolAdminPage        = lazy(() => import('@/pages/SchoolAdminPage'));
const TeacherDashboardPage   = lazy(() => import('@/pages/teacher/TeacherDashboardPage'));
const AdminConsolePage       = lazy(() => import('@/pages/admin/AdminConsolePage'));
const ClassroomCallbackPage  = lazy(() => import('@/pages/auth/ClassroomCallbackPage'));
// Phase 2 — Core Features
const ExamWarRoomPage    = lazy(() => import('@/pages/ExamWarRoomPage'));
const BossFightPage      = lazy(() => import('@/pages/BossFightPage'));
const RankPredictorPage  = lazy(() => import('@/pages/RankPredictorPage'));
const MockPostmortemPage = lazy(() => import('@/pages/MockPostmortemPage'));
const StudyDNAPage       = lazy(() => import('@/pages/StudyDNAPage'));
// Phase 3 — Viral & Social
const LiveStudyRoomsPage  = lazy(() => import('@/pages/LiveStudyRoomsPage'));
const PeerExplanationPage = lazy(() => import('@/pages/PeerExplanationPage'));
const DoubtRoomPage       = lazy(() => import('@/pages/DoubtRoomPage'));
const FormulaARPage       = lazy(() => import('@/pages/FormulaARPage'));
// Phase 4 — Platform Expansion
const ParentPortalPage    = lazy(() => import('@/pages/ParentPortalPage'));
const OfflineModePage     = lazy(() => import('@/pages/OfflineModePage'));
// v3.5.0 — Corporate Course System
const CoursePage          = lazy(() => import('@/pages/CoursePage'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60 * 5, gcTime: 1000 * 60 * 60 * 24, networkMode: 'offlineFirst', retry: 1 },
  },
});

// ── OAuth deep-link handler ───────────────────────────────────────────────────
// Handles two deep-link patterns:
//   com.edora.app://auth/callback           → Supabase login (PKCE)
//   com.edora.app://auth/classroom/callback → Google Classroom OAuth
function useOAuthDeepLink() {
  // useNavigate() requires being inside <BrowserRouter> — hoisted via ref
  const navigateRef = useRef<((path: string) => void) | null>(null);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const listener = CapApp.addListener('appUrlOpen', async ({ url }) => {
      await Browser.close().catch(() => {});

      // ── Google Classroom OAuth callback ──────────────────────────────────
      if (url.includes('auth/classroom/callback')) {
        const parsed = new URL(url);
        const code   = parsed.searchParams.get('code');
        const state  = parsed.searchParams.get('state');
        const err    = parsed.searchParams.get('error');
        const target = `/auth/classroom/callback?code=${code ?? ''}&state=${state ?? ''}&error=${err ?? ''}`;
        navigateRef.current?.(target);
        return;
      }

      // ── Supabase PKCE login callback ──────────────────────────────────────
      if (url.includes('auth/callback')) {
        const { error } = await supabase.auth.exchangeCodeForSession(url);
        if (error) {
          console.error('[OAuth] exchangeCodeForSession failed:', error.message);
          return;
        }
        // Session is live at this point, but nothing here navigates away from
        // whatever screen the app resumed on (often still /login) — the app
        // was relying entirely on the /login route's own inline redirect
        // reacting to the user state change, which real Google sign-ins
        // showed isn't reliable after returning from a native deep link.
        // Navigate explicitly, same as the Classroom OAuth branch above.
        // AuthGuard already redirects on to /onboarding if there's no
        // profile yet, so /home is a safe target for brand-new users too.
        navigateRef.current?.('/home');
      }
    });

    return () => { listener.then(l => l.remove()); };
  }, []);

  return navigateRef;
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, profileLoading, profileError, refetchProfile } = useAuth();

  if (loading || profileLoading) return (
    <div className="flex flex-col items-center justify-center h-full gap-4 bg-gradient-page">
      <div className="w-12 h-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
      <p className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--ink-300)' }}>
        Loading…
      </p>
    </div>
  );

  if (!user) return <Navigate to="/login" replace />;

  // Profile fetch failed (network/DB error) — show retry instead of infinite redirect
  if (profileError) return (
    <div className="flex flex-col items-center justify-center h-full bg-gradient-page px-8 gap-6">
      <div className="w-16 h-16 rounded-3xl flex items-center justify-center"
        style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)' }}>
        <AlertTriangle size={30} style={{ color: '#F87171' }} strokeWidth={1.75} />
      </div>
      <div className="text-center">
        <h2 className="font-heading text-xl font-bold text-white mb-2">Connection Error</h2>
        <p className="text-sm" style={{ color: 'var(--ink-450)' }}>Could not load your profile. Check your internet and try again.</p>
      </div>
      <button onClick={() => refetchProfile()}
        className="px-6 py-3 rounded-2xl text-sm font-semibold text-white"
        style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}>
        Retry
      </button>
    </div>
  );

  if (!profile) return <Navigate to="/onboarding" replace />;

  // DPDP Act 2023: show consent modal for users who haven't consented yet
  // (new users, or after a policy version update)
  if (!profile.dpdp_consent_at) {
    return <DPDPConsentModal userId={user.id} onAccepted={() => refetchProfile()} />;
  }

  return <>{children}</>;
}

// Registers push notifications and wires up analytics identity once authenticated
function PushNotificationsSetup() {
  const { showRationale, onRationaleAllow, onRationaleDeny } = usePushNotifications();
  const { user, profile } = useAuth();

  useEffect(() => {
    if (user) identify(user.id, { email: user.email, name: profile?.full_name ?? undefined });
    else resetAnalytics();
  }, [user, profile]);

  return (
    <PermissionRationale
      open={showRationale}
      icon={<Bell size={28} className="text-white" />}
      title="Stay on top of your studies"
      description="Edora sends one daily reminder at your preferred study time. No spam — just a nudge to keep your streak alive."
      allowLabel="Allow notifications"
      denyLabel="Not now"
      onAllow={onRationaleAllow}
      onDeny={onRationaleDeny}
    />
  );
}

// Tracks screen views whenever the route changes
function ScreenTracker() {
  const location = useLocation();
  useEffect(() => { screenView(location.pathname); }, [location.pathname]);
  return null;
}

// Shows a modal when the session token expires (refresh token exhausted after ~7 days)
function SessionExpiredModal() {
  const { sessionExpired, clearSessionExpired } = useAuth();
  if (!sessionExpired) return null;
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 px-6">
      <div className="rounded-3xl p-6 w-full max-w-xs flex flex-col items-center gap-4 text-center"
        style={{ background: 'var(--surface-scrim)', border: '1px solid var(--ink-080)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
          style={{ background: 'rgba(91,106,245,0.15)', border: '1px solid rgba(91,106,245,0.3)' }}>
          <LockIcon size={26} style={{ color: '#A0AEFF' }} strokeWidth={1.75} />
        </div>
        <div>
          <h3 className="font-heading text-lg font-bold text-white mb-1">Session Expired</h3>
          <p className="text-sm" style={{ color: 'var(--ink-450)' }}>Your session has expired. Please sign in again to continue.</p>
        </div>
        <button
          onClick={() => { clearSessionExpired(); window.location.href = '/login'; }}
          className="w-full py-3 rounded-2xl text-sm font-semibold text-white"
          style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}>
          Sign In Again
        </button>
      </div>
    </div>
  );
}

function AppRoutes({ deepLinkNavigateRef }: { deepLinkNavigateRef: { current: ((path: string) => void) | null } }) {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  // Preload home data eagerly on auth so the HomePage paints without a second network trip
  useEffect(() => {
    if (!user || !profile) return;
    // Fire-and-forget prefetch — TanStack Query caches the result
    queryClient.prefetchQuery({
      queryKey: ['home-feed', user.id],
      queryFn: async () => {
        const r = await supabase.from('sprint_sessions')
          .select('id, status, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1);
        return r.data;
      },
      staleTime: 1000 * 60 * 5,
    });
    // Track app open on first auth
    Events.appOpened({ source: 'cold_start' });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Teacher broadcast — only in classroom contexts (profile.classroom_id if set)
  const classroomId = (profile as Record<string, unknown> | null)?.classroom_id as string | null ?? null;
  const { message: broadcastMsg, dismiss: dismissBroadcast } = useTeacherBroadcast(classroomId);

  // Wire up deep-link navigate once we're inside BrowserRouter
  useEffect(() => {
    deepLinkNavigateRef.current = navigate;
  }, [navigate, deepLinkNavigateRef]);

  return (
    <>
      <ScreenTracker />
      <SessionExpiredModal />
      {user && <PushNotificationsSetup />}
      <TeacherBroadcastBanner message={broadcastMsg} onDismiss={dismissBroadcast} />
      <Suspense fallback={
        <div className="flex items-center justify-center h-full min-h-[40vh]">
          <div className="w-8 h-8 rounded-full border-[3px] border-primary/20 border-t-primary animate-spin" />
        </div>
      }>
      <Routes>
        <Route path="/login"          element={user ? <Navigate to={profile ? '/home' : '/onboarding'} replace /> : <LoginPage />} />
        <Route path="/onboarding"     element={!user ? <Navigate to="/login" replace /> : <OnboardingPage />} />
        <Route path="/privacy-policy"   element={<PrivacyPolicyPage />} />
        <Route path="/terms-of-service" element={<TermsOfServicePage />} />

        {/* All protected routes share the AppShell (tab bar) */}
        <Route element={<AuthGuard><AppShell /></AuthGuard>}>
          <Route path="/home"      element={<RouteErrorBoundary label="home"><HomePage /></RouteErrorBoundary>} />
          <Route path="/sprint"    element={<RouteErrorBoundary label="sprint"><SprintPage /></RouteErrorBoundary>} />
          <Route path="/learning"  element={<RouteErrorBoundary label="learning"><LearningPage /></RouteErrorBoundary>} />
          <Route path="/tools"     element={<RouteErrorBoundary label="tools"><ToolsPage /></RouteErrorBoundary>} />
          <Route path="/profile"   element={<RouteErrorBoundary label="profile"><ProfilePage /></RouteErrorBoundary>} />
          <Route path="/chat"      element={<RouteErrorBoundary label="chat"><ChatPage /></RouteErrorBoundary>} />
          <Route path="/flashcard" element={<RouteErrorBoundary label="flashcard"><FlashcardPage /></RouteErrorBoundary>} />
          <Route path="/quiz"      element={<RouteErrorBoundary label="quiz"><QuizPage /></RouteErrorBoundary>} />

          {/* Tool sub-pages */}
          <Route path="/scanner"        element={<RouteErrorBoundary label="scanner"><ScannerPage /></RouteErrorBoundary>} />
          <Route path="/exam-simulator" element={<RouteErrorBoundary label="exam-simulator"><ExamSimulatorPage /></RouteErrorBoundary>} />
          <Route path="/journal"        element={<RouteErrorBoundary label="journal"><MistakeJournalPage /></RouteErrorBoundary>} />
          <Route path="/notes"          element={<RouteErrorBoundary label="notes"><StudyNotesPage /></RouteErrorBoundary>} />
          <Route path="/mnemonics"      element={<RouteErrorBoundary label="mnemonics"><MnemonicPage /></RouteErrorBoundary>} />
          <Route path="/browser"        element={<RouteErrorBoundary label="browser"><BrowserPage /></RouteErrorBoundary>} />
          <Route path="/study-rooms"    element={<RouteErrorBoundary label="study-rooms"><StudyRoomPage /></RouteErrorBoundary>} />
          <Route path="/tutoring"            element={<RouteErrorBoundary label="tutoring"><TutoringSessionPage /></RouteErrorBoundary>} />
          <Route path="/concept-map"         element={<RouteErrorBoundary label="concept-map"><ConceptMapPage /></RouteErrorBoundary>} />
          <Route path="/error-patterns"      element={<RouteErrorBoundary label="error-patterns"><ErrorPatternsPage /></RouteErrorBoundary>} />
          {/* Tier 2 — Personalised Learning Paths */}
          <Route path="/curriculum"          element={<RouteErrorBoundary label="curriculum"><CurriculumPage /></RouteErrorBoundary>} />
          <Route path="/curriculum/:boardCode/:subject" element={<RouteErrorBoundary label="curriculum-detail"><CurriculumDetailPage /></RouteErrorBoundary>} />
          <Route path="/spaced-review"       element={<RouteErrorBoundary label="spaced-review"><SpacedRepetitionPage /></RouteErrorBoundary>} />
          <Route path="/learning-style"      element={<RouteErrorBoundary label="learning-style"><LearningStylePage /></RouteErrorBoundary>} />
          <Route path="/subject-map"         element={<RouteErrorBoundary label="subject-map"><SubjectDependencyPage /></RouteErrorBoundary>} />
          {/* Tier 3 — Voice & Multimodal */}
          <Route path="/novo-live"           element={<RouteErrorBoundary label="novo-live"><NovoLivePage /></RouteErrorBoundary>} />
          <Route path="/whiteboard"          element={<RouteErrorBoundary label="whiteboard"><WhiteboardPage /></RouteErrorBoundary>} />
          <Route path="/photo-solver"        element={<RouteErrorBoundary label="photo-solver"><PhotoSolverPage /></RouteErrorBoundary>} />
          <Route path="/novo-reads"          element={<RouteErrorBoundary label="novo-reads"><NovoReadsPage /></RouteErrorBoundary>} />
          <Route path="/video-companion"     element={<RouteErrorBoundary label="video-companion"><VideoCompanionPage /></RouteErrorBoundary>} />
          {/* Tier 5 — Analytics & Reporting */}
          <Route path="/exam-prediction"   element={<RouteErrorBoundary label="exam-prediction"><ExamPredictionPage /></RouteErrorBoundary>} />
          <Route path="/attention-heatmap" element={<RouteErrorBoundary label="attention-heatmap"><AttentionHeatmapPage /></RouteErrorBoundary>} />
          <Route path="/confidence"        element={<RouteErrorBoundary label="confidence"><ConfidenceScorePage /></RouteErrorBoundary>} />
          <Route path="/teacher-export"    element={<RouteErrorBoundary label="teacher-export"><TeacherExportPage /></RouteErrorBoundary>} />
          <Route path="/weakness-radar"   element={<RouteErrorBoundary label="weakness-radar"><WeaknessRadarPage /></RouteErrorBoundary>} />
          <Route path="/pyq-bank"        element={<RouteErrorBoundary label="pyq-bank"><PYQBankPage /></RouteErrorBoundary>} />
          <Route path="/mock-test"       element={<RouteErrorBoundary label="mock-test"><MockTestPage /></RouteErrorBoundary>} />
          <Route path="/upsc-mains"      element={<RouteErrorBoundary label="upsc-mains"><UPSCMainsPage /></RouteErrorBoundary>} />
          <Route path="/concept-videos"  element={<RouteErrorBoundary label="concept-videos"><ConceptVideosPage /></RouteErrorBoundary>} />
          <Route path="/ncert-chapters"  element={<RouteErrorBoundary label="ncert-chapters"><NCERTChaptersPage /></RouteErrorBoundary>} />
          <Route path="/ai-quiz"         element={<RouteErrorBoundary label="ai-quiz"><AIQuizBankPage /></RouteErrorBoundary>} />
          {/* Tier 4 — Gamified & Social */}
          <Route path="/daily-session" element={<RouteErrorBoundary label="daily-session"><DailyPowerSessionPage /></RouteErrorBoundary>} />
          <Route path="/sleep-review"  element={<RouteErrorBoundary label="sleep-review"><SleepReviewPage /></RouteErrorBoundary>} />
          {/* Content Moat */}
          <Route path="/formulas"       element={<RouteErrorBoundary label="formulas"><FormulaSheetPage /></RouteErrorBoundary>} />
          <Route path="/planner"        element={<RouteErrorBoundary label="planner"><RevisionPlannerPage /></RouteErrorBoundary>} />
          <Route path="/reels"          element={<RouteErrorBoundary label="reels"><ConceptReelsPage /></RouteErrorBoundary>} />
          <Route path="/solved"         element={<RouteErrorBoundary label="solved"><SolvedExamplesPage /></RouteErrorBoundary>} />
          <Route path="/ncert-deep"     element={<RouteErrorBoundary label="ncert-deep"><NcertDeepPage /></RouteErrorBoundary>} />
          <Route path="/languages"      element={<RouteErrorBoundary label="languages"><RegionalLanguagePage /></RouteErrorBoundary>} />
          <Route path="/challenges"    element={<RouteErrorBoundary label="challenges"><NovoChallengesPage /></RouteErrorBoundary>} />
          <Route path="/debate"        element={<RouteErrorBoundary label="debate"><DebateModePage /></RouteErrorBoundary>} />
          <Route path="/tournament"    element={<RouteErrorBoundary label="tournament"><TournamentPage /></RouteErrorBoundary>} />
          <Route path="/story-mode"    element={<RouteErrorBoundary label="story-mode"><StoryModePage /></RouteErrorBoundary>} />
          <Route path="/streaks"       element={<RouteErrorBoundary label="streaks"><StreakChallengePage /></RouteErrorBoundary>} />
          <Route path="/novo-insights" element={<RouteErrorBoundary label="novo-insights"><NovoInsightsPage /></RouteErrorBoundary>} />
          <Route path="/roadmap"      element={<RouteErrorBoundary label="roadmap"><RoadmapPage /></RouteErrorBoundary>} />
          <Route path="/study-pack"    element={
            <RouteErrorBoundary label="study-pack">
              <Suspense fallback={
                <div className="flex items-center justify-center h-full">
                  <div className="w-6 h-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                </div>
              }>
                <StudyPackPage />
              </Suspense>
            </RouteErrorBoundary>
          } />

          {/* Phase 2 — Core Features */}
          <Route path="/exam-war-room"    element={<RouteErrorBoundary label="exam-war-room"><ExamWarRoomPage /></RouteErrorBoundary>} />
          <Route path="/boss-fight"       element={<RouteErrorBoundary label="boss-fight"><BossFightPage /></RouteErrorBoundary>} />
          <Route path="/rank-predictor"   element={<RouteErrorBoundary label="rank-predictor"><RankPredictorPage /></RouteErrorBoundary>} />
          <Route path="/mock-postmortem"  element={<RouteErrorBoundary label="mock-postmortem"><MockPostmortemPage /></RouteErrorBoundary>} />
          <Route path="/study-dna"        element={<RouteErrorBoundary label="study-dna"><StudyDNAPage /></RouteErrorBoundary>} />

          {/* Phase 3 — Viral & Social */}
          <Route path="/live-study-rooms" element={<RouteErrorBoundary label="live-study-rooms"><LiveStudyRoomsPage /></RouteErrorBoundary>} />
          <Route path="/peer-explain"     element={<RouteErrorBoundary label="peer-explain"><PeerExplanationPage /></RouteErrorBoundary>} />
          <Route path="/doubt-room"       element={<RouteErrorBoundary label="doubt-room"><DoubtRoomPage /></RouteErrorBoundary>} />
          <Route path="/formula-ar"       element={<RouteErrorBoundary label="formula-ar"><FormulaARPage /></RouteErrorBoundary>} />

          {/* Phase 4 — Platform Expansion */}
          <Route path="/parent-portal"    element={<RouteErrorBoundary label="parent-portal"><ParentPortalPage /></RouteErrorBoundary>} />
          <Route path="/offline-mode"     element={<RouteErrorBoundary label="offline-mode"><OfflineModePage /></RouteErrorBoundary>} />
          {/* v3.5.0 — Corporate Course System */}
          <Route path="/course"           element={<RouteErrorBoundary label="course"><CoursePage /></RouteErrorBoundary>} />

          {/* Settings sub-pages */}
          <Route path="/reminders"    element={<RouteErrorBoundary label="reminders"><StudyRemindersPage /></RouteErrorBoundary>} />
          <Route path="/account"      element={<RouteErrorBoundary label="account"><AccountSettingsPage /></RouteErrorBoundary>} />
          <Route path="/parent"       element={<RouteErrorBoundary label="parent"><ParentDashboardPage /></RouteErrorBoundary>} />
          <Route path="/data-rights"  element={<RouteErrorBoundary label="data-rights"><DataRightsPage /></RouteErrorBoundary>} />
          <Route path="/achievements" element={<RouteErrorBoundary label="achievements"><AchievementsPage /></RouteErrorBoundary>} />
          {/* Tier 6 — Independent AI Tutor Identity */}
          <Route path="/lesson-plan"    element={<RouteErrorBoundary label="lesson-plan"><LessonPlanPage /></RouteErrorBoundary>} />
          <Route path="/certifications" element={<RouteErrorBoundary label="certifications"><CertificationsPage /></RouteErrorBoundary>} />
          <Route path="/novo-messages"  element={<RouteErrorBoundary label="novo-messages"><NovoProactivePage /></RouteErrorBoundary>} />
          {/* Tier 7 — Engagement, Social & Monetization */}
          <Route path="/study-groups"          element={<RouteErrorBoundary label="study-groups"><StudyGroupsPage /></RouteErrorBoundary>} />
          <Route path="/study-group/:groupId"  element={<RouteErrorBoundary label="study-group-detail"><GroupDetailPage /></RouteErrorBoundary>} />
          <Route path="/leaderboard"    element={<RouteErrorBoundary label="leaderboard"><LeaderboardPage /></RouteErrorBoundary>} />
          <Route path="/battle"         element={<RouteErrorBoundary label="battle"><BattlePage /></RouteErrorBoundary>} />
          <Route path="/circles"        element={<RouteErrorBoundary label="circles"><StudyCirclePage /></RouteErrorBoundary>} />
          <Route path="/feed"           element={<RouteErrorBoundary label="feed"><AchievementFeedPage /></RouteErrorBoundary>} />
          <Route path="/friends"        element={<RouteErrorBoundary label="friends"><FriendsPage /></RouteErrorBoundary>} />
          <Route path="/study-buddy"    element={<RouteErrorBoundary label="study-buddy"><StudyBuddyPage /></RouteErrorBoundary>} />
          <Route path="/live-event"     element={<RouteErrorBoundary label="live-event"><LiveEventPage /></RouteErrorBoundary>} />
          <Route path="/analytics"             element={<RouteErrorBoundary label="analytics"><AnalyticsDashboardPage /></RouteErrorBoundary>} />
          <Route path="/eval"                  element={<RouteErrorBoundary label="eval"><EvalDashboardPage /></RouteErrorBoundary>} />
          <Route path="/referral"              element={<RouteErrorBoundary label="referral"><ReferralPage /></RouteErrorBoundary>} />
          <Route path="/school-admin"          element={<RouteErrorBoundary label="school-admin"><SchoolAdminPage /></RouteErrorBoundary>} />
          <Route path="/pro"                   element={<Navigate to="/profile" replace />} />
        </Route>

        {/* Tier 3 B2B — Teacher dashboard (full-screen, inside auth, outside AppShell) */}
        <Route path="/teacher" element={
          <AuthGuard>
            <RouteErrorBoundary label="teacher">
              <Suspense fallback={<div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100dvh',background:'var(--page-bg-start)'}}><div style={{width:'32px',height:'32px',borderRadius:'50%',border:'3px solid #5B6AF5',borderTopColor:'transparent',animation:'spin 0.8s linear infinite'}}/></div>}>
                <TeacherDashboardPage />
              </Suspense>
            </RouteErrorBoundary>
          </AuthGuard>
        } />

        {/* Staff-only admin console — server-side gated by has_role(uid,'admin') */}
        <Route path="/admin" element={
          <AuthGuard>
            <RouteErrorBoundary label="admin">
              <Suspense fallback={<div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100dvh',background:'var(--page-bg-start)'}}><div style={{width:'32px',height:'32px',borderRadius:'50%',border:'3px solid #5B6AF5',borderTopColor:'transparent',animation:'spin 0.8s linear infinite'}}/></div>}>
                <AdminConsolePage />
              </Suspense>
            </RouteErrorBoundary>
          </AuthGuard>
        } />

        {/* Google Classroom OAuth2 callback — outside AppShell, auth required */}
        <Route path="/auth/classroom/callback" element={
          <AuthGuard>
            <RouteErrorBoundary label="classroom-callback">
              <Suspense fallback={<div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100dvh',background:'var(--page-bg-start)'}}/>}>
                <ClassroomCallbackPage />
              </Suspense>
            </RouteErrorBoundary>
          </AuthGuard>
        } />

        {/* Public school leaderboard — no auth required, shareable link */}
        <Route path="/school/:schoolName" element={
          <RouteErrorBoundary label="school-leaderboard">
            <Suspense fallback={<div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100dvh',background:'var(--page-bg-start)'}}/>}>
              <SchoolLeaderboardPage />
            </Suspense>
          </RouteErrorBoundary>
        } />

        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
      </Suspense>
    </>
  );
}

export default function App() {
  const deepLinkNavigateRef = useOAuthDeepLink();
  usePerformanceTier();
  const { profile } = useAuth();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    // Light icons (white) on the dark deep-space background
    StatusBar.setStyle({ style: Style.Light });
    StatusBar.setBackgroundColor({ color: '#060918' });
  }, []);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider isPro={profile?.is_pro ?? false}>
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <ConnectionGuard>
              <AppRoutes deepLinkNavigateRef={deepLinkNavigateRef} />
            </ConnectionGuard>
          </BrowserRouter>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
