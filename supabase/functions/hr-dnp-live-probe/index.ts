import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405, headers: corsHeaders });
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return Response.json({ ok: false, error: "Missing Supabase runtime binding" }, { status: 500, headers: corsHeaders });
  }

  const response = await fetch(`${SUPABASE_URL}/functions/v1/razorpay-payroll-proxy`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      action: "payroll_do_not_pay",
      payload: {
        data: {
          "employee-id": 8,
          "employee-type": "employee",
          "payroll-month": "2026-07",
          "do-not-pay": true,
        },
      },
    }),
  });

  const body = await response.text();
  return new Response(body, {
    status: response.status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});