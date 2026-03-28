import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.50.0";
import { z } from "npm:zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BodySchema = z.object({
  userId: z.string().uuid("Invalid userId"),
  newPassword: z.string().min(6, "Password must be at least 6 characters"),
  callerUserId: z.string().uuid("Invalid callerUserId").optional(),
});

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawBody = await req.json();
    const parsed = BodySchema.safeParse(rawBody);

    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { userId, newPassword, callerUserId } = parsed.data;

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    let callerId: string | null = null;

    const authHeader = req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "").trim();
      const {
        data: { user: caller },
      } = await adminClient.auth.getUser(token);
      if (caller?.id) callerId = caller.id;
    }

    // Temporary compatibility path for legacy localStorage sessions
    if (!callerId && callerUserId) {
      callerId = callerUserId;
    }

    if (!callerId) {
      return new Response(JSON.stringify({ error: "Unauthorized. Please log in again." }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { data: roleRows, error: roleError } = await adminClient
      .from("user_roles")
      .select("roles:role_id(name)")
      .eq("user_id", callerId);

    if (roleError) {
      console.error("Failed to fetch caller roles:", roleError);
      return new Response(JSON.stringify({ error: "Failed to verify permissions" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const roleNames = (roleRows ?? [])
      .map((row: any) => row?.roles?.name)
      .filter(Boolean)
      .map((name: string) => name.toLowerCase());

    const isAdmin = roleNames.includes("admin") || roleNames.includes("super admin") || roleNames.includes("super_admin");
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Insufficient permissions" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    let { error: updateError } = await adminClient.auth.admin.updateUserById(userId, {
      password: newPassword,
    });

    // Fallback for legacy records where public.users.id != auth.users.id
    if (updateError?.message?.toLowerCase().includes("user not found")) {
      const { data: targetUser } = await adminClient
        .from("users")
        .select("email")
        .eq("id", userId)
        .single();

      if (targetUser?.email) {
        const { data: listed } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const authMatch = listed?.users?.find(
          (u) => (u.email ?? "").toLowerCase() === targetUser.email.toLowerCase()
        );

        if (authMatch?.id) {
          const retry = await adminClient.auth.admin.updateUserById(authMatch.id, {
            password: newPassword,
          });
          updateError = retry.error;
        }
      }
    }

    if (updateError) {
      console.error("Failed to update auth password:", updateError);
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    try {
      await adminClient.rpc("admin_reset_user_password", {
        p_user_id: userId,
        p_new_password: newPassword,
      });
    } catch (e: any) {
      console.warn("Legacy password hash sync skipped:", e?.message ?? e);
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("admin-reset-password error:", error);
    return new Response(JSON.stringify({ error: error?.message || "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
