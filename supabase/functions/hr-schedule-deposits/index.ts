// Daily cron: pushes any scheduled security-deposit installment whose
// period_month has arrived. Idempotent — a row moves 'scheduled' → 'pushed'
// only when the RazorpayX payroll_add_deduction call succeeds.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const svc = createClient(SUPABASE_URL, SERVICE_ROLE);

  // 1. Current payroll period (YYYY-MM-01)
  const now = new Date();
  const period = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString().slice(0, 10);

  // 2. All installments due this period-or-earlier that haven't been pushed yet
  const { data: due, error } = await svc
    .from("hr_employee_deposit_schedule")
    .select("id, employee_id, period_month, installment_no, amount")
    .in("status", ["scheduled", "failed"])
    .lte("period_month", period);

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
    });
  }

  const results: any[] = [];
  for (const inst of (due ?? []) as any[]) {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/razorpay-payroll-proxy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_ROLE}`,
      },
      body: JSON.stringify({
        action: "payroll_add_deduction",
        hr_employee_id: inst.employee_id,
        period_month: inst.period_month,
        code: `SECURITY_DEPOSIT_M${inst.installment_no + 1}`, // M2 for installment 1, M3 for 2
        amount: Number(inst.amount),
        description: `Security deposit installment ${inst.installment_no} (Clause 6b)`,
      }),
    });
    const body = await resp.json().catch(() => ({}));
    const ok = resp.ok && body?.ok !== false;

    await svc.from("hr_employee_deposit_schedule").update({
      status: ok ? "pushed" : "failed",
      razorpay_input_id: body?.razorpay_input_id ?? body?.response?.data?.id ?? null,
      razorpay_pushed_at: ok ? new Date().toISOString() : null,
      failure_reason: ok ? null : (body?.error ?? `HTTP ${resp.status}`),
    }).eq("id", inst.id);

    results.push({
      id: inst.id, employee_id: inst.employee_id, ok, http: resp.status, error: body?.error ?? null,
    });
  }

  return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
  });
});
