// Caller gate for edge functions that run with verify_jwt = false.
//
// Accepts a request when ANY of the following holds:
//   1. Authorization bearer token is the service role key (internal server-to-server).
//   2. Header `x-scheduler-secret` matches public.app_scheduler_secrets.name = 'internal_cron'.
//   3. Authorization bearer token is a valid Supabase user session.
//
// Anything else is rejected with 401 so the function cannot be used as an open relay.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export type CallerResult =
  | { ok: true; kind: "service" | "scheduler" | "user"; userId: string | null; admin: SupabaseClient }
  | { ok: false; response: Response };

function unauthorized(corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export async function requireCaller(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<CallerResult> {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const authHeader = req.headers.get("Authorization") || "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";

  // 1) internal server-to-server call
  if (bearer && bearer === SERVICE_ROLE_KEY) {
    return { ok: true, kind: "service", userId: null, admin };
  }

  // 2) scheduled job with the shared cron secret
  const schedulerSecret = req.headers.get("x-scheduler-secret");
  if (schedulerSecret) {
    const { data } = await admin
      .from("app_scheduler_secrets")
      .select("secret_value")
      .eq("name", "internal_cron")
      .maybeSingle();
    if (data?.secret_value && data.secret_value === schedulerSecret) {
      return { ok: true, kind: "scheduler", userId: null, admin };
    }
    return { ok: false, response: unauthorized(corsHeaders) };
  }

  // 3) signed-in user
  if (!bearer) return { ok: false, response: unauthorized(corsHeaders) };
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${bearer}` } },
  });
  const { data: userData, error } = await userClient.auth.getUser();
  if (error || !userData?.user?.id) {
    return { ok: false, response: unauthorized(corsHeaders) };
  }
  return { ok: true, kind: "user", userId: userData.user.id, admin };
}
