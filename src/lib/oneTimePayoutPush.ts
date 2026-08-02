/**
 * One-time payout push to RazorpayX.
 *
 * RazorpayX has no standalone "pay a bonus" endpoint — one-off bonuses,
 * incentives, retention pay etc. must be attached to a specific payroll
 * month as an "addition" line item. This helper stages the addition on
 * RazorpayX via `payroll_add_additions` and stamps the outcome back on
 * the originating `hr_salary_revisions` row so the UI can show accurate
 * push feedback.
 *
 * NOTE: This queues the payout onto the payroll month. It is fully
 * "verified" only after that payroll run is executed on RazorpayX and
 * the payslip read-back confirms the addition — see payslip sync.
 */
import { supabase } from "@/integrations/supabase/client";

export type OneTimePushResult = {
  ok: boolean;
  skipped?: boolean;
  error?: string;
  response?: any;
};

const ADDITION_TYPE_MAP: Record<string, string> = {
  bonus: "bonus",
  performance_incentive: "bonus",
  retention_bonus: "bonus",
  special_allowance: "bonus",
  ad_hoc: "bonus",
  reimbursement: "reimbursement",
  arrears: "arrears",
};

export async function pushOneTimePayoutToRazorpay(revisionId: string): Promise<OneTimePushResult> {
  // 1) Read revision
  const { data: rev, error: readErr } = await (supabase as any)
    .from("hr_salary_revisions")
    .select("id, employee_id, revision_type, one_time_amount, payout_month, revision_reason, notes")
    .eq("id", revisionId)
    .maybeSingle();
  if (readErr || !rev) return { ok: false, error: readErr?.message || "Revision not found" };

  const amount = Number(rev.one_time_amount || 0);
  if (!amount || amount <= 0) return { ok: false, error: "No one-time amount on this revision" };
  if (!rev.payout_month) return { ok: false, error: "Payout month missing on this revision" };

  // 2) Look up RazorpayX employee id
  const { data: map } = await (supabase as any)
    .from("hr_razorpay_employee_map")
    .select("razorpay_employee_id")
    .eq("hr_employee_id", rev.employee_id)
    .maybeSingle();
  const razorpayId = map?.razorpay_employee_id;
  if (!razorpayId) {
    const errMsg = "Employee is not linked to RazorpayX — link them from Data Health first.";
    await (supabase as any)
      .from("hr_salary_revisions")
      .update({ razorpay_push_error: errMsg, razorpay_pushed_at: null })
      .eq("id", revisionId);
    return { ok: false, skipped: true, error: errMsg };
  }

  // 3) Build RazorpayX addition payload.
  //
  // AMOUNTS ARE IN RUPEES — NOT PAISE.
  // Opfin's payroll:add-additions envelope is rupee-denominated (the same
  // response echoes `salary: 76000` for a ₹76,000/month employee). This helper
  // previously sent `amount * 100`, which pushed a ₹5,000 bonus to RazorpayX as
  // ₹5,00,000. Every other caller (Payroll Inputs, bulk staging) already sends
  // rupees — keep it that way. Do not reintroduce a paise conversion.
  const periodMonth = String(rev.payout_month).slice(0, 7); // "YYYY-MM-01" → "YYYY-MM"
  const label =
    (rev.revision_reason && String(rev.revision_reason).trim()) ||
    (rev.notes && String(rev.notes).trim()) ||
    (rev.revision_type ? String(rev.revision_type).replace(/_/g, " ") : "Bonus");
  const additionType = ADDITION_TYPE_MAP[rev.revision_type] || "bonus";
  const amountRupees = Math.round(amount);
  const pushLabel = label.slice(0, 80);

  const data = {
    "employee-id": razorpayId,
    "payroll-month": periodMonth,
    additions: [
      {
        label: pushLabel,
        amount: amountRupees,
        taxable: true,
        type: additionType,
      },
    ],
  };


  // 4) Call proxy
  let response: any = null;
  let errorMessage: string | null = null;
  try {
    const { data: res, error } = await (supabase as any).functions.invoke("razorpay-payroll-proxy", {
      body: { action: "payroll_add_additions", data },
    });
    if (error) {
      // FunctionsHttpError swallows the JSON body under a generic message.
      // Unpack it so we log the real reason (e.g. "Payroll-write gate locked").
      let bodyText: string | null = null;
      try {
        if (typeof error.context?.text === "function") bodyText = await error.context.text();
      } catch { /* ignore */ }
      let parsed: any = null;
      if (bodyText) { try { parsed = JSON.parse(bodyText); } catch { /* keep raw */ } }
      response = parsed || (bodyText ? { raw: bodyText } : null);
      errorMessage = parsed?.error || bodyText || error.message || String(error);
    } else if (!res?.ok) {
      errorMessage = res?.error || res?.body?.error?.message || `HTTP ${res?.http_status || "?"}`;
      response = res;
    } else {
      response = res;
    }
  } catch (e: any) {
    errorMessage = e?.message || String(e);
  }

  // Friendlier message for the commissioning gate
  if (errorMessage && /push_payroll_endpoint_verified=false|Payroll-write gate/i.test(errorMessage)) {
    errorMessage =
      "RazorpayX payroll-write gate is locked. Verify the Payroll-run envelope in HRMS → Payroll → RazorpayX Sync, then retry this push.";
  }

  // 4b) ECHO VERIFICATION — RazorpayX returns the resulting additions map for
  // the employee/month. Compare the echoed rupee amount against what we meant
  // to stage. A unit mismatch (paise vs rupees) or an Opfin-side label collapse
  // shows up here instead of silently landing a 100x bonus on the payroll run.
  if (!errorMessage) {
    const echoed = response?.body?.additions;
    const row = echoed && typeof echoed === "object"
      ? (echoed[pushLabel] ?? Object.values(echoed as Record<string, any>).find(
          (v: any) => String(v?.name ?? "").trim() === pushLabel,
        ))
      : null;
    if (row) {
      const echoedAmount = Number((row as any).amount);
      if (Number.isFinite(echoedAmount) && Math.abs(echoedAmount - amountRupees) > 1) {
        errorMessage =
          `RazorpayX recorded ₹${echoedAmount.toLocaleString("en-IN")} for "${pushLabel}" but ₹${amountRupees.toLocaleString("en-IN")} was intended. ` +
          `The addition was NOT accepted as staged — correct it in RazorpayX (Payroll → this employee → modifications) before the run is executed.`;
      }
    }
  }


  // 5) Stamp result back on the revision
  const patch: any = errorMessage
    ? { razorpay_push_error: errorMessage, razorpay_push_response: response ?? null }
    : { razorpay_pushed_at: new Date().toISOString(), razorpay_push_response: response, razorpay_push_error: null };
  await (supabase as any).from("hr_salary_revisions").update(patch).eq("id", revisionId);

  return errorMessage ? { ok: false, error: errorMessage, response } : { ok: true, response };
}
