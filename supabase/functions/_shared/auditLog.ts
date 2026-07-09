// deno-lint-ignore-file no-explicit-any
// Shared admin-action audit logger — writes to public.admin_action_audit.
// Best-effort: a logging failure must never block the action it's recording.
export async function logAdminAction(
  serviceDb: any,
  entry: {
    actorId?: string | null;
    actorRole?: 'user' | 'teacher' | 'service';
    action: string;
    source: string;
    targetId?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await serviceDb.from('admin_action_audit').insert({
      actor_id:   entry.actorId ?? null,
      actor_role: entry.actorRole ?? 'user',
      action:     entry.action,
      source:     entry.source,
      target_id:  entry.targetId ?? null,
      metadata:   entry.metadata ?? {},
    });
  } catch (err) {
    console.error(`[audit] failed to log ${entry.action} from ${entry.source}:`, (err as Error)?.message);
  }
}
