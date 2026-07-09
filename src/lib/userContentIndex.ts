// ═══════════════════════════════════════════════════════════════════════════════
// userContentIndex — client-side trigger for user private RAG index
//
// Called after flashcard/note save to keep user's private index fresh.
// Fire-and-forget: never blocks the save flow.
// ═══════════════════════════════════════════════════════════════════════════════

import { supabase } from '@/lib/supabase';

type SourceType = 'flashcard' | 'study_note' | 'sr_card';

async function getAuthHeader(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? `Bearer ${session.access_token}` : null;
}

// Index a single item immediately after save (called inline)
export async function indexUserItem(sourceType: SourceType, sourceId: string): Promise<void> {
  try {
    const auth = await getAuthHeader();
    if (!auth) return;
    await supabase.functions.invoke('user-content-index', {
      body: { action: 'index_item', source_type: sourceType, source_id: sourceId },
      headers: { Authorization: auth },
    });
  } catch { /* fire-and-forget — never surface errors */ }
}

// Delete a single item from the index (called on flashcard/note delete)
export async function removeUserItem(sourceType: SourceType, sourceId: string): Promise<void> {
  try {
    const auth = await getAuthHeader();
    if (!auth) return;
    await supabase.functions.invoke('user-content-index', {
      body: { action: 'delete', source_type: sourceType, source_id: sourceId },
      headers: { Authorization: auth },
    });
  } catch { /* fire-and-forget */ }
}

// Full reindex — call from Settings "Sync my notes" button
export async function reindexAllUserContent(): Promise<{ indexed: number; embedded: number }> {
  const auth = await getAuthHeader();
  if (!auth) throw new Error('Not authenticated');
  const { data, error } = await supabase.functions.invoke('user-content-index', {
    body:    { action: 'reindex_all' },
    headers: { Authorization: auth },
  });
  if (error) throw error;
  return data as { indexed: number; embedded: number };
}

// Status check — how many items are indexed vs total
export async function getUserIndexStatus(): Promise<{
  flashcards_total: number;
  notes_total:      number;
  indexed_total:    number;
}> {
  const auth = await getAuthHeader();
  if (!auth) return { flashcards_total: 0, notes_total: 0, indexed_total: 0 };
  const { data } = await supabase.functions.invoke('user-content-index', {
    body:    { action: 'status' },
    headers: { Authorization: auth },
  });
  return data ?? { flashcards_total: 0, notes_total: 0, indexed_total: 0 };
}
