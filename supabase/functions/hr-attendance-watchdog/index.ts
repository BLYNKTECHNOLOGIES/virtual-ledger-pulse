// Stale-session watchdog — hourly cron.
// Sweeps hr_attendance_sessions for any session that has stayed open (no
// out-punch) for 12+ hours and upserts them into hr_attendance_stale_sessions
// for HR to resolve.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data, error } = await supabase.rpc("hr_watchdog_open_sessions");
    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    console.log("[watchdog]", row);
    return new Response(JSON.stringify({ ok: true, ...row }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[watchdog] error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
