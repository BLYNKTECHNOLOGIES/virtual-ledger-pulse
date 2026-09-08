// Outage recovery worker.
//
// For a closed outage: waits out a settle window (buffered punches finish
// arriving), rebuilds attendance for every date the outage covered from the
// punches that actually landed, re-runs the absent marker, then releases the
// held attendance notices. Single-flight via a lease; idempotent; bounded.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { requireCaller } from "../_shared/require-caller.ts";
import { fetchAllRows } from "../_shared/paginate.ts";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const LEASE_MINUTES = 10;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const caller = await requireCaller(req, corsHeaders);
  if (!caller.ok) return caller.response;
  const admin = caller.admin;

  let body: any = {};
  try { body = await req.json(); } catch { /* no body */ }
  const force = body?.force === true;

  try {
    const { data: state } = await admin
      .from("hr_attendance_automation_state")
      .select("state, settle_minutes")
      .eq("id", true)
      .maybeSingle();

    if (state?.state !== "running" && !force) {
      return json({ skipped: true, reason: "automation still paused", state: state?.state });
    }

    const settleMs = (state?.settle_minutes ?? 20) * 60 * 1000;

    const { data: outages } = await admin
      .from("hr_attendance_outages")
      .select("*")
      .not("ended_at", "is", null)
      .or("recovery_status.in.(pending,running),mail_release_status.in.(pending,running)")
      .order("started_at", { ascending: true })
      .limit(1);

    const outage = (outages || [])[0];
    if (!outage) return json({ ok: true, message: "nothing to recover" });

    const settledAt = new Date(outage.ended_at).getTime() + settleMs;
    if (!force && Date.now() < settledAt) {
      return json({
        ok: true,
        message: "waiting for buffered punches to arrive",
        outage_id: outage.id,
        ready_at: new Date(settledAt).toISOString(),
      });
    }

    // Single-flight lease.
    const nowIso = new Date().toISOString();
    const leaseUntil = new Date(Date.now() + LEASE_MINUTES * 60 * 1000).toISOString();
    const { data: leased } = await admin
      .from("hr_attendance_outages")
      .update({ recovery_lease_until: leaseUntil, recovery_status: "running", recovery_started_at: outage.recovery_started_at ?? nowIso })
      .eq("id", outage.id)
      .or(`recovery_lease_until.is.null,recovery_lease_until.lt.${nowIso}`)
      .select("id");
    if (!leased || !leased.length) {
      return json({ ok: true, message: "another recovery run holds the lease", outage_id: outage.id });
    }

    // ---- 1. Rebuild attendance for the covered dates --------------------
    const from = outage.from_date as string;
    const to = (outage.to_date as string) ?? from;

    const employees = await fetchAllRows((f, t) =>
      admin.from("hr_employees").select("id").eq("is_active", true).range(f, t)
    );

    let rebuilt = 0;
    const rebuildErrors: string[] = [];
    for (const emp of employees || []) {
      const { error } = await admin.rpc("hr_v4_recompute_range", {
        p_employee_id: (emp as any).id,
        p_from: from,
        p_to: to,
      });
      if (error) rebuildErrors.push(`${(emp as any).id}: ${error.message}`);
      else rebuilt++;
    }

    await admin.from("hr_attendance_outages").update({
      recovery_status: rebuildErrors.length ? "failed" : "done",
      recovery_finished_at: new Date().toISOString(),
      recovery_result: { from, to, employees: employees?.length ?? 0, rebuilt, errors: rebuildErrors.slice(0, 20) },
    }).eq("id", outage.id);

    if (rebuildErrors.length) {
      await admin.from("hr_attendance_outages").update({ recovery_lease_until: null }).eq("id", outage.id);
      return json({ ok: false, outage_id: outage.id, stage: "rebuild", errors: rebuildErrors.slice(0, 5) }, 500);
    }

    // ---- 2. Re-run absent marking for the recovered window --------------
    await admin.from("hr_attendance_outages").update({ mail_release_status: "running" }).eq("id", outage.id);

    const marker = await admin.functions.invoke("auto-absent-marking", { body: {} });

    // ---- 3. Release held notices ---------------------------------------
    const notify = await admin.functions.invoke("hr-attendance-exception-notify", {
      body: { action: "run", sinceDate: from },
    });

    const releaseFailed = !!marker.error || !!notify.error;
    await admin.from("hr_attendance_outages").update({
      mail_release_status: releaseFailed ? "failed" : "done",
      mail_release_result: {
        marker: marker.error ? { error: marker.error.message } : marker.data,
        notices: notify.error ? { error: notify.error.message } : notify.data,
      },
      recovery_lease_until: null,
    }).eq("id", outage.id);

    console.log(`[outage-recover] ${outage.id} ${from}..${to} rebuilt=${rebuilt} release_failed=${releaseFailed}`);
    return json({
      ok: !releaseFailed,
      outage_id: outage.id,
      from,
      to,
      employees_rebuilt: rebuilt,
      marker: marker.error ? { error: marker.error.message } : marker.data,
      notices: notify.error ? { error: notify.error.message } : notify.data,
    });
  } catch (e) {
    console.error("[outage-recover] error", e);
    return json({ error: (e as Error).message }, 500);
  }
});
