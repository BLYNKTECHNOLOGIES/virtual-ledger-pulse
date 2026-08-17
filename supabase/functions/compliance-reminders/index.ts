// Compliance reminder engine — daily sweep that emails the compliance team about
// document expiry, hearings, legal follow-ups, idle cases, ageing approvals,

//
// actions:
//   run      { dryRun?: boolean }        -> daily sweep (idempotent via compliance_reminder_log)
//   preview  { email: string }           -> renders + sends today's digest to one address

import { createClient } from "npm:@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const APP_URL = "https://erp.blynkex.com";
const COMPLIANCE_LINK = `${APP_URL}/compliance`;

const BRAND = {
  company: "Blynkex",
  accent: "#1F4FD8",
};

function esc(s: string) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

function inr(n: number | null | undefined) {
  const v = Number(n || 0);
  return "\u20B9" + v.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function today(): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

function daysUntil(dateStr: string): number {
  const d = new Date(`${dateStr}T00:00:00+05:30`).getTime();
  const t = new Date(`${today()}T00:00:00+05:30`).getTime();
  return Math.round((d - t) / 86400000);
}

function prettyDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(`${String(dateStr).slice(0, 10)}T00:00:00+05:30`).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata",
  });
}

interface Item {
  key: string;              // idempotency key
  entityType: string;
  entityId: string | null;
  reminderType: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
  due: string;
}

function severityColor(s: Item["severity"]) {
  return s === "critical" ? "#B91C1C" : s === "warning" ? "#B45309" : "#1F4FD8";
}

