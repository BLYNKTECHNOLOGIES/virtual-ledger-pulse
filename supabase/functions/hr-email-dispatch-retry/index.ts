// F9a — HR email dispatcher retry with backoff + dead-letter.
// Runs every 5 minutes via pg_cron. For each hr_email_send_log row in
// status='pending' whose created_at (or next_retry_at) has aged past 15
// minutes, invoke the original send function once more. Backoff:
// attempt 1→15m, 2→45m, 3→2h. After 3 attempts, mark dead_letter=true
// and emit an hr_drift_alerts row so System Pulse surfaces it.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BACKOFF_MIN = [15, 45, 120]; // minutes for attempt 1, 2, 3

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { data: rows, error } = await supa
      .from("hr_email_send_log")
      .select("id, template_name, recipient_email, retry_payload, attempt_count, created_at, next_retry_at")
      .eq("status", "pending")
      .eq("dead_letter", false)
      .or(
        `next_retry_at.lte.${new Date().toISOString()},and(next_retry_at.is.null,created_at.lte.${new Date(Date.now() - 15 * 60 * 1000).toISOString()})`,
      )
      .order("created_at", { ascending: true })
      .limit(50);

    if (error) throw error;

    let retried = 0;
    let deadLettered = 0;
    let recovered = 0;

    for (const r of rows ?? []) {
      const nextAttempt = (r.attempt_count ?? 0) + 1;
      const payload = r.retry_payload ?? { template: r.template_name, to: r.recipient_email };
      const fn = (r as any).retry_payload?.function_name || "send-hr-email";

      let ok = false;
      let errText: string | null = null;
      try {
        const { data, error: invokeErr } = await supa.functions.invoke(fn, { body: payload });
        if (invokeErr) throw invokeErr;
        ok = (data as any)?.success !== false;
      } catch (e) {
        errText = (e as Error).message?.slice(0, 500) ?? "unknown";
      }

      if (ok) {
        await supa.from("hr_email_send_log").update({
          status: "sent",
          attempt_count: nextAttempt,
          last_error: null,
          next_retry_at: null,
        }).eq("id", r.id);
        recovered++;
        continue;
      }

      if (nextAttempt >= 3) {
        await supa.from("hr_email_send_log").update({
          status: "failed",
          dead_letter: true,
          attempt_count: nextAttempt,
          last_error: errText,
          next_retry_at: null,
        }).eq("id", r.id);
        // Surface on System Pulse via drift alert (unique field key per row)
        await supa.from("hr_drift_alerts").upsert({
          hr_employee_id: "00000000-0000-0000-0000-000000000000",
          field: `email_dispatch_dead_letter:${r.id}`,
          systems_involved: ["hrms"],
          hrms_value: `${r.template_name} → ${r.recipient_email}`,
          severity: "high",
          last_seen_at: new Date().toISOString(),
        }, { onConflict: "hr_employee_id,field" });
        deadLettered++;
      } else {
        const nextRetry = new Date(Date.now() + BACKOFF_MIN[nextAttempt - 1] * 60 * 1000);
        await supa.from("hr_email_send_log").update({
          attempt_count: nextAttempt,
          last_error: errText,
          next_retry_at: nextRetry.toISOString(),
        }).eq("id", r.id);
        retried++;
      }
    }

    return new Response(
      JSON.stringify({ ok: true, scanned: rows?.length ?? 0, retried, dead_lettered: deadLettered, recovered }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[hr-email-dispatch-retry] error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
