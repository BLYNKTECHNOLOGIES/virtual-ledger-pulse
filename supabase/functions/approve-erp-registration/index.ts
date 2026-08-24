import { createClient } from "npm:@supabase/supabase-js@2.50.0";
import { z } from "npm:zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BodySchema = z.object({
  registrationId: z.string().uuid("Invalid registration id"),
  roleId: z.string().uuid("Invalid role id"),
  departmentId: z.string().uuid("Invalid department id"),
  positionId: z.string().uuid("Invalid position id"),
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return jsonResponse({ error: parsed.error.flatten().fieldErrors }, 400);
    }
    const { registrationId, roleId, departmentId, positionId } = parsed.data;

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    // ── Authenticate caller ──
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    const token = authHeader.replace("Bearer ", "").trim();
    const { data: { user: caller } } = await adminClient.auth.getUser(token);
    if (!caller?.id) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    // ── Verify caller is Super Admin ──
    const { data: roleRows } = await adminClient
      .from("user_roles")
      .select("roles:role_id(name)")
      .eq("user_id", caller.id);
    const callerRoles = (roleRows ?? [])
      .map((row: { roles?: { name?: string } }) => row?.roles?.name)
      .filter(Boolean)
      .map((name: string) => name.toLowerCase());
    if (!callerRoles.some((r) => r === "super admin" || r === "super_admin")) {
      return jsonResponse({ error: "Insufficient permissions" }, 403);
    }

    // ── Resolve the target auth user before mutating anything ──
    const { data: registration, error: regError } = await adminClient
      .from("pending_registrations")
      .select("user_id, email, status")
      .eq("id", registrationId)
      .maybeSingle();

    if (regError || !registration) {
      return jsonResponse({ error: "Registration not found" }, 404);
    }

    // ── Approve via the existing RPC (roles, department, position, status) ──
    const { data: rpcResult, error: rpcError } = await adminClient.rpc("approve_registration", {
      p_registration_id: registrationId,
      p_role_id: roleId,
      p_department_id: departmentId,
      p_position_id: positionId,
      p_approved_by: caller.id,
    });

    if (rpcError) {
      console.error("approve_registration failed:", rpcError);
      return jsonResponse({ error: rpcError.message || "Approval failed" }, 400);
    }

    // ── Lift the login ban now that the account is approved ──
    if (registration.user_id) {
      const { error: unbanError } = await adminClient.auth.admin.updateUserById(
        registration.user_id,
        { ban_duration: "none" }
      );
      if (unbanError) {
        console.error("Failed to lift login ban:", unbanError);
        return jsonResponse(
          { error: "Approved, but the account could not be enabled for login. Please retry." },
          500
        );
      }
    }

    return jsonResponse({ success: true, result: rpcResult });
  } catch (error) {
    console.error("approve-erp-registration error:", error);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
