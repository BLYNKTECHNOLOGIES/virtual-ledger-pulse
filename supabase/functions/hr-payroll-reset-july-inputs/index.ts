// One-shot maintenance job for the July 2026 payroll period.
// 1) Zeroes the already-pushed LOP deductions in RazorpayX (Opfin's
//    add-deduction endpoint is an aggregate per employee/month, so pushing the
//    remaining non-LOP total — zero here — removes the LOP amount), then
//    deletes the local LOP rows so LOP can be recalculated after the salary
//    revisions are applied.
// 2) Zeroes the already-pushed additions in RazorpayX (add-additions upserts by
//    label) and flips the local rows back to un-pushed so HR can re-push them
//    from step 5 with the correct post-revision figures. Rows are kept.
// Naturally idempotent: once LOP rows are gone and additions are un-pushed
// there is nothing left to act on.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PERIOD = "2026-07-01";
const PERIOD_MONTH = "2026-07";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });

async function proxy(action: string, data: Record<string, unknown>) {
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/razorpay-payroll-proxy`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
    body: JSON.stringify({ action, payload: { data, allow_zero: true } }),
  });
  const body = await resp.json().catch(() => ({}));
  return { ok: resp.ok && body?.ok !== false, http: resp.status, body };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const svc = createClient(SUPABASE_URL, SERVICE_ROLE);
  const dryRun = new URL(req.url).searchParams.get("dry") === "1";
  let extraZeroRpIds: string[] = [];
  try {
    const b = await req.json();
    extraZeroRpIds = Array.isArray(b?.zeroDeductionsFor) ? b.zeroDeductionsFor.map(String) : [];
  } catch (_) { /* no body */ }
  const out: any = { period: PERIOD, dryRun, lop: [], additions: [] };

  // ?verify=1 — read July payroll back from RazorpayX and report each
  // employee's live additions/deductions so the wipe can be confirmed.
  if (new URL(req.url).searchParams.get("verify") === "1") {
    const res = await proxy("payroll_view_payroll", { "payroll-month": PERIOD_MONTH });
    return json({ ok: res.ok, http: res.http, body: res.body });
  }

  // ---------------------------------------------------------------- LOP wipe
  const { data: deds, error: dErr } = await svc
    .from("hr_payroll_input_deductions")
    .select("id, razorpay_employee_id, label, amount, source, pushed_at")
    .eq("period_month", PERIOD);
  if (dErr) return json({ ok: false, error: dErr.message }, 500);

  const isLop = (r: any) =>
    r.source === "auto_lop" || String(r.label ?? "").toLowerCase().includes("lop");
  const byEmp = new Map<string, any[]>();
  for (const r of deds ?? []) {
    if (!r.razorpay_employee_id) continue;
    const k = String(r.razorpay_employee_id);
    byEmp.set(k, [...(byEmp.get(k) ?? []), r]);
  }

  // Recovery path: rows already deleted locally in an earlier attempt, but the
  // amount is still live in RazorpayX. Opfin's add-deduction refuses a zero
  // amount ("Please specify the deduction", code 41) and has no delete verb,
  // so the only supported way to remove a pushed deduction is
  // payroll:reset-modifications for that employee/month. It also clears that
  // employee's additions, which is safe here because every addition has been
  // zeroed and flipped back to un-pushed for re-push.
  for (const rpId of extraZeroRpIds) {
    const { data: mapRow } = await svc
      .from("hr_razorpay_employee_map")
      .select("hr_employee_id, last_pull_snapshot")
      .eq("razorpay_employee_id", rpId)
      .maybeSingle();
    const snap: any = mapRow?.last_pull_snapshot || {};
    let email = snap.email || snap.work_email || snap["work-email"] || snap.personal_email || "";
    if (!email && mapRow?.hr_employee_id) {
      const { data: emp } = await svc.from("hr_employees").select("email").eq("id", mapRow.hr_employee_id).maybeSingle();
      email = emp?.email || "";
    }
    if (!email) { out.lop.push({ rp: rpId, ok: false, error: "no mapped email" }); continue; }
    if (dryRun) { out.lop.push({ rp: rpId, wouldReset: true }); continue; }
    const res = await proxy("payroll_reset_modifications", {
      email,
      "employee-id": Number(rpId),
      "employee-type": "employee",
      "payroll-month": PERIOD_MONTH,
    });
    out.lop.push({ rp: rpId, reset: true, ok: res.ok, http: res.http, error: res.ok ? null : (res.body?.error ?? res.body) });
  }

  const lopIds: string[] = [];
  for (const [rpId, rows] of byEmp) {
    const lopRows = rows.filter(isLop);
    if (lopRows.length === 0) continue;
    lopIds.push(...lopRows.map((r) => r.id));
    if (!lopRows.some((r) => r.pushed_at)) {
      out.lop.push({ rp: rpId, skipped: "never pushed" });
      continue;
    }
    const keep = rows.filter((r) => !isLop(r));
    const remaining = keep.reduce((s, r) => s + Number(r.amount || 0), 0);
    if (dryRun) {
      out.lop.push({ rp: rpId, wouldPush: remaining });
      continue;
    }
    const res = await proxy("payroll_add_deduction", {
      "employee-id": Number(rpId),
      "employee-type": "employee",
      "payroll-month": PERIOD_MONTH,
      deductions: keep.length
        ? keep.map((r) => ({ label: r.label, amount: Number(r.amount) }))
        : [{ label: "LOP reset", amount: 0 }],
    });
    out.lop.push({ rp: rpId, pushed: remaining, ok: res.ok, http: res.http, error: res.ok ? null : res.body?.error });
  }

  if (!dryRun && lopIds.length) {
    const { error } = await svc.from("hr_payroll_input_deductions").delete().in("id", lopIds);
    out.lop_rows_deleted = error ? `error: ${error.message}` : lopIds.length;
  } else {
    out.lop_rows_deleted = dryRun ? `${lopIds.length} (dry run)` : 0;
  }

  // ------------------------------------------------------- additions un-push
  const { data: adds, error: aErr } = await svc
    .from("hr_payroll_input_additions")
    .select("id, razorpay_employee_id, label, amount, addition_type, taxable, pushed_at")
    .eq("period_month", PERIOD)
    .not("pushed_at", "is", null);
  if (aErr) return json({ ok: false, error: aErr.message }, 500);

  const addByEmp = new Map<string, any[]>();
  for (const r of adds ?? []) {
    if (!r.razorpay_employee_id) continue;
    const k = String(r.razorpay_employee_id);
    addByEmp.set(k, [...(addByEmp.get(k) ?? []), r]);
  }

  const clearedIds: string[] = [];
  for (const [rpId, rows] of addByEmp) {
    if (dryRun) {
      out.additions.push({ rp: rpId, wouldZero: rows.map((r) => r.label) });
      clearedIds.push(...rows.map((r) => r.id));
      continue;
    }
    const res = await proxy("payroll_add_additions", {
      "employee-id": Number(rpId),
      "employee-type": "employee",
      "payroll-month": PERIOD_MONTH,
      additions: rows.map((r) => ({ label: r.label, amount: 0, taxable: r.taxable !== false })),
    });
    out.additions.push({ rp: rpId, labels: rows.map((r) => r.label), ok: res.ok, http: res.http, error: res.ok ? null : res.body?.error });
    if (res.ok) clearedIds.push(...rows.map((r) => r.id));
  }

  if (!dryRun && clearedIds.length) {
    const { error } = await svc
      .from("hr_payroll_input_additions")
      .update({ pushed_at: null, push_response: null, readback_verified_at: null, readback_diff: null })
      .in("id", clearedIds);
    out.additions_unpushed = error ? `error: ${error.message}` : clearedIds.length;
  } else {
    out.additions_unpushed = dryRun ? `${clearedIds.length} (dry run)` : 0;
  }

  return json({ ok: true, ...out });
});
