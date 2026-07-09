// ─────────────────────────────────────────────────────────────────────────────
// vertex-jobs — Vertex AI fine-tuning job manager  [ADMIN ONLY]
//
// Actions:
//   create  — launch a Gemini supervised fine-tuning job  (ADMIN)
//   status  — poll job status (returns RUNNING / SUCCEEDED / FAILED)  (ADMIN)
//   list    — list all tuning jobs for this project  (ADMIN)
//   deploy  — after success, get the tuned model endpoint URL  (ADMIN)
//
// Security:
//   All actions require an authenticated Supabase user with the 'admin' role.
//   Without admin role, every action returns 403 Forbidden.
//   Cron access is supported via x-cron-secret header for automated status polling.
//
// Fine-tuning takes 1–6 hours. Poll status until SUCCEEDED, then call deploy.
//
// Requires secrets:
//   GCP_SERVICE_ACCOUNT_JSON   (Vertex AI User + roles/aiplatform.tuningJobsEditor)
//   GCS_TRAINING_BUCKET        (bucket holding training.jsonl from vertex-export)
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
//   CRON_SECRET                (optional — for automated status polling via cron)
// ─────────────────────────────────────────────────────────────────────────────
import { serve }       from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getGCPToken } from '../_shared/gcp-auth.ts';
import { getCors } from '../_shared/cors.ts';


import { withSentry } from '../_shared/sentry.ts';
import { checkRateLimit } from '../_shared/rateLimit.ts';
const VERTEX_REGION = 'us-central1';
const BASE_MODEL    = 'gemini-1.5-flash-002';
const VERTEX_BASE   = `https://${VERTEX_REGION}-aiplatform.googleapis.com/v1`;
const VERTEX_SCOPES = ['https://www.googleapis.com/auth/cloud-platform'];

// ── Fetch with timeout ────────────────────────────────────────────────────────
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs = 30_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ── Admin role verification ────────────────────────────────────────────────────
async function assertAdmin(
  serviceDb: ReturnType<typeof createClient>,
  userId: string,
): Promise<boolean> {
  const { data } = await serviceDb
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'admin')
    .maybeSingle();
  return !!data;
}

