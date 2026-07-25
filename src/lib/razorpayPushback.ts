/**
 * ERP → Razorpay Pushback Helpers + audit logging.
 *
 * ERP is source of truth. Every helper:
 *   - silently skips if the employee has no `hr_razorpay_employee_map` row,
 *   - never throws (a Razorpay failure never blocks the local save),
 *   - writes a row to `hr_razorpay_pushback_log` so the Data Health page
 *     has a full audit trail,
 *   - opens a drift alert on failure so the mismatch is surfaced for
 *     one-click retry from Data Health.
 */
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  buildExpected,
  emitPushResult,
  verifyPush,
  type FieldDiff,
  type PushVerifyKind,
  type PushVerifyResult,
} from "@/lib/razorpayVerify";

type PushKind = "identity" | "bank" | "salary" | "employment" | "dismissal" | "create" | "statutory";


const ACTION_BY_KIND: Record<Exclude<PushKind, "dismissal" | "create" | "statutory">, string> = {
  identity: "push_person_apply_one",
  bank: "push_bank_apply_one",
  salary: "push_salary_apply_one",
  employment: "push_person_apply_one", // proxy re-uses the person envelope for employment fields
};

const LABEL_BY_KIND: Record<PushKind, string> = {
  identity: "identity",
  bank: "bank details",
  salary: "salary structure",
  employment: "employment details",
  dismissal: "dismissal",
  create: "employee creation",
  statutory: "statutory enrollment",
};

const DRIFT_FIELD_BY_KIND: Record<PushKind, string> = {
  identity: "identity_bundle",
  bank: "bank_bundle",
  salary: "annual_ctc",
  employment: "employment_bundle",
  dismissal: "dismissal_state",
  create: "razorpay_link",
  statutory: "statutory_enrollment",
};

function readableError(value: any, fallback = "RazorpayX rejected the push"): string {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "string") return value;
  if (typeof value?.message === "string" && value.message.trim()) return value.message;
  if (typeof value?.error === "string" && value.error.trim()) return value.error;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}


async function resolveRazorpayEmployeeId(hrEmployeeId: string): Promise<string | null> {
  const { data, error } = await (supabase as any)
    .from("hr_razorpay_employee_map")
    .select("razorpay_employee_id")
    .eq("hr_employee_id", hrEmployeeId)
    .maybeSingle();
  if (error) return null;
  return data?.razorpay_employee_id ?? null;
}

export async function getRazorpayLinkStatus(hrEmployeeId: string): Promise<{
  linked: boolean;
  razorpay_employee_id: string | null;
  open_drifts: number;
}> {
  const [{ data: mapRow }, { count }] = await Promise.all([
    (supabase as any)
      .from("hr_razorpay_employee_map")
      .select("razorpay_employee_id")
      .eq("hr_employee_id", hrEmployeeId)
      .maybeSingle(),
    (supabase as any)
      .from("hr_drift_alerts")
      .select("id", { count: "exact", head: true })
      .eq("hr_employee_id", hrEmployeeId)
      .is("resolved_at", null),
  ]);
  return {
    linked: !!mapRow?.razorpay_employee_id,
    razorpay_employee_id: mapRow?.razorpay_employee_id ?? null,
    open_drifts: count ?? 0,
  };
}

async function logPushback(row: {
  hr_employee_id: string;
  razorpay_employee_id: string | null;
  kind: PushKind;
  action: string;
  status: "success" | "failure" | "skipped";
  request_snapshot?: unknown;
  response_snapshot?: unknown;
  error_message?: string | null;
  triggered_from?: string;
}) {
  try {
    const { data: userData } = await supabase.auth.getUser();
    await (supabase as any).from("hr_razorpay_pushback_log").insert({
      hr_employee_id: row.hr_employee_id,
      razorpay_employee_id: row.razorpay_employee_id,
      kind: row.kind,
      action: row.action,
      status: row.status,
      request_snapshot: row.request_snapshot ?? null,
      response_snapshot: row.response_snapshot ?? null,
      error_message: row.error_message ?? null,
      triggered_by: userData?.user?.id ?? null,
      triggered_from: row.triggered_from ?? null,
    });
  } catch {
    /* best-effort log */
  }
}

