// Nightly rollup for ad uptime.
//
// Compute-saving design: raw per-minute rows exist only long enough to be
// summarised. This job finalises yesterday's (and today's) IST shift summaries,
// rebuilds the pre-aggregated monthly summaries from those shift rows (never
// from raw minutes), then deletes raw minute rows / collector heartbeats older
// than the retention window. Day and month views therefore read small
// pre-calculated tables instead of scanning millions of minute rows.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Raw minutes kept only for the recent timeline / re-rollup safety net. */
const RAW_RETAIN_DAYS = 4;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    let requestedDate: string | null = null;
    let skipPrune = false;
    try {
      const body = await req.json();
      if (body?.date && /^\d{4}-\d{2}-\d{2}$/.test(String(body.date))) requestedDate = String(body.date);
      if (body?.skip_prune === true) skipPrune = true;
    } catch { /* no body */ }

    const nowIst = new Date(Date.now() + 5.5 * 3600_000);
    const yesterdayIst = new Date(nowIst.getTime() - 24 * 3600_000).toISOString().slice(0, 10);
    const todayIst = nowIst.toISOString().slice(0, 10);

    const dates = requestedDate ? [requestedDate] : [yesterdayIst, todayIst];
    const rolled: Record<string, unknown>[] = [];
    for (const date of dates) {
      const { data, error } = await supabase.rpc("rollup_terminal_ad_uptime", { p_date: date });
      if (error) throw error;
      rolled.push({ date, rows: data });
    }

    // Monthly pre-aggregation from the shift summaries (cheap — a few hundred rows).
    const months = Array.from(new Set(dates.map((d) => `${d.slice(0, 7)}-01`)));
    const monthly: Record<string, unknown>[] = [];
    for (const month of months) {
      const { data, error } = await supabase.rpc("rollup_terminal_ad_uptime_monthly", { p_month: month });
      if (error) throw error;
      monthly.push({ month, rows: data });
    }

    // Drop raw minutes once summarised — this is what keeps storage and query cost flat.
    let pruned: unknown = { skipped: true };
    if (!skipPrune) {
      const { data, error } = await supabase.rpc("prune_terminal_ad_uptime_raw", { p_retain_days: RAW_RETAIN_DAYS });
      if (error) {
        console.error("[ad-uptime-rollup] prune failed:", error.message);
        pruned = { error: error.message };
      } else {
        pruned = data;
      }
    }

    return new Response(JSON.stringify({ success: true, rolled, monthly, pruned }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[ad-uptime-rollup] failed:", message);
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
