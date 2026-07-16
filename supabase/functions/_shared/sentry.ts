// ─────────────────────────────────────────────────────────────────────────────
// sentry — lightweight error reporting for Deno edge functions
//
// No SDK dependency (keeps cold starts fast): posts directly to Sentry's
// envelope ingestion API over HTTPS. Reads SENTRY_DSN from env; no-ops if
// unset so local dev / functions without the secret configured never break.
//
// Also mirrors every captured error into public.edge_function_errors so
// monitoring-check can compute per-function error rates without depending on
// the platform log API (which isn't reachable from inside a running function).
// ─────────────────────────────────────────────────────────────────────────────

interface ParsedDSN {
  publicKey: string;
  host: string;
  projectId: string;
}

function parseDSN(dsn: string): ParsedDSN | null {
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.replace(/^\//, '');
    return { publicKey: url.username, host: url.host, projectId };
  } catch {
    return null;
  }
}

async function logToErrorTable(functionName: string, message: string, requestId?: string): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return;

  try {
    await fetch(`${supabaseUrl}/rest/v1/edge_function_errors`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ function_name: functionName, error_message: message.slice(0, 2000), request_id: requestId ?? null }),
    });
  } catch {
    // Best-effort — must never throw or block the response
  }
}

export async function captureException(
  error: unknown,
  context: { functionName: string; requestId?: string; extra?: Record<string, unknown> },
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);

  // Always mirror to our own table — cheap, and doesn't depend on Sentry being configured
  await logToErrorTable(context.functionName, message, context.requestId);

  const dsn = Deno.env.get('SENTRY_DSN');
  if (!dsn) return; // Sentry not configured — table log above still happened

  const parsed = parseDSN(dsn);
  if (!parsed) return;

  try {
    const stack   = error instanceof Error ? error.stack : undefined;
    const eventId = crypto.randomUUID().replace(/-/g, '');
    const now     = new Date().toISOString();

    const event = {
      event_id:   eventId,
      timestamp:  now,
      platform:   'other',
      level:      'error',
      server_name: context.functionName,
      tags:       { function: context.functionName, runtime: 'deno-edge', request_id: context.requestId ?? 'unknown' },
      extra:      context.extra ?? {},
      exception: {
        values: [{
          type:  error instanceof Error ? error.name : 'Error',
          value: message,
          stacktrace: stack ? { frames: stack.split('\n').slice(1).map(line => ({ filename: line.trim() })) } : undefined,
        }],
      },
    };

    const envelopeHeader = JSON.stringify({ event_id: eventId, sent_at: now });
    const itemHeader = JSON.stringify({ type: 'event' });
    const envelope = `${envelopeHeader}\n${itemHeader}\n${JSON.stringify(event)}`;

    const ingestUrl = `https://${parsed.host}/api/${parsed.projectId}/envelope/?sentry_key=${parsed.publicKey}`;

    await fetch(ingestUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-sentry-envelope' },
      body: envelope,
    });
  } catch {
    // Error reporting must never throw or block the response
  }
}

// ── Universal handler wrapper ─────────────────────────────────────────────────
// Wraps a Deno edge function handler so any uncaught exception is reported to
// Sentry AND the client still gets a clean JSON 500 instead of Deno's default
// crash page. Functions that already catch+return their own errors are
// unaffected — this only fires for truly unhandled exceptions.
//
// Also emits structured JSON request logs (start + end, with duration and a
// request id) so Supabase's own edge-function log viewer becomes a searchable,
// correlatable trace — no external log aggregator needed.
export function withSentry(
  functionName: string,
  handler: (req: Request) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
    const startedAt = performance.now();

    console.log(JSON.stringify({
      level: 'info', event: 'request_start', function: functionName,
      request_id: requestId, method: req.method, url: req.url,
      timestamp: new Date().toISOString(),
    }));

    try {
      const res = await handler(req);
      console.log(JSON.stringify({
        level: 'info', event: 'request_end', function: functionName,
        request_id: requestId, status: res.status,
        duration_ms: Math.round(performance.now() - startedAt),
        timestamp: new Date().toISOString(),
      }));
      return res;
    } catch (err) {
      console.log(JSON.stringify({
        level: 'error', event: 'request_error', function: functionName,
        request_id: requestId,
        duration_ms: Math.round(performance.now() - startedAt),
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      }));
      await captureException(err, { functionName, requestId, extra: { url: req.url, method: req.method } });
      const origin = req.headers.get('Origin') ?? '';
      const errMsg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      return new Response(
        JSON.stringify({ error: 'Internal server error', _debug: errMsg, request_id: requestId }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': origin || '*',
          },
        },
      );
    }
  };
}
