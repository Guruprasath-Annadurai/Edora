import { useState, useEffect } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { Profile } from '@/types';

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null, session: null, profile: null, loading: true,
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setState(prev => ({ ...prev, user: session?.user ?? null, session, loading: false }));
      if (session?.user) fetchProfile(session.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setState(prev => ({ ...prev, user: session?.user ?? null, session, loading: false }));
      if (session?.user) fetchProfile(session.user.id);
      else setState(prev => ({ ...prev, profile: null }));
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchProfile(userId: string): Promise<Profile | null> {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (data) setState(prev => ({ ...prev, profile: data as Profile }));
    return (data as Profile) ?? null;
  }

  // Explicitly re-queries the DB and updates state — safe to await in components
  async function refetchProfile(): Promise<Profile | null> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return null;
    return fetchProfile(session.user.id);
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return { ...state, signOut, refetchProfile };
}
