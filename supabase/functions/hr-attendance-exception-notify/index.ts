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

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f7fb;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:28px 16px;">

    <!-- Brand header -->
    <div style="background:${BRAND.ink};border-radius:14px 14px 0 0;padding:22px 26px;">
      <img src="${BRAND.logo}" alt="Blynk Virtual Technologies" width="180" style="display:block;width:180px;max-width:60%;height:auto;background:#ffffff;padding:8px 12px;border-radius:8px;" />
    </div>

    <div style="background:#ffffff;border:1px solid #e6ecf3;border-top:none;border-radius:0 0 14px 14px;padding:28px 26px;">
      <div style="display:inline-block;background:${chipBg};color:${accent};border:1px solid ${accent}22;border-radius:999px;padding:5px 12px;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;">
        ${label} marked
      </div>

      <h1 style="margin:14px 0 10px;font-size:21px;line-height:1.3;color:${BRAND.ink};font-weight:700;">
        Attendance notice for ${esc(dateLabel)}
      </h1>

      <p style="margin:0 0 18px;font-size:14px;color:#475569;line-height:1.65;">
        Dear ${esc(d.employeeName || "Colleague")},<br/><br/>
        Based on the biometric attendance records, your attendance for <strong>${esc(dateLabel)}</strong>
        has been marked as <strong style="color:${accent}">${label}</strong>. The recorded details are shown below for your reference.
      </p>

      <table width="100%" cellpadding="0" cellspacing="0" style="border-top:2px solid ${BRAND.blue};margin:0 0 20px;">
        ${details}
      </table>

      <p style="margin:0 0 20px;font-size:14px;color:#475569;line-height:1.65;">
        This is an attendance record notice — not a penalty or disciplinary decision. If you believe this is incorrect
        (missed punch, device issue, approved off-site work or an incorrect shift), please raise an
        <strong>Attendance Regularization Request</strong> from your ERP profile under the <em>Attendance</em> tab.
        Your reporting manager and HR will review it.
      </p>

      <a href="${REG_LINK}" style="display:inline-block;background:${BRAND.blue};color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:14px;font-weight:700;">
        Raise regularization request
      </a>

      <p style="margin:14px 0 0;font-size:12px;color:#94a3b8;line-height:1.6;">
        Or open: <a href="${REG_LINK}" style="color:${BRAND.blue};text-decoration:none;">${REG_LINK}</a>
      </p>

      <!-- HR signature -->
      <div style="margin-top:30px;padding-top:22px;border-top:1px solid #eef2f7;">
        <div style="font-size:21px;font-weight:800;color:#5b62d6;line-height:1.25;">${BRAND.hrName}</div>
        <div style="font-size:13.5px;font-weight:700;color:${BRAND.ink};padding-bottom:7px;border-bottom:2px solid #5b62d6;">
          ${BRAND.hrTitle} &nbsp;|&nbsp; <a href="https://${BRAND.site}" style="color:${BRAND.ink};text-decoration:underline;">${BRAND.site}</a>
        </div>
        <table cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;border-collapse:collapse;">
          <tr>
            <td valign="top" width="96" style="width:96px;padding:2px 20px 0 0;">
              <img src="${BRAND.icon}" alt="Blynk Virtual Technologies" width="64" style="display:block;width:64px;height:auto;border:0;" />
            </td>
            <td valign="top">
              <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;font-size:13px;color:#334155;line-height:1.55;">
                <tr>
                  <td valign="top" style="padding:0 8px 4px 0;font-weight:700;color:${BRAND.ink};white-space:nowrap;">M:</td>
                  <td valign="top" style="padding:0 0 4px 0;">${BRAND.hrPhone}</td>
                </tr>
                <tr>
                  <td valign="top" style="padding:0 8px 4px 0;font-weight:700;color:${BRAND.ink};">E:</td>
                  <td valign="top" style="padding:0 0 4px 0;"><a href="mailto:${BRAND.hrEmail}" style="color:#334155;">${BRAND.hrEmail}</a></td>
                </tr>
                <tr>
                  <td valign="top" style="padding:0 8px 0 0;font-weight:700;color:${BRAND.ink};">A:</td>
                  <td valign="top" style="padding:0;">${BRAND.company},<br/>${BRAND.address}</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </div>

    </div>

    <p style="margin:16px 6px 0;font-size:11px;color:#94a3b8;line-height:1.6;text-align:center;">
      Automated attendance notice sent 24 hours after the day was marked. © ${new Date().getFullYear()} ${BRAND.company}
    </p>
  </div>
</body></html>`;

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
