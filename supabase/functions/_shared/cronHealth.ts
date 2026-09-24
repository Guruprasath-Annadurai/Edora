// deno-lint-ignore-file no-explicit-any
// Shared cron-health reporter — writes to public.cron_health so
// monitoring-check (and any admin dashboard) can see whether a scheduled
// job actually ran and what it found, without depending on the platform
// log viewer. Synced from production 2026-08-08 (was live but never
// committed to the local repo — see pyq-content-audit/index.ts's header).
export async function reportCronHealth(
  supabase: any,
  jobname: string,
  status: 'success' | 'error' | 'inconclusive',
  summary: Record<string, unknown>,
): Promise<void> {
  try {
    await supabase.from('cron_health').upsert({
      jobname, last_status: status, last_summary: summary, last_run_at: new Date().toISOString(),
    }, { onConflict: 'jobname' });
  } catch {
  }
}
