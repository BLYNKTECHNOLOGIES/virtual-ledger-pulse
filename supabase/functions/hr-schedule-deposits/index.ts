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

async function pushDeduction(input: {
  hr_employee_id: string;
  period_month: string;
  code: string;
  amount: number;
  description: string;
}) {
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/razorpay-payroll-proxy`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_ROLE}`,
    },
    body: JSON.stringify({ action: "payroll_add_deduction", ...input }),
  });
  const body = await resp.json().catch(() => ({}));
  const ok = resp.ok && body?.ok !== false;
  const inputId = body?.razorpay_input_id ?? body?.response?.data?.id ?? null;
  return { ok, http: resp.status, inputId, error: body?.error ?? (ok ? null : `HTTP ${resp.status}`) };
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
      if (inst.deposit_id && skip.has(inst.deposit_id)) {
        results.push({ kind: "deposit", id: inst.id, skipped: "deposit paused/settled/collected" });
        continue;
      }
      const isRecovery = inst.deposit_type === "error_recovery";
      const push = await pushDeduction({
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
      const loan = loanMeta.get(r.loan_id);
      if (!loan || !["approved", "active"].includes(loan.status)) {
        results.push({ kind: "loan", id: r.id, skipped: `loan status ${loan?.status ?? "missing"}` });
        continue;
      }
      const isAdvance = (loan.loan_type || "").includes("advance");
      const push = await pushDeduction({
        hr_employee_id: r.employee_id,
        period_month: r.period_month,
        code: `LOAN_EMI_M${r.installment_no}`,
        amount: Number(r.amount),
        description: isAdvance
          ? `Salary advance recovery — installment ${r.installment_no}`
          : `Loan EMI — installment ${r.installment_no}`,
      });

      if (push.ok) {
        const { error: rpcErr } = await svc.rpc("hr_apply_loan_repayment", {
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
