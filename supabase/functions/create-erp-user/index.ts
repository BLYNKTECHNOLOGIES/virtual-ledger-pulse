import { createClient } from "npm:@supabase/supabase-js@2.50.0";
import { z } from "npm:zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BodySchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().optional().default(""),
  email: z.string().email("Invalid email"),
  phone: z.string().optional().nullable(),
  departmentId: z.string().uuid().optional().nullable(),
  positionId: z.string().uuid().optional().nullable(),
  roleId: z.string().uuid("Role ID is required"),
  badgeId: z.string().optional().nullable(),
  
});

function generatePassword(length = 12): string {
  const chars = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%";
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => chars[b % chars.length]).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawBody = await req.json();
    const parsed = BodySchema.safeParse(rawBody);

    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { firstName, lastName, email, phone, departmentId, positionId, roleId, badgeId } = parsed.data;

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
    if (!callerId && callerUserId) callerId = callerUserId;

    if (!callerId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // ── Verify caller is admin/super_admin ──
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

    const callerRoleNames = (roleRows ?? [])
      .map((row: any) => row?.roles?.name)
      .filter(Boolean)
      .map((name: string) => name.toLowerCase());

    const isAdmin = callerRoleNames.includes("admin") || callerRoleNames.includes("super admin") || callerRoleNames.includes("super_admin");
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Insufficient permissions. Admin access required." }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // ── Verify target role is NOT admin/super admin ──
    const { data: targetRole } = await adminClient
      .from("roles")
      .select("name")
      .eq("id", roleId)
      .single();

    if (targetRole) {
      const targetRoleName = targetRole.name.toLowerCase();
      if (targetRoleName === "admin" || targetRoleName === "super admin" || targetRoleName === "super_admin") {
        return new Response(JSON.stringify({ error: "Cannot assign Admin or Super Admin role during onboarding" }), {
          status: 403,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    }

    // ── Generate unique username ──
    const baseUsername = `${firstName}${lastName}`.toLowerCase().replace(/\s+/g, "");
    let username = baseUsername;
    let counter = 1;

    while (true) {
      const { data: existing } = await adminClient
        .from("users")
        .select("id")
        .eq("username", username)
        .maybeSingle();

      if (!existing) break;
      username = `${baseUsername}${counter}`;
      counter++;
      if (counter > 100) {
        return new Response(JSON.stringify({ error: "Unable to generate unique username" }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    }

    // ── Generate password ──
    const tempPassword = generatePassword(12);

    // ── Create auth user ──
    const { data: authUser, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
    });

    if (authError) {
      console.error("Auth user creation failed:", authError);
      return new Response(JSON.stringify({ error: `Auth error: ${authError.message}` }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const newUserId = authUser.user.id;

    // ── Create public.users record ──
    const { error: userInsertError } = await adminClient.from("users").insert({
      id: newUserId,
      username,
      email,
      first_name: firstName,
      last_name: lastName || null,
      phone: phone || null,
      badge_id: badgeId || null,
      role_id: roleId,
      password_hash: "SUPABASE_AUTH",
      status: "ACTIVE",
      force_password_change: true,
    });

    if (userInsertError) {
      console.error("public.users insert failed:", userInsertError);
      // Cleanup auth user
      await adminClient.auth.admin.deleteUser(newUserId);
      return new Response(JSON.stringify({ error: `User record error: ${userInsertError.message}` }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // ── Assign role ──
    const { error: roleInsertError } = await adminClient.from("user_roles").insert({
      user_id: newUserId,
      role_id: roleId,
    });

    if (roleInsertError) {
      console.error("Role assignment failed:", roleInsertError);
      // Non-fatal — user is created, role can be assigned manually
    }

    console.log("ERP user created successfully:", { userId: newUserId, username, email });

    return new Response(
      JSON.stringify({
        success: true,
        userId: newUserId,
        username,
        tempPassword,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("create-erp-user error:", error);
    return new Response(
      JSON.stringify({ error: error?.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
