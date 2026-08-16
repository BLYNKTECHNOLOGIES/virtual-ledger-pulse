// HR workflow notifications (attendance regularization + leave approval).
// Sends from the configured HR mailbox (hr@blynkex.com) using the standard
// HR branding: Blynk header strip, card body, and the HR signature footer.
//
// body: {
//   kind: 'regularization' | 'leave',
//   eventType: string,
//   recipientEmail: string,
//   idempotencyKey?: string,
//   sample?: boolean,
//   data: { ...fields }
// }

import { createClient } from "npm:@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { HR_BRAND, hrHeaderHtml, hrSignatureHtml, hrSignatureText } from "../_shared/hrSignature.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const APP_URL = "https://erp.blynkex.com";
const B = HR_BRAND;

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

function prettyDate(dateStr?: string): string {
  if (!dateStr) return "";
  const d = new Date(`${dateStr}T00:00:00+05:30`);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
}
function shortDate(dateStr?: string): string {
  if (!dateStr) return "";
  const d = new Date(`${dateStr}T00:00:00+05:30`);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

type Tone = "approved" | "rejected" | "action" | "info";
const TONE: Record<Tone, { accent: string; chipBg: string }> = {
  approved: { accent: "#16a34a", chipBg: "#f0fdf4" },
  rejected: { accent: "#dc2626", chipBg: "#fef2f2" },
  action: { accent: "#d97706", chipBg: "#fffbeb" },
  info: { accent: B.blue, chipBg: "#f0f9ff" },
};

interface Meta {
  chip: string;
  heading: string;
  intro: string;
  tone: Tone;
  cta: string;
}

function linkFor(kind: string, role: string, requestId?: string): string {
  if (role === "hr") {
    return kind === "leave"
      ? `${APP_URL}/hrms/leave/requests`
      : `${APP_URL}/hrms/attendance/regularization`;
  }
  if (role === "manager") {
    return kind === "leave"
      ? `${APP_URL}/profile?tab=team`
      : `${APP_URL}/profile?tab=requests&regId=${requestId || ""}`;
  }
  return `${APP_URL}/profile?tab=requests`;
}

function regMeta(ev: string, d: Record<string, any>): Meta {
  const who = d.employeeName || "An employee";
  switch (ev) {
    case "reg_pushed_to_manager":
      return {
        chip: "Action required", tone: "action",
        heading: "Attendance regularization needs your confirmation",
        intro: `HR has forwarded ${who}'s attendance regularization request to you for confirmation.`,
        cta: "Review request",
      };
    case "reg_manager_decided":
      return {
        chip: "Awaiting HR", tone: "info",
        heading: "Regularization returned by reporting manager",
        intro: `The reporting manager has recorded a decision on ${who}'s regularization. HR approval is now required.`,
        cta: "Open HRMS",
      };
    case "reg_approved":
      return {
        chip: "Approved", tone: "approved",
        heading: "Your attendance regularization is approved",
        intro: "HR has approved your attendance regularization request. Your attendance record for this day has been updated.",
        cta: "View my requests",
      };
    case "reg_rejected":
      return {
        chip: "Not approved", tone: "rejected",
        heading: "Your attendance regularization was not approved",
        intro: "HR has reviewed and could not approve your attendance regularization request.",
        cta: "View my requests",
      };
    default:
      return {
        chip: "Action required", tone: "action",
        heading: "Attendance regularization needs HR review",
        intro: `${who} raised an attendance regularization request.`,
        cta: "Open HRMS",
      };
  }
}

function leaveMeta(ev: string, d: Record<string, any>): Meta {
  const who = d.employeeName || "An employee";
  switch (ev) {
    case "leave_manager_approved":
      return {
        chip: "Awaiting HR", tone: "info",
        heading: "Leave request approved by reporting manager",
        intro: `${who}'s leave request has been approved by the reporting manager and needs HR approval.`,
        cta: "Open HRMS",
      };
    case "leave_approved":
      return {
        chip: "Approved", tone: "approved",
        heading: "Your leave request is approved",
        intro: "HR has approved your leave request. The leave type and balance treatment are shown below.",
        cta: "View my requests",
      };
    case "leave_rejected":
      return {
        chip: "Not approved", tone: "rejected",
        heading: "Your leave request was not approved",
        intro: "HR has reviewed and could not approve your leave request.",
        cta: "View my requests",
      };
    default:
      return {
        chip: "Action required", tone: "action",
        heading: "Leave request awaiting your approval",
        intro: `${who} has applied for leave and is awaiting approval.`,
        cta: "Review request",
      };
  }
}

function buildRows(kind: string, d: Record<string, any>): Array<[string, string]> {
  const rows: Array<[string, string]> = [];
  const push = (k: string, v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v).trim();
    if (s && s !== "—" && s.toLowerCase() !== "none") rows.push([k, s]);
  };
  push("Employee", d.employeeName);
  if (kind === "leave") {
    push("Leave type", d.leaveType);
    const range = d.startDate === d.endDate
      ? prettyDate(d.startDate)
      : `${shortDate(d.startDate)} — ${shortDate(d.endDate)}`;
    push("Dates", range);
    push("Total days", d.totalDays);
    push("Reason", d.reason);
    push("Contact during leave", d.contactDuringLeave);
    push("Balance", d.balanceNote);
  } else {
    push("Date", prettyDate(d.attendanceDate));
    push("Requested in", d.requestedIn);
    push("Requested out", d.requestedOut);
    push("Category", d.reasonCategory);
    push("Reason", d.reason);
    push("Manager recommendation", d.managerRecommendation);
    push("Manager remarks", d.managerRemarks);
    push("HR notes", d.approverNotes);
  }
  push("Decided by", d.decidedBy);
  return rows;
}

