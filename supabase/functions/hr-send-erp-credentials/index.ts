import { createClient } from "npm:@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { hrHeaderHtml, hrSignatureHtml, hrSignatureText } from "../_shared/hrSignature.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const LOGIN_URL = "https://erp.blynkex.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  try {
    // ---- caller must be an authenticated admin / HR staff ----
    const authHeader = req.headers.get("authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const { data: { user: caller } } = await admin.auth.getUser(authHeader.replace("Bearer ", "").trim());
    if (!caller?.id) return json({ error: "Unauthorized" }, 401);

    const { data: roleRows } = await admin
      .from("user_roles")
      .select("roles:role_id(name)")
      .eq("user_id", caller.id);
    const names = (roleRows ?? []).map((r: any) => String(r?.roles?.name || "").toLowerCase());
    const allowed = names.some((n) => ["admin", "super admin", "super_admin", "hr manager"].includes(n));
    if (!allowed) return json({ error: "Insufficient permissions" }, 403);

    const body = await req.json().catch(() => ({}));
    const to = String(body.email || "").trim();
    const fullName = String(body.fullName || "there").trim();
    const username = String(body.username || "").trim();
    const tempPassword = String(body.tempPassword || "").trim();
    const roleName = String(body.roleName || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return json({ error: "A valid recipient email is required" }, 400);
    if (!username || !tempPassword) return json({ error: "Username and temporary password are required" }, 400);

    const { data: mailbox } = await admin
      .from("hr_mailboxes")
      .select("*")
      .eq("is_active", true)
      .order("created_at")
      .limit(1)
      .maybeSingle();
    if (!mailbox) return json({ error: "No active HR mailbox configured" }, 400);

    const host = Deno.env.get(mailbox.smtp_host_secret) || Deno.env.get("HR_SMTP_HOST");
    const user = (Deno.env.get(mailbox.smtp_user_secret) || Deno.env.get("HR_SMTP_USER") || "").trim();
    const pass = (Deno.env.get(mailbox.smtp_pass_secret) || Deno.env.get("HR_SMTP_PASS") || "").replace(/\s+/g, "");
    if (!host || !user || !pass) return json({ error: "SMTP credentials are not configured for the HR mailbox" }, 500);

    const subject = "Your Blynkex ERP account credentials";
    const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f5f6f8;font-family:Arial,Helvetica,sans-serif;color:#1f2430">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px">
    <h1 style="margin:0 0 12px;font-size:20px">Your ERP account is ready</h1>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.6">Hi ${esc(fullName)},</p>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.6">
      An ERP account has been created for you${roleName ? ` with the role <b>${esc(roleName)}</b>` : ""}.
      Please sign in with the credentials below and change your password immediately — it is required on first login.
    </p>
    <table style="width:100%;font-size:14px;border-collapse:collapse;margin:0 0 16px">
      <tr><td style="padding:8px 0;color:#6b7280">Portal</td><td style="padding:8px 0"><a href="${LOGIN_URL}">${LOGIN_URL}</a></td></tr>
      <tr><td style="padding:8px 0;color:#6b7280">Login email</td><td style="padding:8px 0"><b>${esc(to)}</b></td></tr>
      <tr><td style="padding:8px 0;color:#6b7280">Username</td><td style="padding:8px 0"><b>${esc(username)}</b></td></tr>
      <tr><td style="padding:8px 0;color:#6b7280">Temporary password</td><td style="padding:8px 0"><b style="font-family:monospace">${esc(tempPassword)}</b></td></tr>
    </table>
    <p style="margin:0 0 8px;font-size:12px;color:#6b7280;line-height:1.6">
      Keep these credentials confidential. Never share your password with anyone, including IT or HR staff.
    </p>
    <p style="margin:16px 0 0;font-size:13px;line-height:1.6">Regards,<br/>${esc(mailbox.from_name || "HR")}<br/>Blynkex</p>
  </div>
</body></html>`;
    const text = `Hi ${fullName},

An ERP account has been created for you${roleName ? ` with the role ${roleName}` : ""}.

Portal: ${LOGIN_URL}
Login email: ${to}
Username: ${username}
Temporary password: ${tempPassword}

You will be asked to change this password on first login. Keep it confidential.

Regards,
${mailbox.from_name || "HR"} | Blynkex`;

    const client = new SMTPClient({
      connection: { hostname: host, port: 465, tls: true, auth: { username: user, password: pass } },
    });
    try {
      await client.send({
        from: `${mailbox.from_name || "HR"} <${mailbox.from_address || user}>`,
        to,
        subject,
        content: text,
        html,
      });
    } finally {
      try { await client.close(); } catch { /* ignore */ }
    }

    await admin.from("hr_email_send_log").insert({
      recipient_email: to,
      subject,
      status: "sent",
      template_name: "erp-credentials",
      sent_at: new Date().toISOString(),
    }).then(() => {}, () => {});

    return json({ success: true });
  } catch (e: any) {
    console.error("hr-send-erp-credentials error:", e);
    return json({ error: e?.message || "Internal error" }, 500);
  }
});
