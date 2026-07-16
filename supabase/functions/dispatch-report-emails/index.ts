import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Current IST date (YYYY-MM-DD) and minutes-since-midnight.
function istNow(): { date: string; minutes: number } {
  const nowMs = Date.now() + 5.5 * 60 * 60 * 1000;
  const ist = new Date(nowMs);
  return {
    date: ist.toISOString().split("T")[0],
    minutes: ist.getUTCHours() * 60 + ist.getUTCMinutes(),
  };
}

// Parse "HH:MM" -> minutes since midnight (null on bad input).
function parseHHMM(s?: string | null): number | null {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s).trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Manual override: { configId } forces a single config to send now (used by "Send now").
    let body: any = {};
    try { body = await req.json(); } catch { /* no body */ }

    const { date: today, minutes: nowMin } = istNow();

    const { data: configs, error } = await supabase
      .from("report_email_configs")
      .select("*");
    if (error) throw error;

    const results: any[] = [];
    for (const cfg of configs || []) {
      const isManual = body?.configId && body.configId === cfg.id;

      if (!isManual) {
        if (!cfg.enabled) continue;
        const cfgMin = parseHHMM(cfg.send_time);
        if (cfgMin === null) continue;
        // Catch-up semantics: fire once per IST day as soon as we're past send_time
        // AND today's send hasn't been recorded. This survives short outages,
        // deploy gaps, and transient 401s during the exact 5-minute cron slot.
        if (nowMin < cfgMin) continue;
        if (cfg.last_sent_on === today) continue;
      }

      const recipients: string[] = Array.isArray(cfg.recipients)
        ? cfg.recipients.filter((r: string) => !!r && r.trim())
        : [];
      if (recipients.length === 0) {
        results.push({ id: cfg.id, name: cfg.name, skipped: "no recipients" });
        continue;
      }

      // Route by variant: KYC/RM report uses its own function; profit/operations use daily-report-email.
      const isKycRm = cfg.variant === "kyc_rm";
      const targetFn = isKycRm ? "kyc-rm-report-email" : "daily-report-email";
      const invokeBody = isKycRm
        ? { recipients }
        : { recipients, variant: cfg.variant, mode: cfg.is_monthly ? "monthly" : "daily" };

      // Server-to-server dispatch secret — authorises the report functions
      // to accept caller-supplied recipients from this cron dispatcher.
      const dispatcherSecret = Deno.env.get("REPORT_DISPATCH_SECRET") || Deno.env.get("CRON_SECRET") || "";
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supaUrl = Deno.env.get("SUPABASE_URL")!;
      let invokeData: any = null;
      let invokeError: { message: string } | null = null;
      try {
        const resp = await fetch(`${supaUrl}/functions/v1/${targetFn}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceKey}`,
            "apikey": serviceKey,
            ...(dispatcherSecret ? { "x-report-dispatch-secret": dispatcherSecret } : {}),
          },
          body: JSON.stringify(invokeBody),
        });
        const text = await resp.text();
        if (!resp.ok) {
          invokeError = { message: `HTTP ${resp.status}: ${text.slice(0, 300)}` };
        } else {
          try { invokeData = JSON.parse(text); } catch { invokeData = text; }
        }
      } catch (e) {
        invokeError = { message: (e as Error).message };
      }

      const ok = !invokeError;
      // Only stamp last_sent_on for scheduled runs (manual sends can be repeated).
      if (ok && !isManual) {
        await supabase
          .from("report_email_configs")
          .update({ last_sent_on: today })
          .eq("id", cfg.id);
      }
      results.push({ id: cfg.id, name: cfg.name, variant: cfg.variant, sent: ok, error: invokeError?.message, data: invokeData });
    }

    return new Response(JSON.stringify({ success: true, istDate: today, istMinutes: nowMin, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("dispatch-report-emails error:", error);
    return new Response(JSON.stringify({ success: false, error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