function render(kind: string, eventType: string, d: Record<string, any>) {
  const meta = kind === "leave" ? leaveMeta(eventType, d) : regMeta(eventType, d);
  const tone = TONE[meta.tone];
  const rows = buildRows(kind, d);
  const link = linkFor(kind, d.recipientRole || "employee", d.requestId);

  const dateTag = kind === "leave" ? shortDate(d.startDate) : shortDate(d.attendanceDate);
  const subjectBase = kind === "leave" ? "Leave" : "Attendance regularization";
  const subject = `${subjectBase}: ${meta.chip}${dateTag ? ` — ${dateTag}` : ""}${
    d.recipientRole !== "employee" && d.employeeName ? ` · ${d.employeeName}` : ""
  }`;

  const ref = `${(dateTag || "").replace(/\s/g, "")}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;

  const rowsHtml = rows.map(([k, v]) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #eef2f7;color:#64748b;font-size:13px;">${esc(k)}</td>
      <td style="padding:10px 0;border-bottom:1px solid #eef2f7;color:${B.ink};font-size:13px;font-weight:600;text-align:right;">${esc(v)}</td>
    </tr>`).join("");

  const greetName = d.recipientName || (d.recipientRole === "employee" ? d.employeeName : null) || "Colleague";

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f7fb;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:24px 14px;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border:1px solid #e6ecf3;border-radius:12px;border-collapse:separate;">
      <tr><td>${hrHeaderHtml()}</td></tr>
      <tr>
        <td style="padding:20px 22px;">
          <div style="font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:${tone.accent};background:${tone.chipBg};display:inline-block;padding:4px 10px;border-radius:999px;">${esc(meta.chip)}</div>
          <h1 style="margin:12px 0 8px;font-size:18px;line-height:1.35;color:${B.ink};font-weight:700;">${esc(meta.heading)}</h1>
          <p style="margin:0 0 14px;font-size:13.5px;color:#475569;line-height:1.6;">Dear ${esc(greetName)}, ${esc(meta.intro)}</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">${rowsHtml}</table>
          <a href="${link}" style="display:inline-block;background:${tone.accent};color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:13px;font-weight:700;">${esc(meta.cta)}</a>
          ${hrSignatureHtml(`Automated notice · Ref ${ref}`)}
        </td>
      </tr>
    </table>
    <div style="text-align:center;font-size:10.5px;color:#94a3b8;padding:14px 6px;">Blynk Virtual Technologies Pvt. Ltd. · HRMS automated notification</div>
  </div>
