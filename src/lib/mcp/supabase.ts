import { createClient } from "@supabase/supabase-js";
import type { ToolContext } from "@lovable.dev/mcp-js";

/**
 * Build a Supabase client that acts AS the signed-in user by forwarding the
 * verified OAuth bearer token. RLS runs as that user — never a shared/admin key.
 * Read secrets inside the handler (never at module top level) so the entry stays
 * import-safe for build-time extraction and Edge Function cold start.
 */
export function supabaseForUser(ctx: ToolContext) {
  const env = (globalThis as any).process?.env ?? {};
  const url = env.SUPABASE_URL!;
  const anonKey =
    env.SUPABASE_PUBLISHABLE_KEY ?? env.SUPABASE_ANON_KEY!;
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
