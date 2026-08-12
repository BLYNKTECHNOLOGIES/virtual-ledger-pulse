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

function shortDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00+05:30`);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
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
    d.lateBy ? row("Late by", `${d.lateBy} min`) : "",
    d.earlyBy ? row("Early out by", `${d.earlyBy} min`) : "",
  ].join("");

  const subject = `Attendance Notice: ${label} — ${shortDate(d.attendanceDate)}`;
  // Unique trailing token: prevents Gmail from collapsing the identical footer
  // of successive notices behind the "..." trimmed-content toggle.
  const noticeRef = `${d.attendanceDate.replace(/-/g, "")}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

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
          <p style="margin:0 0 14px;font-size:13px;color:#475569;line-height:1.6;">If this looks incorrect (missed punch, device issue, off-site work or wrong shift), raise an <strong>Attendance Regularization Request</strong> from your ERP profile &rsaquo; Attendance tab.</p>
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
            <div style="margin-top:10px;font-size:10px;color:#94a3b8;">Automated notice &middot; Ref ${esc(noticeRef)}</div>
          </div>
        </td>
      </tr>
    </table>
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
${BRAND.company}, ${BRAND.address}
Ref ${noticeRef}`;

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

    // ---------------- RESEND (single failed notice) ----------------
    if (action === "resend") {
      const logId = String(body.logId || "");
      if (!logId) return json({ error: "logId is required" }, 400);
      const { data: row } = await admin.from("hr_attendance_notice_log").select("*").eq("id", logId).maybeSingle();
      if (!row) return json({ error: "Notice not found" }, 404);
      const { data: emp } = await admin.from("hr_employees").select("first_name, last_name, email").eq("id", row.employee_id).maybeSingle();
      const { data: day } = await admin
        .from("hr_attendance_daily")
        .select("status, first_in, last_out, total_hours, late_by_minutes, early_by_minutes, punch_count, detected_shift_id")
        .eq("employee_id", row.employee_id).eq("attendance_date", row.attendance_date).maybeSingle();
      const to = row.email || emp?.email;
      if (!to) return json({ error: "No email on record for this employee" }, 400);
      const notice: NoticeData = {
        employeeName: [emp?.first_name, emp?.last_name].filter(Boolean).join(" ") || "Employee",
        attendanceDate: row.attendance_date,
        status: (day?.status === "absent" ? "absent" : "half_day"),
        firstIn: day?.first_in ?? null,
        lastOut: day?.last_out ?? null,
        totalHours: day?.total_hours ?? null,
        lateBy: day?.late_by_minutes ?? null,
        earlyBy: day?.early_by_minutes ?? null,
        punchCount: day?.punch_count ?? null,
        shiftName: null,
      };
      const { subject, html, text } = renderNotice(notice);
      const { client, user } = makeClient(mailbox);
      try {
        await client.send({ from: `${mailbox.from_name || "HR"} <${mailbox.from_address || user}>`, to, subject, content: text, html });
        await admin.from("hr_attendance_notice_log").update({
          status: "sent", sent_at: new Date().toISOString(), error_message: null,
          attempts: (row.attempts || 0) + 1, last_attempt_at: new Date().toISOString(),
        }).eq("id", logId);
        return json({ success: true, resentTo: to });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await admin.from("hr_attendance_notice_log").update({
          status: "failed", error_message: msg,
          attempts: (row.attempts || 0) + 1, last_attempt_at: new Date().toISOString(),
        }).eq("id", logId);
        return json({ error: msg }, 500);
      } finally {
        try { await client.close(); } catch { /* ignore */ }
      }
    }

    // ---------------- RUN ----------------
    const sinceDate = body.sinceDate || ACTIVATION_DATE;
    const dryRun = body.dryRun === true;
    const MAX_ATTEMPTS = 3;
    // Age gate is driven by the DAY, not by updated_at: the v4 engine rewrites
    // updated_at on every recompute, which would otherwise postpone mail forever.
    // A day qualifies once it is at least a full calendar day in the past (IST),
    // and its current status is still absent/half_day (read live below).
    const istNow = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    const maxDate = new Date(istNow.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    // Settling buffer: ignore rows the engine touched in the last 2 hours.
    const settleCutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    const { data: days } = await admin
      .from("hr_attendance_daily")
      .select("employee_id, attendance_date, status, first_in, last_out, total_hours, late_by_minutes, early_by_minutes, punch_count, detected_shift_id, updated_at")
      .in("status", ["absent", "half_day"])
      .gte("attendance_date", sinceDate)
      .lte("attendance_date", maxDate)
      .lte("updated_at", settleCutoff)
      .order("attendance_date", { ascending: false })
      .limit(500);

    const candidates = days || [];
    if (!candidates.length) return json({ success: true, considered: 0, sent: 0, failed: 0, skipped: 0 });

    const empIds = [...new Set(candidates.map((d: any) => d.employee_id))];
    const dates = [...new Set(candidates.map((d: any) => d.attendance_date))];
    const minDate = dates.reduce((a: string, b: string) => (a < b ? a : b));
    const maxCandDate = dates.reduce((a: string, b: string) => (a > b ? a : b));

    const { data: emps } = await admin
      .from("hr_employees")
      .select("id, first_name, last_name, email, is_active, last_working_day")
      .in("id", empIds);
    const empMap = new Map((emps || []).map((e: any) => [e.id, e]));

    // Existing log rows: sent/pending block; failed rows retry until MAX_ATTEMPTS.
    const { data: existingLogs } = await admin
      .from("hr_attendance_notice_log")
      .select("id, employee_id, attendance_date, status, attempts")
      .in("employee_id", empIds)
      .in("attendance_date", dates);
    const logMap = new Map((existingLogs || []).map((r: any) => [`${r.employee_id}|${r.attendance_date}`, r]));

    // Regularization: a rejected request leaves the day standing, so it does not block.
    const { data: regs } = await admin
      .from("hr_attendance_regularization_requests")
      .select("employee_id, attendance_date, status")
      .in("employee_id", empIds)
      .in("attendance_date", dates);
    const regKeys = new Set(
      (regs || []).filter((r: any) => String(r.status || "").toLowerCase() !== "rejected")
        .map((r: any) => `${r.employee_id}|${r.attendance_date}`),
    );

    // Approved leave covering the day — HR already knows, employee should not be nudged.
    const { data: leaves } = await admin
      .from("hr_leave_requests")
      .select("employee_id, start_date, end_date, status")
      .in("employee_id", empIds)
      .lte("start_date", maxCandDate)
      .gte("end_date", minDate);
    const approvedLeaves = (leaves || []).filter((l: any) => ["approved", "hr_approved"].includes(String(l.status || "").toLowerCase()));
    const onLeave = (empId: string, date: string) =>
      approvedLeaves.some((l: any) => l.employee_id === empId && l.start_date <= date && l.end_date >= date);

    // Company holidays (exact date or recurring day/month).
    const { data: holidays } = await admin.from("hr_holidays").select("date, recurring, is_active");
    const holidaySet = new Set<string>();
    const recurringSet = new Set<string>();
    for (const h of holidays || []) {
      if (h.is_active === false || !h.date) continue;
      holidaySet.add(String(h.date));
      if (h.recurring) recurringSet.add(String(h.date).slice(5));
    }
    const isHoliday = (date: string) => holidaySet.has(date) || recurringSet.has(date.slice(5));


    const shiftIds = [...new Set(candidates.map((d: any) => d.detected_shift_id).filter(Boolean))];
    const shiftMap = new Map<string, string>();
    if (shiftIds.length) {
      const { data: shifts } = await admin.from("hr_shifts").select("id, name").in("id", shiftIds);
      for (const s of shifts || []) shiftMap.set(s.id, s.name);
    }

    let sent = 0, failed = 0, skipped = 0, retried = 0;
    const skipReasons: Record<string, number> = {};
    const skip = (reason: string) => { skipped++; skipReasons[reason] = (skipReasons[reason] || 0) + 1; };
    let smtp: { client: SMTPClient; user: string } | null = null;

    for (const d of candidates) {
      const key = `${d.employee_id}|${d.attendance_date}`;
      const emp: any = empMap.get(d.employee_id);
      if (!emp) { skip("employee_missing"); continue; }
      if (!emp.is_active) { skip("inactive"); continue; }
      if (!emp.email) { skip("no_email"); continue; }
      // Separated staff: nothing after the last working day.
      if (emp.last_working_day && d.attendance_date > emp.last_working_day) { skip("post_lwd"); continue; }
      if (regKeys.has(key)) { skip("regularization_raised"); continue; }
      if (onLeave(d.employee_id, d.attendance_date)) { skip("approved_leave"); continue; }
      if (isHoliday(d.attendance_date)) { skip("holiday"); continue; }

      const existing: any = logMap.get(key);
      if (existing) {
        if (existing.status !== "failed") { skip("already_logged"); continue; }
        if ((existing.attempts || 0) >= MAX_ATTEMPTS) { skip("max_attempts"); continue; }
      }

      // Watchdog fairness gate — open stale session means HR owns the day.
      try {
        const { data: held } = await admin.rpc("hr_stale_session_held", {
          p_employee_id: d.employee_id,
          p_date: d.attendance_date,
        });
        if (held === true) { skip("stale_session_hold"); continue; }
      } catch { /* gate unavailable — proceed */ }

      if (dryRun) { sent++; continue; }

      const nowIso = new Date().toISOString();
      if (existing) {
        retried++;
        await admin.from("hr_attendance_notice_log")
          .update({ status: "pending", attempts: (existing.attempts || 0) + 1, last_attempt_at: nowIso, email: emp.email })
          .eq("id", existing.id);
      } else {
        // Claim the row first (unique constraint = idempotency anchor)
        const { error: claimErr } = await admin.from("hr_attendance_notice_log").insert({
          employee_id: d.employee_id,
          attendance_date: d.attendance_date,
          status_at_send: d.status,
          email: emp.email,
          status: "pending",
          attempts: 1,
          last_attempt_at: nowIso,
        });
        if (claimErr) { skip("claim_lost"); continue; }
      }


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
          .update({ status: "sent", sent_at: new Date().toISOString(), error_message: null, status_at_send: d.status })
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
        // Drop a poisoned SMTP connection so one bad send does not fail the batch.
        if (smtp) { try { await smtp.client.close(); } catch { /* ignore */ } smtp = null; }
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

    console.log(`[attendance-notice] considered=${candidates.length} sent=${sent} retried=${retried} failed=${failed} skipped=${skipped} ${JSON.stringify(skipReasons)}`);
    return json({ success: true, considered: candidates.length, sent, retried, failed, skipped, skipReasons, dryRun });

  } catch (e) {
    console.error("[attendance-notice] error", e);
    return json({ error: (e as Error).message }, 500);
  }
});