function renderDigest(items: Item[], dateLabel: string) {
  const groups: Record<string, Item[]> = {};
  for (const it of items) (groups[it.reminderType] ||= []).push(it);

  const sectionTitles: Record<string, string> = {
    DOCUMENT_EXPIRY: "Documents expiring",
    HEARING_DUE: "Court hearings",
    LEGAL_FOLLOW_UP: "Legal follow-ups due",
    CASE_IDLE: "Cases with no update",
    APPROVAL_AGEING: "Approvals waiting",
    REGULATORY_DEADLINE: "Regulatory response deadlines",
    STATUTORY_DUE: "Statutory filings due",
    SLA_BREACH: "Cases past SLA",
  };

  const rows = Object.entries(groups)
    .map(([type, list]) => `
      <tr><td style="padding:18px 24px 6px 24px;font:600 12px/1.4 Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#64748B;">
        ${esc(sectionTitles[type] || type)} (${list.length})
      </td></tr>
      ${list.map((it) => `
        <tr><td style="padding:0 24px 10px 24px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E2E8F0;border-left:3px solid ${severityColor(it.severity)};border-radius:6px;">
            <tr><td style="padding:10px 14px;font:400 13px/1.5 Arial,sans-serif;color:#0F172A;">
              <strong>${esc(it.title)}</strong><br/>
              <span style="color:#475569;">${esc(it.detail)}</span><br/>
              <span style="color:${severityColor(it.severity)};font-weight:600;">${esc(it.due)}</span>
            </td></tr>
          </table>
        </td></tr>`).join("")}
    `).join("");

  const html = `<!doctype html><html><body style="margin:0;background:#F1F5F9;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:24px 0;">
    <tr><td align="center">
      <table width="640" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:10px;overflow:hidden;border:1px solid #E2E8F0;">
        <tr><td style="background:${BRAND.accent};padding:20px 24px;font:600 16px/1.3 Arial,sans-serif;color:#FFFFFF;">
          Compliance Daily Digest
          <div style="font:400 12px/1.4 Arial,sans-serif;color:#DBEAFE;margin-top:4px;">${esc(dateLabel)} · ${items.length} item(s) need attention</div>
        </td></tr>
        ${rows}
        <tr><td style="padding:20px 24px;">
          <a href="${COMPLIANCE_LINK}" style="display:inline-block;background:${BRAND.accent};color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font:600 13px Arial,sans-serif;">Open Compliance Management</a>
        </td></tr>
        <tr><td style="padding:16px 24px;border-top:1px solid #E2E8F0;font:400 11px/1.5 Arial,sans-serif;color:#94A3B8;">
          Automated notice from the ${esc(BRAND.company)} ERP compliance engine. Do not reply to this message.
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;

  const text = items.map((i) => `- [${i.reminderType}] ${i.title} — ${i.detail} (${i.due})`).join("\n");
  return { subject: `Compliance digest · ${items.length} item(s) · ${dateLabel}`, html, text };
}

async function collectItems(admin: any): Promise<Item[]> {
  const items: Item[] = [];
  const t = today();

  // 1. Document expiry T-60 / T-30 / T-7 / expired
  const { data: docs } = await admin
    .from("compliance_documents")
    .select("id, name, category, expiry_date")
    .not("expiry_date", "is", null)
    .lte("expiry_date", new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10));
  for (const d of docs || []) {
    const n = daysUntil(d.expiry_date);
    let bucket: number | null = null;
    if (n < 0) bucket = -1;
    else if (n <= 7) bucket = 7;
    else if (n <= 30) bucket = 30;
    else bucket = 60;
    const severity: Item["severity"] = n < 0 ? "critical" : n <= 7 ? "critical" : n <= 30 ? "warning" : "info";
    items.push({
      key: `DOCUMENT_EXPIRY:${d.id}:${bucket}`,
      entityType: "compliance_documents",
      entityId: d.id,
      reminderType: "DOCUMENT_EXPIRY",
      severity,
      title: d.name,
      detail: `Category: ${d.category || "—"}`,
      due: n < 0 ? `Expired on ${prettyDate(d.expiry_date)}` : `Expires ${prettyDate(d.expiry_date)} (in ${n} day${n === 1 ? "" : "s"})`,
    });
  }

  // 2. Hearings T-7 / T-1
  const { data: hearings } = await admin
    .from("legal_actions")
    .select("id, title, case_number, court_name, next_hearing_date")
    .not("next_hearing_date", "is", null)
    .gte("next_hearing_date", t)
    .lte("next_hearing_date", new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
  for (const h of hearings || []) {
    const n = daysUntil(h.next_hearing_date);
    const bucket = n <= 1 ? 1 : 7;
    items.push({
      key: `HEARING_DUE:${h.id}:${bucket}`,
      entityType: "legal_actions",
      entityId: h.id,
      reminderType: "HEARING_DUE",
      severity: n <= 1 ? "critical" : "warning",
      title: `${h.title}${h.case_number ? ` (${h.case_number})` : ""}`,
      detail: h.court_name || "Court not recorded",
      due: `Hearing on ${prettyDate(h.next_hearing_date)} (in ${n} day${n === 1 ? "" : "s"})`,
    });
  }

  // 3. Legal follow-ups due
  const { data: comms } = await admin
    .from("legal_communications")
    .select("id, party_name, subject, follow_up_date")
    .eq("follow_up_required", true)
    .not("follow_up_date", "is", null)
    .lte("follow_up_date", t);
  for (const c of comms || []) {
    items.push({
      key: `LEGAL_FOLLOW_UP:${c.id}:${c.follow_up_date}`,
      entityType: "legal_communications",
      entityId: c.id,
      reminderType: "LEGAL_FOLLOW_UP",
      severity: "warning",
      title: c.subject || "Legal communication",
      detail: `Party: ${c.party_name || "—"}`,
      due: `Follow-up due ${prettyDate(c.follow_up_date)}`,
    });
  }

  // 4. Idle cases (> 7 days no update) and SLA breaches
  const { data: cases } = await admin
    .from("bank_cases")
    .select("id, case_number, title, status, created_at, last_activity_at, sla_days, amount_involved")
    .not("status", "in", "(RESOLVED,CLOSED)");
  for (const c of cases || []) {
    const last = new Date(c.last_activity_at || c.created_at).getTime();
    const idleDays = Math.floor((Date.now() - last) / 86400000);
    if (idleDays >= 7) {
      items.push({
        key: `CASE_IDLE:${c.id}:${Math.floor(idleDays / 7)}`,
        entityType: "bank_cases",
        entityId: c.id,
        reminderType: "CASE_IDLE",
        severity: idleDays >= 21 ? "critical" : "warning",
        title: `${c.case_number} · ${c.title}`,
        detail: `${inr(c.amount_involved)} at stake · status ${c.status}`,
        due: `No update for ${idleDays} days`,
      });
    }
    const ageDays = Math.floor((Date.now() - new Date(c.created_at).getTime()) / 86400000);
    const sla = Number(c.sla_days || 15);
    if (ageDays > sla) {
      items.push({
        key: `SLA_BREACH:${c.id}:${Math.floor(ageDays / 7)}`,
        entityType: "bank_cases",
        entityId: c.id,
        reminderType: "SLA_BREACH",
        severity: "critical",
        title: `${c.case_number} · ${c.title}`,
        detail: `Open ${ageDays} days against an SLA of ${sla} days`,
        due: `SLA breached by ${ageDays - sla} day(s)`,
      });
    }
  }

  // 5. Approvals pending > 48h
  const { data: approvals } = await admin
    .from("investigation_approvals")
    .select("id, submitted_at, investigation_id")
    .eq("approval_status", "PENDING")
    .lt("submitted_at", new Date(Date.now() - 48 * 3600 * 1000).toISOString());
  for (const a of approvals || []) {
    const hrs = Math.floor((Date.now() - new Date(a.submitted_at).getTime()) / 3600000);
    items.push({
      key: `APPROVAL_AGEING:${a.id}:${Math.floor(hrs / 48)}`,
      entityType: "investigation_approvals",
      entityId: a.id,
      reminderType: "APPROVAL_AGEING",
      severity: hrs >= 120 ? "critical" : "warning",
      title: "Investigation awaiting approval",
      detail: `Submitted ${prettyDate(a.submitted_at)}`,
      due: `Waiting ${hrs} hours`,
    });
  }




  return items;
}

async function recipients(admin: any): Promise<string[]> {
  const { data: perms } = await admin
    .from("role_permissions")
    .select("role_id")
    .in("permission", ["compliance_manage", "compliance_approve"]);
  const roleIds = [...new Set((perms || []).map((p: any) => p.role_id))];
  if (!roleIds.length) return [];
  const { data: ur } = await admin.from("user_roles").select("user_id").in("role_id", roleIds);
  const userIds = [...new Set((ur || []).map((u: any) => u.user_id))];
  if (!userIds.length) return [];
  const { data: users } = await admin.from("users").select("email, status").in("id", userIds);
  return [...new Set((users || [])
    .filter((u: any) => u.email && String(u.status || "active").toLowerCase() === "active")
    .map((u: any) => String(u.email).trim()))];
}

async function getMailbox(admin: any) {
  const { data } = await admin.from("hr_mailboxes").select("*").eq("is_active", true).order("created_at").limit(1).maybeSingle();
  return data;
}

function makeClient(mailbox: any) {
  const host = Deno.env.get(mailbox?.smtp_host_secret || "") || Deno.env.get("HR_SMTP_HOST");
  const user = (Deno.env.get(mailbox?.smtp_user_secret || "") || Deno.env.get("HR_SMTP_USER") || "").trim();
  const pass = (Deno.env.get(mailbox?.smtp_pass_secret || "") || Deno.env.get("HR_SMTP_PASS") || "").replace(/\s+/g, "");
  if (!host || !user || !pass) throw new Error("SMTP credentials are not configured");
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
    // keep document status honest before reporting on it
    await admin.rpc("compliance_recompute_document_status");

    const all = await collectItems(admin);
    const dateLabel = prettyDate(today());

    if (action === "preview") {
      const to = String(body.email || "").trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return json({ error: "A valid email is required" }, 400);
      const mailbox = await getMailbox(admin);
      const { subject, html, text } = renderDigest(all, dateLabel);
      const { client, user } = makeClient(mailbox);
      await client.send({
        from: `${mailbox?.from_name || "Blynkex Compliance"} <${mailbox?.from_address || user}>`,
        to, subject, content: text, html,
      });
      await client.close();
      return json({ ok: true, sent_to: to, items: all.length });
    }

    // de-duplicate against the log
    const keys = all.map((i) => i.key);
    let fresh = all;
    if (keys.length) {
      const { data: seen } = await admin.from("compliance_reminder_log").select("reminder_key").in("reminder_key", keys);
      const seenSet = new Set((seen || []).map((s: any) => s.reminder_key));
      fresh = all.filter((i) => !seenSet.has(i.key));
    }

    if (!fresh.length) return json({ ok: true, scanned: all.length, sent: 0, reason: "nothing new" });

    const to = await recipients(admin);
    if (body.dryRun) return json({ ok: true, dryRun: true, scanned: all.length, new: fresh.length, recipients: to.length, items: fresh });
    if (!to.length) return json({ ok: true, scanned: all.length, sent: 0, reason: "no recipients with compliance permissions" });

    const mailbox = await getMailbox(admin);
    const { subject, html, text } = renderDigest(fresh, dateLabel);
    const { client, user } = makeClient(mailbox);
    await client.send({
      from: `${mailbox?.from_name || "Blynkex Compliance"} <${mailbox?.from_address || user}>`,
      to, subject, content: text, html,
    });
    await client.close();

    await admin.from("compliance_reminder_log").upsert(
      fresh.map((i) => ({
        reminder_key: i.key,
        entity_type: i.entityType,
        entity_id: i.entityId,
        reminder_type: i.reminderType,
        recipients: to,
      })),
      { onConflict: "reminder_key" },
    );

    return json({ ok: true, scanned: all.length, sent: fresh.length, recipients: to.length });
  } catch (e) {
    console.error("compliance-reminders error", e);
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
