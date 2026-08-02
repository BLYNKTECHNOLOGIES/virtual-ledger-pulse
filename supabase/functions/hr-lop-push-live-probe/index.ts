import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    return new Response(JSON.stringify({ error: "Supabase binding unavailable" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(url, serviceKey);
  const { data: rows, error: rowError } = await admin
    .from("hr_payroll_input_deductions")
    .select("id, razorpay_employee_id, period_month, label, amount")
    .eq("period_month", "2026-07-01")
    .is("readback_verified_at", null)
    .order("created_at");
  if (rowError || !rows?.length) {
    return new Response(JSON.stringify({ error: rowError?.message || "No unverified probe rows found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results = [];
  for (const row of rows) {
    const { data, error } = await admin.functions.invoke("razorpay-payroll-proxy", {
      body: {
        action: "payroll_add_deduction",
        payload: {
          data: {
            "employee-id": Number(row.razorpay_employee_id),
            "employee-type": "employee",
            "payroll-month": String(row.period_month).slice(0, 7),
            deductions: [{ label: row.label, amount: Number(row.amount) }],
          },
          readback_ids: [row.id],
          readback_table: "deductions",
        },
      },
    });
    results.push({ id: row.id, employee_id: row.razorpay_employee_id, amount: row.amount, ok: !error && data?.ok === true && data?.readback?.ok === true, response: data, invoke_error: error?.message || null });
  }
  const ok = results.every((result) => result.ok);
  return new Response(JSON.stringify({ ok, count: results.length, results }), {
    status: ok ? 200 : 502,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});