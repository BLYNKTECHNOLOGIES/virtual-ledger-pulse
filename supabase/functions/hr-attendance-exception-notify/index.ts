// Attendance exception notice — emails an employee 24h after a day is marked
// absent / half_day, from the configured HR mailbox (hr@blynkex.com).
//
// actions:
//   preview  { email, employeeId?, date? }  -> renders + sends one sample
//   run      { dryRun?, sinceDate? }        -> hourly sweep (idempotent)

import { createClient } from "npm:@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const APP_URL = "https://erp.blynkex.com";
const REG_LINK = `${APP_URL}/profile?tab=attendance`;
// Do not consider anything before this date (avoids a burst of historical mail).
const ACTIVATION_DATE = "2026-08-12";

interface NoticeData {
  employeeName: string;
  attendanceDate: string;
  status: "absent" | "half_day";
  firstIn: string | null;
  lastOut: string | null;
  totalHours: number | null;
  lateBy: number | null;
  earlyBy: number | null;
  punchCount: number | null;
  shiftName: string | null;
}

function istTime(ts: string | null): string | null {
  if (!ts) return null;
  const d = new Date(ts);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
}

function prettyDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00+05:30`);
  return d.toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
}

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

const BRAND = {
  logo: "https://erp.blynkex.com/__l5e/assets-v1/2ac6088a-a0a4-4047-8220-03319fe0ec29/blynk-wordmark.png",
  icon: "https://erp.blynkex.com/__l5e/assets-v1/ae377ace-4faa-43a4-930f-e3a7ae48a885/blynk-icon-transparent.png",
  blue: "#00AEEF",
  ink: "#0B1524",
  hrName: "Honey Sewani",
  hrTitle: "Human Resources",
  hrPhone: "+91 74707 56539",
  hrEmail: "hr.desk@blynkex.com",
  site: "www.blynkex.com",
  company: "Blynk Virtual Technologies Pvt. Ltd.",
  address: "Bhopal, 462021, India",
};

function renderNotice(d: NoticeData): { subject: string; html: string; text: string } {
  const isAbsent = d.status === "absent";
  const accent = isAbsent ? "#dc2626" : "#d97706";
  const chipBg = isAbsent ? "#fef2f2" : "#fffbeb";
  const label = isAbsent ? "Absent" : "Half Day";
  const dateLabel = prettyDate(d.attendanceDate);
  const inT = istTime(d.firstIn);
  const outT = istTime(d.lastOut);
  const noPunches = !inT && !outT;

  const row = (k: string, v: string) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #eef2f7;color:#64748b;font-size:13px;">${esc(k)}</td>
      <td style="padding:10px 0;border-bottom:1px solid #eef2f7;color:${BRAND.ink};font-size:13px;font-weight:600;text-align:right;">${esc(v)}</td>
    </tr>`;

  const details = [
    row("Date", dateLabel),
    noPunches
      ? row("Punches", "No punches recorded")
      : row("Office in", inT || "—") + row("Office out", outT || "—"),
    d.totalHours != null ? row("Hours worked", `${Number(d.totalHours).toFixed(2)} h`) : "",
    d.punchCount != null && !noPunches ? row("Punch count", String(d.punchCount)) : "",
    d.lateBy ? row("Late by", `${d.lateBy} min`) : "",
    d.earlyBy ? row("Early out by", `${d.earlyBy} min`) : "",
    d.shiftName ? row("Shift considered", d.shiftName) : "",
  ].join("");

  const subject = `Attendance marked ${label} — ${dateLabel}`;

  const rawHtml = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f7fb;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:24px 14px;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border:1px solid #e6ecf3;border-radius:12px;border-collapse:separate;">
      <tr>
        <td style="padding:16px 22px;border-bottom:2px solid ${BRAND.blue};">
          <table cellpadding="0" cellspacing="0" border="0"><tr>
            <td valign="middle" style="padding-right:10px;"><img src="${BRAND.icon}" alt="Blynk" width="26" style="display:block;width:26px;height:auto;border:0;" /></td>
            <td valign="middle" style="font-size:14px;font-weight:800;letter-spacing:.06em;color:${BRAND.ink};">BLYNK <span style="font-weight:500;">VIRTUAL TECHNOLOGIES</span></td>
          </tr></table>
        </td>
      </tr>
      <tr>
        <td style="padding:20px 22px;">
          <div style="font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:${accent};background:${chipBg};display:inline-block;padding:4px 10px;border-radius:999px;">${label} marked</div>
          <h1 style="margin:12px 0 8px;font-size:18px;line-height:1.35;color:${BRAND.ink};font-weight:700;">Attendance marked ${label} — ${esc(dateLabel)}</h1>
          <p style="margin:0 0 14px;font-size:13.5px;color:#475569;line-height:1.6;">Dear ${esc(d.employeeName || "Colleague")}, your biometric attendance for this day was recorded as below.</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">${details}</table>
          <p style="margin:0 0 14px;font-size:13px;color:#475569;line-height:1.6;">If this looks incorrect (missed punch, device issue, off-site work or wrong shift), raise an <strong>Attendance Regularization Request</strong> from your ERP profile &rsaquo; Attendance tab. Manager and HR will review it.</p>
          <a href="${REG_LINK}" style="display:inline-block;background:${BRAND.blue};color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:13px;font-weight:700;">Raise regularization request</a>
          <div style="margin-top:22px;padding-top:16px;border-top:1px solid #eef2f7;">
            <div style="font-size:15px;font-weight:800;color:#5b62d6;line-height:1.2;">${BRAND.hrName}</div>
            <div style="font-size:11.5px;font-weight:700;color:${BRAND.ink};padding-bottom:4px;border-bottom:1.5px solid #5b62d6;">${BRAND.hrTitle} &nbsp;|&nbsp; <a href="https://${BRAND.site}" style="color:${BRAND.ink};text-decoration:underline;">${BRAND.site}</a></div>
            <table cellpadding="0" cellspacing="0" border="0" style="margin-top:10px;border-collapse:collapse;"><tr>
              <td valign="top" width="48" style="width:48px;padding:2px 12px 0 0;"><img src="${BRAND.icon}" alt="Blynk" width="34" style="display:block;width:34px;height:auto;border:0;" /></td>
              <td valign="top"><table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;font-size:11px;color:#334155;line-height:1.45;">
                <tr><td valign="top" style="padding:0 6px 2px 0;font-weight:700;color:${BRAND.ink};">M:</td><td valign="top" style="padding:0 0 2px 0;white-space:nowrap;">${BRAND.hrPhone}</td></tr>
                <tr><td valign="top" style="padding:0 6px 2px 0;font-weight:700;color:${BRAND.ink};">E:</td><td valign="top" style="padding:0 0 2px 0;"><a href="mailto:${BRAND.hrEmail}" style="color:#334155;">${BRAND.hrEmail}</a></td></tr>
                <tr><td valign="top" style="padding:0 6px 0 0;font-weight:700;color:${BRAND.ink};">A:</td><td valign="top" style="padding:0;">${BRAND.company}, ${BRAND.address}</td></tr>
              </table></td>
            </tr></table>
          </div>
        </td>
      </tr>
    </table>
    <p style="margin:12px 6px 0;font-size:10.5px;color:#94a3b8;line-height:1.5;text-align:center;">Automated notice sent 24 hours after the day was marked. &copy; ${new Date().getFullYear()} ${BRAND.company}</p>
  </div>
