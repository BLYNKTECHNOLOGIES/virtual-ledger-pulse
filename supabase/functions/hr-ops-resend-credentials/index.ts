// One-off maintenance function: re-issues ERP credentials for three onboardings
// whose credential email failed with SMTP 535 (stale HR_SMTP_* secrets).
// Scope is hard-limited to the user IDs below. Delete after use.
import { createClient } from "npm:@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TARGETS = [
  "77f34a5a-c477-428e-8202-382e0714a478",
  "3bdf6751-25ff-4ee1-9f7d-54b94701aa44",
  "e332176d-0955-49ea-b40f-fa3ee360287b",
];

const LOGIN_URL = "https://erp.blynkex.com";

function genPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return "Bly" + Array.from(bytes).map((b) => chars[b % chars.length]).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: mailbox } = await admin
    .from("hr_mailboxes").select("*").eq("is_active", true).order("created_at").limit(1).maybeSingle();
  const host = Deno.env.get(mailbox?.smtp_host_secret || "") || Deno.env.get("HR_SMTP_HOST");
  const user = (Deno.env.get(mailbox?.smtp_user_secret || "") || "").trim();
  const pass = (Deno.env.get(mailbox?.smtp_pass_secret || "") || "").replace(/\s+/g, "");
  if (!host || !user || !pass) {
    return new Response(JSON.stringify({ error: "SMTP not configured" }), { status: 500, headers: corsHeaders });
  }

  const results: any[] = [];

  for (const id of TARGETS) {
    try {
      const { data: u } = await admin
        .from("users").select("id, email, username, first_name, last_name").eq("id", id).maybeSingle();
      if (!u?.email) { results.push({ id, ok: false, error: "user not found" }); continue; }

      const tempPassword = genPassword();
      const { error: pwErr } = await admin.auth.admin.updateUserById(id, { password: tempPassword });
      if (pwErr) { results.push({ id, ok: false, error: `auth: ${pwErr.message}` }); continue; }
      await admin.from("users").update({ force_password_change: true, updated_at: new Date().toISOString() }).eq("id", id);

      const fullName = [u.first_name, u.last_name].filter(Boolean).join(" ");
      const subject = "Your Blynk ERP Login Credentials";
      const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#1a1a1a">Welcome to Blynk ERP</h2>
        <p>Dear ${fullName},</p>
        <p>Your ERP account is ready. Here are your login credentials:</p>
        <table style="border-collapse:collapse;margin:20px 0">
          <tr><td style="padding:8px 16px;font-weight:bold;background:#f5f5f5">Login URL</td><td style="padding:8px 16px"><a href="${LOGIN_URL}">${LOGIN_URL}</a></td></tr>
          <tr><td style="padding:8px 16px;font-weight:bold;background:#f5f5f5">Email</td><td style="padding:8px 16px">${u.email}</td></tr>
          <tr><td style="padding:8px 16px;font-weight:bold;background:#f5f5f5">Username</td><td style="padding:8px 16px">${u.username || ""}</td></tr>
          <tr><td style="padding:8px 16px;font-weight:bold;background:#f5f5f5">Temporary Password</td><td style="padding:8px 16px;font-family:monospace">${tempPassword}</td></tr>
        </table>
        <p style="color:#d32f2f;font-weight:bold">You will be required to change this password on first login.</p>
        <p>If you have any questions, please contact the HR department.</p>
        <hr style="margin:20px 0;border:none;border-top:1px solid #eee" />
        <p style="color:#888;font-size:12px">This is an automated message from Blynk Virtual Technologies HR.</p>
      </div>`;

      const client = new SMTPClient({
        connection: { hostname: host, port: 465, tls: true, auth: { username: user, password: pass } },
      });
      try {
        await client.send({
          from: `${mailbox?.from_name || "HR"} <${mailbox?.from_address || user}>`,
          to: u.email,
          subject,
          content: "Please view this email in an HTML-compatible client.",
          html,
        });
      } finally {
        try { await client.close(); } catch { /* ignore */ }
      }

      await admin.from("hr_email_send_log").insert({
        message_id: crypto.randomUUID(),
        template_name: "erp_credentials",
        recipient_email: u.email,
        subject,
        status: "sent",
      });
      results.push({ id, ok: true, email: u.email });
    } catch (e: any) {
      results.push({ id, ok: false, error: e?.message || String(e) });
    }
  }

  return new Response(JSON.stringify({ results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