serve(withSentry('vertex-jobs', async (req) => {
  const CORS = getCors(req);
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const cronSecret  = Deno.env.get('CRON_SECRET') ?? '';

  const gcpSaJson = Deno.env.get('GCP_SERVICE_ACCOUNT_JSON');
  const gcsBucket = Deno.env.get('GCS_TRAINING_BUCKET');

  if (!gcpSaJson) return json({ error: 'GCP_SERVICE_ACCOUNT_JSON secret required' }, 500);

  const serviceDb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // ── Authentication ─────────────────────────────────────────────────────────
  // Allow cron-based automated status polling via shared secret
  const incomingCronSecret = req.headers.get('x-cron-secret') ?? '';
  const isCron = cronSecret && incomingCronSecret === cronSecret;

  let callerIsAdmin = false;

  if (isCron) {
    // Cron is trusted for read-only actions (list, status) only
    // No per-user rate limit — internal/cron-triggered only
    callerIsAdmin = true;
  } else {
    // All other callers must provide a valid Supabase JWT
    const userDb = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });

    const { data: { user }, error: authErr } = await userDb.auth.getUser();
    if (authErr || !user) {
      return json({ error: 'Unauthorized. This endpoint requires authentication.' }, 401);
    }

    // Verify admin role — no non-admin user should ever reach Vertex AI
    callerIsAdmin = await assertAdmin(serviceDb, user.id);
    if (!callerIsAdmin) {
      // Log the attempt for security audit
      console.warn(`[vertex-jobs] Non-admin access attempt by user ${user.id} at ${new Date().toISOString()}`);
      return json({
        error: 'Forbidden. Vertex AI fine-tuning requires the admin role.',
        hint:  'Contact your system administrator to request access.',
      }, 403);
    }

    const rl = await checkRateLimit(serviceDb, user.id, 'vertex_jobs', 25, 60);
    if (!rl.allowed) return json({ error: 'Too many requests. Try again later.', retry_after_secs: rl.retryAfterSecs }, 429);
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { action } = body;

  if (!action || typeof action !== 'string') {
    return json({ error: 'action required. Use: list | status | create | deploy' }, 400);
  }

  let sa: { project_id: string; [k: string]: unknown };
  try {
    sa = JSON.parse(gcpSaJson);
  } catch {
    return json({ error: 'GCP_SERVICE_ACCOUNT_JSON is not valid JSON' }, 500);
  }
  const projectId = sa.project_id as string;

  // ── list ──────────────────────────────────────────────────────────────────
  if (action === 'list') {
    let token: string;
    try { token = await getGCPToken(sa, VERTEX_SCOPES); }
    catch (e) { return json({ error: `GCP auth failed: ${(e as Error).message}` }, 500); }

    let res: Response;
    try {
      res = await fetchWithTimeout(
        `${VERTEX_BASE}/projects/${projectId}/locations/${VERTEX_REGION}/tuningJobs?pageSize=20`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
    } catch (e) {
      if ((e as Error).name === 'AbortError') return json({ error: 'Vertex API timeout listing jobs' }, 504);
      return json({ error: 'Vertex API unreachable' }, 502);
    }
    return json(await res.json());
  }

  // ── status ────────────────────────────────────────────────────────────────
  if (action === 'status') {
    const job_name = typeof body.job_name === 'string' ? body.job_name : '';
    if (!job_name) return json({ error: 'job_name required' }, 400);
    // Validate job_name format to prevent path injection
    if (!/^projects\/[^/]+\/locations\/[^/]+\/tuningJobs\/[^/]+$/.test(job_name)) {
      return json({ error: 'Invalid job_name format' }, 400);
    }

    let token: string;
    try { token = await getGCPToken(sa, VERTEX_SCOPES); }
    catch (e) { return json({ error: `GCP auth failed: ${(e as Error).message}` }, 500); }

    let res: Response;
    try {
      res = await fetchWithTimeout(
        `${VERTEX_BASE}/${job_name}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
    } catch (e) {
      if ((e as Error).name === 'AbortError') return json({ error: 'Vertex API timeout fetching status' }, 504);
      return json({ error: 'Vertex API unreachable' }, 502);
    }

    const data = await res.json() as {
      state?: string; tunedModel?: { endpoint?: string };
      tunedModelDisplayName?: string; createTime?: string; updateTime?: string;
      error?: unknown; tuningDataStats?: unknown;
    };

    const state      = data.state ?? 'UNKNOWN';
    const tunedModel = data.tunedModel?.endpoint ?? null;

    return json({
      state,
      tuned_model_endpoint: tunedModel,
      display_name: data.tunedModelDisplayName,
      created_at:   data.createTime,
      updated_at:   data.updateTime,
      error:        data.error ?? null,
      progress:     data.tuningDataStats ?? null,
      instruction:  state === 'JOB_STATE_SUCCEEDED'
        ? `Fine-tuning complete! Set VERTEX_ENDPOINT=${tunedModel} in Supabase secrets to activate.`
        : state === 'JOB_STATE_FAILED'
        ? 'Job failed. Check error field and re-run vertex-export upload + vertex-jobs create.'
        : `Job is ${state}. Poll again in a few minutes.`,
    });
  }

  // ── create — launches an expensive GCP job; restricted to admin only ───────
  if (action === 'create') {
    if (!gcsBucket) return json({ error: 'GCS_TRAINING_BUCKET secret required' }, 500);

    // Additional safety: cron cannot create jobs, only admins with JWT can
    if (isCron) {
      return json({ error: 'Job creation is not allowed via cron. Use an authenticated admin JWT.' }, 403);
    }

    const trainingUri   = typeof body.training_uri   === 'string' ? body.training_uri   : `gs://${gcsBucket}/training.jsonl`;
    const validationUri = typeof body.validation_uri === 'string' ? body.validation_uri : `gs://${gcsBucket}/validation.jsonl`;
    const displayName   = typeof body.display_name   === 'string' ? body.display_name   : `edora-novo-${Date.now()}`;
    const epochCount    = Number.isFinite(Number(body.epoch_count)) ? Math.min(Math.max(Number(body.epoch_count), 1), 10) : 3;
    const lrMultiplier  = Number.isFinite(Number(body.lr_multiplier)) ? Math.min(Math.max(Number(body.lr_multiplier), 0.1), 10) : 1.0;

    // Validate GCS URIs start with gs:// to prevent injection
    if (!trainingUri.startsWith('gs://') || !validationUri.startsWith('gs://')) {
      return json({ error: 'training_uri and validation_uri must be gs:// URIs' }, 400);
    }

    let token: string;
    try { token = await getGCPToken(sa, VERTEX_SCOPES); }
    catch (e) { return json({ error: `GCP auth failed: ${(e as Error).message}` }, 500); }

    const jobBody = {
      baseModel: BASE_MODEL,
      tunedModelDisplayName: displayName,
      supervisedTuningSpec: {
        trainingDatasetUri:   trainingUri,
        validationDatasetUri: validationUri,
        hyperParameters: {
          epochCount,
          learningRateMultiplier: lrMultiplier,
          adapterSize: 'ADAPTER_SIZE_ONE',
        },
      },
    };

    let res: Response;
    try {
      res = await fetchWithTimeout(
        `${VERTEX_BASE}/projects/${projectId}/locations/${VERTEX_REGION}/tuningJobs`,
        {
          method:  'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body:    JSON.stringify(jobBody),
        },
        60_000, // Job creation can take up to 60s
      );
    } catch (e) {
      if ((e as Error).name === 'AbortError') return json({ error: 'Vertex API timeout creating job' }, 504);
      return json({ error: 'Vertex API unreachable' }, 502);
    }

    const data = await res.json() as { name?: string; state?: string; error?: { message?: string } };
    if (!res.ok) return json({ error: data?.error?.message ?? 'Job creation failed', details: data }, 500);

    return json({
      success:      true,
      job_name:     data.name,
      state:        data.state,
      display_name: displayName,
      base_model:   BASE_MODEL,
      training_uri: trainingUri,
      instruction:  `Job created. Poll with: { "action": "status", "job_name": "${data.name}" }`,
    });
  }

  // ── deploy ─────────────────────────────────────────────────────────────────
  if (action === 'deploy') {
    if (isCron) {
      return json({ error: 'Deploy is not allowed via cron. Use an authenticated admin JWT.' }, 403);
    }

    const job_name = typeof body.job_name === 'string' ? body.job_name : '';
    if (!job_name) return json({ error: 'job_name required' }, 400);
    if (!/^projects\/[^/]+\/locations\/[^/]+\/tuningJobs\/[^/]+$/.test(job_name)) {
      return json({ error: 'Invalid job_name format' }, 400);
    }

    let token: string;
    try { token = await getGCPToken(sa, VERTEX_SCOPES); }
    catch (e) { return json({ error: `GCP auth failed: ${(e as Error).message}` }, 500); }

    let res: Response;
    try {
      res = await fetchWithTimeout(
        `${VERTEX_BASE}/${job_name}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
    } catch (e) {
      if ((e as Error).name === 'AbortError') return json({ error: 'Vertex API timeout' }, 504);
      return json({ error: 'Vertex API unreachable' }, 502);
    }

    const data = await res.json() as { state?: string; tunedModel?: { endpoint?: string } };
    if (data.state !== 'JOB_STATE_SUCCEEDED') {
      return json({ error: `Job not complete. Current state: ${data.state}` }, 400);
    }

    const endpoint = data.tunedModel?.endpoint;
    return json({
      endpoint,
      instruction: endpoint
        ? `Set VERTEX_ENDPOINT=${endpoint} in Supabase Dashboard → Secrets. Edora will use your fine-tuned model automatically.`
        : 'Endpoint not yet available. Try again in a few minutes.',
    });
  }

  return json({ error: 'Unknown action. Use: list | status | create | deploy' }, 400);
}));
