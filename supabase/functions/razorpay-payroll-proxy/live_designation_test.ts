const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

async function callProxy(body: Record<string, unknown>) {
  const response = await fetch(`${supabaseUrl}/functions/v1/razorpay-payroll-proxy`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok || payload?.ok === false) {
    throw new Error(`Proxy call failed (${response.status}): ${JSON.stringify(payload)}`);
  }
  return payload;
}

Deno.test("live push updates Khushbu designation and reads it back", async () => {
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase test environment is unavailable");

  const push = await callProxy({
    action: "push_person_apply_one",
    razorpay_employee_id: "35",
  });
  const pushedRow = Array.isArray(push?.rows) ? push.rows[0] : null;
  if (!pushedRow || !["pushed", "unchanged"].includes(String(pushedRow.status))) {
    throw new Error(`Designation push was not accepted: ${JSON.stringify(push)}`);
  }

  const readBack = await callProxy({
    action: "read_person_by_id",
    razorpay_employee_id: "35",
    allow_dismissed: true,
  });
  const actual = String(readBack?.snapshot?.title ?? readBack?.snapshot?.designation ?? "").trim().toLowerCase();
  const expected = "relationship manager";
  if (actual !== expected) {
    throw new Error(`Live RazorpayX read-back mismatch: expected ${expected}, received ${actual || "<blank>"}`);
  }
});