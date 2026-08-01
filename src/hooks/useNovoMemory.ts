import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface NovoMemory {
  id: string;
  memory_type: 'learning_pattern' | 'academic_goal' | 'personal_fact' | 'emotion' | 'achievement' | 'fact';
  content: string;
  subject: string | null;
  topic: string | null;
  importance: number;
  source: string | null;
  last_used_at: string | null;
  created_at: string;
}

export type MemoryFilter = {
  memory_type?: NovoMemory['memory_type'];
  subject?: string;
};

interface UseNovoMemoryReturn {
  memories: NovoMemory[];
  loading: boolean;
  error: string | null;
  totalCount: number;
  filter: MemoryFilter;
  setFilter: (f: MemoryFilter) => void;
  deleteMemory: (id: string) => Promise<void>;
  deleteAll: () => Promise<void>;
  refresh: () => Promise<void>;
}

const PAGE_SIZE = 50;

interface MemoryQueryResult { memories: NovoMemory[]; totalCount: number }

async function fetchMemories(filter: MemoryFilter): Promise<MemoryQueryResult> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { memories: [], totalCount: 0 };

  let query = supabase
    .from('novo_memories')
    .select('*', { count: 'exact' })
    .eq('user_id', user.id)
    .order('importance', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE);

  if (filter.memory_type) query = query.eq('memory_type', filter.memory_type);
  if (filter.subject)     query = query.eq('subject', filter.subject);

  const { data, error: fetchError, count } = await query;
  if (fetchError) throw new Error(fetchError.message);
  return { memories: (data as NovoMemory[]) ?? [], totalCount: count ?? 0 };
}

// Previously a raw useEffect+useState fetch, refetching from scratch on
// every mount/filter change with no cache. Now backed by TanStack Query.
export function useNovoMemory(): UseNovoMemoryReturn {
  const [filter, setFilter] = useState<MemoryFilter>({});
  const queryClient = useQueryClient();
  const queryKey = ['novo-memories', filter];

  const { data, isLoading, error, refetch } = useQuery({
    queryKey,
    queryFn: () => fetchMemories(filter),
    staleTime: 1000 * 30,
  });

  const deleteMemory = useCallback(async (id: string) => {
    const { error: delErr } = await supabase
      .from('novo_memories')
      .delete()
      .eq('id', id);
    if (delErr) throw new Error(delErr.message);
    queryClient.setQueryData<MemoryQueryResult>(queryKey, prev => prev && {
      memories: prev.memories.filter(m => m.id !== id),
      totalCount: Math.max(0, prev.totalCount - 1),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, filter]);

  const deleteAll = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error: delErr } = await supabase
      .from('novo_memories')
      .delete()
      .eq('user_id', user.id);
    if (delErr) throw new Error(delErr.message);
    queryClient.setQueryData<MemoryQueryResult>(queryKey, { memories: [], totalCount: 0 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, filter]);

  return {
    memories: data?.memories ?? [],
    loading: isLoading,
    error: error ? (error as Error).message : null,
    totalCount: data?.totalCount ?? 0,
    filter,
    setFilter,
    deleteMemory,
    deleteAll,
    refresh: async () => { await refetch(); },
  };
}

export const MEMORY_TYPE_LABELS: Record<NovoMemory['memory_type'], string> = {
  learning_pattern: 'Learning Pattern',
  academic_goal:    'Academic Goal',
  personal_fact:    'Personal Fact',
  emotion:          'Emotion',
  achievement:      'Achievement',
  fact:             'Fact',
};

export const MEMORY_TYPE_COLORS: Record<NovoMemory['memory_type'], string> = {
  learning_pattern: '#6366f1',
  academic_goal:    '#10b981',
  personal_fact:    '#f59e0b',
  emotion:          '#ec4899',
  achievement:      '#f97316',
  fact:             '#64748b',
};
