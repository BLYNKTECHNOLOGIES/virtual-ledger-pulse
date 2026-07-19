// Daily cron: for every employee whose DOJ + training_period_months has arrived,
// push the "real" structure to RazorpayX via razorpay-payroll-proxy. Requires
// hr_razorpay_settings.path_a_structure_swap_enabled = true.
//
// Also creates a paired hr_salary_revisions row so the statutory toggle-off
// (probation-period exemption) flips at the same moment. The revision is a
// synthetic system entry (`reason = 'Auto: training → real structure swap'`).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const svc = createClient(SUPABASE_URL, SERVICE_ROLE);

  // 1. Doctrine guard
  const { data: settings } = await svc
    .from("hr_razorpay_settings")
    .select("path_a_structure_swap_enabled")
    .eq("is_singleton", true)
    .maybeSingle();
  if (!settings?.path_a_structure_swap_enabled) {
    return new Response(
      JSON.stringify({ ok: false, skipped: true, reason: "path_a_structure_swap_enabled=false" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  }

  // 2. Pending swaps (from the RPC we just deployed)
  const { data: pending, error: rpcErr } = await svc.rpc("hr_pending_training_swaps");
  if (rpcErr) {
    return new Response(JSON.stringify({ ok: false, error: rpcErr.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
    });
  }

  const results: any[] = [];
  for (const row of (pending ?? []) as any[]) {
    // Fetch the real target template (must be pre-configured on the employee)
    const { data: wi } = await svc
      .from("hr_employee_work_info")
      .select("real_structure_template_id")
      .eq("employee_id", row.employee_id)
      .maybeSingle();

    if (!wi?.real_structure_template_id) {
      results.push({ employee_id: row.employee_id, skipped: "no real_structure_template_id" });
      continue;
    }

    // Load the template + expand (client-side expansion helper is unavailable here;
    // we assume the assignment ledger already holds the expanded breakdown from the
    // previous "real" attempt — otherwise the operator must push it manually first).
    const { data: prevReal } = await svc
      .from("hr_employee_salary_structure_assignments")
      .select("annual_ctc, expanded_breakdown, template_id")
      .eq("employee_id", row.employee_id)
      .eq("structure_kind", "real")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!prevReal?.expanded_breakdown) {
      results.push({ employee_id: row.employee_id, skipped: "no expanded_breakdown for real structure — assign via profile first" });
      continue;
    }

    // Invoke the proxy
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/razorpay-payroll-proxy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_ROLE}`,
      },
      body: JSON.stringify({
        action: "push_salary_from_template",
        hr_employee_id: row.employee_id,
        template_id: prevReal.template_id ?? wi.real_structure_template_id,
        annual_ctc: prevReal.annual_ctc,
        structure_kind: "real",
        breakdown: prevReal.expanded_breakdown,
      }),
    });
    const body = await resp.json().catch(() => ({}));
    const ok = resp.ok && body?.ok;

    // Statutory toggle flip via a synthetic salary revision row (no CTC change)
    if (ok) {
      await svc.from("hr_salary_revisions").insert({
        employee_id: row.employee_id,
        revision_type: "statutory_toggle",
        reason: "Auto: training → real structure swap (probation exemption ends)",
        effective_from: row.swap_due,
        applied_at: new Date().toISOString(),
        applied_by_system: true,
        pf_enabled_after: true,
        esi_enabled_after: true,
        pt_enabled_after: true,
      }).select().maybeSingle();

      // Schedule security deposit for months 2/3 now that the real structure is live
      await svc.rpc("hr_schedule_security_deposit", { p_employee_id: row.employee_id });
    }

    results.push({
      employee_id: row.employee_id, ok, http: resp.status, error: body?.error ?? null,
    });
  }

  return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
  });
});