async function upsertDrift(hr_employee_id: string, field: string, note: string) {
  try {
    await (supabase as any)
      .from("hr_drift_alerts")
      .upsert(
        {
          hr_employee_id,
          field,
          systems_involved: ["hrms", "razorpay"],
          severity: "medium",
          resolution_note: note,
          last_seen_at: new Date().toISOString(),
          resolved_at: null,
        },
        { onConflict: "hr_employee_id,field" },
      );
  } catch {
    /* best-effort */
  }
}

// ---------- verification finalizer ----------
// Called after every RazorpayX write. Re-reads the person from RazorpayX,
// diffs field-by-field, dispatches the field-diff dialog on partial/failed,
// and toasts honestly about what actually landed vs what didn't.
async function verifyAndFinalize(args: {
  kind: PushVerifyKind;
  hrEmployeeId: string;
  razorpayEmployeeId: string | null;
  triggeredFrom?: string;
  silent?: boolean;
  expectedOverrides?: Record<string, any>;
  successToast?: string;
  retry?: () => Promise<any>;
}): Promise<PushVerifyResult> {
  const expected = await buildExpected(args.kind, args.hrEmployeeId, args.expectedOverrides).catch(() => ({}));
  const result = await verifyPush(args.kind, args.hrEmployeeId, expected, {
    razorpayEmployeeId: args.razorpayEmployeeId,
  });

  // Persist the diff into the last pushback log row (best-effort).
  try {
    await (supabase as any)
      .from("hr_razorpay_pushback_log")
      .insert({
        hr_employee_id: args.hrEmployeeId,
        razorpay_employee_id: args.razorpayEmployeeId,
        kind: args.kind,
        action: `verify_${args.kind}`,
        status: result.overall === "verified" ? "success" : "failure",
        response_snapshot: { overall: result.overall, fields: result.fields, error: result.error ?? null },
        error_message: result.overall === "verified" ? null : (result.error || `Verification: ${result.overall}`),
        triggered_from: args.triggeredFrom,
      });
  } catch { /* best-effort */ }

  if (result.overall !== "verified") {
    const mismatched = result.fields.filter((f) => f.match !== true).map((f) => f.label).join(", ");
    await upsertDrift(
      args.hrEmployeeId,
      DRIFT_FIELD_BY_KIND[args.kind as PushKind] || `${args.kind}_bundle`,
      `Verification ${result.overall}: ${mismatched || "field-level details in dialog"}`,
    );
  }

  // Fetch employee name for the dialog header (best-effort).
  let employeeName: string | null = null;
  try {
    const { data } = await (supabase as any)
      .from("hr_employees")
      .select("first_name,last_name")
      .eq("id", args.hrEmployeeId)
      .maybeSingle();
    if (data) employeeName = [data.first_name, data.last_name].filter(Boolean).join(" ").trim() || null;
  } catch { /* best-effort */ }

  if (!args.silent) {
    if (result.overall === "verified") {
      toast.success(args.successToast || `Razorpay ${LABEL_BY_KIND[args.kind as PushKind] || args.kind} verified`);
    } else if (result.overall === "partial") {
      toast.warning(`RazorpayX ${args.kind} update partially verified — see details`, {
        description: "Some fields could not be read back from RazorpayX. Opened the diff dialog.",
      });
    } else if (result.overall === "failed") {
      toast.error(`RazorpayX ${args.kind} update NOT verified`, {
        description: result.error || "RazorpayX is still showing old values for one or more fields.",
      });
    } else if (result.overall === "skipped") {
      // Skipped means employee isn't linked — pushback layer already handled that.
    }
  }

  if (result.overall !== "verified" && result.overall !== "skipped") {
    emitPushResult({
      ...result,
      employeeName,
      triggeredFrom: args.triggeredFrom,
      retry: args.retry
        ? async () => {
            const retry = args.retry;
            if (!retry) return result;
            await retry();
            return verifyPush(args.kind, args.hrEmployeeId, expected, {
              razorpayEmployeeId: args.razorpayEmployeeId,
            });
          }
        : undefined,
    });
  }

  return result;
}


