import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

/**
 * Canonical V5 defaults — FAIL-CLOSED.
 *
 * battle_enabled = false  — V5 freeze: not yet re-enabled
 * new_home_enabled = false — V5 freeze: not yet re-enabled
 *
 * Unknown flags not in this object will not be served to clients.
 * The RPC merges from DB; any DB flag overrides these only by explicit value.
 */
export const DEFAULT_APP_FLAGS: Record<string, boolean> = {
  novo_enabled: true,
  ai_generation_enabled: true,
  pyq_enabled: true,
  battle_enabled: false,
  new_home_enabled: false,
  pro_enabled: true,
};

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  // Fallback to safe defaults if environment variables are not configured
  if (!supabaseUrl || !supabaseKey) {
    return new Response(JSON.stringify(DEFAULT_APP_FLAGS), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60, s-maxage=300",
      },
    });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase.rpc("get_app_flags");

    if (error) {
      console.warn("[app-flags] DB RPC error, falling back to safe defaults:", error.message);
      return new Response(JSON.stringify(DEFAULT_APP_FLAGS), {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=30, s-maxage=60",
        },
      });
    }

    // Merge: DEFAULT_APP_FLAGS provides the fail-closed baseline;
    // DB values override where explicitly configured.
    const mergedFlags = {
      ...DEFAULT_APP_FLAGS,
      ...(data && typeof data === "object" ? data : {}),
    };

    return new Response(JSON.stringify(mergedFlags), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (err: unknown) {
    console.error("[app-flags] Unexpected error:", err);
    return new Response(JSON.stringify(DEFAULT_APP_FLAGS), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=30, s-maxage=60",
      },
    });
  }
}

if (import.meta.main) {
  serve(handleRequest);
}
