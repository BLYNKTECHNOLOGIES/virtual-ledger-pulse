import { createClient } from "npm:@supabase/supabase-js@2.50.0";
import { z } from "npm:zod@3.23.8";

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

    // ── Clean up the created account so the email/phone free up ──
    if (registration.user_id) {
      await adminClient.from("users").delete().eq("id", registration.user_id);
      await adminClient.auth.admin.deleteUser(registration.user_id).catch((e) =>
        console.error("auth delete failed (non-fatal):", e)
      );
    }

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

    return jsonResponse({ success: true });
  } catch (error) {
    console.error("reject-erp-registration error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return jsonResponse({ error: message }, 500);
  }
});
