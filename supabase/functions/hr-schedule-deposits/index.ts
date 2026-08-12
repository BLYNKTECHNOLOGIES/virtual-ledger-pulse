// Daily cron: pushes every due payroll recovery installment to RazorpayX —
// security deposits, error recoveries and loan/advance EMIs.
// Idempotent: a row only leaves 'scheduled'/'failed' when the RazorpayX
// payroll_add_deduction call succeeds, and ledger/balances are updated
// atomically through SECURITY DEFINER RPCs.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });

// RazorpayX payroll:add-deduction contract (via proxy):
//   data = { "employee-id": <razorpay numeric id>, "employee-type": "employee",
//            "payroll-month": "YYYY-MM", deductions: [{ label, amount }] }
// Sending hr_employee_id/period_month/code/amount is rejected with
// "Missing required payroll deductions field(s): ...".
//
// Opfin's add-deduction is aggregate-only: it returns no per-input id and
// canonicalises our label into "Gross pay deduction". The proxy therefore
// performs a payroll:view-payroll read-back and reports whether the amount is
// actually visible on the live run. We treat "pushed" as true only when that
// read-back verifies — no fabricated ids, no optimistic success.
async function pushDeduction(
  svc: any,
  input: {
    hr_employee_id: string;
    period_month: string;
    code: string;
    amount: number;
    description: string;
  },
) {
  const { data: mapRow } = await svc
    .from("hr_razorpay_employee_map")
    .select("razorpay_employee_id")
    .eq("hr_employee_id", input.hr_employee_id)
    .maybeSingle();
  const rpEid = mapRow?.razorpay_employee_id;
  if (!rpEid) {
    return { ok: false, http: 0, inputId: null, error: "No RazorpayX employee mapping" };
  }

  const resp = await fetch(`${SUPABASE_URL}/functions/v1/razorpay-payroll-proxy`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_ROLE}`,
    },
    body: JSON.stringify({
      action: "payroll_add_deduction",
      payload: {
        data: {
          "employee-id": Number(rpEid),
          "employee-type": "employee",
          "payroll-month": String(input.period_month).slice(0, 7),
          deductions: [{ label: input.description, amount: Number(input.amount) }],
        },
      },
    }),
  });
  const body = await resp.json().catch(() => ({}));
  const httpOk = resp.ok && body?.ok !== false;
  const rb = body?.readback ?? null;
  // Verified only when RazorpayX itself echoes the deduction back on the run.
  const verified = httpOk && rb?.ok === true;
  const inputId = body?.razorpay_input_id ?? body?.response?.data?.id ?? null;
  const error = !httpOk
    ? (body?.error ?? `HTTP ${resp.status}`)
    : (verified ? null : (rb?.error ?? "Pushed, but not visible on the RazorpayX read-back"));
  return { ok: verified, http: resp.status, inputId, error, readback: rb };
}



Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const svc = createClient(SUPABASE_URL, SERVICE_ROLE);

  let onlyKind: string | null = null;
  let onlyId: string | null = null;
  try {
    const b = await req.json();
    onlyKind = b?.kind ?? null;
    onlyId = b?.id ?? null;
  } catch (_) { /* cron call, no body */ }

  const now = new Date();
  const period = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString().slice(0, 10);

  const results: any[] = [];

  // Leavers are settled exclusively through the F&F engine: from the last
  // working-day MONTH onward, no monthly deposit installment or loan EMI is
  // pushed for them. The F&F settlement carries the whole recovery/refund.
  const leaverCutoff = new Map<string, string>(); // hr_employee_id -> LWD month (YYYY-MM-01)
  {
    const { data: leavers } = await svc
      .from("hr_employees")
      .select("id, last_working_day")
      .not("last_working_day", "is", null);
    for (const e of (leavers ?? []) as any[]) {
      leaverCutoff.set(e.id, `${String(e.last_working_day).slice(0, 7)}-01`);
    }
  }
  const isLeaverPeriod = (employeeId: string, periodMonth: string) => {
    const cut = leaverCutoff.get(employeeId);
    return !!cut && String(periodMonth).slice(0, 10) >= cut;
  };


  // ---------------------------------------------------------------- deposits
  if (!onlyKind || onlyKind === "deposit") {
    let q = svc
      .from("hr_employee_deposit_schedule")
      .select("id, employee_id, deposit_id, period_month, installment_no, amount, deposit_type")
      .in("status", ["scheduled", "failed"])
      .lte("period_month", period);
    if (onlyId) q = q.eq("deposit_id", onlyId);
    const { data: due, error } = await q;
    if (error) return json({ ok: false, error: error.message }, 500);

    // Skip installments whose parent deposit is paused / settled / collected
    const depositIds = [...new Set((due ?? []).map((d: any) => d.deposit_id).filter(Boolean))];
    const skip = new Set<string>();
    if (depositIds.length) {
      const { data: deps } = await svc
        .from("hr_employee_deposits")
        .select("id, is_paused, is_settled, is_fully_collected")
        .in("id", depositIds);
      for (const d of (deps ?? []) as any[]) {
        if (d.is_paused || d.is_settled || d.is_fully_collected) skip.add(d.id);
      }
    }

    for (const inst of (due ?? []) as any[]) {
      if (isLeaverPeriod(inst.employee_id, inst.period_month)) {
        results.push({ kind: "deposit", id: inst.id, skipped: "leaver — settled via F&F" });
        continue;
      }
      if (inst.deposit_id && skip.has(inst.deposit_id)) {
        results.push({ kind: "deposit", id: inst.id, skipped: "deposit paused/settled/collected" });

        continue;
      }
      const isRecovery = inst.deposit_type === "error_recovery";
      const push = await pushDeduction(svc, {
        hr_employee_id: inst.employee_id,
        period_month: inst.period_month,
        code: `${isRecovery ? "ERROR_RECOVERY" : "SECURITY_DEPOSIT"}_M${inst.installment_no}`,
        amount: Number(inst.amount),
        description: isRecovery
          ? `Error recovery installment ${inst.installment_no}`
          : `Security deposit installment ${inst.installment_no} (Clause 6b)`,
      });

      if (push.ok) {
        const { error: rpcErr } = await svc.rpc("hr_apply_deposit_collection", {
          p_schedule_id: inst.id,
          p_razorpay_input_id: push.inputId,
        });
        if (rpcErr) {
          await svc.from("hr_employee_deposit_schedule")
            .update({ status: "failed", failure_reason: `ledger: ${rpcErr.message}` })
            .eq("id", inst.id);
        }
        results.push({ kind: "deposit", id: inst.id, ok: !rpcErr, error: rpcErr?.message ?? null });
      } else {
        await svc.from("hr_employee_deposit_schedule")
          .update({ status: "failed", failure_reason: push.error })
          .eq("id", inst.id);
        results.push({ kind: "deposit", id: inst.id, ok: false, http: push.http, error: push.error });
      }
    }
  }

  // ------------------------------------------------------------------- loans
  if (!onlyKind || onlyKind === "loan") {
    let q = svc
      .from("hr_loan_repayments")
      .select("id, loan_id, employee_id, period_month, installment_no, amount")
      .in("status", ["scheduled", "failed"])
      .lte("period_month", period);
    if (onlyId) q = q.eq("loan_id", onlyId);
    const { data: dueLoans, error: loanErr } = await q;
    if (loanErr) return json({ ok: false, error: loanErr.message }, 500);

    const loanIds = [...new Set((dueLoans ?? []).map((r: any) => r.loan_id))];
    const loanMeta = new Map<string, any>();
    if (loanIds.length) {
      const { data: loans } = await svc
        .from("hr_loans")
        .select("id, status, loan_type, advance_type")
        .in("id", loanIds);
      for (const l of (loans ?? []) as any[]) loanMeta.set(l.id, l);
    }

    for (const r of (dueLoans ?? []) as any[]) {
      if (isLeaverPeriod(r.employee_id, r.period_month)) {
        results.push({ kind: "loan", id: r.id, skipped: "leaver — settled via F&F" });
        continue;
      }
      const loan = loanMeta.get(r.loan_id);

      if (!loan || !["approved", "active"].includes(loan.status)) {
        results.push({ kind: "loan", id: r.id, skipped: `loan status ${loan?.status ?? "missing"}` });
        continue;
      }
      const isAdvance = (loan.loan_type || "").includes("advance");
      const push = await pushDeduction(svc, {
        hr_employee_id: r.employee_id,
        period_month: r.period_month,
        code: `LOAN_EMI_M${r.installment_no}`,
        amount: Number(r.amount),
        description: isAdvance
          ? `Salary advance recovery — installment ${r.installment_no}`
          : `Loan EMI — installment ${r.installment_no}`,
      });

      if (push.ok) {
        // Two-stage life: 'pushed' now (money is on the RazorpayX run), 'paid'
        // only when that payroll month is actually locked/processed.
        const { error: rpcErr } = await svc.rpc("hr_apply_loan_push", {
          p_repayment_id: r.id,
          p_razorpay_input_id: push.inputId,
        });

        if (rpcErr) {
          await svc.from("hr_loan_repayments")
            .update({ status: "failed", failure_reason: `ledger: ${rpcErr.message}` })
            .eq("id", r.id);
        }
        results.push({ kind: "loan", id: r.id, ok: !rpcErr, error: rpcErr?.message ?? null });
      } else {
        await svc.from("hr_loan_repayments")
          .update({ status: "failed", failure_reason: push.error })
          .eq("id", r.id);
        results.push({ kind: "loan", id: r.id, ok: false, http: push.http, error: push.error });
      }
    }
  }

  return json({ ok: true, period, processed: results.length, results });
});
