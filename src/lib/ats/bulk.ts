import { supabase } from "@/integrations/supabase/client";
import { atsErrorMessage } from "./errors";
import type { AtsAppRow } from "./candidates";
import { MailError, PLACEHOLDER_RE, mailErrorMessage, renderTemplate, sendCandidateEmail } from "./mail";

export type BulkAction =
  | { kind: "move"; stageId: string; stageName: string }
  | { kind: "hold" }
  | { kind: "reject"; reasonId: string; note: string };

export interface BulkItem { row: AtsAppRow; skip?: string }
export interface BulkResult {
  done: number;
  skipped: { row: AtsAppRow; reason: string }[];
  failed: { row: AtsAppRow; reason: string }[];
  cancelled: boolean;
  /** Present when rejection emails were requested. */
  email?: { sent: number; noEmail: number; notSent: { row: AtsAppRow; reason: string }[] };
}

/** Pre-flight skip rules (B4). Returns a reason when the row must be skipped. */
export function skipReason(action: BulkAction, r: AtsAppRow): string | null {
  const st = r.status;
  if (action.kind === "move" || action.kind === "hold") {
    if (st === "rejected") return "already rejected: reopen first";
    if (st === "withdrawn") return "withdrawn: reopen first";
    if (action.kind === "move" && r.stage_id === action.stageId) return `already in ${action.stageName}`;
    if (action.kind === "hold" && st === "on_hold") return "already on hold";
    if (action.kind === "hold" && st === "hired") return "already hired";
  }
  if (action.kind === "reject") {
    if (st === "rejected") return "already rejected";
    if (st === "withdrawn") return "withdrawn";
    if (st === "hired") return "already hired";
  }
  return null;
}

function callFor(action: BulkAction, appId: string) {
  switch (action.kind) {
    case "move": return supabase.rpc("ats_move_stage", { p_application_id: appId, p_stage_id: action.stageId, p_note: null });
    case "hold": return supabase.rpc("ats_set_status", { p_application_id: appId, p_status: "on_hold", p_reason_id: null, p_note: null });
    case "reject": return supabase.rpc("ats_set_status", { p_application_id: appId, p_status: "rejected", p_reason_id: action.reasonId, p_note: action.note || null });
  }
}

/**
 * Runs the queue with at most `concurrency` calls in flight. `signal.cancelled`
 * is checked before each new call starts; calls already in flight finish.
 */
export async function runBulk(
  action: BulkAction,
  rows: AtsAppRow[],
  opts: {
    signal: { cancelled: boolean }; onProgress: (processed: number, total: number) => void; concurrency?: number;
    /** Reject only: email each rejected candidate with this template. */
    emailTemplateId?: string | null;
  },
): Promise<BulkResult> {
  const emailQueue: AtsAppRow[] = [];
  const res: BulkResult = { done: 0, skipped: [], failed: [], cancelled: false };
  const queue: AtsAppRow[] = [];
  for (const r of rows) {
    const s = skipReason(action, r);
    if (s) res.skipped.push({ row: r, reason: s }); else queue.push(r);
  }
  const total = rows.length;
  let processed = res.skipped.length;
  opts.onProgress(processed, total);
  let next = 0;
  const worker = async () => {
    while (next < queue.length) {
      if (opts.signal.cancelled) { res.cancelled = true; return; }
      const r = queue[next++];
      try {
        const { error } = await callFor(action, r.application_id!);
        if (error) throw error;
        res.done++;
        if (action.kind === "reject" && opts.emailTemplateId) emailQueue.push(r);
      } catch (e) {
        res.failed.push({ row: r, reason: atsErrorMessage(e) });
      }
      processed++;
      opts.onProgress(processed, total);
    }
  };
  await Promise.all(Array.from({ length: Math.min(opts.concurrency ?? 4, queue.length) }, worker));
  if (opts.signal.cancelled && next < queue.length) res.cancelled = true;
  if (action.kind === "reject" && opts.emailTemplateId) {
    res.email = await sendRejectionEmails(emailQueue, opts.emailTemplateId, opts.signal, () => { if (opts.signal.cancelled) res.cancelled = true; });
  }
  return res;
}

/** Rejection emails, at most 2 at a time; Cancel stops new ones. Each is filled for its own application. */
async function sendRejectionEmails(
  rows: AtsAppRow[], templateId: string, signal: { cancelled: boolean }, onCancel: () => void,
): Promise<NonNullable<BulkResult["email"]>> {
  const out: NonNullable<BulkResult["email"]> = { sent: 0, noEmail: 0, notSent: [] };
  let next = 0;
  const worker = async () => {
    while (next < rows.length) {
      if (signal.cancelled) { onCancel(); return; }
      const r = rows[next++];
      if (!r.email || !r.candidate_id) { out.noEmail++; continue; }
      try {
        const t = await renderTemplate(templateId, r.application_id, r.candidate_id);
        if (PLACEHOLDER_RE.test(`${t.subject}\n${t.body}`)) { out.notSent.push({ row: r, reason: mailErrorMessage("invalid_template") }); continue; }
        const s = await sendCandidateEmail({
          id: crypto.randomUUID(), candidateId: r.candidate_id, applicationId: r.application_id, subject: t.subject, body: t.body,
          purpose: "rejection", templateCode: t.template_code, replyToId: null, fileIds: [],
        });
        if (s.status === "failed") out.notSent.push({ row: r, reason: mailErrorMessage(s.error) });
        else out.sent++;
      } catch (e) {
        out.notSent.push({ row: r, reason: e instanceof MailError ? mailErrorMessage(e.code, e.field) : atsErrorMessage(e) });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(2, rows.length) }, worker));
  return out;
}
