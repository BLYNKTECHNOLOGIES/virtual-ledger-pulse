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

async function findAuthUserByEmail(adminClient: any, email: string) {
  const target = email.trim().toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const hit = (data?.users || []).find((u: any) => String(u.email || "").trim().toLowerCase() === target);
    if (hit) return hit;
    if (!data?.users?.length || data.users.length < 1000) break;
  }
  return null;
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

    // ── Pre-check email / phone collisions with a friendly message so the
    // wizard doesn't have to interpret raw PG unique-index errors on retry.
    const { data: emailHit } = await adminClient
      .from("users").select("id, username, first_name, last_name")
      .ilike("email", email).maybeSingle();
    if (emailHit?.id) {
      return new Response(JSON.stringify({
        error: `Email ${email} already belongs to ERP user "${emailHit.username}" (${[emailHit.first_name, emailHit.last_name].filter(Boolean).join(" ")}). Use a different email or link to that user.`,
      }), { status: 409, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }
    if (phone) {
      const digits = String(phone).replace(/\D/g, "").replace(/^0+/, "");
      const last10 = digits.slice(-10);
      if (last10.length >= 10) {
        const { data: phoneHits } = await adminClient
          .from("users").select("id, username, first_name, last_name, phone")
          .not("phone", "is", null);
        const phoneHit = (phoneHits || []).find((r: any) =>
          String(r.phone || "").replace(/\D/g, "").replace(/^0+/, "").slice(-10) === last10
        );
        if (phoneHit) {
          return new Response(JSON.stringify({
            error: `Phone ${phone} already belongs to ERP user "${phoneHit.username}" (${[phoneHit.first_name, phoneHit.last_name].filter(Boolean).join(" ")}). Update the onboarding phone number or link to that user.`,
          }), { status: 409, headers: { "Content-Type": "application/json", ...corsHeaders } });
        }
      }
    }

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

    // ── Create/reuse auth user ──
    // Onboarding retries can leave a Supabase Auth identity behind even when
    // the public.users insert failed. Reuse that orphan identity instead of
    // failing with "email already registered" or burning another employee flow.
    let reusedAuthUser = false;
    let authUserRecord: any = null;
    try {
      authUserRecord = await findAuthUserByEmail(adminClient, email);
    } catch (lookupError) {
      console.error("Auth email lookup failed:", lookupError);
      return new Response(JSON.stringify({ error: "Unable to verify existing auth user for this email. Please retry." }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (authUserRecord?.id) {
      reusedAuthUser = true;
      const { error: updateAuthError } = await adminClient.auth.admin.updateUserById(authUserRecord.id, {
        password: tempPassword,
        email_confirm: true,
      });
      if (updateAuthError) {
        console.error("Existing auth user password reset failed:", updateAuthError);
        return new Response(JSON.stringify({ error: `Auth link error: ${updateAuthError.message}` }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    } else {
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
      authUserRecord = authUser.user;
    }

    const newUserId = authUserRecord.id;

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
      // Cleanup only auth identities created by this request. If this was an
      // orphan auth identity from a previous partial failure, keep it for the
      // next retry/manual repair rather than deleting a real Auth record.
      if (!reusedAuthUser) await adminClient.auth.admin.deleteUser(newUserId);
      const raw = `${userInsertError.message} ${(userInsertError as any).details ?? ""}`.toLowerCase();
      let friendly = `User record error: ${userInsertError.message}`;
      if (raw.includes("users_unique_phone_normalized")) {
        friendly = "This phone number is already assigned to another user.";
      } else if (raw.includes("users_unique_email_ci")) {
        friendly = "This email is already assigned to another user.";
      }
      return new Response(JSON.stringify({ error: friendly }), {
        status: 409,
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
        reusedAuthUser,
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
