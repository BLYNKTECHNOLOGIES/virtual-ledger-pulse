import { createClient } from "npm:@supabase/supabase-js@2.50.0";
import { z } from "npm:zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BodySchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(100),
  lastName: z.string().trim().max(100).optional().default(""),
  username: z.string().trim().min(1, "Username is required").max(100),
  email: z.string().trim().email("Invalid email").max(255),
  phone: z.string().trim().max(30).optional().nullable(),
  badgeId: z.string().trim().max(50).optional().nullable(),
  password: z.string().min(6, "Password must be at least 6 characters").max(200),
});

// Mirror the phone normalization used elsewhere (digits only, keep last 10–15)
function normalizePhone(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length ? digits : null;
}

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

    const { firstName, lastName, username, email, phone, badgeId, password } = parsed.data;
    const normalizedEmail = email.toLowerCase();
    const normalizedPhone = normalizePhone(phone);

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    // ── Uniqueness: existing active/registered users ──
    const { data: emailUser } = await adminClient
      .from("users")
      .select("id")
      .ilike("email", normalizedEmail)
      .maybeSingle();
    if (emailUser) {
      return jsonResponse({ error: "This email is already registered." }, 409);
    }

    const { data: usernameUser } = await adminClient
      .from("users")
      .select("id")
      .eq("username", username)
      .maybeSingle();
    if (usernameUser) {
      return jsonResponse({ error: "This username is already taken." }, 409);
    }

    if (normalizedPhone) {
      const { data: phoneUser } = await adminClient
        .from("users")
        .select("id, phone")
        .not("phone", "is", null);
      const phoneTaken = (phoneUser ?? []).some(
        (u: { phone: string | null }) => normalizePhone(u.phone) === normalizedPhone
      );
      if (phoneTaken) {
        return jsonResponse({ error: "This phone number is already registered." }, 409);
      }
    }

    // ── Uniqueness: pending registrations awaiting approval ──
    const { data: pendingRows } = await adminClient
      .from("pending_registrations")
      .select("email, username, phone")
      .in("status", ["PENDING", "pending"]);

    for (const row of pendingRows ?? []) {
      if ((row.email ?? "").toLowerCase() === normalizedEmail) {
        return jsonResponse({ error: "A registration with this email is already pending approval." }, 409);
      }
      if ((row.username ?? "") === username) {
        return jsonResponse({ error: "A registration with this username is already pending approval." }, 409);
      }
      if (normalizedPhone && normalizePhone(row.phone) === normalizedPhone) {
        return jsonResponse({ error: "A registration with this phone number is already pending approval." }, 409);
      }
    }

    // ── Create the Supabase auth user (so they can log in once approved) ──
    const { data: authUser, error: authError } = await adminClient.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
    });

    if (authError || !authUser?.user) {
      console.error("Auth user creation failed:", authError);
      return jsonResponse(
        { error: authError?.message?.includes("already") ? "This email is already registered." : "Could not create the account. Please try again." },
        409
      );
    }

    const newUserId = authUser.user.id;

    // ── Create public.users record in PENDING state (no role yet) ──
    const { error: userInsertError } = await adminClient.from("users").insert({
      id: newUserId,
      username,
      email: normalizedEmail,
      first_name: firstName,
      last_name: lastName || null,
      phone: phone || null,
      badge_id: badgeId || null,
      password_hash: "SUPABASE_AUTH",
      status: "PENDING",
      force_password_change: false,
    });

    if (userInsertError) {
      console.error("public.users insert failed:", userInsertError);
      // Remove the auto-created employee row (FK ON DELETE RESTRICT) then the auth user
      await adminClient.from("employees").delete().eq("user_id", newUserId);
      await adminClient.auth.admin.deleteUser(newUserId);
      const raw = `${userInsertError.message} ${(userInsertError as { details?: string }).details ?? ""}`.toLowerCase();
      let friendly = "Could not complete registration. Please try again.";
      if (raw.includes("phone")) friendly = "This phone number is already registered.";
      else if (raw.includes("email")) friendly = "This email is already registered.";
      else if (raw.includes("username")) friendly = "This username is already taken.";
      return jsonResponse({ error: friendly }, 409);
    }


    // ── Create the pending registration record (approval queue) ──
    const { error: regError } = await adminClient.from("pending_registrations").insert({
      username,
      email: normalizedEmail,
      first_name: firstName,
      last_name: lastName || null,
      phone: phone || null,
      badge_id: badgeId || null,
      password_hash: "SUPABASE_AUTH",
      status: "PENDING",
      user_id: newUserId,
    });

    if (regError) {
      console.error("pending_registrations insert failed:", regError);
      await adminClient.from("users").delete().eq("id", newUserId);
      await adminClient.from("employees").delete().eq("user_id", newUserId);
      await adminClient.auth.admin.deleteUser(newUserId);
      return jsonResponse({ error: "Could not submit registration. Please try again." }, 500);
    }


    console.log("Registration submitted:", { userId: newUserId, username, email: normalizedEmail });

    return jsonResponse({ success: true });
  } catch (error) {
    console.error("register-erp-user error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return jsonResponse({ error: message }, 500);
  }
});
