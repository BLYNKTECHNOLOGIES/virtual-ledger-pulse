// Daily cron: promote every SCHEDULED salary revision whose effective_from has
// arrived. For each promoted row: (1) call the RPC that flips the employee's
// CTC + marks the row APPLIED, then (2) push the new CTC to RazorpayX via the
// existing payroll proxy.
//
// This is the ONLY place scheduled revisions become live — the Revise Salary
// dialog just stores the SCHEDULED row and returns.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const svc = createClient(SUPABASE_URL, SERVICE_ROLE);

  const today = new Date().toISOString().slice(0, 10);

  const { data: due, error: dueErr } = await svc
    .from("hr_salary_revisions")
    .select("id, employee_id, effective_from, new_total, new_basic, revision_reason")
    .eq("status", "SCHEDULED")
    .lte("effective_from", today)
    .is("one_time_amount", null)
    .order("effective_from", { ascending: true });

  if (dueErr) {
    return new Response(JSON.stringify({ ok: false, error: dueErr.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
    });
  }

  const results: any[] = [];
  for (const row of due ?? []) {
    try {
      const { data: promoted, error: promoteErr } = await svc.rpc(
        "promote_scheduled_salary_revision",
        { p_row_id: row.id },
      );
      if (promoteErr) {
        results.push({ id: row.id, ok: false, stage: "promote", error: promoteErr.message });
        continue;
      }

      // Push to RazorpayX. Never block a promotion on push failure — a badge
      // will surface it on the Salary Revisions page for retry.
      const { data: pushResp, error: pushErr } = await svc.functions.invoke(
        "razorpay-payroll-proxy",
        {
          body: {
            action: "push_employee_salary",
            hr_employee_id: row.employee_id,
            triggered_from: "scheduled_revision_cron",
            revision_id: row.id,
          },
        },
      );

      // Training-completion transitions: RazorpayX pays the whole month at the
      // live CTC, so stage the exact one-time recovery (or arrears) for HR to
      // approve in the payroll cockpit. Idempotent — safe on cron re-runs.
      let adjustment: any = null;
      if (row.revision_reason === "training_completion") {
        const { data: adj, error: adjErr } = await svc.rpc(
          "hr_stage_training_ctc_adjustment",
          { p_revision_id: row.id },
        );
        adjustment = adjErr ? { ok: false, error: adjErr.message } : adj;
      }

      results.push({
        id: row.id,
        employee_id: row.employee_id,
        effective_from: row.effective_from,
        ok: true,
        promoted,
        adjustment,
        push_ok: !pushErr && !(pushResp as any)?.error,
        push_error: pushErr?.message || (pushResp as any)?.error || null,
      });
    } catch (e: any) {
      results.push({ id: row.id, ok: false, stage: "exception", error: e?.message || String(e) });
    }
  }


  return new Response(
    JSON.stringify({ ok: true, ran_at: new Date().toISOString(), count: results.length, results }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
