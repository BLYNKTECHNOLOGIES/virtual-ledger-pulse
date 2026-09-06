// TEMPORARY diagnostic: probe RazorpayX (Opfin) add-deduction sub-type / payload
// variants to find any documented-or-hidden path that books a NET PAY deduction.
// Scoped hard to one employee + one month. Delete after the probe concludes.

const KEY_ID = Deno.env.get("RAZORPAY_PAYROLL_KEY_ID") ?? "";
const KEY_SECRET = Deno.env.get("RAZORPAY_PAYROLL_KEY_SECRET") ?? "";
const BASE = "https://payroll.razorpay.com/api";

const EMP_ID = 53;                 // Honey Sewani
const EMAIL = "honeygirgilani.mba21@gmail.com";
const MONTH = "2026-08";
const CANON_AMOUNT = 13710;        // intended LOP deduction
const REIMB = 2100;                // intended reimbursement addition

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b, null, 2), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

function auth() {
  const n = Number(KEY_ID);
  return { id: Number.isFinite(n) && n > 0 ? n : KEY_ID, key: KEY_SECRET };
}

async function call(resource: string, type: string, subType: string, data: Record<string, unknown>) {
  const res = await fetch(`${BASE}/${resource}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ auth: auth(), request: { type, "sub-type": subType }, data }),
  });
  const raw = await res.text();
  let body: any = null;
  try { body = JSON.parse(raw); } catch { body = raw; }
  return { status: res.status, body };
}

const view = () => call("payroll", "payroll", "view-payroll", {
  "employee-id": EMP_ID, "employee-type": "employee", "payroll-month": MONTH,
});

const reset = () => call("payroll", "payroll", "reset-modifications", {
  "employee-id": EMP_ID, "employee-type": "employee", "payroll-month": MONTH,
});

function deductionSummary(v: any) {
  const d = v?.body?.deductions || {};
  return Object.entries(d).map(([k, x]: any) => ({ name: k, amount: x?.amount, deductFrom: x?.deductFrom, lopDays: x?.lopDays }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!KEY_ID || !KEY_SECRET) return json(500, { error: "Razorpay credentials not configured" });

  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const step = body.step || "view";

  if (step === "view") return json(200, { view: await view(), summary: deductionSummary(await view()) });

  if (step === "restore") {
    const r = body.skipReset ? { status: 0 } : await reset();
    const ded = body.skipReset ? { status: 0 } : await call("payroll", "payroll", "add-deduction", {
      email: EMAIL, "payroll-month": MONTH, "deduction-amount": CANON_AMOUNT,
      remarks: "Loss of Pay - Attendance (10 days)",
    });
    const add = await call("payroll", "payroll", "add-additions", {
      email: EMAIL, "payroll-month": MONTH,
      additions: [{ label: "Reimbursement", amount: REIMB, taxable: true }],
    });
    const v = await view();
    return json(200, { reset: r.status, ded: ded.status, add: add.status, summary: deductionSummary(v), additions: v?.body?.additions });
  }

  if (step === "probe") {
    // Each variant: reset month → attempt → read back → record.
    const variants: { label: string; resource: string; type: string; sub: string; data: Record<string, unknown> }[] = [
      { label: "add-net-deduction", resource: "payroll", type: "payroll", sub: "add-net-deduction",
        data: { email: EMAIL, "payroll-month": MONTH, "deduction-amount": 100, remarks: "probe" } },
      { label: "add-deduction-net", resource: "payroll", type: "payroll", sub: "add-deduction-net",
        data: { email: EMAIL, "payroll-month": MONTH, "deduction-amount": 100, remarks: "probe" } },
      { label: "net-pay-deduction", resource: "payroll", type: "payroll", sub: "net-pay-deduction",
        data: { email: EMAIL, "payroll-month": MONTH, "deduction-amount": 100, remarks: "probe" } },
      { label: "add-net-pay-deduction", resource: "payroll", type: "payroll", sub: "add-net-pay-deduction",
        data: { email: EMAIL, "payroll-month": MONTH, "deduction-amount": 100, remarks: "probe" } },
      { label: "add-deductions(plural)", resource: "payroll", type: "payroll", sub: "add-deductions",
        data: { email: EMAIL, "payroll-month": MONTH, deductions: [{ name: "Net pay deduction", amount: 100, "deduct-from": "net" }] } },
      { label: "add-deduction + deduct-from:net", resource: "payroll", type: "payroll", sub: "add-deduction",
        data: { email: EMAIL, "payroll-month": MONTH, "deduction-amount": 100, "deduct-from": "net", remarks: "probe" } },
      { label: "add-deduction + deductFrom:2", resource: "payroll", type: "payroll", sub: "add-deduction",
        data: { email: EMAIL, "payroll-month": MONTH, "deduction-amount": 100, deductFrom: 2, remarks: "probe" } },
      { label: "add-deduction + deduction-type:net", resource: "payroll", type: "payroll", sub: "add-deduction",
        data: { email: EMAIL, "payroll-month": MONTH, "deduction-amount": 100, "deduction-type": "net", remarks: "probe" } },
      { label: "add-deduction + name:Net pay deduction", resource: "payroll", type: "payroll", sub: "add-deduction",
        data: { email: EMAIL, "payroll-month": MONTH, "deduction-amount": 100, name: "Net pay deduction", remarks: "probe" } },
      { label: "add-deduction + deduction-from:net_pay", resource: "payroll", type: "payroll", sub: "add-deduction",
        data: { email: EMAIL, "payroll-month": MONTH, "deduction-amount": 100, "deduction-from": "net_pay", remarks: "probe" } },
      { label: "bulk-upload sub-type", resource: "payroll", type: "payroll", sub: "bulk-upload",
        data: { email: EMAIL, "payroll-month": MONTH, action: "Net pay deduction", amount: 100 } },
      { label: "payroll:modify net deduction", resource: "payroll", type: "payroll", sub: "modify",
        data: { email: EMAIL, "payroll-month": MONTH, "net-pay-deduction": 100, remarks: "probe" } },
    ];

    const results: any[] = [];
    for (const v of variants) {
      await reset();
      const r = await call(v.resource, v.type, v.sub, v.data);
      const after = await view();
      results.push({
        variant: v.label,
        status: r.status,
        response: typeof r.body === "object" ? (r.body?.error ?? r.body?.message ?? r.body) : r.body,
        readback: deductionSummary(after),
      });
    }
    await reset();
    return json(200, { results, note: "month left reset; call step=restore to re-book canonical values" });
  }

  return json(400, { error: "unknown step" });
});
