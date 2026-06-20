// ─────────────────────────────────────────────────────────────────────────────
// sentry — lightweight error reporting for Deno edge functions
//
// No SDK dependency (keeps cold starts fast): posts directly to Sentry's
// envelope ingestion API over HTTPS. Reads SENTRY_DSN from env; no-ops if
// unset so local dev / functions without the secret configured never break.
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

export async function captureException(
  error: unknown,
  context: { functionName: string; extra?: Record<string, unknown> } ,
): Promise<void> {
  const dsn = Deno.env.get('SENTRY_DSN');
  if (!dsn) return; // not configured — no-op

  const parsed = parseDSN(dsn);
  if (!parsed) return;

  try {
    const message = error instanceof Error ? error.message : String(error);
    const stack   = error instanceof Error ? error.stack : undefined;
    const eventId = crypto.randomUUID().replace(/-/g, '');
    const now     = new Date().toISOString();

    const event = {
      event_id:   eventId,
      timestamp:  now,
      platform:   'other',
      level:      'error',
      server_name: context.functionName,
      tags:       { function: context.functionName, runtime: 'deno-edge' },
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
export function withSentry(
  functionName: string,
  handler: (req: Request) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    try {
      return await handler(req);
    } catch (err) {
      await captureException(err, { functionName, extra: { url: req.url, method: req.method } });
      const origin = req.headers.get('Origin') ?? '';
      const errMsg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      return new Response(
        JSON.stringify({ error: 'Internal server error', _debug: errMsg }),
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
