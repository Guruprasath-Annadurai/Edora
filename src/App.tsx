import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Capacitor } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';

import { AppShell } from '@/components/layout/AppShell';
import { ConnectionGuard } from '@/components/guards/ConnectionGuard';
import { useAuth } from '@/hooks/useAuth';

import LoginPage      from '@/pages/auth/LoginPage';
import OnboardingPage from '@/pages/OnboardingPage';
import HomePage       from '@/pages/HomePage';
import SprintPage     from '@/pages/SprintPage';
import ChatPage       from '@/pages/ChatPage';
import FlashcardPage  from '@/pages/FlashcardPage';
import QuizPage       from '@/pages/QuizPage';
import LearningPage   from '@/pages/LearningPage';
import ToolsPage      from '@/pages/ToolsPage';
import ProfilePage    from '@/pages/ProfilePage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60 * 5, gcTime: 1000 * 60 * 60 * 24, networkMode: 'offlineFirst', retry: 1 },
  },
});

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();
  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-background">
      <div className="w-12 h-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  if (!profile) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { user, profile } = useAuth();
  return (
    <Routes>
      <Route path="/login"      element={user ? <Navigate to={profile ? '/home' : '/onboarding'} replace /> : <LoginPage />} />
      <Route path="/onboarding" element={!user ? <Navigate to="/login" replace /> : <OnboardingPage />} />
      <Route element={<AuthGuard><AppShell /></AuthGuard>}>
        <Route path="/home"      element={<HomePage />} />
        <Route path="/sprint"    element={<SprintPage />} />
        <Route path="/learning"  element={<LearningPage />} />
        <Route path="/tools"     element={<ToolsPage />} />
        <Route path="/profile"   element={<ProfilePage />} />
        <Route path="/chat"      element={<ChatPage />} />
        <Route path="/flashcard" element={<FlashcardPage />} />
        <Route path="/quiz"      element={<QuizPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  );
}

export default function App() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    StatusBar.setStyle({ style: Style.Dark });
    StatusBar.setBackgroundColor({ color: '#0F172A' });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ConnectionGuard>
          <AppRoutes />
        </ConnectionGuard>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