export async function pushToRazorpay(
  kind: Exclude<PushKind, "dismissal" | "create">,
  hrEmployeeId: string,
  opts?: { triggeredFrom?: string; silent?: boolean; expectedTotal?: number },
): Promise<{ ok: boolean; skipped?: boolean; error?: string; verifiedTotal?: number; expectedTotal?: number }> {
  const razorpayId = await resolveRazorpayEmployeeId(hrEmployeeId);
  if (!razorpayId) {
    await logPushback({
      hr_employee_id: hrEmployeeId,
      razorpay_employee_id: null,
      kind,
      action: ACTION_BY_KIND[kind],
      status: "skipped",
      error_message: "Employee not linked to Razorpay",
      triggered_from: opts?.triggeredFrom,
    });
    return { ok: false, skipped: true };
  }

  try {
    const { data, error } = await supabase.functions.invoke("razorpay-payroll-proxy", {
      body: { action: ACTION_BY_KIND[kind], razorpay_employee_id: razorpayId },
    });
    if (error) throw error;
    if (data && (data as any).ok === false) {
      throw new Error(readableError((data as any).error));
    }

    // Strict verification for salary pushes: the proxy returns rows[0] with the
    // ACTUAL erp_total it sent to RazorpayX (built from hr_employee_salary_structures).
    // If the caller told us what the new CTC should be, refuse to mark this successful
    // unless the pushed total matches to the rupee. This catches the case where the
    // salary structure wasn't rescaled and Razorpay silently kept the OLD CTC.
    let verifiedTotal: number | undefined;
    if (kind === "salary") {
      const row = Array.isArray((data as any)?.rows) ? (data as any).rows[0] : null;
      const rowStatus = String(row?.status || "").toLowerCase();
      verifiedTotal = Number.isFinite(Number(row?.erp_total)) ? Number(row?.erp_total) : undefined;

      if (rowStatus === "no_erp_structure" || rowStatus === "skipped_no_baseline") {
        throw new Error(readableError(row?.error, `RazorpayX push skipped (${rowStatus}) — build salary structure and retry.`));
      }
      if (rowStatus === "failed") {
        throw new Error(readableError(row?.error, "RazorpayX rejected the salary push"));
      }
      if (rowStatus === "unchanged" && typeof opts?.expectedTotal === "number") {
        throw new Error(
          `RazorpayX reports the salary structure is unchanged (₹${(verifiedTotal ?? 0).toLocaleString("en-IN")}). ` +
          `Expected ₹${opts.expectedTotal.toLocaleString("en-IN")}. The salary structure was not rescaled — nothing was written to RazorpayX.`
        );
      }
      if (typeof opts?.expectedTotal === "number" && typeof verifiedTotal === "number") {
        if (Math.abs(verifiedTotal - opts.expectedTotal) > 1) {
          throw new Error(
            `RazorpayX received ₹${verifiedTotal.toLocaleString("en-IN")} but expected ₹${opts.expectedTotal.toLocaleString("en-IN")}. ` +
            `The salary structure did not match the revised CTC — RazorpayX was NOT updated with the new amount.`
          );
        }
      }
    }

    // NOTE: we deliberately do NOT log status="success" here. RazorpayX often
    // returns HTTP 200 while silently no-op'ing the write (locked payroll
    // cycle, stale envelope, wrong sub-type, etc.). The pushback log status
    // must reflect the RE-READ verification result — not the push HTTP code —
    // otherwise the row badges in the Salary Revision History will read
    // "Synced to RazorpayX" even when RazorpayX kept the old value.

    // Re-read RazorpayX and diff field-by-field. This is the source of truth
    // for whether the update actually landed — RazorpayX silently no-ops some
    // fields (bank IFSC updates, phone updates, etc.) so a 200 from the API
    // is NOT proof the change is live.
    const verifyKind = (kind === "employment" ? "employment" : kind) as PushVerifyKind;
    const expectedOverrides =
      kind === "salary" && typeof opts?.expectedTotal === "number"
        ? { annual_ctc: opts.expectedTotal }
        : undefined;
    const verifyResult = await verifyAndFinalize({
      kind: verifyKind,
      hrEmployeeId,
      razorpayEmployeeId: String(razorpayId),
      triggeredFrom: opts?.triggeredFrom,
      silent: opts?.silent,
      expectedOverrides,
      successToast:
        kind === "salary" && typeof verifiedTotal === "number"
          ? `RazorpayX CTC verified: ₹${verifiedTotal.toLocaleString("en-IN")}`
          : `RazorpayX ${LABEL_BY_KIND[kind]} verified`,
      retry: () => pushToRazorpay(kind, hrEmployeeId, { ...opts, silent: true }),
    });

    // Log the pushback with the ACTUAL verification result. This is what
    // downstream UI (Salary Revision History badges, Data Health) reads.
    const verifyOverall = verifyResult.overall;
    if (verifyOverall === "verified") {
      await logPushback({
        hr_employee_id: hrEmployeeId,
        razorpay_employee_id: razorpayId,
        kind,
        action: ACTION_BY_KIND[kind],
        status: "success",
        response_snapshot: { push: data ?? null, verify: verifyResult },
        triggered_from: opts?.triggeredFrom,
      });
      try {
        await (supabase as any)
          .from("hr_drift_alerts")
          .update({ resolved_at: new Date().toISOString(), resolution_note: "Auto-resolved by verified push" })
          .eq("hr_employee_id", hrEmployeeId)
          .eq("field", DRIFT_FIELD_BY_KIND[kind])
          .is("resolved_at", null);
      } catch { /* ignore */ }
    } else {
      const mismatched = verifyResult.fields.filter((f) => f.match === false);
      const unknown = verifyResult.fields.filter((f) => f.match === null);
      const errSummary =
        mismatched.length
          ? `RazorpayX did not accept: ${mismatched.map((f) => `${f.label} (sent ${f.expected}, RazorpayX shows ${f.actual})`).join("; ")}`
          : unknown.length
            ? `RazorpayX could not confirm: ${unknown.map((f) => f.label).join(", ")}`
            : (verifyResult.error || "RazorpayX did not confirm the write.");
      await logPushback({
        hr_employee_id: hrEmployeeId,
        razorpay_employee_id: razorpayId,
        kind,
        action: ACTION_BY_KIND[kind],
        status: "failure",
        response_snapshot: { push: data ?? null, verify: verifyResult },
        error_message: errSummary,
        triggered_from: opts?.triggeredFrom,
      });
      await upsertDrift(
        hrEmployeeId,
        DRIFT_FIELD_BY_KIND[kind],
        `Push not verified: ${errSummary.slice(0, 200)}`,
      );
    }

    return {
      ok: verifyOverall === "verified",
      verifiedTotal,
      expectedTotal: opts?.expectedTotal,
      error: verifyOverall !== "verified"
        ? (verifyResult.error || `RazorpayX ${LABEL_BY_KIND[kind]} update was not verified — see the field diff dialog.`)
        : undefined,
    };


  } catch (e: any) {
    const msg = e?.message || String(e);
    await logPushback({
      hr_employee_id: hrEmployeeId,
      razorpay_employee_id: razorpayId,
      kind,
      action: ACTION_BY_KIND[kind],
      status: "failure",
      error_message: msg,
      triggered_from: opts?.triggeredFrom,
    });
    await upsertDrift(hrEmployeeId, DRIFT_FIELD_BY_KIND[kind], `Push failed: ${msg.slice(0, 200)}`);
    emitPushResult({
      ok: false,
      overall: "failed",
      kind: kind as PushVerifyKind,
      hrEmployeeId,
      razorpayEmployeeId: razorpayId ? String(razorpayId) : null,
      error: msg,
      fields: kind === "salary" && typeof opts?.expectedTotal === "number"
        ? [{
            key: "annual_ctc",
            label: "Annual CTC",
            expected: opts.expectedTotal,
            actual: null,
            match: false,
            reason: msg,
          }]
        : [],
      triggeredFrom: opts?.triggeredFrom,
      retry: async () => {
        await pushToRazorpay(kind, hrEmployeeId, { ...opts, silent: true });
        const expected = await buildExpected(kind as PushVerifyKind, hrEmployeeId, kind === "salary" && typeof opts?.expectedTotal === "number" ? { annual_ctc: opts.expectedTotal } : undefined).catch(() => ({}));
        return verifyPush(kind as PushVerifyKind, hrEmployeeId, expected, { razorpayEmployeeId: razorpayId ? String(razorpayId) : null });
      },
    });
    if (!opts?.silent) {
      toast.error(
        `RazorpayX ${LABEL_BY_KIND[kind]} push NOT verified — revision is not finalized.`,
        { description: msg.length > 220 ? msg.slice(0, 220) + "…" : msg },
      );
    }
    return { ok: false, error: msg };
  }
}

