import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type AtsMessage = Tables<"ats_messages">;
export type AtsEmailTemplate = Tables<"ats_email_templates">;

export interface MailStatus {
  enabled: boolean;
  mailbox_id: string | null;
  backfill_days: number;
  ack_enabled: boolean;
  reject_default: boolean;
  mailboxes: { id: string; label: string | null; from_address: string; from_name: string | null; can_receive: boolean }[];
  sync: {
    started_at: string | null; last_run_at: string | null; last_ok_at: string | null;
    last_error: string | null; last_error_at: string | null; last_stats: Record<string, any> | null;
  } | null;
  unread: number;
  failed_7d: number;
  queued: number;
}

export interface MailAttachmentInfo {
  name?: string; mime?: string; size?: number; file_id?: string; storage_path?: string;
  skipped?: string; duplicate?: boolean;
}

export const mailKeys = {
  status: ["ats", "mail", "status"] as const,
  thread: (candidateId: string) => ["ats", "mail", "thread", candidateId] as const,
  templates: ["ats", "mail", "templates"] as const,
};

export const PURPOSES = [
  { value: "general", label: "General" },
  { value: "acknowledgement", label: "Acknowledgement" },
  { value: "rejection", label: "Rejection" },
  { value: "interview", label: "Interview" },
  { value: "offer", label: "Offer" },
] as const;
export const purposeLabel = (p?: string | null) => PURPOSES.find((x) => x.value === p)?.label ?? "General";

export const useMailStatus = () =>
  useQuery({
    queryKey: mailKeys.status,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ats_mail_status");
      if (error) throw error;
      return (data ?? null) as unknown as MailStatus | null;
    },
  });

const msgTime = (m: AtsMessage) => new Date(m.received_at ?? m.sent_at ?? m.created_at).getTime();

export const useMailThread = (candidateId: string | undefined, opts: { poll?: boolean } = {}) =>
  useQuery({
    queryKey: mailKeys.thread(candidateId ?? ""),
    enabled: !!candidateId,
    refetchInterval: opts.poll ? 60_000 : false,
    queryFn: async () => {
      const { data, error } = await supabase.from("ats_messages").select("*").eq("candidate_id", candidateId!);
      if (error) throw error;
      return [...(data ?? [])].sort((a, b) => msgTime(a) - msgTime(b));
    },
  });

