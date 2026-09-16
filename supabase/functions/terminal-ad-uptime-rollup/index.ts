// Nightly shift rollup for ad uptime: finalises yesterday's IST shift summaries
// and prunes minute-level rows older than 90 days.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    let requestedDate: string | null = null;
    try {
      const body = await req.json();
      if (body?.date && /^\d{4}-\d{2}-\d{2}$/.test(String(body.date))) requestedDate = String(body.date);
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

    // Retention: minute rows older than 90 days are not needed once summarised.
    const cutoff = new Date(Date.now() - 90 * 24 * 3600_000).toISOString();
    const { error: pruneErr } = await supabase
      .from("terminal_ad_uptime_minutes")
      .delete()
      .lt("minute", cutoff);
    if (pruneErr) console.error("[ad-uptime-rollup] prune failed:", pruneErr.message);
    await supabase.from("terminal_ad_uptime_runs").delete().lt("minute", cutoff);

    return new Response(JSON.stringify({ success: true, rolled }), {
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
