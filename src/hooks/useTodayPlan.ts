import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useAppFlags } from '@/hooks/useAppFlags';
import { validatePlanRows, filterPlanByFlags, buildFallbackPlan, type TodayPlanItem } from '@/lib/todayPlan';

// Today's Plan for the signed-in learner. ONE database call (`get_today_plan`), no Edge Function, no AI, no
// client-side ranking: the database decides what appears and in what order. Cached with TanStack Query (no
// polling, no refetch on focus/reconnect/remount); call `refetch()` for an explicit refresh.

export const TODAY_PLAN_STALE_MS = 5 * 60 * 1000;
export const TODAY_PLAN_TIMEOUT_MS = 8000;
export const todayPlanKey = (userId: string | undefined) => ['today-plan', userId ?? 'anon'] as const;

async function fetchTodayPlan() {
  const call = supabase.rpc('get_today_plan');
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error('get_today_plan timed out')), TODAY_PLAN_TIMEOUT_MS); });
  try {
    const { data, error } = await Promise.race([call, timeout]);
    if (error) throw error;
    return validatePlanRows(data);          // malformed rows are dropped here; the cache only ever holds valid rows
  } finally { if (timer) clearTimeout(timer); }
}

export interface UseTodayPlanResult {
  items: TodayPlanItem[];
  isLoading: boolean;
  isFallback: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
}

export function useTodayPlan(): UseTodayPlanResult {
  const { user } = useAuth();
  const flags = useAppFlags();
  const novo = flags.novo_enabled === true;
  const pyq = flags.pyq_enabled === true;

  const q = useQuery({
    queryKey: todayPlanKey(user?.id),
    queryFn: fetchTodayPlan,
    enabled: !!user,
    staleTime: TODAY_PLAN_STALE_MS,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: false,
    retry: false,                     // failure -> deterministic fallback immediately; refetch() retries explicitly
    networkMode: 'always',            // offline must fail fast into the fallback, not pause forever
  });

  return useMemo(() => {
    const isLoading = !!user && q.isPending;
    if (isLoading) return { items: [], isLoading: true, isFallback: false, error: null, refetch: q.refetch };
    const filtered = q.data ? filterPlanByFlags(q.data, { novo_enabled: novo, pyq_enabled: pyq }) : [];
    if (filtered.length > 0) return { items: filtered, isLoading: false, isFallback: false, error: null, refetch: q.refetch };
    return {
      items: buildFallbackPlan({ novo_enabled: novo }),
      isLoading: false, isFallback: true,
      error: (q.error as Error | null) ?? null,
      refetch: q.refetch,
    };
  }, [user, q.isPending, q.data, q.error, q.refetch, novo, pyq]);
}
