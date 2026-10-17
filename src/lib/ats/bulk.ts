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
  email?: { sent: number; noEmail: number; notSent: { row: AtsAppRow; reason: string }[]; samePerson: number };
}

/** Pre-flight skip rules (B4). Returns a reason when the row must be skipped. */
export function skipReason(action: BulkAction, r: AtsAppRow): string | null {
  const st = r.status;
  if (action.kind === "move" || action.kind === "hold") {
    if (st === "rejected") return "already rejected: reopen first";
    if (st === "withdrawn") return "withdrawn: reopen first";
    if (action.kind === "move" && r.stage_id === action.stageId) return `already in ${action.stageName}`;
    if (action.kind === "hold" && st === "on_hold") return "already on hold";
    if (st === "hired") return "already hired";
  }
  if (action.kind === "reject") {
    if (st === "rejected") return "already rejected";
    if (st === "withdrawn") return "withdrawn";
    if (st === "hired") return "already hired";
  }
  return null;
}

/**
 * Shift for a bulk hire: the job's only shift, or the candidate's single preferred shift among the job's.
 * `undefined` = can't decide in bulk (several job shifts, no single matching preference).
 */
export function bulkHireShift(
  jobShiftIds: string[], preferred?: string[] | null, shiftNames?: ReadonlyMap<string, string>,
): string | null | undefined {
  if (jobShiftIds.length <= 1) return jobShiftIds[0] ?? null;
  // preferred_shifts stores shift names (careers form); older rows may hold ids.
  const toId = (p: string) => {
    const v = p.trim();
    if (jobShiftIds.includes(v)) return v;
    return jobShiftIds.find((id) => (shiftNames?.get(id) ?? "").trim().toLowerCase() === v.toLowerCase());
  };
  const prefs = (preferred ?? []).filter((p) => p && p.trim());
  if (prefs.length !== 1) return undefined;
  return toId(prefs[0]) ?? undefined;
}

function callFor(action: BulkAction, appId: string, hiredShift?: string | null) {
  switch (action.kind) {
    case "move": return (supabase.rpc as any)("ats_move_stage", { p_application_id: appId, p_stage_id: action.stageId, p_note: null, p_hired_shift: hiredShift ?? null });
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
    signal: { cancelled: boolean };
    /** phase 'emails' reports the rejection emails after the status changes. */
    onProgress: (processed: number, total: number, phase?: "actions" | "emails") => void; concurrency?: number;
    /** Reject only: email each rejected candidate with this template. */
    emailTemplateId?: string | null;
  },
): Promise<BulkResult> {
  const emailQueue: AtsAppRow[] = [];
  const res: BulkResult = { done: 0, skipped: [], failed: [], cancelled: false };
  const queue: AtsAppRow[] = [];
  // Hiring in bulk: each person needs one shift on multi-shift jobs.
  const hireShift = new Map<string, string | null>();
  let jobShifts: Map<string, string[]> | null = null;
  let shiftNames = new Map<string, string>();
  if (action.kind === "move") {
    const { data: st } = await supabase.from("ats_stages").select("kind, code").eq("id", action.stageId).maybeSingle();
    if (st && (st.kind === "hired" || st.code === "hired")) {
      const jobIds = [...new Set(rows.map((r) => (r as any).job_id).filter(Boolean))] as string[];
      const { data: jobs } = jobIds.length ? await supabase.from("ats_jobs").select("id, shift_ids").in("id", jobIds) : { data: [] as any[] };
      jobShifts = new Map((jobs ?? []).map((j: any) => [j.id, (j.shift_ids ?? []) as string[]]));
      const ids = [...new Set([...jobShifts.values()].flat())];
      const { data: sh } = ids.length ? await supabase.from("hr_shifts").select("id, name").in("id", ids) : { data: [] as any[] };
      shiftNames = new Map((sh ?? []).map((x: any) => [x.id as string, (x.name ?? "") as string]));
    }
  }
  for (const r of rows) {
    let s = skipReason(action, r);
    if (!s && jobShifts) {
      const shift = bulkHireShift(jobShifts.get((r as any).job_id) ?? [], (r as any).preferred_shifts, shiftNames);
      if (shift === undefined) s = "the job has several shifts: hire from the candidate page to choose one";
      else hireShift.set(r.application_id!, shift);
    }
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
        const { error } = await callFor(action, r.application_id!, hireShift.get(r.application_id!));
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
    res.email = await sendRejectionEmails(emailQueue, opts.emailTemplateId, opts.signal, () => { if (opts.signal.cancelled) res.cancelled = true; },
      (d, t) => opts.onProgress(d, t, "emails"));
  }
  return res;
}

/**
 * Rejection emails, at most 2 at a time; Cancel stops new ones. One email per person, filled for that person's
 * most recent rejected application; samePerson counts the people who had more than one rejected application.
 */
async function sendRejectionEmails(
  all: AtsAppRow[], templateId: string, signal: { cancelled: boolean }, onCancel: () => void,
  onProgress: (done: number, total: number) => void,
): Promise<NonNullable<BulkResult["email"]>> {
  const byPerson = new Map<string, AtsAppRow>();
  const noId: AtsAppRow[] = [];
  const multi = new Set<string>();
  for (const r of all) {
    if (!r.candidate_id) { noId.push(r); continue; }
    const cur = byPerson.get(r.candidate_id);
    if (!cur) { byPerson.set(r.candidate_id, r); continue; }
    multi.add(r.candidate_id);
    if (String(r.applied_at ?? "") > String(cur.applied_at ?? "")) byPerson.set(r.candidate_id, r);
  }
  const rows = [...byPerson.values(), ...noId];
  const out: NonNullable<BulkResult["email"]> = { sent: 0, noEmail: 0, notSent: [], samePerson: multi.size };
  let done = 0;
  const tick = () => onProgress(++done, rows.length);
  onProgress(0, rows.length);
  let next = 0;
  const worker = async () => {
    while (next < rows.length) {
      if (signal.cancelled) { onCancel(); return; }
      const r = rows[next++];
      if (!r.email || !r.candidate_id) { out.noEmail++; tick(); continue; }
      try {
        const t = await renderTemplate(templateId, r.application_id, r.candidate_id);
        if (PLACEHOLDER_RE.test(`${t.subject}\n${t.body}`)) { out.notSent.push({ row: r, reason: mailErrorMessage("invalid_template") }); tick(); continue; }
        const s = await sendCandidateEmail({
          id: crypto.randomUUID(), candidateId: r.candidate_id, applicationId: r.application_id, subject: t.subject, body: t.body,
          purpose: "rejection", templateCode: t.template_code, replyToId: null, fileIds: [],
        });
        if (s.status === "failed") out.notSent.push({ row: r, reason: mailErrorMessage(s.error) });
        else out.sent++;
      } catch (e) {
        out.notSent.push({ row: r, reason: e instanceof MailError ? mailErrorMessage(e.code, e.field) : atsErrorMessage(e) });
      }
      tick();
    }
  };
  await Promise.all(Array.from({ length: Math.min(2, rows.length) }, worker));
  return out;
}
