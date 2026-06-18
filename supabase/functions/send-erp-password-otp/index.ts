import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BodySchema = z.object({
  email: z.string().email("Invalid email").max(255),
});

const GENERIC_RESPONSE = {
  success: true,
  message: "If an account exists for this email, a verification code has been sent.",
};

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

  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const email = parsed.data.email.trim().toLowerCase();

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    // Look up active ERP user by email (case-insensitive)
    const { data: user } = await admin
      .from("users")
      .select("id, email, first_name, status")
      .ilike("email", email)
      .maybeSingle();

    // Generic response to prevent account enumeration
    const respondGeneric = () =>
      new Response(JSON.stringify(GENERIC_RESPONSE), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    if (!user || user.status !== "ACTIVE" || !user.email) {
      return respondGeneric();
    }

    // Generate 6-digit OTP
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const otpHash = await sha256Hex(otp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    // Invalidate any prior unused OTPs for this user
    await admin
      .from("erp_password_otps")
      .update({ used: true })
      .eq("user_id", user.id)
      .eq("used", false);

    const { error: insertError } = await admin.from("erp_password_otps").insert({
      user_id: user.id,
      email: user.email,
      otp_hash: otpHash,
      expires_at: expiresAt,
    });

    if (insertError) {
      console.error("Failed to store OTP:", insertError);
      return new Response(JSON.stringify({ error: "Failed to generate code. Please try again." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send the OTP email via the app-email infrastructure
    const { error: emailError } = await admin.functions.invoke("send-transactional-email", {
      body: {
        templateName: "erp-password-otp",
        recipientEmail: user.email,
        idempotencyKey: `erp-pwd-otp-${user.id}-${Date.now()}`,
        templateData: {
          otp,
          recipientName: user.first_name || undefined,
          expiryMinutes: 10,
        },
      },
    });

    if (emailError) {
      console.error("Failed to send OTP email:", emailError);
      return new Response(JSON.stringify({ error: "Failed to send email. Please try again." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return respondGeneric();
  } catch (error: any) {
    console.error("send-erp-password-otp error:", error);
    return new Response(JSON.stringify({ error: error?.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
