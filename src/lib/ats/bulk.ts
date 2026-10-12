import { supabase } from "@/integrations/supabase/client";
import { atsErrorMessage } from "./errors";
import type { AtsAppRow } from "./candidates";

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
  opts: { signal: { cancelled: boolean }; onProgress: (processed: number, total: number) => void; concurrency?: number },
): Promise<BulkResult> {
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
      } catch (e) {
        res.failed.push({ row: r, reason: atsErrorMessage(e) });
      }
      processed++;
      opts.onProgress(processed, total);
    }
  };
  await Promise.all(Array.from({ length: Math.min(opts.concurrency ?? 4, queue.length) }, worker));
  if (opts.signal.cancelled && next < queue.length) res.cancelled = true;
  return res;
}
