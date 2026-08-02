// deno-lint-ignore-file no-explicit-any
/**
 * Roster drift sweep — finds people who exist in RazorpayX payroll but have no
 * matching HRMS employee. Delegates to the razorpay-payroll-proxy
 * `scan_orphans` action using the service-role token so it can run from cron.
 *
 * Results land in public.hr_razorpay_orphans and surface on /hrms/data-health.
 */
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supaUrl = Deno.env.get("SUPABASE_URL")!;
  const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  let body: any = {};
  try { body = await req.json(); } catch { /* empty body ok */ }
  const start_id = Number(body?.start_id ?? 1);
  const max_id = Number(body?.max_id ?? 300);

  try {
    const r = await fetch(`${supaUrl}/functions/v1/razorpay-payroll-proxy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${svcKey}`,
        apikey: svcKey,
      },
      body: JSON.stringify({ action: "scan_orphans", payload: { start_id, max_id } }),
    });
    const out = await r.json().catch(() => ({}));
    return new Response(JSON.stringify(out), {
      status: r.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message || String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