export const pushIdentityToRazorpay = (id: string, opts?: { triggeredFrom?: string; silent?: boolean }) =>
  pushToRazorpay("identity", id, opts);
export const pushBankToRazorpay = (id: string, opts?: { triggeredFrom?: string; silent?: boolean }) =>
  pushToRazorpay("bank", id, opts);
export const pushSalaryToRazorpay = (id: string, opts?: { triggeredFrom?: string; silent?: boolean; expectedTotal?: number }) =>
  pushToRazorpay("salary", id, opts);
export const pushEmploymentToRazorpay = (id: string, opts?: { triggeredFrom?: string; silent?: boolean }) =>
  pushToRazorpay("employment", id, opts);


/**
 * Dismiss an employee in RazorpayX Payroll — see previous doc block.
 */
export async function dismissInRazorpay(
  hrEmployeeId: string,
  opts: { dateOfDismissal: string; reason?: string | null; triggeredFrom?: string },
): Promise<{ ok: boolean; skipped?: boolean; error?: string; razorpay_employee_id?: string }> {
  const razorpayId = await resolveRazorpayEmployeeId(hrEmployeeId);
  if (!razorpayId) {
    await logPushback({
      hr_employee_id: hrEmployeeId,
      razorpay_employee_id: null,
      kind: "dismissal",
      action: "people_dismiss",
      status: "skipped",
      error_message: "Employee not linked to Razorpay",
      triggered_from: opts.triggeredFrom,
    });
    return { ok: false, skipped: true };
  }

  const iso = /^\d{4}-\d{2}-\d{2}$/.test(opts.dateOfDismissal);
  const ddmmyyyy = iso
    ? (() => { const [y, m, d] = opts.dateOfDismissal.split("-"); return `${d}/${m}/${y}`; })()
    : opts.dateOfDismissal;

  try {
    const payload = {
      action: "people_dismiss",
      ack: "CONFIRM_DISMISS",
      data: {
        "employee-id": Number(razorpayId),
        "employee-type": "employee",
        "date-of-dismissal": ddmmyyyy,
        reason: (opts.reason || "Resignation").slice(0, 240),
      },
    };
    const { data, error } = await supabase.functions.invoke("razorpay-payroll-proxy", { body: payload });
    if (error) throw error;
    if (data && (data as any).ok === false) throw new Error((data as any).error || "Razorpay rejected the dismissal");

    await logPushback({
      hr_employee_id: hrEmployeeId,
      razorpay_employee_id: razorpayId,
      kind: "dismissal",
      action: "people_dismiss",
      status: "success",
      request_snapshot: payload,
      response_snapshot: data ?? null,
      triggered_from: opts.triggeredFrom,
    });

    const verifyResult = await verifyAndFinalize({
      kind: "dismissal",
      hrEmployeeId,
      razorpayEmployeeId: String(razorpayId),
      triggeredFrom: opts.triggeredFrom,
      expectedOverrides: { dismissed: true, date_of_dismissal: opts.dateOfDismissal },
      successToast: `Razorpay dismissal scheduled for ${ddmmyyyy} — FNF payroll enabled`,
      retry: () => dismissInRazorpay(hrEmployeeId, opts),
    });
    return {
      ok: verifyResult.overall === "verified",
      razorpay_employee_id: String(razorpayId),
      error: verifyResult.overall === "verified" ? undefined : (verifyResult.error || "Dismissal not yet reflected in RazorpayX."),
    };

  } catch (e: any) {
    const msg = e?.message || String(e);
    await logPushback({
      hr_employee_id: hrEmployeeId,
      razorpay_employee_id: razorpayId,
      kind: "dismissal",
      action: "people_dismiss",
      status: "failure",
      error_message: msg,
      triggered_from: opts.triggeredFrom,
    });
    await upsertDrift(hrEmployeeId, "dismissal_state", `Dismissal push failed: ${msg.slice(0, 200)}`);
    toast.warning(
      "ERP separation saved, but Razorpay dismissal push failed. Retry from Data Health.",
      { description: msg.length > 160 ? msg.slice(0, 160) + "…" : msg },
    );
    return { ok: false, error: msg };
  }
}

