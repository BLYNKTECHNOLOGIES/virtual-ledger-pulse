import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

serve(async (req) => {
  const supaUrl = Deno.env.get("SUPABASE_URL")!;
  const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const body = await req.text();
  const r = await fetch(`${supaUrl}/functions/v1/razorpay-payroll-proxy`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${svcKey}`, apikey: svcKey },
    body,
  });
  const out = await r.text();
  return new Response(out, { status: r.status, headers: { "Content-Type": "application/json" } });
});