</body></html>`;

  const text = `${meta.heading}

${meta.intro}

${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}

${meta.cta}: ${link}

${hrSignatureText(`Automated notice · Ref ${ref}`)}`;

  return { subject, html, text };
}

async function getMailbox(admin: any) {
  const { data } = await admin.from("hr_mailboxes").select("*").eq("is_active", true).order("created_at").limit(1).maybeSingle();
  return data;
}

function makeClient(mailbox: any) {
  const host = Deno.env.get(mailbox?.smtp_host_secret || "") || Deno.env.get("HR_SMTP_HOST");
  const user = (Deno.env.get(mailbox?.smtp_user_secret || "") || Deno.env.get("HR_SMTP_USER") || "").trim();
  const pass = (Deno.env.get(mailbox?.smtp_pass_secret || "") || Deno.env.get("HR_SMTP_PASS") || "").replace(/\s+/g, "");
  if (!host || !user || !pass) throw new Error("SMTP credentials are not configured for the HR mailbox");
  return {
    user,
    client: new SMTPClient({ connection: { hostname: host, port: 465, tls: true, auth: { username: user, password: pass } } }),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let body: any = {};
  try { body = await req.json(); } catch { /* ignore */ }

  const kind = body.kind === "leave" ? "leave" : "regularization";
  const eventType = String(body.eventType || "");
  const to = String(body.recipientEmail || "").trim();
  const data = (body.data && typeof body.data === "object") ? body.data : {};
  const sample = body.sample === true;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return json({ error: "A valid recipientEmail is required" }, 400);
  if (!eventType) return json({ error: "eventType is required" }, 400);

  const idempotencyKey = String(body.idempotencyKey || `${kind}-${eventType}-${to}-${crypto.randomUUID()}`);

  try {
    if (!sample) {
      const { data: prior } = await admin
        .from("hr_email_send_log")
        .select("id")
        .eq("message_id", idempotencyKey)
        .eq("status", "sent")
        .limit(1)
        .maybeSingle();
      if (prior) return json({ success: true, skipped: "already_sent" });
    }

    const mailbox = await getMailbox(admin);
    if (!mailbox) return json({ error: "No active HR mailbox configured" }, 400);

    const rendered = render(kind, eventType, data);
    const subject = sample ? `[SAMPLE] ${rendered.subject}` : rendered.subject;

    const { client, user } = makeClient(mailbox);
    try {
      await client.send({
        from: `${mailbox.from_name || "Blynkex HR"} <${mailbox.from_address || user}>`,
        to,
        subject,
        content: rendered.text,
        html: rendered.html,
      });
    } finally {
      try { await client.close(); } catch { /* ignore */ }
    }

    await admin.from("hr_email_send_log").insert({
      message_id: idempotencyKey,
      template_name: kind === "leave" ? "leave-approval" : "regularization-approval",
      recipient_email: to,
      subject,
      status: "sent",
      metadata: { kind, eventType, requestId: data.requestId ?? null, sample },
    });

    return json({ success: true, subject, sentFrom: mailbox.from_address || user });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("hr-workflow-notify failed", msg);
    await admin.from("hr_email_send_log").insert({
      message_id: idempotencyKey,
      template_name: kind === "leave" ? "leave-approval" : "regularization-approval",
      recipient_email: to,
      subject: `${kind} ${eventType}`,
      status: "failed",
      error_message: msg,
      metadata: { kind, eventType },
    });
    return json({ error: msg }, 500);
  }
});
