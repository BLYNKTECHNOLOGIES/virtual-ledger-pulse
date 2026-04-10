import { createClient } from "npm:@supabase/supabase-js@2.50.0";
import { z } from "npm:zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BodySchema = z.object({
  userId: z.string().uuid("Invalid userId"),
  newPassword: z.string().min(6, "Password must be at least 6 characters"),
});

Deno.serve(async (req) => {
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

    const { userId, newPassword } = parsed.data;

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    // ── Authenticate caller ──
    let callerId: string | null = null;
    const authHeader = req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "").trim();
      const { data: { user: caller } } = await adminClient.auth.getUser(token);
      if (caller?.id) callerId = caller.id;
    }

    if (!callerId) {
      return new Response(JSON.stringify({ error: "Unauthorized. Please log in again." }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // ── Verify caller is Admin/Super Admin ──
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

    // ── Step 1: Try direct auth password update ──
    let { error: updateError } = await adminClient.auth.admin.updateUserById(userId, {
      password: newPassword,
    });

    // ── Step 2: Fallback for legacy users (public.users exists but auth.users doesn't) ──
    if (updateError?.message?.toLowerCase().includes("user not found")) {
      console.log("Auth user not found by ID, attempting email-based fallback for userId:", userId);

      const { data: targetUser } = await adminClient
        .from("users")
        .select("email")
        .eq("id", userId)
        .single();

      console.log("Public user lookup result:", { email: targetUser?.email });

      if (targetUser?.email) {
        // Search all auth users by email (paginated)
        let authMatch: { id: string } | undefined;
        let page = 1;
        const perPage = 1000;

        while (!authMatch) {
          const { data: listed, error: listError } = await adminClient.auth.admin.listUsers({ page, perPage });
          if (listError || !listed?.users?.length) break;

          authMatch = listed.users.find(
            (u) => (u.email ?? "").toLowerCase() === targetUser.email.toLowerCase()
          );

          if (listed.users.length < perPage) break;
          page++;
        }

        if (authMatch?.id) {
          // Auth user exists with this email but a different UUID — update their password
          console.log("Found auth user by email, auth.id:", authMatch.id);
          const retry = await adminClient.auth.admin.updateUserById(authMatch.id, { password: newPassword });
          updateError = retry.error;
        } else {
          // No auth user at all — create one linked to the public.users UUID
          console.log("No auth user found at all. Creating new auth account for:", targetUser.email);
          const { data: createdUser, error: createError } = await adminClient.auth.admin.createUser({
            id: userId,
            email: targetUser.email,
            password: newPassword,
            email_confirm: true,
          });

          if (createError) {
            console.error("Failed to create auth user:", createError);
            updateError = createError;
          } else {
            console.log("Auth user created successfully with id:", createdUser?.user?.id);
            updateError = null;

            // Mark force_password_change so the user must set their own password on first login
            await adminClient
              .from("users")
              .update({ force_password_change: true, password_hash: "SUPABASE_AUTH" })
              .eq("id", userId);
          }
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

    // ── Sync legacy password hash (best-effort) ──
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
