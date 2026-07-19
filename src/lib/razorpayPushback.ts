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

export async function pushToRazorpay(
  kind: Exclude<PushKind, "dismissal" | "create">,
  hrEmployeeId: string,
  opts?: { triggeredFrom?: string; silent?: boolean },
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
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
      throw new Error((data as any).error || "Razorpay rejected the push");
    }

    await logPushback({
      hr_employee_id: hrEmployeeId,
      razorpay_employee_id: razorpayId,
      kind,
      action: ACTION_BY_KIND[kind],
      status: "success",
      response_snapshot: data ?? null,
      triggered_from: opts?.triggeredFrom,
    });

    // Clear any open drift for this bundle now that push succeeded.
    try {
      await (supabase as any)
        .from("hr_drift_alerts")
        .update({ resolved_at: new Date().toISOString(), resolution_note: "Auto-resolved by push" })
        .eq("hr_employee_id", hrEmployeeId)
        .eq("field", DRIFT_FIELD_BY_KIND[kind])
        .is("resolved_at", null);
    } catch { /* ignore */ }

    if (!opts?.silent) toast.success(`Razorpay ${LABEL_BY_KIND[kind]} updated`);
    return { ok: true };
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
    if (!opts?.silent) {
      toast.warning(
        `ERP saved, but Razorpay ${LABEL_BY_KIND[kind]} push failed. Open Data Health to retry.`,
        { description: msg.length > 160 ? msg.slice(0, 160) + "…" : msg },
      );
    }
    return { ok: false, error: msg };
  }
}

export const pushIdentityToRazorpay = (id: string, opts?: { triggeredFrom?: string }) =>
  pushToRazorpay("identity", id, opts);
export const pushBankToRazorpay = (id: string, opts?: { triggeredFrom?: string }) =>
  pushToRazorpay("bank", id, opts);
export const pushSalaryToRazorpay = (id: string, opts?: { triggeredFrom?: string }) =>
  pushToRazorpay("salary", id, opts);
export const pushEmploymentToRazorpay = (id: string, opts?: { triggeredFrom?: string }) =>
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

    toast.success(`Razorpay dismissal scheduled for ${ddmmyyyy} — FNF payroll enabled`);
    return { ok: true, razorpay_employee_id: String(razorpayId) };
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

    try {
      await (supabase as any)
        .from("hr_drift_alerts")
        .update({ resolved_at: new Date().toISOString(), resolution_note: "Auto-resolved by push" })
        .eq("hr_employee_id", hrEmployeeId)
        .eq("field", "statutory_enrollment")
        .is("resolved_at", null);
    } catch { /* ignore */ }

    if (!opts?.silent) toast.success("Razorpay statutory enrollment updated");
    return { ok: true };
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
