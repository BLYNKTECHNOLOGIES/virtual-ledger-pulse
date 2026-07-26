// deno-lint-ignore-file no-explicit-any
/**
 * F6 · Nightly push-truth sweep — snapshot refresher.
 *
 * For every employee touched in the last N days (default 30), re-fetch the
 * RazorpayX person snapshot via the existing razorpay-payroll-proxy and
 * upsert it into hr_razorpay_employee_map.last_pull_snapshot. After this
 * runs, the downstream hr-drift-scan cron compares HRMS ↔ fresh RazorpayX
 * and opens drift alerts for any field-level divergence — catching dashboard
 * edits, support corrections, and late no-ops within 24 h with zero human
 * initiation.
 *
 * "Touched" = has a hr_razorpay_pushback_log entry OR updated_at within
 * lookback_days. Unchanged records are cheap (a single GET + local diff).
 */
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const lookbackDays = Math.max(1, Math.min(90, Number(url.searchParams.get("lookback_days") ?? "30")));
  const limit = Math.max(1, Math.min(500, Number(url.searchParams.get("limit") ?? "150")));
  const runDriftScan = url.searchParams.get("chain_drift_scan") !== "false";

  const supaUrl = Deno.env.get("SUPABASE_URL")!;
  const svc = createClient(supaUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    // Candidate set: linked employees whose HRMS record was touched OR who
    // had a pushback attempted recently.
    const since = new Date(Date.now() - lookbackDays * 86400 * 1000).toISOString();
    const [{ data: touched }, { data: pushed }] = await Promise.all([
      svc.from("hr_employees").select("id, updated_at").gte("updated_at", since).limit(limit),
      svc.from("hr_razorpay_pushback_log").select("hr_employee_id, created_at")
        .gte("created_at", since).order("created_at", { ascending: false }).limit(limit),
    ]);

    const candidateIds = Array.from(new Set<string>([
      ...(touched ?? []).map((r: any) => r.id),
      ...(pushed ?? []).map((r: any) => r.hr_employee_id).filter(Boolean),
    ]));

    if (candidateIds.length === 0) {
      return new Response(JSON.stringify({ ok: true, refreshed: 0, scanned_after: 0, reason: "no candidates" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Only refresh those with a linked razorpay_employee_id
    const { data: mapRows } = await svc.from("hr_razorpay_employee_map")
      .select("hr_employee_id, razorpay_employee_id")
      .in("hr_employee_id", candidateIds);

    const proxyUrl = `${supaUrl}/functions/v1/razorpay-payroll-proxy`;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    let refreshed = 0; let errors = 0;
    for (const row of mapRows ?? []) {
      const rpId = row.razorpay_employee_id;
      if (!rpId) continue;
      try {
        const r = await fetch(proxyUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${anonKey}`, apikey: anonKey },
          body: JSON.stringify({ action: "read_person_by_id", payload: { razorpay_employee_id: rpId } }),
        });
        if (!r.ok) { errors++; continue; }
        const body = await r.json();
        if (!body?.ok || !body?.snapshot) { errors++; continue; }
        await svc.from("hr_razorpay_employee_map")
          .update({ last_pull_snapshot: body.snapshot, last_pulled_at: new Date().toISOString() })
          .eq("hr_employee_id", row.hr_employee_id);
        refreshed++;
      } catch (e) {
        console.warn("snapshot refresh failed for", row.hr_employee_id, (e as Error).message);
        errors++;
      }
    }

    // Chain the drift-scan so drift alerts open in the same cron tick
    let scanResult: any = null;
    if (runDriftScan && refreshed > 0) {
      try {
        const scanUrl = `${supaUrl}/functions/v1/hr-drift-scan`;
        const s = await fetch(scanUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${anonKey}`, apikey: anonKey },
        });
        scanResult = await s.json().catch(() => null);
      } catch (e) {
        console.warn("chained drift-scan failed", (e as Error).message);
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      lookback_days: lookbackDays,
      candidates: candidateIds.length,
      linked: mapRows?.length ?? 0,
      refreshed, errors,
      drift_scan: scanResult,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("hr-razorpay-snapshot-refresh error", e);
    return new Response(JSON.stringify({ ok: false, error: e?.message || String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
