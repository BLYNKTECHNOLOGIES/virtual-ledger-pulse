/**
 * pushWithVerification — the single client entry point for every RazorpayX write.
 *
 * Doctrine (R1 · Universal Push Verification):
 *   1. Route the write through the existing typed helper (push* in razorpayPushback
 *      or the one-time payout helper).
 *   2. Wait for the built-in read-back verification (verifyAndFinalize) to finish.
 *   3. Report the honest outcome to the caller: `confirmed` / `partial` / `failed` /
 *      `skipped`, with the field-level diff already logged and (on partial/failed)
 *      the RazorpayPushResultDialog already dispatched via emitPushResult.
 *
 * Callers get ONE surface and never have to think about the two-step push→verify
 * dance. Every un-migrated call site continues to work; migrated ones benefit from
 * the unified dialog + drift-alert lifecycle.
 */
import {
  pushToRazorpay,
  pushStatutoryToRazorpay,
} from "@/lib/razorpayPushback";
import { pushOneTimePayoutToRazorpay } from "@/lib/oneTimePayoutPush";

export type PushKind =
  | "identity"
  | "bank"
  | "employment"
  | "salary"
  | "statutory"
  | "advance_salary"
  | "one_time_payment";

export type PushOverall = "confirmed" | "partial" | "failed" | "skipped";

export type PushWithVerificationResult = {
  overall: PushOverall;
  ok: boolean;
  kind: PushKind;
  hrEmployeeId: string;
  error?: string;
  /** Raw underlying response for debugging. */
  raw?: any;
  /** Only present for salary — the ₹ figure RazorpayX actually accepted. */
  verifiedTotal?: number;
  expectedTotal?: number;
};

export interface PushWithVerificationArgs {
  kind: PushKind;
  hrEmployeeId?: string;
  /** Only required for advance_salary / one_time_payment (loan-id / revision-id). */
  referenceId?: string;
  /** For salary pushes — the CTC we expect RazorpayX to accept (±₹1 tolerance). */
  expectedTotal?: number;
  triggeredFrom?: string;
  /** When true, suppresses toasts but still opens the diff dialog on failure. */
  silent?: boolean;
}

function overallFromPush(
  res: { ok: boolean; skipped?: boolean; error?: string },
): PushOverall {
  if (res.skipped) return "skipped";
  if (res.ok) return "confirmed";
  // Distinguish partial (API-unavailable fields treated as confirmed in razorpayVerify)
  // vs full failure by checking for the marker phrases from the verify layer.
  const err = (res.error || "").toLowerCase();
  if (err.includes("partial") || err.includes("could not confirm")) return "partial";
  return "failed";
}

/**
 * Universal push wrapper. Consumes the existing per-kind helpers so the
 * behavioural contract stays identical — this file only adds the unified
 * result shape and one predictable entry point per call site.
 */
export async function pushWithVerification(
  args: PushWithVerificationArgs,
): Promise<PushWithVerificationResult> {
  const { kind, hrEmployeeId, referenceId, expectedTotal, triggeredFrom, silent } = args;

  const baseResult: PushWithVerificationResult = {
    overall: "failed",
    ok: false,
    kind,
    hrEmployeeId: hrEmployeeId || referenceId || "",
  };

  try {
    if (kind === "identity" || kind === "bank" || kind === "employment" || kind === "salary") {
      if (!hrEmployeeId) {
        return { ...baseResult, overall: "failed", error: "hrEmployeeId is required" };
      }
      const res = await pushToRazorpay(kind, hrEmployeeId, {
        triggeredFrom,
        silent,
        expectedTotal,
      });
      return {
        ...baseResult,
        hrEmployeeId,
        ok: res.ok,
        overall: overallFromPush(res),
        error: res.error,
        raw: res,
        verifiedTotal: res.verifiedTotal,
        expectedTotal: res.expectedTotal,
      };
    }

    if (kind === "statutory") {
      if (!hrEmployeeId) {
        return { ...baseResult, overall: "failed", error: "hrEmployeeId is required" };
      }
      const res = await pushStatutoryToRazorpay(hrEmployeeId, { triggeredFrom, silent });
      return {
        ...baseResult,
        hrEmployeeId,
        ok: res.ok,
        overall: overallFromPush(res),
        error: res.error,
        raw: res,
      };
    }

    if (kind === "one_time_payment") {
      const revisionId = referenceId;
      if (!revisionId) {
        return { ...baseResult, overall: "failed", error: "referenceId (revision) required" };
      }
      const res = await pushOneTimePayoutToRazorpay(revisionId);
      return {
        ...baseResult,
        ok: res.ok,
        overall: res.skipped ? "skipped" : res.ok ? "confirmed" : "failed",
        error: res.error,
        raw: res.response,
      };
    }

    if (kind === "advance_salary") {
      // Advance salary reuses the payroll additions envelope. Delegates to the
      // one-time payout helper which is the same underlying proxy contract.
      const revisionId = referenceId;
      if (!revisionId) {
        return { ...baseResult, overall: "failed", error: "referenceId (advance/loan) required" };
      }
      const res = await pushOneTimePayoutToRazorpay(revisionId);
      return {
        ...baseResult,
        ok: res.ok,
        overall: res.skipped ? "skipped" : res.ok ? "confirmed" : "failed",
        error: res.error,
        raw: res.response,
      };
    }

    return { ...baseResult, error: `Unknown push kind: ${kind}` };
  } catch (e: any) {
    return { ...baseResult, error: e?.message || String(e) };
  }
}

export default pushWithVerification;
