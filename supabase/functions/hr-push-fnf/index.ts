// Pushes an approved F&F settlement onto the leaver's final RazorpayX payroll
// month as TWO consolidated lines:
//   addition  — "F&F settlement — dues"       (deposit refunds + bonus)
//   deduction — "F&F settlement — recoveries" (loan outstanding + penalties +
//                                              notice pay + other deductions)
// Amounts are RUPEES. A push is only recorded as done when RazorpayX echoes it
// back on the live run (payroll:view-payroll read-back inside the proxy).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { requireHrCaller } from "../_shared/require-hr-caller.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });

async function callProxy(action: string, payload: unknown) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/razorpay-payroll-proxy`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
    body: JSON.stringify({ action, payload }),
  });
  const body = await res.json().catch(() => ({}));
  const httpOk = res.ok && body?.ok !== false;
  const rb = body?.readback ?? null;
  return {
    verified: httpOk && rb?.ok === true,
    http: res.status,
    error: !httpOk
      ? (body?.error ?? `HTTP ${res.status}`)
      : (rb?.ok === true ? null : (rb?.error ?? "Pushed, but not visible on the RazorpayX read-back")),
    readback: rb,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Payroll payout push — service role / internal cron / HR-payroll staff only.
  const caller = await requireHrCaller(req, corsHeaders, { allowPayrollAuthorized: true });
  if (!caller.ok) return caller.response;

  const svc = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    const { settlement_id } = await req.json();
    if (!settlement_id) return json({ ok: false, error: "settlement_id is required" }, 400);

    const { data: s, error } = await svc
      .from("hr_fnf_settlements")
      .select("*")
      .eq("id", settlement_id)
      .maybeSingle();
    if (error) return json({ ok: false, error: error.message }, 500);
    if (!s) return json({ ok: false, error: "Settlement not found" }, 404);
    if (s.razorpay_push_status === "pushed") {
      return json({ ok: true, already_pushed: true, pushed_at: s.razorpay_pushed_at });
    }
    if (!["approved", "paid"].includes(s.status)) {
      return json({ ok: false, error: `Settlement must be approved before pushing (currently ${s.status})` }, 400);
    }

    const { data: mapRow } = await svc
      .from("hr_razorpay_employee_map")
      .select("razorpay_employee_id")
      .eq("hr_employee_id", s.employee_id)
      .maybeSingle();
    if (!mapRow?.razorpay_employee_id) {
      return json({ ok: false, error: "No RazorpayX employee mapping for this employee" }, 400);
    }

    // The payroll cycle chosen by HR on the settlement wins; the last working
    // day's month is only the fallback for legacy settlements.
    const month = String(s.payroll_month || s.last_working_day || "").slice(0, 7);
    if (!month) return json({ ok: false, error: "Settlement has no payroll cycle month or last working day" }, 400);

    const b: any = s.breakdown || {};
    const additionTotal =
      Number(s.deposit_refund || 0) + Number(s.bonus_amount || 0);
    const deductionTotal =
      Number(s.loan_recovery || 0) +
      Number(s.penalty_deductions || 0) +
      Number(b.notice_pay_recovery || 0) +
      Number(s.other_deductions || 0);

    const results: any[] = [];

    if (additionTotal > 0) {
      const r = await callProxy("payroll_add_additions", {
        data: {
          "employee-id": Number(mapRow.razorpay_employee_id),
          "employee-type": "employee",
          "payroll-month": month,
          additions: [{ label: "F&F settlement — dues", amount: Math.round(additionTotal * 100) / 100 }],
        },
      });
      results.push({ line: "addition", amount: additionTotal, ...r });
    }

    if (deductionTotal > 0) {
      const r = await callProxy("payroll_add_deduction", {
        data: {
          "employee-id": Number(mapRow.razorpay_employee_id),
          "employee-type": "employee",
          "payroll-month": month,
          deductions: [{ label: "F&F settlement — recoveries", amount: Math.round(deductionTotal * 100) / 100 }],
        },
      });
      results.push({ line: "deduction", amount: deductionTotal, ...r });
    }

    if (results.length === 0) {
      await svc.from("hr_fnf_settlements")
        .update({
          razorpay_push_status: "nothing_to_push",
          razorpay_pushed_at: new Date().toISOString(),
          push_failure_reason: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", s.id);
      return json({ ok: true, nothing_to_push: true, month });
    }

    const allVerified = results.every((r) => r.verified);

    // Mirror the pushed F&F lines into the monthly payroll input tables so the
    // Monthly Payroll Cockpit shows them for that cycle, clearly segregated as
    // F&F settlement lines. They are recorded as already pushed so the cockpit
    // never re-pushes them to RazorpayX.
    const periodMonth = `${month}-01`;
    const nowIso = new Date().toISOString();
    for (const r of results) {
      const isAddition = r.line === "addition";
      const table = isAddition ? "hr_payroll_input_additions" : "hr_payroll_input_deductions";
      const row: Record<string, unknown> = {
        hr_employee_id: s.employee_id,
        razorpay_employee_id: String(mapRow.razorpay_employee_id),
        period_month: periodMonth,
        label: isAddition ? "F&F settlement — dues" : "F&F settlement — recoveries",
        amount: r.amount,
        source: "fnf_settlement",
        pushed_at: r.verified ? nowIso : null,
        readback_verified_at: r.verified ? nowIso : null,
        push_response: { settlement_id: s.id, readback: r.readback ?? null, error: r.error ?? null },
        updated_at: nowIso,
      };
      if (isAddition) { row.addition_type = 0; row.taxable = true; }
      const { error: mirrorErr } = await svc
        .from(table)
        .upsert(row, { onConflict: "razorpay_employee_id,period_month,label" });
      if (mirrorErr) console.error("F&F payroll-input mirror failed", table, mirrorErr.message);
    }

    await svc.from("hr_fnf_settlements")
      .update({
        razorpay_push_status: allVerified ? "pushed" : "failed",
        razorpay_pushed_at: allVerified ? new Date().toISOString() : null,
        push_failure_reason: allVerified ? null : results.filter((r) => !r.verified).map((r) => `${r.line}: ${r.error}`).join(" | "),
        breakdown: { ...b, razorpay_push: { month, payroll_month: periodMonth, results, at: new Date().toISOString() } },
        updated_at: new Date().toISOString(),
      })
      .eq("id", s.id);

    return json({ ok: allVerified, month, results });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