</body></html>`;

  // Collapse indentation/newlines between tags — avoids quoted-printable "=20"
  // artifacts leaking into the rendered mail.
  const html = rawHtml.replace(/>\s+</g, "><").replace(/[ \t]+\n/g, "\n").replace(/\n/g, "");


  const text = `Attendance notice — ${label} on ${dateLabel}
Office in: ${inT || "no punch"} | Office out: ${outT || "no punch"}
If this is incorrect, raise an Attendance Regularization Request in the ERP: ${REG_LINK}

${BRAND.hrName} | ${BRAND.hrTitle}
M: ${BRAND.hrPhone} | E: ${BRAND.hrEmail}
${BRAND.company}, ${BRAND.address}`;

  return { subject, html, text };
}


async function getMailbox(admin: any) {
  const { data } = await admin.from("hr_mailboxes").select("*").eq("is_active", true).order("created_at").limit(1).maybeSingle();
  return data;
}

function makeClient(mailbox: any) {
  const host = Deno.env.get(mailbox.smtp_host_secret) || Deno.env.get("HR_SMTP_HOST");
  const user = (Deno.env.get(mailbox.smtp_user_secret) || Deno.env.get("HR_SMTP_USER") || "").trim();
  const pass = (Deno.env.get(mailbox.smtp_pass_secret) || Deno.env.get("HR_SMTP_PASS") || "").replace(/\s+/g, "");
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
  try { body = await req.json(); } catch { /* cron sends empty body */ }
  const action = body.action || "run";

  try {
    const mailbox = await getMailbox(admin);
    if (!mailbox) return json({ error: "No active HR mailbox configured" }, 400);

    // ---------------- PREVIEW ----------------
    if (action === "preview") {
      const to = String(body.email || "").trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return json({ error: "A valid email is required" }, 400);

      let data: NoticeData | null = null;

      const { data: day } = await admin
        .from("hr_attendance_daily")
        .select("employee_id, attendance_date, status, first_in, last_out, total_hours, late_by_minutes, early_by_minutes, punch_count, detected_shift_id")
        .in("status", ["absent", "half_day"])
        .order("attendance_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (day) {
        const { data: emp } = await admin.from("hr_employees").select("first_name, last_name").eq("id", day.employee_id).maybeSingle();
        let shiftName: string | null = null;
        if (day.detected_shift_id) {
          const { data: sh } = await admin.from("hr_shifts").select("name").eq("id", day.detected_shift_id).maybeSingle();
          shiftName = sh?.name || null;
        }
        data = {
          employeeName: body.employeeName || [emp?.first_name, emp?.last_name].filter(Boolean).join(" ") || "Employee",
          attendanceDate: day.attendance_date,
          status: day.status,
          firstIn: day.first_in,
          lastOut: day.last_out,
          totalHours: day.total_hours,
          lateBy: day.late_by_minutes,
          earlyBy: day.early_by_minutes,
          punchCount: day.punch_count,
          shiftName,
        };
      } else {
        data = {
          employeeName: body.employeeName || "Employee",
          attendanceDate: new Date().toISOString().slice(0, 10),
          status: "half_day",
          firstIn: null,
          lastOut: null,
          totalHours: 0,
          lateBy: null,
          earlyBy: null,
          punchCount: 0,
          shiftName: null,
        };
      }

      const { subject, html, text } = renderNotice(data!);
      const { client, user } = makeClient(mailbox);
      await client.send({
        from: `${mailbox.from_name || "HR"} <${mailbox.from_address || user}>`,
        to,
        subject: `[SAMPLE] ${subject}`,
        content: text,
        html,
      });
      try { await client.close(); } catch { /* ignore */ }

      await admin.from("hr_email_send_log").insert({
        message_id: crypto.randomUUID(),
        template_name: "attendance-exception-notice",
        recipient_email: to,
        subject: `[SAMPLE] ${subject}`,
        status: "sent",
      });

      return json({ success: true, sampleSentTo: to, subject, basedOn: data });
    }

    // ---------------- RUN ----------------
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const sinceDate = body.sinceDate || ACTIVATION_DATE;
    const dryRun = body.dryRun === true;

    const { data: days } = await admin
      .from("hr_attendance_daily")
      .select("employee_id, attendance_date, status, first_in, last_out, total_hours, late_by_minutes, early_by_minutes, punch_count, detected_shift_id, updated_at")
      .in("status", ["absent", "half_day"])
      .gte("attendance_date", sinceDate)
      .lte("updated_at", cutoff)
      .order("attendance_date", { ascending: false })
      .limit(500);

    const candidates = days || [];
    if (!candidates.length) return json({ success: true, considered: 0, sent: 0, failed: 0, skipped: 0 });

    const empIds = [...new Set(candidates.map((d: any) => d.employee_id))];
    const dates = [...new Set(candidates.map((d: any) => d.attendance_date))];

    const { data: emps } = await admin
      .from("hr_employees")
      .select("id, first_name, last_name, email, is_active")
      .in("id", empIds);
    const empMap = new Map((emps || []).map((e: any) => [e.id, e]));

    const { data: alreadySent } = await admin
      .from("hr_attendance_notice_log")
      .select("employee_id, attendance_date")
      .in("employee_id", empIds)
      .in("attendance_date", dates);
    const sentKeys = new Set((alreadySent || []).map((r: any) => `${r.employee_id}|${r.attendance_date}`));

    const { data: regs } = await admin
      .from("hr_attendance_regularization_requests")
      .select("employee_id, attendance_date")
      .in("employee_id", empIds)
      .in("attendance_date", dates);
    const regKeys = new Set((regs || []).map((r: any) => `${r.employee_id}|${r.attendance_date}`));

    const shiftIds = [...new Set(candidates.map((d: any) => d.detected_shift_id).filter(Boolean))];
    const shiftMap = new Map<string, string>();
    if (shiftIds.length) {
      const { data: shifts } = await admin.from("hr_shifts").select("id, name").in("id", shiftIds);
      for (const s of shifts || []) shiftMap.set(s.id, s.name);
    }

    let sent = 0, failed = 0, skipped = 0;
    let smtp: { client: SMTPClient; user: string } | null = null;

    for (const d of candidates) {
      const key = `${d.employee_id}|${d.attendance_date}`;
      const emp: any = empMap.get(d.employee_id);
      if (!emp || !emp.is_active || !emp.email || sentKeys.has(key) || regKeys.has(key)) { skipped++; continue; }

      // Watchdog fairness gate — open stale session means HR owns the day.
      try {
        const { data: held } = await admin.rpc("hr_stale_session_held", {
          p_employee_id: d.employee_id,
          p_date: d.attendance_date,
        });
        if (held === true) { skipped++; continue; }
      } catch { /* gate unavailable — proceed */ }

      if (dryRun) { sent++; continue; }

      // Claim the row first (unique constraint = idempotency anchor)
      const { error: claimErr } = await admin.from("hr_attendance_notice_log").insert({
        employee_id: d.employee_id,
        attendance_date: d.attendance_date,
        status_at_send: d.status,
        email: emp.email,
        status: "pending",
      });
      if (claimErr) { skipped++; continue; }

      const data: NoticeData = {
        employeeName: [emp.first_name, emp.last_name].filter(Boolean).join(" ") || "Employee",
        attendanceDate: d.attendance_date,
        status: d.status,
        firstIn: d.first_in,
        lastOut: d.last_out,
        totalHours: d.total_hours,
        lateBy: d.late_by_minutes,
        earlyBy: d.early_by_minutes,
        punchCount: d.punch_count,
        shiftName: d.detected_shift_id ? shiftMap.get(d.detected_shift_id) || null : null,
      };
      const { subject, html, text } = renderNotice(data);

      try {
        if (!smtp) smtp = makeClient(mailbox);
        await smtp.client.send({
          from: `${mailbox.from_name || "HR"} <${mailbox.from_address || smtp.user}>`,
          to: emp.email,
          subject,
          content: text,
          html,
        });
        sent++;
        await admin.from("hr_attendance_notice_log")
          .update({ status: "sent", sent_at: new Date().toISOString(), error_message: null })
          .eq("employee_id", d.employee_id).eq("attendance_date", d.attendance_date);
        await admin.from("hr_email_send_log").insert({
          message_id: crypto.randomUUID(),
          template_name: "attendance-exception-notice",
          recipient_email: emp.email,
          subject,
          status: "sent",
        });
      } catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : String(err);
        await admin.from("hr_attendance_notice_log")
          .update({ status: "failed", error_message: msg })
          .eq("employee_id", d.employee_id).eq("attendance_date", d.attendance_date);
        await admin.from("hr_email_send_log").insert({
          message_id: crypto.randomUUID(),
          template_name: "attendance-exception-notice",
          recipient_email: emp.email,
          subject,
          status: "failed",
          error_message: msg,
        });
      }
    }

    if (smtp) { try { await smtp.client.close(); } catch { /* ignore */ } }

    console.log(`[attendance-notice] considered=${candidates.length} sent=${sent} failed=${failed} skipped=${skipped}`);
    return json({ success: true, considered: candidates.length, sent, failed, skipped, dryRun });
  } catch (e) {
    console.error("[attendance-notice] error", e);
    return json({ error: (e as Error).message }, 500);
  }
});