export const useEmailTemplates = (opts: { includeInactive?: boolean } = {}) =>
  useQuery({
    queryKey: [...mailKeys.templates, !!opts.includeInactive],
    queryFn: async () => {
      let q = supabase.from("ats_email_templates").select("*");
      if (!opts.includeInactive) q = q.eq("is_active", true);
      const { data, error } = await q.order("sort_order").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

export async function renderTemplate(templateId: string, applicationId: string | null, candidateId: string) {
  const { data, error } = await supabase.rpc("ats_render_template", {
    p_template_id: templateId, p_application_id: applicationId as any, p_candidate_id: candidateId,
  });
  if (error) throw error;
  return data as unknown as { subject: string; body: string; template_code: string; purpose: string };
}

export class MailError extends Error {
  constructor(readonly code: string, readonly field?: string) {
    super(code);
  }
}

async function invokeMail<T>(fn: string, body: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    let code = "unexpected_error";
    let field: string | undefined;
    try {
      const ctx = (error as any).context;
      const j = ctx && typeof ctx.json === "function" ? await ctx.json() : null;
      if (j?.error) { code = String(j.error); field = j.field ? String(j.field) : undefined; }
    } catch { /* not JSON */ }
    if (code === "unexpected_error" && /fetch|network/i.test(String(error.message))) code = "network";
    throw new MailError(code, field);
  }
  return data as T;
}

export interface SendPayload {
  id: string; candidateId: string; applicationId: string | null; subject: string; body: string;
  purpose: string; templateCode: string | null; replyToId: string | null; fileIds: string[];
}
export interface SendResult { id: string; status: string; error?: string }

export const sendCandidateEmail = (payload: SendPayload) => invokeMail<SendResult>("ats-mail-send", payload);
export const retryCandidateEmail = (id: string) => invokeMail<SendResult>("ats-mail-send", { retryId: id });
export const checkCandidateMail = () =>
  invokeMail<{ ok: boolean; error?: string | null; skipped?: string; stored?: number; bounces?: number; pending?: number; [k: string]: unknown }>(
    "ats-mail-sync", { source: "manual" });

export async function markThreadRead(candidateId: string) {
  const { data, error } = await supabase.rpc("ats_mark_messages_read", { p_candidate_id: candidateId });
  if (error) throw error;
  return data as number;
}
export async function markMessageUnread(id: string) {
  const { error } = await supabase.rpc("ats_mark_message_unread", { p_message_id: id });
  if (error) throw error;
}
export async function deleteMessage(id: string) {
  const { data, error } = await supabase.from("ats_messages").delete().eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("Only HR admins can remove emails.");
}

const AGAIN = "The email couldn't be sent. Try again in a minute.";
const UNREACHABLE = "Couldn't reach the mailbox. It will try again in 5 minutes.";

export function mailErrorMessage(code?: string | null, field?: string | null): string {
  switch (code) {
    case "mail_disabled": return "Email is turned off. Turn it on in ATS → Settings → Email.";
    case "mailbox_unavailable": return "The HR mailbox isn't available. Check ATS → Settings → Email.";
    case "no_email": return "This candidate has no email address. Add one with Edit profile.";
    case "candidate_closed": return "This candidate record is closed and can't be emailed.";
    case "not_found": return "This record no longer exists.";
    case "forbidden": return "Only HR staff can send candidate emails.";
    case "attachments_too_large": return "Attachments are too large. Keep them under 15 MB in total.";
    case "invalid":
      if (field === "subject") return "Add a subject. Only English letters, numbers and common symbols are kept in the subject line.";
      if (field === "body") return "Write a message (up to 20,000 characters).";
      if (field === "placeholders") return "Replace the {{placeholders}} before sending.";
      if (field === "attachments") return "Choose up to 5 of this candidate's files.";
      return "Check the email and try again.";
    case "smtp_auth_failed": return "The HR mailbox rejected the sign-in. Ask an admin to check the HR mailbox settings.";
    case "smtp_timeout": case "timeout": return "The mail server didn't respond. Try again in a minute.";
    case "attachment_missing": return "One of the attached files is missing. Remove it and try again.";
    case "smtp_failed": case "smtp_not_configured": case "interrupted": case "unexpected_error": case "save_failed": return AGAIN;
    case "bounced": return "The candidate's mail server returned this email. Check the address.";
    case "imap_login_failed": return "The mailbox rejected the sign-in. The HR mailbox app password may have changed.";
    case "receiving_off": return "Receiving is turned off for this mailbox in the HR mailbox settings.";
    case "mailbox_credentials_missing": return "The mailbox sign-in details are missing.";
    case "imap_timeout": case "imap_connect_failed": case "imap_closed": case "imap_read_failed": case "imap_greeting": return UNREACHABLE;
    default: return "Something went wrong while checking mail. It will try again in 5 minutes.";
  }
}

/** Toast text for a Check now / Check for new emails result. */
export function checkResultText(r: { ok: boolean; error?: string | null; skipped?: string; stored?: number }): { ok: boolean; text: string } {
  if (r.skipped === "busy") return { ok: true, text: "Already checking. Try again in a minute." };
  if (!r.ok || r.error) return { ok: false, text: mailErrorMessage(r.error) };
  const n = Number(r.stored ?? 0);
  return { ok: true, text: n ? `${n} new candidate emails` : "No new candidate emails" };
}

export const PLACEHOLDER_RE = /\{\{\s*[\w.]+\s*\}\}/;
export const SAMPLE_VALUES: Record<string, string> = {
  first_name: "Rahul", full_name: "Rahul Sharma", job_title: "Customer Support Executive",
  company_name: "Blynk Virtual Technologies", ref_no: "BX-1001",
};
export const fillSample = (s: string) => s.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => SAMPLE_VALUES[k] ?? m);

/** Splits a received body into the new text and quoted history (or null). */
export function splitQuoted(text: string): [string, string | null] {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (/^On .{3,200} wrote:$/.test(l) || /^-{2,}\s*Original Message/i.test(l)) {
      return [lines.slice(0, i).join("\n").trimEnd(), lines.slice(i).join("\n")];
    }
    if (l.startsWith(">") && (lines[i + 1] ?? "").trim().startsWith(">")) {
      return [lines.slice(0, i).join("\n").trimEnd(), lines.slice(i).join("\n")];
    }
  }
  return [text, null];
}
