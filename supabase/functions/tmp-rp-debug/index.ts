import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const KEY_ID = Deno.env.get("RAZORPAY_PAYROLL_KEY_ID") ?? "";
const KEY_SECRET = Deno.env.get("RAZORPAY_PAYROLL_KEY_SECRET") ?? "";
const BASE = "https://payroll.razorpay.com/api";

serve(async (req) => {
  const { path, request, data } = await req.json();
  const idNum = Number(KEY_ID);
  const body = {
    auth: { id: Number.isFinite(idNum) && idNum > 0 ? idNum : KEY_ID, key: KEY_SECRET },
    request,
    data,
  };
  const res = await fetch(`${BASE}/${path || "people"}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  return new Response(JSON.stringify({ status: res.status, raw: raw.slice(0, 4000) }), {
    headers: { "Content-Type": "application/json" },
  });
});
