import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BodySchema = z.object({
  email: z.string().email("Invalid email").max(255),
  otp: z.string().regex(/^\d{6}$/, "Invalid code"),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

const MAX_ATTEMPTS = 5;

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return json({ error: parsed.error.flatten().fieldErrors }, 400);
    }

    const email = parsed.data.email.trim().toLowerCase();
    const { otp, newPassword } = parsed.data;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    // Find the most recent unused OTP for this email
    const { data: otpRow } = await admin
      .from("erp_password_otps")
      .select("id, user_id, email, otp_hash, expires_at, attempts, used")
      .ilike("email", email)
      .eq("used", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!otpRow) {
      return json({ error: "No active reset code found. Please request a new one." }, 400);
    }

    if (new Date(otpRow.expires_at).getTime() < Date.now()) {
      await admin.from("erp_password_otps").update({ used: true }).eq("id", otpRow.id);
      return json({ error: "This code has expired. Please request a new one." }, 400);
    }

    if (otpRow.attempts >= MAX_ATTEMPTS) {
      await admin.from("erp_password_otps").update({ used: true }).eq("id", otpRow.id);
      return json({ error: "Too many incorrect attempts. Please request a new code." }, 429);
    }

    const otpHash = await sha256Hex(otp);
    if (otpHash !== otpRow.otp_hash) {
      await admin
        .from("erp_password_otps")
        .update({ attempts: otpRow.attempts + 1 })
        .eq("id", otpRow.id);
      const remaining = MAX_ATTEMPTS - (otpRow.attempts + 1);
      return json(
        { error: `Incorrect code.${remaining > 0 ? ` ${remaining} attempt(s) left.` : " Please request a new code."}` },
        400
      );
    }

    const userId = otpRow.user_id;

    // ── Reset password (reuses proven admin-reset-password logic) ──
    let { error: updateError } = await admin.auth.admin.updateUserById(userId, {
      password: newPassword,
    });

    if (updateError?.message?.toLowerCase().includes("user not found")) {
      const { data: targetUser } = await admin
        .from("users")
        .select("email")
        .eq("id", userId)
        .single();

      if (targetUser?.email) {
        let authMatch: { id: string } | undefined;
        let page = 1;
        const perPage = 1000;
        while (!authMatch) {
          const { data: listed, error: listError } = await admin.auth.admin.listUsers({ page, perPage });
          if (listError || !listed?.users?.length) break;
          authMatch = listed.users.find(
            (u) => (u.email ?? "").toLowerCase() === targetUser.email.toLowerCase()
          );
          if (listed.users.length < perPage) break;
          page++;
        }

        if (authMatch?.id) {
          const retry = await admin.auth.admin.updateUserById(authMatch.id, { password: newPassword });
          updateError = retry.error;
        } else {
          const { error: createError } = await admin.auth.admin.createUser({
            id: userId,
            email: targetUser.email,
            password: newPassword,
            email_confirm: true,
          });
          updateError = createError;
          if (!createError) {
            await admin.from("users").update({ password_hash: "SUPABASE_AUTH" }).eq("id", userId);
          }
        }
      }
    }

    if (updateError) {
      console.error("Failed to update password:", updateError);
      return json({ error: updateError.message || "Failed to reset password." }, 500);
    }

    // Mark OTP used
    await admin.from("erp_password_otps").update({ used: true }).eq("id", otpRow.id);

    // Best-effort legacy hash sync
    try {
      await admin.rpc("admin_reset_user_password", {
        p_user_id: userId,
        p_new_password: newPassword,
      });
    } catch (e: any) {
      console.warn("Legacy password hash sync skipped:", e?.message ?? e);
    }

    return json({ success: true, message: "Password reset successfully. You can now sign in." });
  } catch (error: any) {
    console.error("verify-erp-password-otp error:", error);
    return json({ error: error?.message || "Internal server error" }, 500);
  }
});
