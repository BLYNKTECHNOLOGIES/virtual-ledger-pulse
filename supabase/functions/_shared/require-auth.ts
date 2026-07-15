// Shared JWT auth gate for edge functions.
// Validates the incoming Authorization header via supabase.auth.getUser().
// Optionally verifies the caller has a permission via user_has_permission RPC.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export type AuthResult =
  | { ok: true; userId: string; email: string | null; admin: SupabaseClient }
  | { ok: false; response: Response };

export interface RequireAuthOptions {
  corsHeaders: Record<string, string>;
  /** Optional permission checked via public.user_has_permission(user_id, permission). */
  permission?: string;
  /** If true, require ERP role name === 'Super Admin'. */
  requireSuperAdmin?: boolean;
}

export async function requireAuth(req: Request, opts: RequireAuthOptions): Promise<AuthResult> {
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...opts.corsHeaders, "Content-Type": "application/json" },
      }),
    };
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user?.id) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { ...opts.corsHeaders, "Content-Type": "application/json" },
      }),
    };
  }
  const userId = userData.user.id;
  const email = userData.user.email ?? null;

  if (opts.permission) {
    try {
      const { data: hasPerm } = await admin.rpc("user_has_permission", {
        p_user_id: userId,
        p_permission: opts.permission,
      });
      if (!hasPerm) {
        return {
          ok: false,
          response: new Response(JSON.stringify({ error: "Forbidden" }), {
            status: 403,
            headers: { ...opts.corsHeaders, "Content-Type": "application/json" },
          }),
        };
      }
    } catch (_e) {
      return {
        ok: false,
        response: new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...opts.corsHeaders, "Content-Type": "application/json" },
        }),
      };
    }
  }

  if (opts.requireSuperAdmin) {
    const { data: roles } = await admin
      .from("user_roles")
      .select("roles:role_id(name)")
      .eq("user_id", userId);
    const isSuperAdmin = (roles || []).some((r: any) => r.roles?.name === "Super Admin");
    if (!isSuperAdmin) {
      return {
        ok: false,
        response: new Response(JSON.stringify({ error: "Super Admin required" }), {
          status: 403,
          headers: { ...opts.corsHeaders, "Content-Type": "application/json" },
        }),
      };
    }
  }

  return { ok: true, userId, email, admin };
}