/**
 * Push per-employee statutory enrollment (PF / ESI / PT toggle) to RazorpayX.
 * Used when an employee is exempted from statutory deductions during training/probation
 * (or re-enrolled afterwards). Reads the current pf_enabled/esi_enabled/pt_enabled from
 * hr_employees and sends them via the operator-verified statutory envelope in the proxy.
 *
 * Failure paths:
 *   - Envelope not verified → returns { ok:false, needsEnvelope:true } with a toast asking
 *     the operator to record a probe-verified envelope in Data Health / Settings.
 *   - Razorpay rejects → drift alert opened, warning toast, ERP save stands.
 */
export async function pushStatutoryToRazorpay(
  hrEmployeeId: string,
  opts?: { triggeredFrom?: string; silent?: boolean },
): Promise<{ ok: boolean; skipped?: boolean; error?: string; needsEnvelope?: boolean }> {
  const razorpayId = await resolveRazorpayEmployeeId(hrEmployeeId);
  if (!razorpayId) {
    await logPushback({
      hr_employee_id: hrEmployeeId,
      razorpay_employee_id: null,
      kind: "statutory",
      action: "push_statutory_apply_one",
      status: "skipped",
      error_message: "Employee not linked to Razorpay",
      triggered_from: opts?.triggeredFrom,
    });
    return { ok: false, skipped: true };
  }

  try {
    const { data, error } = await supabase.functions.invoke("razorpay-payroll-proxy", {
      body: { action: "push_statutory_apply_one", hr_employee_id: hrEmployeeId },
    });
    if (error) throw error;
    const d = data as any;
    if (d?.ok === false) {
      const needsEnvelope = d?.code === "STATUTORY_ENVELOPE_UNVERIFIED";
      const msg = d?.error || "Razorpay rejected the statutory push";
      await logPushback({
        hr_employee_id: hrEmployeeId,
        razorpay_employee_id: razorpayId,
        kind: "statutory",
        action: "push_statutory_apply_one",
        status: "failure",
        request_snapshot: { hr_employee_id: hrEmployeeId },
        response_snapshot: d,
        error_message: msg,
        triggered_from: opts?.triggeredFrom,
      });
      if (!needsEnvelope) {
        await upsertDrift(hrEmployeeId, "statutory_enrollment", `Push failed: ${msg.slice(0, 200)}`);
      }
      if (!opts?.silent) {
        if (needsEnvelope) {
          toast.warning(
            "ERP statutory toggle saved. Razorpay statutory push endpoint isn't verified yet — verify the envelope in Data Health, then retry.",
          );
        } else {
          toast.warning(
            "ERP saved, but Razorpay statutory push failed. Open Data Health to retry.",
            { description: msg.length > 160 ? msg.slice(0, 160) + "…" : msg },
          );
        }
      }
      return { ok: false, error: msg, needsEnvelope };
    }

    await logPushback({
      hr_employee_id: hrEmployeeId,
      razorpay_employee_id: razorpayId,
      kind: "statutory",
      action: "push_statutory_apply_one",
      status: "success",
      response_snapshot: d ?? null,
      triggered_from: opts?.triggeredFrom,
    });

    await logPushback({
      hr_employee_id: hrEmployeeId,
      razorpay_employee_id: razorpayId,
      kind: "statutory",
      action: "push_statutory_apply_one",
      status: "success",
      response_snapshot: d ?? null,
      triggered_from: opts?.triggeredFrom,
    });

    const verifyResult = await verifyAndFinalize({
      kind: "statutory",
      hrEmployeeId,
      razorpayEmployeeId: String(razorpayId),
      triggeredFrom: opts?.triggeredFrom,
      silent: opts?.silent,
      successToast: "RazorpayX statutory enrollment verified",
      retry: () => pushStatutoryToRazorpay(hrEmployeeId, { ...(opts || {}), silent: true }),
    });

    if (verifyResult.overall === "verified") {
      try {
        await (supabase as any)
          .from("hr_drift_alerts")
          .update({ resolved_at: new Date().toISOString(), resolution_note: "Auto-resolved by verified push" })
          .eq("hr_employee_id", hrEmployeeId)
          .eq("field", "statutory_enrollment")
          .is("resolved_at", null);
      } catch { /* ignore */ }
    }
    return { ok: verifyResult.overall === "verified", error: verifyResult.overall === "verified" ? undefined : verifyResult.error };
  } catch (e: any) {
    const msg = e?.message || String(e);
    await logPushback({
      hr_employee_id: hrEmployeeId,
      razorpay_employee_id: razorpayId,
      kind: "statutory",
      action: "push_statutory_apply_one",
      status: "failure",
      error_message: msg,
      triggered_from: opts?.triggeredFrom,
    });
    await upsertDrift(hrEmployeeId, "statutory_enrollment", `Push failed: ${msg.slice(0, 200)}`);
    if (!opts?.silent) {
      toast.warning("ERP saved, but Razorpay statutory push failed. Retry from Data Health.", {
        description: msg.length > 160 ? msg.slice(0, 160) + "…" : msg,
      });
    }
    return { ok: false, error: msg };
  }
}

