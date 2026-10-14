import { createClient } from "npm:@supabase/supabase-js@2.50.0";
import { z } from "npm:zod@3.23.8";
import { completeErpRevocation, queueAccountRemoval } from "../_shared/hr-erp-revocation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BodySchema = z.object({
  registrationId: z.string().uuid("Invalid registration id"),
  reason: z.string().max(1000).optional().nullable(),
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
    const rawBody = await req.json();
    const parsed = BodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return jsonResponse({ error: parsed.error.flatten().fieldErrors }, 400);
    }
    const { registrationId, reason } = parsed.data;

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
    const callerRoleNames = (roleRows ?? [])
      .map((row: { roles?: { name?: string } }) => row?.roles?.name)
      .filter(Boolean)
      .map((name: string) => name.toLowerCase());
    const isSuperAdmin =
      callerRoleNames.includes("super admin") || callerRoleNames.includes("super_admin");
    if (!isSuperAdmin) {
      return jsonResponse({ error: "Only a Super Admin can reject registrations." }, 403);
    }

    // ── Load the registration ──
    const { data: registration } = await adminClient
      .from("pending_registrations")
      .select("id, user_id, status")
      .eq("id", registrationId)
      .maybeSingle();

    if (!registration || !["PENDING", "pending"].includes(registration.status)) {
      return jsonResponse({ error: "Registration not found or already processed." }, 404);
    }

    // Decision: the request becomes REJECTED straight away (the Super Admin's
    // decision is final); any account clean-up still owed is tracked in the shared
    // removal record and retried by the daily job until the email and phone are free.
    const { error: updateError } = await adminClient
      .from("pending_registrations")
      .update({
        status: "REJECTED",
        rejection_reason: reason || null,
        reviewed_by: caller.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", registrationId);

    if (updateError) {
      console.error("registration update failed:", updateError);
      return jsonResponse({ error: "Could not reject the registration." }, 500);
    }

    if (!registration.user_id) return jsonResponse({ success: true, cleanupPending: false });

    const uid = registration.user_id;
    let cleanupError: string | null = null;
    try {
      // Same durable path as every other removal (record → clean-up → Auth/Terminal → read-back → retry).
      await queueAccountRemoval(adminClient, {
        userId: uid, requestedBy: caller.id, source: "signup_rejection",
        reason: reason || "Sign-up rejected", registrationId,
      });
      // The sign-up's own employee stub (FK to auth is RESTRICT) must go before Auth removal.
      const { error: empError } = await adminClient.from("employees").delete().eq("user_id", uid);
      if (empError) throw new Error(`employee record: ${empError.message}`);
      const { data: left, error: leftError } = await adminClient.from("employees").select("id").eq("user_id", uid);
      if (leftError) throw new Error(`employee record: ${leftError.message}`);
      if (left?.length) throw new Error("employee record still present");
      const result = await completeErpRevocation(adminClient, uid);
      if (!result.deleted) cleanupError = result.reason || "account clean-up failed";
    } catch (e) {
      cleanupError = e instanceof Error ? e.message : String(e);
      const { data: rec } = await adminClient.from("hr_erp_access_revocations").select("attempts").eq("user_id", uid).maybeSingle();
      await adminClient.from("hr_erp_access_revocations")
        .update({ attempts: (rec?.attempts || 0) + 1, last_error: cleanupError, updated_at: new Date().toISOString() })
        .eq("user_id", uid);
    }

    return jsonResponse({ success: true, cleanupPending: !!cleanupError, cleanupError });
  } catch (error) {
    console.error("reject-erp-registration error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return jsonResponse({ error: message }, 500);
  }
});
