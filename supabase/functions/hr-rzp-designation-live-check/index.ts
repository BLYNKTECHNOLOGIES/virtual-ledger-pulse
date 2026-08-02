import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const body = await req.json().catch(() => ({}));
  if (body?.challenge !== "khushbu-designation-20260802") {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !serviceKey) {
    return new Response(JSON.stringify({ error: "Backend binding unavailable" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const call = async (payload: Record<string, unknown>) => {
    const response = await fetch(`${url}/functions/v1/razorpay-payroll-proxy`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify(payload),
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  };

  const push = await call({ action: "push_person_apply_one", razorpay_employee_id: "35" });
  if (push.status >= 300 || push.body?.ok === false) {
    return new Response(JSON.stringify({ ok: false, stage: "push", push }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const readBack = await call({ action: "read_person_by_id", razorpay_employee_id: "35", allow_dismissed: true });
  const actual = String(readBack.body?.snapshot?.title ?? readBack.body?.snapshot?.designation ?? "").trim();
  const expected = "Relationship Manager";
  const verified = actual.toLowerCase() === expected.toLowerCase();

  if (verified) {
    const admin = createClient(url, serviceKey);
    await admin.functions.invoke("hr-drift-scan", {
      body: { employee_id: "13e66f8f-c90d-455d-b4ec-ea301a43f75e", max_age_hours: 0 },
    });
  }

  return new Response(JSON.stringify({ ok: verified, expected, actual, push_status: push.body?.rows?.[0]?.status ?? null, read_status: readBack.status }), {
    status: verified ? 200 : 409,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});