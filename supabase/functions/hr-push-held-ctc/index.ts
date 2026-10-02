// Releases held CTC revisions to RazorpayX once their payroll month allows it.
// Rule: a change effective on the 1st goes out once that month is the open
// payroll month; a mid-month change only after that month's payroll closes
// (RazorpayX keeps the old CTC and the part-month arrears pays the difference).
// Triggered by: cockpit final step "done", daily cron (07:00 IST), or HR Retry.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function callProxy(body: Record<string, unknown>) {
  const res = await fetch(`${SUPA_URL}/functions/v1/razorpay-payroll-proxy`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SVC}` },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: any = null; try { data = JSON.parse(text); } catch { /* ignore */ }
  return { status: res.status, data, text };
}

function pickCtc(snap: any): number | null {
  const v = snap?.__salary?.annual_ctc ?? snap?.annual_ctc ?? snap?.["annual-ctc"] ?? null;
  const n = Number(v);
  return v === null || v === undefined || !Number.isFinite(n) ? null : n;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const svc = createClient(SUPA_URL, SVC);
  try {
    // ---- auth: scheduler secret, or HR staff (Retry of one revision) ----
    let actor = "system:auto-ctc-release";
    let triggeredBy: string | null = null;
    const secret = req.headers.get("x-scheduler-secret") || "";
    let isScheduler = false;
    if (secret) {
      const { data } = await svc.from("app_scheduler_secrets").select("secret_value").eq("name", "internal_cron").maybeSingle();
      isScheduler = !!data?.secret_value && data.secret_value === secret;
      if (!isScheduler) return json(401, { error: "Unauthorized" });
    }
    const body = await req.json().catch(() => ({}));
    const revisionId: string | null = typeof body?.revision_id === "string" ? body.revision_id : null;
    if (revisionId && !UUID.test(revisionId)) return json(400, { error: "revision_id must be a UUID" });

    if (!isScheduler) {
      const auth = req.headers.get("Authorization") || "";
      if (!auth.toLowerCase().startsWith("bearer ")) return json(401, { error: "Unauthorized" });
      const c = createClient(SUPA_URL, ANON, { global: { headers: { Authorization: auth } } });
      const { data: u, error } = await c.auth.getUser();
      if (error || !u?.user?.id) return json(401, { error: "Unauthorized" });
      const { data: ok } = await svc.rpc("hr_is_hr_staff", { _user_id: u.user.id }).then(
        (r) => r, () => ({ data: false } as any));
      let allowed = !!ok;
      if (!allowed) {
        const { data: p } = await svc.rpc("user_has_permission", { user_uuid: u.user.id, check_permission: "hrms_razorpay_sync" });
        allowed = !!p;
      }
      if (!allowed) return json(403, { error: "Not authorised" });
      if (!revisionId) return json(400, { error: "revision_id is required for a manual retry" });
      actor = `user:${u.user.id}`;
      triggeredBy = u.user.id;
    }

    const { data: due, error: dueErr } = await svc.rpc("hr_ctc_revisions_due_for_push", { p_revision_id: revisionId });
    if (dueErr) return json(500, { error: dueErr.message });
    if (revisionId && (!due || due.length === 0)) {
      return json(200, { ok: false, error: "This change is not due yet, or a newer change replaced it." });
    }

    const results: any[] = [];
    for (const d of (due || []) as any[]) {
      // Claim (idempotent): only one runner per revision.
      const { data: claimed } = await svc.from("hr_salary_revisions")
        .update({ razorpay_push_state: "queued", last_push_attempt_at: new Date().toISOString() })
        .eq("id", d.revision_id).in("razorpay_push_state", ["held", "failed"])
        .select("id, push_attempts").maybeSingle();
      if (!claimed) { results.push({ revision_id: d.revision_id, status: "skipped_claimed" }); continue; }

      const push = await callProxy({
        action: "push_salary_apply_one",
        razorpay_employee_ids: [String(d.razorpay_employee_id)],
        release_revision_id: d.revision_id,
      });
      const row = push.data?.rows?.[0];
      const pushed = push.status === 200 && row?.status === "pushed";
      const expected = Number(d.new_total);

      let actual: number | null = null; let readErr: string | null = null;
      if (pushed) {
        await new Promise((r) => setTimeout(r, 1200));
        const rd = await callProxy({ action: "read_person_by_id", razorpay_employee_id: String(d.razorpay_employee_id) });
        if (rd.data?.ok === false) readErr = rd.data?.error || "read failed";
        else actual = pickCtc(rd.data?.snapshot);
      }
      // RazorpayX exposes CTC only after an executed run; a null read is not a mismatch.
      const match = pushed && (actual === null || Math.abs(actual - expected) <= 1);
      const now = new Date().toISOString();
      const errText = !pushed
        ? (row?.error || push.data?.error || push.text?.slice(0, 300) || `HTTP ${push.status}`)
        : (!match ? `RazorpayX shows ₹${actual} instead of ₹${expected}` : null);

      await svc.from("hr_razorpay_pushback_log").insert({
        hr_employee_id: d.employee_id,
        razorpay_employee_id: String(d.razorpay_employee_id),
        kind: "salary",
        action: "push_salary_apply_one",
        status: match ? "success" : "failure",
        request_snapshot: { revision_id: d.revision_id, annual_ctc: expected, actor },
        response_snapshot: {
          verify: {
            overall: match ? "verified" : "failed",
            fields: [{ key: "annual_ctc", expected, actual, match, actual_unavailable: actual === null }],
          },
          proxy: row ?? push.data ?? null,
          read_error: readErr,
        },
        error_message: errText,
        triggered_by: triggeredBy,
        triggered_from: isScheduler ? "auto_release_after_payroll" : "salary_revisions_retry",
      });

      if (match) {
        await svc.from("hr_salary_revisions").update({
          razorpay_push_state: "pushed", razorpay_pushed_at: now,
          razorpay_verified_at: actual !== null ? now : null,
          razorpay_push_error: null, push_attempts: (claimed.push_attempts ?? 0) + 1,
        }).eq("id", d.revision_id);
        // Older unsent changes for the same person are now replaced by this one.
        await svc.from("hr_salary_revisions").update({ razorpay_push_state: "superseded" })
          .eq("employee_id", d.employee_id).neq("id", d.revision_id)
          .in("razorpay_push_state", ["held", "failed", "queued"]).eq("status", "APPLIED");
        await svc.from("hr_drift_alerts").update({ resolved_at: now, resolution_note: "Auto-sent after payroll close" })
          .eq("hr_employee_id", d.employee_id).eq("field", "annual_ctc").is("resolved_at", null);
      } else {
        await svc.from("hr_salary_revisions").update({
          razorpay_push_state: "failed", razorpay_push_error: errText,
          push_attempts: (claimed.push_attempts ?? 0) + 1,
        }).eq("id", d.revision_id);
        await svc.from("hr_drift_alerts").upsert({
          hr_employee_id: d.employee_id, field: "annual_ctc", systems_involved: ["hrms", "razorpay"],
          severity: "medium", resolution_note: `Automatic CTC send failed: ${errText}`,
          last_seen_at: now, resolved_at: null,
        }, { onConflict: "hr_employee_id,field" });
      }
      results.push({ revision_id: d.revision_id, status: match ? "pushed" : "failed", error: errText, actual });
    }

    return json(200, { ok: true, processed: results.length, results });
  } catch (e) {
    return json(500, { error: (e as Error).message });
  }
});
