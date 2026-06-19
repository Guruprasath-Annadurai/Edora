import { useEffect, useState, useCallback } from 'react';
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

export function useNovoMemory(): UseNovoMemoryReturn {
  const [memories, setMemories]   = useState<NovoMemory[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [totalCount, setTotal]    = useState(0);
  const [filter, setFilter]       = useState<MemoryFilter>({});

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

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

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setMemories((data as NovoMemory[]) ?? []);
      setTotal(count ?? 0);
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => { fetch(); }, [fetch]);

  const deleteMemory = useCallback(async (id: string) => {
    const { error: delErr } = await supabase
      .from('novo_memories')
      .delete()
      .eq('id', id);
    if (delErr) throw new Error(delErr.message);
    setMemories((prev) => prev.filter((m) => m.id !== id));
    setTotal((t) => Math.max(0, t - 1));
  }, []);

  const deleteAll = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error: delErr } = await supabase
      .from('novo_memories')
      .delete()
      .eq('user_id', user.id);
    if (delErr) throw new Error(delErr.message);
    setMemories([]);
    setTotal(0);
  }, []);

  return {
    memories,
    loading,
    error,
    totalCount,
    filter,
    setFilter,
    deleteMemory,
    deleteAll,
    refresh: fetch,
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
