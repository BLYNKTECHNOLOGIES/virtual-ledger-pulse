// TEMPORARY one-off tester: pushes LOP DAYS (instead of an amount) to RazorpayX
// for a single hard-coded employee/month (Honey Sewani, Aug-2026) so the owner
// can inspect the result in the RazorpayX dashboard. Deleted after the test.
const BASE = "https://payroll.razorpay.com/api";
const AUTH = {
  id: Number(Deno.env.get("RAZORPAY_PAYROLL_KEY_ID")),
  key: Deno.env.get("RAZORPAY_PAYROLL_KEY_SECRET"),
};
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EMAIL = "honeygirgilani.mba21@gmail.com";
const EMP_ID = 53;
const MONTH = "2026-08";

async function call(urlPath: string, type: string, subType: string, data: Record<string, unknown>) {
  const res = await fetch(`${BASE}/${urlPath}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ auth: AUTH, request: { type, "sub-type": subType }, data }),
  });
  const raw = await res.text();
  let body: unknown = raw;
  try { body = JSON.parse(raw); } catch { /* keep raw */ }
  return { status: res.status, body };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const reqBody: any = await req.json().catch(() => ({}));
  const { step = "view", days = 10, amount = 0 } = reqBody;
  let out: unknown;
  if (step === "view") {
    out = await call("payroll", "payroll", "view-payroll", { "employee-id": EMP_ID, "payroll-month": MONTH });
  } else if (step === "reset") {
    out = await call("payroll", "payroll", "reset-modifications", { email: EMAIL, "payroll-month": MONTH });
  } else if (step === "push_days") {
    out = await call("payroll", "payroll", "add-deduction", {
      email: EMAIL,
      "payroll-month": MONTH,
      "deduction-days": Number(days),
      remarks: "Loss of Pay - Attendance (days test)",
    });
  } else if (step === "push_amount") {
    out = await call("payroll", "payroll", "add-deduction", {
      email: EMAIL,
      "payroll-month": MONTH,
      "deduction-amount": Number(amount),
      remarks: "Loss of Pay - Attendance",
    });
  } else {
    out = { error: "unknown step" };
  }
  return new Response(JSON.stringify(out), { headers: { ...cors, "Content-Type": "application/json" } });
});
