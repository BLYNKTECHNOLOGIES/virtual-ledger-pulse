import { createClient } from "npm:@supabase/supabase-js@2.50.0";
import { z } from "npm:zod@3.23.8";
import { completeErpRevocation, queueAccountRemoval } from "../_shared/hr-erp-revocation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BodySchema = z.object({
  userId: z.string().uuid("Invalid user id"),
  verifyOnly: z.boolean().optional().default(false),
  // Retry a pending/failed removal from the shared record (Super Admin / erp_destructive).
  retry: z.boolean().optional().default(false),
  reason: z.string().trim().max(500).optional().nullable(),
});

// Always return 200 with a success flag so the browser client can read the
// error body (supabase.functions.invoke swallows the body on non-2xx).
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
      return jsonResponse({ success: false, error: "Invalid request payload" });
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ success: false, error: "Unauthorized. Please log in again." });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: { user: caller }, error: callerError } = await adminClient.auth.getUser(token);
    if (callerError || !caller?.id) {
      return jsonResponse({ success: false, error: "Unauthorized. Please log in again." });
    }

    // Authorize the validated caller explicitly (UM-2A R4: user_management_manage on
    // people ranked below the caller; Super Admin unrestricted; never yourself),
    // then perform privileged cleanup with the service client.
    if (caller.id === parsed.data.userId) {
      return jsonResponse({ success: false, error: "You cannot delete your own account" });
    }

    // ── Retry: same rights as HRMS Deactivate (Super Admin or erp_destructive), not rank-based ──
    if (parsed.data.retry) {
      const [sa, destructive] = await Promise.all([
        adminClient.rpc("um_is_super_admin", { p_uid: caller.id }),
        adminClient.rpc("user_has_permission", { user_uuid: caller.id, check_permission: "erp_destructive" }),
      ]);
      if (sa.error || destructive.error) return jsonResponse({ success: false, error: "Unable to verify retry permission" });
      if (sa.data !== true && destructive.data !== true) {
        return jsonResponse({ success: false, error: "Only a Super Admin or someone with ERP destructive access can retry a removal" });
      }
      const { data: rec, error: recError } = await adminClient.from("hr_erp_access_revocations")
        .select("user_id,completed_at").eq("user_id", parsed.data.userId).maybeSingle();
      if (recError) return jsonResponse({ success: false, error: recError.message });
      if (!rec) return jsonResponse({ success: false, error: "No removal record for this account" });
      if (rec.completed_at) return jsonResponse({ success: true, deleted: true, recordId: rec.user_id });
      const result = await completeErpRevocation(adminClient, parsed.data.userId);
      return jsonResponse({ success: result.deleted, deleted: result.deleted, pending: !result.deleted, error: result.deleted ? undefined : result.reason, recordId: parsed.data.userId });
    }

    // ── Who may delete whom: UM-2A rule only (um_can_act 'delete') ──
    const [superAdminCheck, permissionCheck] = await Promise.all([
      adminClient.rpc("um_is_super_admin", { p_uid: caller.id }),
      parsed.data.verifyOnly
        ? adminClient.rpc("has_permission", { _user_id: caller.id, _permission: "user_management_manage" })
        : adminClient.rpc("um_can_act", { p_uid: caller.id, p_target: parsed.data.userId, p_action: "delete" }),
    ]);

    const authorizationError = superAdminCheck.error || permissionCheck.error;
    if (authorizationError) {
      console.error("delete authorization check failed:", authorizationError);
      return jsonResponse({ success: false, error: "Unable to verify delete permission" });
    }

    const isSuperAdmin = superAdminCheck.data === true;
    if (!(isSuperAdmin || permissionCheck.data === true)) {
      return jsonResponse({
        success: false,
        error: "You can only delete accounts of people ranked below you, and you need full User Management access",
      });
    }

    if (parsed.data.verifyOnly) {
      return jsonResponse({ success: true, authorized: true, isSuperAdmin });
    }

    const reason = (parsed.data.reason ?? "").trim();
    if (reason.length < 3) {
      return jsonResponse({ success: false, error: "Give a short reason for removing this account" });
    }

    // Linked HRMS employee (kept; only unlinked by the shared clean-up).
    const { data: target } = await adminClient.from("users").select("badge_id").eq("id", parsed.data.userId).maybeSingle();
    let employeeId: string | null = null;
    {
      const { data: byUser } = await adminClient.from("hr_employees").select("id").eq("user_id", parsed.data.userId).limit(1);
      employeeId = byUser?.[0]?.id ?? null;
      if (!employeeId && target?.badge_id) {
        const { data: byBadge } = await adminClient.from("hr_employees").select("id").eq("badge_id", target.badge_id).limit(1);
        employeeId = byBadge?.[0]?.id ?? null;
      }
    }

    // ── Same durable path as HRMS Deactivate and offboarding: one record, clean-up,
    //    Auth + Terminal removal, read-back, automatic retries by the daily job. ──
    try {
      await queueAccountRemoval(adminClient, {
        userId: parsed.data.userId, employeeId, requestedBy: caller.id, source: "user_management", reason,
      });
    } catch (e) {
      return jsonResponse({ success: false, error: e instanceof Error ? e.message : "Could not record the removal" });
    }
    const result = await completeErpRevocation(adminClient, parsed.data.userId);
    if (!result.deleted) {
      return jsonResponse({
        success: false, pending: true, recordId: parsed.data.userId,
        error: `Removal recorded but not finished: ${result.reason}. It will be retried automatically.`,
      });
    }
    return jsonResponse({ success: true, deleted: true, authDeleted: true, recordId: parsed.data.userId });
  } catch (error) {
    console.error("delete-erp-user error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return jsonResponse({ success: false, error: message });
  }
});
