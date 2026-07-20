// RazorpayX Payroll (Opfin) proxy — Phase 1a full import flow.
//
// API model (JSON-RPC, not REST):
//   POST https://payroll.razorpay.com/api/{resource}
//   { auth:{id,key}, request:{type,sub-type}, data:{...} }
//
// No bulk list endpoint. Discovery = sequential employee-id walk with max-id cap.
//
// Actions:
//   validate_creds     - single people/view probe (existing)
//   introspect_envelope- shape debug (existing)
//   fetch_one          - preview one employee-id: fetch + match, NO writes
//   apply_one          - write one employee-id (pilot); flips bulk_sync_unlocked
//   dry_run_range      - walk 1..max, return match table, NO writes  (gated)
//   apply_range        - write everything from a fresh dry-run       (gated)
//   pull_person_full   - re-fetch people:view for every mapped id and project
//                        into hr_employees / work_info / bank_details (ERP-wins)
//
// PII policy: only field NAMES land in hr_razorpay_sync_log.field_diff_summary.

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const KEY_ID = Deno.env.get("RAZORPAY_PAYROLL_KEY_ID") ?? "";
const KEY_SECRET = Deno.env.get("RAZORPAY_PAYROLL_KEY_SECRET") ?? "";
const BASE = "https://payroll.razorpay.com/api";
const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function schedulerSecretMatches(provided: string): Promise<boolean> {
  if (!provided) return false;
  const envSecret = Deno.env.get("RAZORPAY_PAYSLIP_SYNC_SECRET") || Deno.env.get("CRON_SECRET") || "";
  if (envSecret && provided === envSecret) return true;
  try {
    const admin = createClient(SUPA_URL, SVC);
    const { data } = await admin
      .from("app_scheduler_secrets")
      .select("secret_value")
      .eq("name", "razorpay_payslip_auto_sync")
      .maybeSingle();
    return !!data?.secret_value && provided === data.secret_value;
  } catch {
    return false;
  }
}

async function requireAuth(req: Request): Promise<{ userId: string | null; serviceRole: boolean } | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.toLowerCase().startsWith("bearer ")) return json(401, { error: "Unauthorized" });
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (token && token === SVC) return { userId: null, serviceRole: true };
  const providedSchedulerSecret = req.headers.get("x-razorpay-sync-secret") || "";
  if (await schedulerSecretMatches(providedSchedulerSecret)) {
    return { userId: null, serviceRole: true };
  }
  const c = createClient(SUPA_URL, ANON, { global: { headers: { Authorization: authHeader } } });
  const { data, error } = await c.auth.getUser();
  if (error || !data?.user?.id) return json(401, { error: "Unauthorized" });
  return { userId: data.user.id, serviceRole: false };
}

async function requirePermission(userId: string, svc: SupabaseClient) {
  const { data, error } = await svc.rpc("user_has_permission", {
    user_uuid: userId, check_permission: "hrms_razorpay_sync",
  });
  if (error) return { ok: false, msg: error.message };
  return { ok: !!data, msg: data ? "" : "Missing hrms_razorpay_sync permission" };
}

function authBlock() {
  const idNum = Number(KEY_ID);
  return { id: Number.isFinite(idNum) && idNum > 0 ? idNum : KEY_ID, key: KEY_SECRET };
}

async function opfinView(employeeId: number, employeeType = "employee") {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(`${BASE}/people`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        auth: authBlock(),
        request: { type: "people", "sub-type": "view" },
        data: { "employee-id": employeeId, "employee-type": employeeType },
      }),
      signal: ctrl.signal,
    });
    const raw = await res.text();
    let body: any = null;
    try { body = JSON.parse(raw); } catch { /* keep raw */ }
    const errText = body && typeof body === "object"
      ? (body.error || body.message || null) : null;
    // Opfin returns 200 with body for valid, sometimes 200 with {error:...} for missing.
    // Treat a body that lacks `name` (or is empty) as a miss.
    const looksLikeEmployee = body && typeof body === "object" && typeof body.name === "string";
    return { status: res.status, ok: res.ok && looksLikeEmployee && !errText, body, raw, errText };
  } catch (e) {
    return { status: 0, ok: false, body: null, raw: `NETWORK: ${(e as Error).message}`, errText: (e as Error).message };
  } finally { clearTimeout(t); }
}

// Fetch the current salary of a Razorpay employee.
//
// AUDIT (verified against the official RazorpayX Payroll Postman collection):
// The API exposes NO read endpoint for the master annual CTC / salary structure.
// Only these salary-adjacent sub-types exist:
//   - people:set-salary        (WRITE annual-ctc or custom structure)
//   - payroll:view-payroll     (READ per-month payroll line, keyed by email + payroll-month)
//   - advance-salary:create    (WRITE advance)
//
// There is no people:view-salary, no salary-structure endpoint, no get-salary.
// The dozen probe variants we previously tried all returned code:23 "Unknown
// request type" — they simply do not exist in the tenant's API surface.
//
// The only documented way to READ salary numbers is `payroll:view-payroll`,
// which returns { salary: <monthly_gross>, additions, deduction-amount, ... }
// for a specific processed payroll month. We annualise monthly*12 (matches the
// Postman description: "even if an employee joins mid-year, please set the
// salary as their monthly_salary*12").
//
// If no processed payroll month exists for the employee, salary is NOT exposed
// via the API and CTC must be entered manually in HRMS. We surface that
// cleanly via ok:false + err: "not-exposed-by-api".
async function opfinSalary(
  employeeId: number,
  email?: string | null,
  executedMonths?: string[] | null,
): Promise<{
  ok: boolean; annual_ctc: number | null; monthly_gross: number | null;
  components: any[]; raw: any; http_status: number; err: string | null;
}> {
  const empty = { ok: false, annual_ctc: null, monthly_gross: null, components: [] as any[], raw: null as any, http_status: 0, err: null as string | null };

  if (!email || typeof email !== "string" || !email.includes("@")) {
    console.log(`[opfinSalary] emp=${employeeId} SKIP no-email (payroll:view-payroll requires email)`);
    return { ...empty, err: "not-exposed-by-api: payroll view requires employee email which is missing on snapshot" };
  }

  // GATE: only probe months where a RazorpayX payroll run has actually
  // executed (bulk_applied/locked/recalled). Otherwise view-payroll returns
  // CTC/12 setup defaults which would mis-populate CTC on the ERP profile.
  if (!executedMonths || executedMonths.length === 0) {
    console.log(`[opfinSalary] emp=${employeeId} SKIP no-executed-payroll-run`);
    return { ...empty, err: "not-exposed-by-api: no executed RazorpayX payroll run available; view-payroll would return CTC/12 setup defaults" };
  }

  const readNum = (obj: any, keys: string[]): number | null => {
    if (!obj || typeof obj !== "object") return null;
    for (const k of keys) {
      const v = obj[k];
      const n = typeof v === "string" ? Number(v.replace(/,/g, "")) : v;
      if (typeof n === "number" && Number.isFinite(n) && n > 0) return n;
    }
    return null;
  };

  // Newest-first traversal of executed months only (already validated by caller).
  const months = [...executedMonths].sort().reverse();

  let lastStatus = 0;
  let lastRaw: any = null;
  let lastErr: string | null = null;
  const perAttempt: string[] = [];

  for (const ym of months) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch(`${BASE}/payroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          auth: authBlock(),
          request: { type: "payroll", "sub-type": "view-payroll" },
          data: { email, "payroll-month": ym },
        }),
        signal: ctrl.signal,
      });
      const raw = await res.text();
      let body: any = null; try { body = JSON.parse(raw); } catch { /* keep raw */ }
      lastStatus = res.status;
      lastRaw = body ?? raw;
      const tag = `payroll:view-payroll@${ym}`;

      if (!res.ok || !body || typeof body !== "object") {
        const isHtml = typeof raw === "string" && raw.trim().startsWith("<");
        const snip = isHtml ? "<HTML>" : String(raw).slice(0, 120);
        perAttempt.push(`HTTP ${res.status} @ ${tag} ${snip}`);
        lastErr = perAttempt[perAttempt.length - 1];
        continue;
      }
      const rpErr = body.error || body.message || null;
      if (rpErr) {
        perAttempt.push(`RPERR @ ${tag} ${typeof rpErr === "string" ? rpErr : JSON.stringify(rpErr).slice(0, 150)}`);
        lastErr = perAttempt[perAttempt.length - 1];
        continue;
      }

      const monthly = readNum(body, ["salary"]);
      if (monthly && monthly > 0) {
        const annual = Math.round(monthly * 12);
        console.log(`[opfinSalary] emp=${employeeId} MATCH ${tag} monthly=${monthly} annual=${annual} (executed-run gated)`);
        return { ok: true, annual_ctc: annual, monthly_gross: monthly, components: [], raw: body, http_status: res.status, err: null };
      }
      perAttempt.push(`no salary field @ ${tag} keys=${Object.keys(body).slice(0, 10).join(",")}`);
      lastErr = perAttempt[perAttempt.length - 1];
    } catch (e) {
      perAttempt.push(`NETWORK @ ${ym}: ${(e as Error).message}`);
      lastErr = perAttempt[perAttempt.length - 1];
    } finally { clearTimeout(t); }
  }

  console.log(`[opfinSalary] emp=${employeeId} NO_PROCESSED_PAYROLL email=${email} tried=${months.length} executed months | ${perAttempt.slice(0, 3).join(" || ")}`);
  return { ...empty, http_status: lastStatus, raw: lastRaw, err: lastErr || "not-exposed-by-api: no executed payroll month returned salary" };
}


type PayrollViewPullResult = {
  pulled: number;
  withPdf: number;
  failed: number;
  noEmail: number;
  noRecord: number;
  upsertErrors: number;
};

function moneyNum(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? Number(v.toFixed(2)) : null;
  if (typeof v === "string") {
    const cleaned = v.replace(/[^0-9.\-]/g, "");
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? Number(n.toFixed(2)) : null;
  }
  return null;
}

function pickDeepMoney(obj: any, keys: string[]): number | null {
  if (!obj || typeof obj !== "object") return null;
  const queue: any[] = [obj];
  const wanted = new Set(keys.map((k) => k.toLowerCase()));
  const seen = new Set<any>();
  while (queue.length) {
    const cur = queue.shift();
    if (!cur || typeof cur !== "object" || seen.has(cur)) continue;
    seen.add(cur);
    if (Array.isArray(cur)) {
      for (const item of cur) queue.push(item);
      continue;
    }
    for (const [k, v] of Object.entries(cur)) {
      if (wanted.has(k.toLowerCase())) {
        const n = moneyNum(v);
        if (n !== null) return n;
      }
      if (v && typeof v === "object") queue.push(v);
    }
  }
  return null;
}

function sumMoneyLeaves(v: any): number {
  if (!v) return 0;
  if (typeof v === "number" || typeof v === "string") return moneyNum(v) ?? 0;
  if (Array.isArray(v)) return Number(v.reduce((sum, item) => sum + sumMoneyLeaves(item), 0).toFixed(2));
  if (typeof v === "object") {
    let total = 0;
    for (const [k, val] of Object.entries(v)) {
      const lk = k.toLowerCase();
      if (["id", "employee-id", "employee_id", "email", "name", "type", "label", "month", "payroll-month"].includes(lk)) continue;
      if (/(amount|value|salary|pay|tds|pf|esi|tax|deduction|earning|addition|hra|basic|allowance|bonus|incentive)/i.test(k)) {
        total += sumMoneyLeaves(val);
      } else if (val && typeof val === "object") {
        total += sumMoneyLeaves(val);
      }
    }
    return Number(total.toFixed(2));
  }
  return 0;
}

function extractPayrollViewFigures(body: any) {
  const baseSalary = pickDeepMoney(body, [
    "salary", "monthly_salary", "monthly-salary", "gross_salary", "gross-salary", "gross", "gross-pay", "gross_pay",
  ]);
  const additionsExplicit = pickDeepMoney(body, [
    "additions-amount", "addition-amount", "additions_amount", "total-additions", "total_additions",
  ]);
  const deductionExplicit = pickDeepMoney(body, [
    "deduction-amount", "deductions-amount", "deduction_amount", "deductions_amount", "total-deductions", "total_deductions",
  ]);
  const additions = additionsExplicit ?? Math.max(
    sumMoneyLeaves(body?.additions) || sumMoneyLeaves(body?.addition) || sumMoneyLeaves(body?.earnings),
    0,
  );
  const deductions = deductionExplicit ?? Math.max(
    sumMoneyLeaves(body?.deductions) || sumMoneyLeaves(body?.deduction),
    0,
  );
  const gross = pickDeepMoney(body, ["total-earnings", "total_earnings", "gross-earnings", "gross_earnings"])
    ?? (baseSalary !== null ? Number((baseSalary + additions).toFixed(2)) : null);
  const net = pickDeepMoney(body, [
    "net-pay", "net_pay", "netPay", "net", "net-salary", "net_salary", "payable", "amount-payable", "amount_payable",
  ]) ?? (gross !== null ? Number((gross - deductions).toFixed(2)) : null);
  const tds = pickDeepMoney(body, ["tds", "tds-amount", "tds_amount", "income-tax", "income_tax", "tax"]);
  const pdf = (() => {
    const v = pickString(body?.["pdf-url"], body?.pdf_url, body?.["download-url"], body?.download_url, body?.url, body?.payslip_url);
    return v && /^https?:\/\//i.test(v) ? v : null;
  })();
  const payslipId = pickString(body?.["payslip-id"], body?.payslip_id, body?.id, body?.["payroll-id"], body?.payroll_id);
  // Statutory + payroll-snapshot extras (every field the view-payroll response returns)
  const pf = pickDeepMoney(body, ["pf", "pf-amount", "pf_amount", "provident-fund", "employer-pf", "employee-pf"]);
  const esi = pickDeepMoney(body, ["esi", "esi-amount", "esi_amount", "employer-esi", "employee-esi"]);
  const pt = pickDeepMoney(body, ["pt", "professional-tax", "professional_tax", "prof-tax", "prof_tax"]);
  const additionsDetail = (body && typeof body === "object" && body.additions && typeof body.additions === "object" && !Array.isArray(body.additions))
    ? body.additions : null;
  const doNotPay = body?.["do-not-pay"] === true || body?.do_not_pay === true;
  const employeeName = pickString(body?.["employee-name"], body?.employee_name, body?.name);
  return { gross, deductions, net, tds, pdf, payslipId, pf, esi, pt, additionsDetail, doNotPay, employeeName, deductionAmount: deductions };
}


async function loadExpectedNetByRpId(svc: SupabaseClient, periodMonthISO: string) {
  const expectedByRpId = new Map<string, { hr_employee_id: string; net_pay: number }>();
  const { data: runRow } = await svc.from("hr_razorpay_payroll_runs")
    .select("id").eq("period_month", periodMonthISO).maybeSingle();
  const runId = runRow?.id || null;
  if (!runId) return { runId, expectedByRpId };
  const { data: lineRows } = await svc.from("hr_razorpay_payroll_run_lines")
    .select("employee_id,net_pay").eq("run_id", runId);
  const hrIds = (lineRows || []).map((l: any) => l.employee_id).filter(Boolean);
  if (hrIds.length) {
    const { data: maps } = await svc.from("hr_razorpay_employee_map")
      .select("hr_employee_id,razorpay_employee_id").in("hr_employee_id", hrIds);
    const rpByHr = new Map((maps || []).map((m: any) => [m.hr_employee_id, String(m.razorpay_employee_id)]));
    for (const l of (lineRows || []) as any[]) {
      const rpId = rpByHr.get(l.employee_id);
      if (rpId) expectedByRpId.set(rpId, { hr_employee_id: l.employee_id, net_pay: Number(l.net_pay || 0) });
    }
  }
  return { runId, expectedByRpId };
}

async function pullPayrollViewForPeriod(svc: SupabaseClient, periodMonthStr: string, actorUserId: string | null): Promise<PayrollViewPullResult> {
  const pmMatch = /^(\d{4})-(\d{2})$/.exec(periodMonthStr);
  if (!pmMatch) throw new Error("period_month must be YYYY-MM");
  const periodMonthISO = `${pmMatch[1]}-${pmMatch[2]}-01`;
  const { runId, expectedByRpId } = await loadExpectedNetByRpId(svc, periodMonthISO);

  const { data: maps, error: mapErr } = await svc
    .from("hr_razorpay_employee_map")
    .select("hr_employee_id,razorpay_employee_id");
  if (mapErr) throw new Error(`employee map load failed: ${mapErr.message}`);
  const hrIds = (maps || []).map((m: any) => m.hr_employee_id).filter(Boolean);
  const emailByHr = new Map<string, string>();
  if (hrIds.length) {
    for (let i = 0; i < hrIds.length; i += 200) {
      const { data: employees, error: empErr } = await svc
        .from("hr_employees")
        .select("id,email")
        .in("id", hrIds.slice(i, i + 200));
      if (empErr) throw new Error(`employee email load failed: ${empErr.message}`);
      for (const e of employees || []) {
        const email = String((e as any).email || "").trim().toLowerCase();
        if (email.includes("@")) emailByHr.set((e as any).id, email);
      }
    }
  }

  const result: PayrollViewPullResult = { pulled: 0, withPdf: 0, failed: 0, noEmail: 0, noRecord: 0, upsertErrors: 0 };
  const upserts: any[] = [];

  for (const map of (maps || []) as any[]) {
    const rpId = String(map.razorpay_employee_id || "");
    const hrId = map.hr_employee_id as string | null;
    const email = hrId ? emailByHr.get(hrId) : null;
    if (!rpId || !hrId || !email) { result.noEmail++; continue; }

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 25000);
    try {
      const res = await fetch(`${BASE}/payroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          auth: authBlock(),
          request: { type: "payroll", "sub-type": "view-payroll" },
          data: { email, "payroll-month": periodMonthStr },
        }),
        signal: ctrl.signal,
      });
      const raw = await res.text();
      let body: any = null; try { body = JSON.parse(raw); } catch { /* keep null */ }
      const rpErr = body && typeof body === "object" ? (body.error || body.message || null) : null;
      if (!res.ok || !body || typeof body !== "object" || rpErr) {
        result.noRecord++;
        continue;
      }
      const figures = extractPayrollViewFigures(body);
      if (figures.gross === null && figures.net === null && figures.deductions === null) {
        result.noRecord++;
        continue;
      }
      const exp = expectedByRpId.get(rpId);
      const expNet = exp?.net_pay ?? null;
      const variance = (figures.net != null && expNet != null) ? Number((figures.net - expNet).toFixed(2)) : null;
      if (figures.pdf) result.withPdf++;
      upserts.push({
        run_id: runId,
        period_month: periodMonthISO,
        razorpay_employee_id: rpId,
        hr_employee_id: hrId,
        gross_earnings: figures.gross,
        total_deductions: figures.deductions,
        net_pay: figures.net,
        tds_amount: figures.tds,
        expected_net: expNet,
        variance,
        razorpay_payslip_id: figures.payslipId || `${rpId}-${periodMonthStr}`,
        pdf_url: figures.pdf,
        pf_amount: figures.pf,
        esi_amount: figures.esi,
        professional_tax: figures.pt,
        deduction_amount: figures.deductionAmount,
        additions_detail: figures.additionsDetail,
        do_not_pay: figures.doNotPay,
        employee_name_snapshot: figures.employeeName,
        source_payload: { endpoint: "payroll:view-payroll", request: { email, "payroll-month": periodMonthStr }, response: body },
        pulled_by: actorUserId,
      });
    } catch (_e) {
      result.failed++;
    } finally {
      clearTimeout(t);
    }
  }

  if (upserts.length) {
    for (let i = 0; i < upserts.length; i += 100) {
      const chunk = upserts.slice(i, i + 100);
      const { error: upErr } = await svc.from("hr_razorpay_payslip_records")
        .upsert(chunk, { onConflict: "period_month,razorpay_employee_id" });
      if (upErr) {
        result.upsertErrors += chunk.length;
        console.error("[pullPayrollViewForPeriod] upsert failed", { periodMonthStr, error: upErr.message });
      } else {
        result.pulled += chunk.length;
      }
    }
  }
  return result;
}




function normPhone(v: string | null | undefined): string | null {
  if (!v) return null;
  const d = String(v).replace(/\D/g, "");
  if (!d) return null;
  return d.length > 10 ? d.slice(-10) : d;
}
function parseDobIso(v: string | null | undefined): string | null {
  if (!v) return null;
  const m = String(v).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(v); return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}
function splitName(full: string): { first: string; last: string } {
  const parts = String(full).trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

interface MatchResult {
  hr_employee_id: string | null;
  matched_by: "pan" | "phone" | "email" | null;
  action: "match" | "create_draft";
}

async function matchEmployee(svc: SupabaseClient, e: any, currentRazorpayId?: string | number | null): Promise<MatchResult> {
  const pan = (e.pan || "").toString().trim().toUpperCase();
  const phone = normPhone(e.phone_number);
  const email = (e.email || "").toString().trim().toLowerCase();

  // Pre-load hr_employee_ids already claimed by a DIFFERENT Razorpay employee.
  // Without this guard, two distinct Razorpay records that share a stale PAN /
  // phone / email fragment with the same ERP row both try to write the same
  // hr_employee_id and the second one hits hr_razorpay_map_hr_emp_uniq
  // (that is exactly why RP #70 "Shubham Singh" never landed).
  const currentIdStr = currentRazorpayId != null ? String(currentRazorpayId) : null;
  const { data: claimedRows } = await svc
    .from("hr_razorpay_employee_map")
    .select("hr_employee_id,razorpay_employee_id");
  const claimed = new Set(
    (claimedRows || [])
      .filter((r: any) => !currentIdStr || String(r.razorpay_employee_id) !== currentIdStr)
      .map((r: any) => r.hr_employee_id),
  );
  const notClaimed = (id: string | null | undefined) => !!id && !claimed.has(id);

  if (pan) {
    const { data } = await svc.from("hr_employees").select("id").eq("pan_number", pan).limit(5);
    const hit = (data || []).find((r: any) => notClaimed(r.id));
    if (hit?.id) return { hr_employee_id: hit.id, matched_by: "pan", action: "match" };
  }
  if (phone) {
    const { data } = await svc.from("hr_employees").select("id,phone").ilike("phone", `%${phone}%`).limit(10);
    const hit = (data || []).find((r: any) => normPhone(r.phone) === phone && notClaimed(r.id));
    if (hit) return { hr_employee_id: hit.id, matched_by: "phone", action: "match" };
  }
  if (email) {
    const { data } = await svc.from("hr_employees").select("id").ilike("email", email).limit(5);
    const hit = (data || []).find((r: any) => notClaimed(r.id));
    if (hit?.id) return { hr_employee_id: hit.id, matched_by: "email", action: "match" };
  }
  return { hr_employee_id: null, matched_by: null, action: "create_draft" };
}


function fieldNames(e: any): string[] {
  return Object.keys(e || {}).sort();
}

async function logSync(svc: SupabaseClient, row: {
  action: string; http_status: number; razorpay_employee_id: string;
  hr_employee_id?: string | null; field_diff_summary?: any; error_text?: string | null; actor_user_id: string | null;
}) {
  const { error } = await svc.from("hr_razorpay_sync_log").insert(row);
  if (error) {
    // Loud failure: an audit trail that fails silently is worse than none.
    // Surfacing lets us catch enum drift, RLS, or constraint issues immediately.
    console.error("[logSync] insert failed", {
      action: row.action,
      http_status: row.http_status,
      razorpay_employee_id: row.razorpay_employee_id,
      error: error.message,
      code: (error as any).code,
      details: (error as any).details,
    });
  }
}

function extractRazorpayError(body: any, fallback?: string | null): { code: number | null; message: string } {
  const rawErr = body && typeof body === "object" ? (body.error ?? body.message ?? null) : null;
  let parsedErr: any = rawErr;
  if (typeof rawErr === "string") {
    try { parsedErr = JSON.parse(rawErr); } catch { /* keep string */ }
  }
  const codeRaw = parsedErr && typeof parsedErr === "object"
    ? (parsedErr.code ?? body?.code ?? body?.error_code ?? null)
    : (body?.code ?? body?.error_code ?? null);
  const code = Number(codeRaw);
  const message = String(
    parsedErr && typeof parsedErr === "object"
      ? (parsedErr.message ?? parsedErr.error ?? fallback ?? "")
      : (parsedErr ?? fallback ?? "")
  );
  return { code: Number.isFinite(code) ? code : null, message };
}

function extractRazorpayPeopleId(body: any): string | null {
  if (!body || typeof body !== "object") return null;
  const candidates = [
    body?.["people-id"],
    body?.people_id,
    body?.peopleId,
    body?.id,
    body?.data?.["people-id"],
    body?.data?.people_id,
    body?.data?.peopleId,
    body?.data?.id,
    body?.person?.["people-id"],
    body?.person?.people_id,
    body?.employee?.["people-id"],
    body?.employee?.people_id,
  ];
  for (const c of candidates) {
    const v = c == null ? "" : String(c).trim();
    if (/^\d+$/.test(v)) return v;
  }
  const text = JSON.stringify(body);
  const match = text.match(/"people-id"\s*:\s*"?(\d+)"?|"people_id"\s*:\s*"?(\d+)"?|"peopleId"\s*:\s*"?(\d+)"?/);
  return match ? (match[1] || match[2] || match[3] || null) : null;
}

function buildGmailAliasForRazorpay(email: string, reservedEmployeeId: string | null): string | null {
  const cleanEmail = String(email || "").trim().toLowerCase();
  const reserved = String(reservedEmployeeId || "").trim();
  if (!cleanEmail.includes("@") || !/^\d+$/.test(reserved)) return null;
  const [localRaw, domainRaw] = cleanEmail.split("@");
  const domain = String(domainRaw || "").trim().toLowerCase();
  if (!localRaw || !["gmail.com", "googlemail.com"].includes(domain)) return null;
  const localBase = localRaw.split("+")[0];
  if (!localBase) return null;
  return `${localBase}+rzp${reserved}@${domain}`;
}

async function opfinEditPerson(data: Record<string, any>): Promise<{ ok: boolean; status: number; error: string | null; body: any }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(`${BASE}/people`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        auth: authBlock(),
        request: { type: "people", "sub-type": "edit" },
        data,
      }),
      signal: ctrl.signal,
    });
    const raw = await res.text();
    let body: any = null;
    try { body = JSON.parse(raw); } catch { body = { raw: raw.slice(0, 500) }; }
    const rpErr = body && typeof body === "object" ? (body.error ?? body.message ?? null) : null;
    const ok = res.ok && !rpErr;
    const error = ok ? null : (typeof rpErr === "string" ? rpErr : (rpErr ? JSON.stringify(rpErr) : `HTTP ${res.status}`));
    return { ok, status: res.status, error, body };
  } catch (e) {
    return { ok: false, status: 0, error: `NETWORK: ${(e as Error).message}`, body: null };
  } finally { clearTimeout(t); }
}

async function attachReservedEmployeeIdByEmail(
  email: string,
  reservedEmployeeId: string | null,
  extra: Record<string, any> = {},
): Promise<{ ok: boolean; status: number; error: string | null; body: any }> {
  const cleanEmail = String(email || "").trim().toLowerCase();
  const reserved = String(reservedEmployeeId || "").trim();
  if (!cleanEmail.includes("@")) return { ok: false, status: 0, error: "email required for people:edit", body: null };
  if (!/^\d+$/.test(reserved)) return { ok: false, status: 0, error: "numeric reserved employee-id required for people:edit", body: null };

  // Official RazorpayX Payroll docs state `people:edit` identifies the person
  // by email, not by the internal people-id. This is the API-side equivalent of
  // typing the Employee ID into the dashboard, so the operator no longer has to
  // copy/paste the people-id manually for -NA limbo records.
  //
  // RazorpayX's live server rejects minimal edits on newly-invited persons with
  // code 43 ("hire_date is required"), so callers may pass an `extra` payload
  // (typically the ERP's fullEditData) to satisfy required-field validation in
  // a single round-trip.
  const payload: Record<string, any> = {
    ...extra,
    email: cleanEmail,
    "employee-id": Number(reserved),
    "employee-type": "employee",
  };
  for (const k of Object.keys(payload)) {
    if (payload[k] === null || payload[k] === "" || payload[k] === undefined) delete payload[k];
  }
  return await opfinEditPerson(payload);
}

// Some tenants leave the ghost person addressable only by its internal
// `people-id` (returned in the create error body) until an employee-id is
// stamped on. This variant of people:edit keys by people-id AND stamps the
// reserved employee-id + full profile in a single round-trip, upgrading the
// invite from inactive → active without needing a Gmail +alias.
async function attachReservedEmployeeIdByPeopleId(
  peopleId: string | null,
  reservedEmployeeId: string | null,
  extra: Record<string, any> = {},
): Promise<{ ok: boolean; status: number; error: string | null; body: any }> {
  const pid = String(peopleId || "").trim();
  const reserved = String(reservedEmployeeId || "").trim();
  if (!/^\d+$/.test(pid)) return { ok: false, status: 0, error: "numeric people-id required for people:edit", body: null };
  if (!/^\d+$/.test(reserved)) return { ok: false, status: 0, error: "numeric reserved employee-id required for people:edit", body: null };
  const payload: Record<string, any> = {
    ...extra,
    "people-id": Number(pid),
    "employee-id": Number(reserved),
    "employee-type": "employee",
  };
  for (const k of Object.keys(payload)) {
    if (payload[k] === null || payload[k] === "" || payload[k] === undefined) delete payload[k];
  }
  return await opfinEditPerson(payload);
}

function isDismissedRazorpayPerson(rp: any): boolean {
  if (!rp || typeof rp !== "object") return false;
  const rpStatus = String(rp.status || "").toLowerCase();
  return rpStatus === "dismissed" ||
    rpStatus === "terminated" ||
    rpStatus === "resigned" ||
    rp.is_active === false ||
    !!rp.date_of_leaving ||
    !!rp.dismissed_at;
}

async function findRazorpayEmployeeByEmail(
  email: string,
  options: { reservedEmployeeId?: string | null; maxId?: number; concurrency?: number } = {},
): Promise<{ employeeId: string; body: any; status: number } | null> {
  const wanted = String(email || "").trim().toLowerCase();
  if (!wanted.includes("@")) return null;

  const reserved = Number(options.reservedEmployeeId || 0);
  const maxId = Math.min(
    Math.max(
      Number.isFinite(reserved) ? reserved + 100 : 0,
      Number(options.maxId || 0),
      250,
    ),
    1000,
  );
  const ids: number[] = [];
  if (Number.isFinite(reserved) && reserved > 0) ids.push(reserved);
  for (let i = 1; i <= maxId; i++) if (i !== reserved) ids.push(i);

  const concurrency = Math.min(Math.max(Number(options.concurrency || 8), 1), 12);
  let cursor = 0;
  let found: { employeeId: string; body: any; status: number } | null = null;
  const workers = Array.from({ length: concurrency }, async () => {
    while (!found && cursor < ids.length) {
      const id = ids[cursor++];
      const r = await opfinView(id, "employee");
      if (!r.ok || !r.body || isDismissedRazorpayPerson(r.body)) continue;
      const rpEmail = String(r.body.email || r.body.work_email || "").trim().toLowerCase();
      if (rpEmail === wanted) {
        found = { employeeId: String(id), body: r.body, status: r.status };
        break;
      }
    }
  });
  await Promise.all(workers);
  return found;
}

async function upsertMap(svc: SupabaseClient, razorpayId: string, hrEmployeeId: string, isPilot: boolean, created: boolean) {
  // Two unique constraints exist on this table: (razorpay_employee_id) and
  // (hr_employee_id). A single upsert can only reference one conflict target,
  // so a stale row keyed on the OTHER column produced a 500 (apply_error).
  // Clear any conflicting stale rows on either key that don't match this
  // exact (razorpay_id, hr_employee_id) pair, then upsert on hr_employee_id.
  await svc.from("hr_razorpay_employee_map")
    .delete()
    .eq("razorpay_employee_id", razorpayId)
    .neq("hr_employee_id", hrEmployeeId);
  await svc.from("hr_razorpay_employee_map")
    .delete()
    .eq("hr_employee_id", hrEmployeeId)
    .neq("razorpay_employee_id", razorpayId);
  const { error } = await svc.from("hr_razorpay_employee_map").upsert({
    razorpay_employee_id: razorpayId,
    hr_employee_id: hrEmployeeId,
    sync_status: created ? "imported" : "matched_existing",
    is_pilot_verified: isPilot,
    last_synced_at: new Date().toISOString(),
  }, { onConflict: "hr_employee_id" });
  if (error) throw new Error(`upsert map failed: ${error.message}`);
}

async function createDraftEmployee(svc: SupabaseClient, e: any): Promise<string> {
  const { first, last } = splitName(e.name || "");
  const dept = (e.department || "General").toString().trim() || "General";
  // generate_employee_id is now concurrency-safe (advisory lock) and reads
  // from hr_employees, so each call returns a unique sequential badge.
  // We still retry a few times in case of transient unique-collision races.
  const maxAttempts = 5;
  let lastErr: any = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { data: badgeData, error: badgeErr } = await svc.rpc("generate_employee_id", {
      dept, designation: "Employee",
    });
    if (badgeErr) throw new Error(`generate_employee_id failed: ${badgeErr.message}`);
    const badgeId = String(badgeData);
    const { data, error } = await svc.from("hr_employees").insert({
      badge_id: badgeId,
      first_name: first,
      last_name: last,
      email: (e.email || "").toString().trim() || null,
      phone: normPhone(e.phone_number),
      dob: parseDobIso(e["date-of-birth"]),
      pan_number: (e.pan || "").toString().trim().toUpperCase() || null,
      is_active: false, // draft — will surface in Onboarding Pipeline, not Employee list
      additional_info: { source: "razorpay_import", razorpay: { status: "draft", imported_at: new Date().toISOString() } },
    }).select("id").single();
    if (!error) return data!.id as string;
    lastErr = error;
    // Only retry on badge_id unique-violation (extremely unlikely now)
    if ((error as any).code !== "23505") break;
    if (!String(error.message).includes("badge_id")) break;
  }
  throw new Error(`create hr_employees failed: ${lastErr?.message ?? "unknown"}`);
}

async function readSettings(svc: SupabaseClient) {
  const { data } = await svc.from("hr_razorpay_settings")
    .select("*").eq("is_singleton", true).maybeSingle();
  return data as any;
}
async function markCredsValidated(svc: SupabaseClient) {
  await svc.from("hr_razorpay_settings").update({ last_creds_validated_at: new Date().toISOString() }).eq("is_singleton", true);
}
async function stampLastImport(svc: SupabaseClient) {
  await svc.from("hr_razorpay_settings").update({
    last_import_at: new Date().toISOString(),
  }).eq("is_singleton", true);
}
async function unlockBulk(svc: SupabaseClient) {
  await svc.from("hr_razorpay_settings").update({
    bulk_sync_unlocked: true,
  }).eq("is_singleton", true);
}

// ---------- Deep-pull helpers (Phase 1a) ----------

async function canonicalHash(obj: unknown): Promise<string> {
  const s = JSON.stringify(obj, Object.keys(obj as object).sort());
  const buf = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function pickString(...vals: any[]): string | null {
  for (const v of vals) {
    if (v === null || v === undefined) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return null;
}

function normIfsc(v: any): string | null {
  const s = pickString(v);
  return s ? s.toUpperCase().replace(/\s+/g, "") : null;
}

// ERP-wins: only patch keys where ERP row currently has NULL/empty; return
// diff summary of field names actually written (never values).
function pickPatch<T extends Record<string, any>>(current: T | null, incoming: Record<string, any>): { patch: Record<string, any>; wrote: string[]; conflicts: string[] } {
  const patch: Record<string, any> = {};
  const wrote: string[] = [];
  const conflicts: string[] = [];
  for (const [k, v] of Object.entries(incoming)) {
    if (v === null || v === undefined || v === "") continue;
    const cur = current?.[k];
    const isEmpty = cur === null || cur === undefined || cur === "";
    if (isEmpty) {
      patch[k] = v;
      wrote.push(k);
    } else if (String(cur).trim() !== String(v).trim()) {
      conflicts.push(k);
    }
  }
  return { patch, wrote, conflicts };
}

// Resolve a positions.id by case-/whitespace-insensitive title match,
// creating the row on first sight so RazorpayX titles never end up unlinked.
async function resolveOrCreatePositionId(svc: SupabaseClient, rawTitle: string): Promise<string | null> {
  const canonical = (rawTitle || "").trim();
  if (!canonical) return null;
  const norm = canonical.toLowerCase();
  const { data: existing } = await svc
    .from("positions")
    .select("id,title")
    .ilike("title", canonical)
    .limit(1)
    .maybeSingle();
  if (existing?.id) return existing.id as string;
  // Extra safety: scan for any title whose trimmed lowercase equals ours (handles
  // legacy rows with embedded whitespace). If found, reuse; otherwise create.
  const { data: fuzzy } = await svc
    .from("positions")
    .select("id,title")
    .ilike("title", `%${canonical}%`)
    .limit(20);
  const hit = (fuzzy || []).find((p: any) => (p.title || "").trim().toLowerCase() === norm);
  if (hit?.id) return hit.id as string;
  const { data: created, error } = await svc
    .from("positions")
    .insert({ title: canonical, is_active: true, hierarchy_level: 5 })
    .select("id")
    .maybeSingle();
  if (error || !created?.id) return null;
  return created.id as string;
}

async function projectSnapshotIntoErp(
  svc: SupabaseClient,
  hrId: string,
  snap: any,
): Promise<{ hr_employees: { wrote: string[]; conflicts: string[] }; work_info: { wrote: string[]; conflicts: string[] }; bank: { wrote: string[]; conflicts: string[] } }> {
  // ---- hr_employees identity fields ----
  const { first, last } = splitName(snap?.name || "");
  const empIncoming = {
    first_name: pickString(snap?.first_name, first) || null,
    last_name: pickString(snap?.last_name, last) || null,
    gender: pickString(snap?.gender)?.toLowerCase() || null,
    dob: parseDobIso(snap?.["date-of-birth"] ?? snap?.date_of_birth ?? snap?.dob),
    phone: normPhone(snap?.phone_number ?? snap?.phone),
    pan_number: (pickString(snap?.pan) || "").toUpperCase() || null,
  };
  const { data: empCur } = await svc.from("hr_employees").select("first_name,last_name,gender,dob,phone,pan_number").eq("id", hrId).maybeSingle();
  const empPick = pickPatch(empCur as any, empIncoming);
  if (Object.keys(empPick.patch).length) {
    await svc.from("hr_employees").update(empPick.patch).eq("id", hrId);
  }

  // ---- hr_employee_work_info ----
  const deptName = pickString(snap?.department);
  const jobTitle = pickString(snap?.title, snap?.designation, snap?.job_title);
  let departmentId: string | null = null;
  let jobPositionId: string | null = null;
  if (deptName) {
    const { data: d } = await svc.from("departments").select("id").ilike("name", deptName.trim()).limit(1).maybeSingle();
    if (d?.id) departmentId = d.id;
  }
  if (jobTitle) {
    jobPositionId = await resolveOrCreatePositionId(svc, jobTitle);
  }
  // Resolve manager-employee-id (RazorpayX numeric id) → local hr_employee_id via employee map.
  const rzMgrRaw = snap?.["manager-employee-id"] ?? snap?.manager_employee_id ?? snap?.manager?.id ?? snap?.manager?.["employee-id"];
  const rzMgrId = rzMgrRaw != null && Number.isFinite(Number(rzMgrRaw)) ? Number(rzMgrRaw) : null;
  let reportingManagerLocalId: string | null = null;
  if (rzMgrId) {
    const { data: mgrMap } = await svc.from("hr_razorpay_employee_map")
      .select("hr_employee_id").eq("razorpay_employee_id", rzMgrId).maybeSingle();
    if (mgrMap?.hr_employee_id) reportingManagerLocalId = mgrMap.hr_employee_id;
  }
  const wiIncoming: Record<string, any> = {
    joining_date: parseDobIso(snap?.["date-of-hiring"] ?? snap?.date_of_hiring ?? snap?.hiring_date ?? snap?.["date-of-joining"] ?? snap?.date_of_joining ?? snap?.joining_date),
    department_id: departmentId,
    job_position_id: jobPositionId,
    job_role: jobTitle,
    employee_type: pickString(snap?.employee_type, snap?.employment_type),
    work_email: pickString(snap?.work_email, snap?.email)?.toLowerCase() || null,
    location: pickString(snap?.location, snap?.work_location),
    reporting_manager_id: reportingManagerLocalId,
  };

  const { data: wiCur } = await svc.from("hr_employee_work_info").select("*").eq("employee_id", hrId).maybeSingle();
  const wiPick = pickPatch(wiCur as any, wiIncoming);
  if (wiCur) {
    if (Object.keys(wiPick.patch).length) {
      await svc.from("hr_employee_work_info").update(wiPick.patch).eq("employee_id", hrId);
    }
  } else if (Object.keys(wiPick.patch).length) {
    await svc.from("hr_employee_work_info").insert({ employee_id: hrId, ...wiPick.patch });
  }

  // ---- hr_employee_bank_details ----
  // RazorpayX exposes bank fields in two shapes: nested (bank_account / bank_details / bank_information)
  // OR flat hyphenated keys at the snapshot root (bank-account-number, bank-ifsc, bank-name, bank-branch).
  // Cover both — real payloads for people:view use the flat hyphenated form.
  const b = snap?.bank_account ?? snap?.bank_details ?? snap?.bank_information ?? snap?.bank ?? {};
  const bankIncoming: Record<string, any> = {
    account_number: pickString(b?.account_number, snap?.account_number, snap?.bank_account_number, snap?.["bank-account-number"]),
    ifsc_code: normIfsc(b?.ifsc ?? b?.ifsc_code ?? snap?.ifsc ?? snap?.ifsc_code ?? snap?.["bank-ifsc"]),
    bank_name: pickString(b?.bank_name, snap?.bank_name, snap?.["bank-name"]),
    branch: pickString(b?.branch, b?.branch_name, snap?.branch, snap?.["bank-branch"]),
  };

  const { data: bdCur } = await svc.from("hr_employee_bank_details").select("*").eq("employee_id", hrId).maybeSingle();
  const bdPick = pickPatch(bdCur as any, bankIncoming);
  if (bdCur) {
    if (Object.keys(bdPick.patch).length) {
      await svc.from("hr_employee_bank_details").update(bdPick.patch).eq("employee_id", hrId);
    }
  } else if (Object.keys(bdPick.patch).length) {
    await svc.from("hr_employee_bank_details").insert({ employee_id: hrId, ...bdPick.patch });
  }

  return { hr_employees: empPick, work_info: wiPick, bank: bdPick };
}

// Mirror the Razorpay snapshot into the onboarding row so the wizard form
// opens pre-filled with everything Razorpay knows about the employee.
// ERP-wins: only fills fields that are currently NULL on the onboarding row.
async function projectSnapshotIntoOnboarding(
  svc: SupabaseClient,
  hrId: string,
  snap: any,
): Promise<{ wrote: string[]; conflicts: string[] } | null> {
  const { data: ob } = await svc.from("hr_employee_onboarding")
    .select("id,first_name,last_name,email,phone,gender,date_of_birth,department_id,position_id,job_role,employee_type,date_of_joining,ctc")
    .eq("employee_id", hrId).maybeSingle();
  if (!ob) return null;

  const { first, last } = splitName(snap?.name || "");
  const deptName = pickString(snap?.department);
  const jobTitle = pickString(snap?.title, snap?.designation, snap?.job_title);
  let departmentId: string | null = null;
  let positionId: string | null = null;
  if (deptName) {
    const { data: d } = await svc.from("departments").select("id").ilike("name", deptName.trim()).limit(1).maybeSingle();
    if (d?.id) departmentId = d.id;
  }
  if (jobTitle) {
    positionId = await resolveOrCreatePositionId(svc, jobTitle);
  }

  // CTC comes from the salary sub-response injected onto snap.__salary by the
  // pull flow. Fall back to any legacy salary block that may already be on the
  // snapshot root, and finally to top-level fields (some tenants inline salary
  // keys directly on person view).
  const readNumAny = (obj: any, keys: string[]): number | null => {
    if (!obj || typeof obj !== "object") return null;
    for (const k of keys) {
      const v = obj[k];
      const n = typeof v === "string" ? Number(v.replace(/,/g, "")) : v;
      if (typeof n === "number" && Number.isFinite(n) && n > 0) return n;
    }
    return null;
  };
  const CTC_KEYS = ["annual_ctc","ctc-annual","ctc_annual","ctc","annual-ctc","ctc-yearly","annual-salary","annual-gross"];
  const MONTHLY_KEYS = ["monthly-gross","monthly_gross","gross","monthly-ctc","monthly-salary"];
  const salaryBlock = snap?.__salary || snap?.salary || snap?.["salary-structure"] || snap?.salary_structure || null;
  let ctcAnnual: number | null =
    readNumAny(salaryBlock, CTC_KEYS) ||
    readNumAny(snap, CTC_KEYS);
  if (!ctcAnnual) {
    const monthly = readNumAny(salaryBlock, MONTHLY_KEYS) || readNumAny(snap, MONTHLY_KEYS);
    if (monthly && monthly > 0) ctcAnnual = Math.round(monthly * 12);
  }


  const incoming: Record<string, any> = {
    first_name: pickString(snap?.first_name, first) || null,
    last_name: pickString(snap?.last_name, last) || null,
    email: pickString(snap?.email)?.toLowerCase() || null,
    phone: normPhone(snap?.phone_number ?? snap?.phone),
    gender: pickString(snap?.gender)?.toLowerCase() || null,
    date_of_birth: parseDobIso(snap?.["date-of-birth"] ?? snap?.date_of_birth ?? snap?.dob),
    department_id: departmentId,
    position_id: positionId,
    job_role: jobTitle,
    employee_type: pickString(snap?.employee_type, snap?.employment_type),
    // Razorpay actually uses `date-of-hiring` (verified against production
    // snapshots); the *-joining aliases are kept for legacy/other tenants.
    date_of_joining: parseDobIso(
      snap?.["date-of-hiring"] ??
      snap?.date_of_hiring ??
      snap?.hiring_date ??
      snap?.["date-of-joining"] ??
      snap?.date_of_joining ??
      snap?.joining_date
    ),
    ctc: ctcAnnual && ctcAnnual > 0 ? ctcAnnual : null,
  };
  const picked = pickPatch(ob as any, incoming);
  if (Object.keys(picked.patch).length) {
    await svc.from("hr_employee_onboarding").update(picked.patch).eq("id", (ob as any).id);
  }
  return picked;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authed = await requireAuth(req);
    if (authed instanceof Response) return authed;
    if (!KEY_ID || !KEY_SECRET) return json(500, { error: "Missing RAZORPAY_PAYROLL_KEY_ID / _SECRET" });

    const svc = createClient(SUPA_URL, SVC);
    const perm = authed.serviceRole ? { ok: true, msg: "" } : await requirePermission(authed.userId!, svc);
    if (!perm.ok) return json(403, { error: perm.msg });

    const payload = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = payload?.action ?? "validate_creds";

    // ---------- validate_creds / introspect_envelope ----------
    if (action === "validate_creds" || action === "introspect_envelope") {
      const eid = Number(payload?.employee_id ?? 1);
      const r = await opfinView(eid, payload?.employee_type ?? "employee");
      const preview = r.raw?.slice(0, 500) ?? null;
      const fields = r.body && typeof r.body === "object" && !Array.isArray(r.body)
        ? Object.keys(r.body) : null;
      if (r.ok) await markCredsValidated(svc);
      const attempt = {
        url: `${BASE}/people`,
        http_status: r.status,
        body_type: r.body && typeof r.body === "object" ? "object" : typeof r.body,
        top_level_keys: fields ?? [],
        array_key: null, array_length: null,
        scalar_keys: fields ?? [], element_field_names: fields,
        raw_length: r.raw?.length ?? 0, raw_preview: preview,
      };
      if (action === "validate_creds") {
        return json(200, {
          ok: r.ok, base_url_used: `${BASE}/people`, http_status: r.status,
          sample_employee_count: r.ok ? 1 : 0,
          error_body_snippet: r.ok ? null : preview, attempts: [attempt],
        });
      }
      return json(200, { ...attempt, ok: r.ok, http_status: r.status, attempts: [attempt] });
    }

    // ---------- fetch_one: preview + match, no writes ----------
    if (action === "fetch_one") {
      const eid = Number(payload?.employee_id);
      if (!Number.isFinite(eid) || eid < 1) return json(400, { error: "employee_id required" });
      const r = await opfinView(eid);
      if (!r.ok) return json(200, { ok: false, http_status: r.status, error: r.errText || r.raw?.slice(0, 300) });
      const match = await matchEmployee(svc, r.body, eid);

      return json(200, {
        ok: true, employee_id: eid,
        preview: {
          // Send back only non-PII scalars + first-name hint for operator confirmation.
          name: r.body.name, title: r.body.title, department: r.body.department,
          is_active: r.body.is_active,
        },
        field_names: fieldNames(r.body),
        match,
      });
    }

    // ---------- reset_onboarding_razorpay_reservation ----------
    // Operator recovery for failed/deleted Razorpay creates. Clears the local
    // onboarding reservation plus linked local mirrors so Stage 5 can reserve a
    // fresh unified ID. The allocator still treats previously queued eSSL pins
    // as burned, so the next reserve advances instead of reusing the deleted ID.
    if (action === "reset_onboarding_razorpay_reservation") {
      const onboardingId = payload?.onboarding_id ? String(payload.onboarding_id) : "";
      if (!onboardingId) return json(400, { ok: false, error: "onboarding_id required" });

      const { data: ob, error: obErr } = await svc
        .from("hr_employee_onboarding")
        .select("id,email,employee_id,essl_badge_id")
        .eq("id", onboardingId)
        .maybeSingle();
      if (obErr) return json(500, { ok: false, error: obErr.message });
      if (!ob) return json(404, { ok: false, error: "Onboarding record not found" });

      const staleId = String((ob as any).essl_badge_id || "").trim();
      if (!staleId) return json(200, { ok: true, already_clear: true });
      if (!/^\d+$/.test(staleId)) return json(400, { ok: false, error: `Current reservation "${staleId}" is not a numeric RazorpayX/ESSL ID.` });

      const pendingBadge = `PENDING-${onboardingId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
      const touched: Record<string, number | boolean | string> = { stale_id: staleId };

      const { error: onbErr } = await svc
        .from("hr_employee_onboarding")
        .update({ essl_badge_id: null, updated_at: new Date().toISOString() })
        .eq("id", onboardingId)
        .eq("essl_badge_id", staleId);
      if (onbErr) return json(500, { ok: false, error: onbErr.message });
      touched.onboarding_cleared = true;

      if ((ob as any).employee_id) {
        const { error: empErr } = await svc
          .from("hr_employees")
          .update({ badge_id: pendingBadge, updated_at: new Date().toISOString() })
          .eq("id", (ob as any).employee_id)
          .eq("badge_id", staleId);
        if (empErr) return json(500, { ok: false, error: empErr.message });
        touched.hr_employee_badge = pendingBadge;

        await svc
          .from("hr_razorpay_employee_map")
          .delete()
          .eq("hr_employee_id", (ob as any).employee_id)
          .eq("razorpay_employee_id", staleId);
      }

      if ((ob as any).email) {
        const { error: userErr } = await svc
          .from("users")
          .update({ badge_id: null, updated_at: new Date().toISOString() })
          .eq("badge_id", staleId)
          .ilike("email", String((ob as any).email));
        if (userErr) return json(500, { ok: false, error: userErr.message });
        touched.erp_user_badge_cleared = true;
      }

      const { data: pushRows, error: pushFetchErr } = await svc
        .from("hr_essl_pushback_log")
        .select("id,command_id")
        .eq("pin", staleId)
        .eq("kind", "identity")
        .eq("triggered_from", "onboarding_stage5")
        .in("status", ["queued", "pending"]);
      if (pushFetchErr) return json(500, { ok: false, error: pushFetchErr.message });

      const commandIds = (pushRows || []).map((r: any) => r.command_id).filter(Boolean);
      if (commandIds.length > 0) {
        const { error: cmdCancelErr } = await svc
          .from("hr_biometric_device_commands")
          .update({
            status: "cancelled",
            ack_response: "Cancelled after operator reset a deleted/failed RazorpayX onboarding reservation.",
          })
          .in("id", commandIds)
          .eq("status", "pending");
        if (cmdCancelErr) return json(500, { ok: false, error: cmdCancelErr.message });
      }

      const { error: pushErr } = await svc
        .from("hr_essl_pushback_log")
        .update({
          status: "cancelled",
          error_message: "Cancelled after operator reset a deleted/failed RazorpayX onboarding reservation.",
          updated_at: new Date().toISOString(),
        })
        .eq("pin", staleId)
        .eq("kind", "identity")
        .eq("triggered_from", "onboarding_stage5")
        .in("status", ["queued", "pending"]);
      if (pushErr) return json(500, { ok: false, error: pushErr.message });
      touched.essl_commands_cancelled = commandIds.length;

      const { data: devices, error: devErr } = await svc
        .from("hr_biometric_devices")
        .select("device_serial")
        .not("device_serial", "is", null);
      if (devErr) return json(500, { ok: false, error: devErr.message });

      let deleteQueued = 0;
      for (const dev of devices || []) {
        const serial = String((dev as any).device_serial || "").trim();
        if (!serial) continue;
        const cmdSeed = Date.now() + Math.floor(Math.random() * 10_000);
        const commandText = `C:${cmdSeed}:DATA DELETE USERINFO PIN=${staleId}`;
        const { data: cmdRow, error: cmdErr } = await svc
          .from("hr_biometric_device_commands")
          .insert({
            device_serial: serial,
            command_text: commandText,
            status: "pending",
            created_by: authed.userId,
          })
          .select("id")
          .single();
        if (cmdErr) return json(500, { ok: false, error: cmdErr.message });

        const { error: logErr } = await svc.from("hr_essl_pushback_log").insert({
          hr_employee_id: (ob as any).employee_id || null,
          device_serial: serial,
          pin: staleId,
          kind: "delete",
          action: "DATA DELETE USERINFO",
          status: "queued",
          command_id: (cmdRow as any).id,
          request_snapshot: { command_text: commandText, onboarding_id: onboardingId, reason: "reset_deleted_razorpay_onboarding" },
          triggered_by: authed.userId,
          triggered_from: "onboarding_stage5_reset",
        });
        if (logErr) return json(500, { ok: false, error: logErr.message });
        deleteQueued += 1;
      }
      touched.essl_delete_commands_queued = deleteQueued;

      return json(200, { ok: true, ...touched });
    }

    // ---------- recover_person_by_id: operator-assisted mapping repair ----------
    // Used when Razorpay says "Email already exists" but the create API does
    // not return which employee-id owns that email. HR can copy the employee-id
    // from RazorpayX; we verify the ID via people:view and only map it when the
    // Razorpay email exactly matches the ERP employee email.
    if (action === "recover_person_by_id") {
      const hrId = payload?.hr_employee_id ? String(payload.hr_employee_id) : "";
      const rpId = Number(payload?.razorpay_employee_id);
      if (!hrId) return json(400, { error: "hr_employee_id required" });
      if (!Number.isFinite(rpId) || rpId < 1) return json(400, { error: "razorpay_employee_id required" });

      const { data: emp, error: empErr } = await svc
        .from("hr_employees")
        .select("id,email")
        .eq("id", hrId)
        .maybeSingle();
      if (empErr) return json(500, { error: empErr.message });
      if (!emp?.email) return json(400, { error: "ERP employee email missing" });

      const r = await opfinView(rpId, "employee");
      if (!r.ok) return json(200, { ok: false, code: "RAZORPAY_ID_NOT_FOUND", error: `Razorpay employee-id ${rpId} was not found or is inactive.`, http_status: r.status });
      if (isDismissedRazorpayPerson(r.body)) {
        return json(200, { ok: false, code: "RAZORPAY_EMPLOYEE_DISMISSED", error: `Razorpay employee-id ${rpId} is dismissed/inactive and cannot be linked.`, http_status: r.status });
      }

      const erpEmail = String(emp.email || "").trim().toLowerCase();
      const rpEmail = String(r.body?.email || r.body?.work_email || "").trim().toLowerCase();
      if (!rpEmail || rpEmail !== erpEmail) {
        return json(200, {
          ok: false,
          code: "RAZORPAY_EMAIL_MISMATCH",
          error: `Razorpay employee-id ${rpId} email does not match this onboarding record. Link blocked to prevent identity corruption.`,
          email_domain: rpEmail ? rpEmail.split("@")[1] || null : null,
          http_status: r.status,
        });
      }

      try {
        await upsertMap(svc, String(rpId), hrId, false, false);
        await svc.from("hr_razorpay_employee_map").update({
          last_pull_snapshot: r.body,
          last_pulled_at: new Date().toISOString(),
          last_payload_hash: await canonicalHash(r.body),
        }).eq("hr_employee_id", hrId);
        await logSync(svc, {
          action: "create_person",
          http_status: r.status,
          razorpay_employee_id: String(rpId),
          hr_employee_id: hrId,
          field_diff_summary: { source: "operator_confirmed_id", field_names: fieldNames(r.body) },
          error_text: null,
          actor_user_id: authed.userId,
        });
        return json(200, { ok: true, razorpay_employee_id: String(rpId), already_exists_in_razorpay: true, repaired_mapping: true, snapshot: r.body, http_status: r.status });
      } catch (e) {
        return json(200, { ok: false, code: "RAZORPAY_MAPPING_REPAIR_FAILED", error: (e as Error).message, http_status: r.status });
      }
    }

    // ---------- read_person_by_id: read-only fetch for reconciliation UI ----------
    // Returns the raw RazorpayX people:view snapshot for an employee-id. Does NOT
    // touch hr_razorpay_employee_map or require a linked hr_employees row. Used by
    // the Stage 5 reconciliation panel to show a field-by-field diff BEFORE the
    // operator commits to linking. Refuses dismissed employees.
    if (action === "read_person_by_id") {
      const rpId = Number(payload?.razorpay_employee_id);
      if (!Number.isFinite(rpId) || rpId < 1) return json(400, { error: "razorpay_employee_id required" });
      const r = await opfinView(rpId, "employee");
      if (!r.ok) return json(200, { ok: false, code: "RAZORPAY_ID_NOT_FOUND", error: `Razorpay employee-id ${rpId} was not found or is inactive.`, http_status: r.status });
      if (isDismissedRazorpayPerson(r.body)) {
        return json(200, { ok: false, code: "RAZORPAY_EMPLOYEE_DISMISSED", error: `Razorpay employee-id ${rpId} is dismissed/inactive and cannot be linked.`, http_status: r.status });
      }
      // Best-effort salary attach — people:view never carries CTC; the
      // separate payroll:view-payroll endpoint returns it, but only after an
      // executed payroll run. We probe executed months only (same gating as
      // the bulk pull) so a brand-new hire cleanly reports "not exposed".
      try {
        const { data: runs } = await svc.from("hr_razorpay_payroll_runs")
          .select("period_month,status")
          .in("status", ["bulk_applied", "locked", "recalled"]);
        const months = new Set<string>();
        for (const run of runs || []) {
          const m = /^(\d{4})-(\d{2})/.exec(String(run.period_month || ""));
          if (m) months.add(`${m[1]}-${m[2]}`);
        }
        const rpEmail = (r.body as any)?.email || (r.body as any)?.work_email || null;
        const sal = await opfinSalary(rpId, rpEmail, Array.from(months));
        if (sal.ok) {
          (r.body as any).__salary = {
            annual_ctc: sal.annual_ctc,
            monthly_gross: sal.monthly_gross,
            components: sal.components,
          };
          (r.body as any).annual_ctc = sal.annual_ctc;
        } else {
          (r.body as any).__salary_probe_error = sal.err;
        }
      } catch (e) {
        (r.body as any).__salary_probe_error = (e as Error).message;
      }
      return json(200, { ok: true, razorpay_employee_id: String(rpId), snapshot: r.body, http_status: r.status });
    }

    // ---------- attach_employee_id_by_email ----------
    // Repair path for records that were created in Razorpay but lost their
    // reserved employee-id (the "-NA-" limbo state). Official contract uses
    // people:edit keyed by email; internal people-id is deliberately ignored.
    if (action === "attach_employee_id_by_email" || action === "attach_employee_id_by_people_id") {
      const hrId = payload?.hr_employee_id ? String(payload.hr_employee_id) : "";
      if (!hrId) return json(400, { error: "hr_employee_id required" });

      const { data: emp, error: empErr } = await svc
        .from("hr_employees")
        .select("id,email,badge_id")
        .eq("id", hrId)
        .maybeSingle();
      if (empErr) return json(500, { error: empErr.message });
      if (!emp?.email) return json(400, { error: "ERP employee email missing" });
      const desiredEid = Number(payload?.desired_employee_id ?? emp.badge_id);
      if (!Number.isFinite(desiredEid) || desiredEid < 1) {
        return json(400, { error: "desired_employee_id (or hr_employees.badge_id) required" });
      }

      const attach = await attachReservedEmployeeIdByEmail(emp.email, String(desiredEid));
      if (!attach.ok) {
        return json(200, { ok: false, code: "RAZORPAY_ATTACH_FAILED", error: `Attaching employee-id ${desiredEid} to email ${emp.email} failed: ${attach.error}`, http_status: attach.status });
      }

      // Verify by reading back with the newly attached employee-id.
      const v = await opfinView(desiredEid, "employee");
      if (!v.ok) {
        return json(200, { ok: false, code: "RAZORPAY_ATTACH_UNVERIFIED", error: `Razorpay accepted the attach for email ${emp.email} → employee-id ${desiredEid}, but a follow-up people:view could not confirm it.`, http_status: v.status });
      }
      const erpEmail = String(emp.email || "").trim().toLowerCase();
      const rpEmail = String(v.body?.email || v.body?.work_email || "").trim().toLowerCase();
      if (!rpEmail || rpEmail !== erpEmail) {
        return json(200, { ok: false, code: "RAZORPAY_EMAIL_MISMATCH", error: `Employee-id ${desiredEid} belongs to a different email (${rpEmail || "unknown"}). Refusing to link.`, http_status: v.status });
      }

      try {
        await upsertMap(svc, String(desiredEid), hrId, false, false);
        const snapshot = { ...(v.body || {}), _attached_by: "email_keyed_people_edit" };
        await svc.from("hr_razorpay_employee_map").update({
          last_pull_snapshot: snapshot,
          last_pulled_at: new Date().toISOString(),
          last_payload_hash: await canonicalHash(snapshot),
        }).eq("hr_employee_id", hrId);
        await logSync(svc, {
          action: "create_person",
          http_status: v.status,
          razorpay_employee_id: String(desiredEid),
          hr_employee_id: hrId,
          field_diff_summary: { source: "attach_employee_id_by_email", field_names: fieldNames(v.body) },
          error_text: null,
          actor_user_id: authed.userId,
        });
        return json(200, { ok: true, razorpay_employee_id: String(desiredEid), attached: true, http_status: v.status });
      } catch (e) {
        return json(200, { ok: false, code: "RAZORPAY_MAPPING_REPAIR_FAILED", error: (e as Error).message, http_status: v.status });
      }
    }

    // ---------- apply_one: pilot write (unlocks bulk on success) ----------
    if (action === "apply_one") {
      const eid = Number(payload?.employee_id);
      if (!Number.isFinite(eid) || eid < 1) return json(400, { error: "employee_id required" });
      const r = await opfinView(eid);
      if (!r.ok) return json(200, { ok: false, http_status: r.status, error: r.errText || "Not found" });

      // Block dismissed / inactive Razorpay employees from entering the ERP.
      const rp = r.body || {};
      const rpStatus = String(rp.status || "").toLowerCase();
      if (
        rpStatus === "dismissed" ||
        rpStatus === "terminated" ||
        rpStatus === "resigned" ||
        rp.is_active === false ||
        !!rp.date_of_leaving ||
        !!rp.dismissed_at
      ) {
        return json(200, {
          ok: false,
          http_status: r.status,
          skipped: "dismissed",
          error: "Razorpay employee is dismissed/inactive — import blocked.",
          razorpay_status: rp.status ?? null,
        });
      }

      let match = await matchEmployee(svc, r.body, eid);
      let hrId = match.hr_employee_id;
      let created = false;
      if (!hrId) {
        hrId = await createDraftEmployee(svc, r.body);
        created = true;
      }
      await upsertMap(svc, String(eid), hrId!, true, created);
      // Project the full Razorpay snapshot into ERP + onboarding row so HR
      // opens the wizard pre-filled (gender, DOB, department, designation,
      // DOJ, work_email, bank details when Razorpay returns them).
      let projDiff: any = null;
      let obDiff: any = null;
      try {
        projDiff = await projectSnapshotIntoErp(svc, hrId!, r.body);
        obDiff = await projectSnapshotIntoOnboarding(svc, hrId!, r.body);
        await svc.from("hr_razorpay_employee_map").update({
          last_pull_snapshot: r.body,
          last_pulled_at: new Date().toISOString(),
          last_payload_hash: await canonicalHash(r.body),
        }).eq("razorpay_employee_id", String(eid));
      } catch (projErr) {
        console.error("[apply_one] project failed", (projErr as Error).message);
      }
      await logSync(svc, {
        action: created ? "create_draft" : "match",
        http_status: r.status,
        razorpay_employee_id: String(eid),
        hr_employee_id: hrId,
        field_diff_summary: {
          field_names: fieldNames(r.body),
          matched_by: match.matched_by,
          pilot: true,
          projected: projDiff ? {
            hr_employees: projDiff.hr_employees.wrote,
            work_info: projDiff.work_info.wrote,
            bank: projDiff.bank.wrote,
          } : null,
          onboarding_prefilled: obDiff?.wrote ?? null,
        },
        actor_user_id: authed.userId,
      });
      await stampLastImport(svc);
      return json(200, { ok: true, hr_employee_id: hrId, created, matched_by: match.matched_by });
    }

    // ---------- unlock_bulk: human gate after pilot verification ----------
    if (action === "unlock_bulk") {
      const { data: pilot } = await svc.from("hr_razorpay_employee_map")
        .select("razorpay_employee_id").eq("is_pilot_verified", true).limit(1).maybeSingle();
      if (!pilot) return json(400, { error: "No pilot-verified employee. Run apply_one first." });
      await unlockBulk(svc);
      await logSync(svc, {
        action: "unlock_bulk", http_status: 200,
        razorpay_employee_id: String(pilot.razorpay_employee_id),
        actor_user_id: authed.userId,
      });
      return json(200, { ok: true });
    }

    // (Removed: probe_create_person / probe_attach_by_email — R1 proved the
    // shape and R4 pre-flight is now inlined into create_person.)


    // ---------- probe_endpoint: gated read-only sub-type validator ----------
    // Used by Phase-planning to prove which Opfin sub-types exist against the
    // live tenant BEFORE any Phase B/C/... UI is wired to them. Writes are
    // NEVER allowed here — only an allowlist of read-only sub-types can run.
    if (action === "probe_endpoint") {
      const resource = String(payload?.resource ?? "").trim();
      const subType = String(payload?.sub_type ?? "").trim();
      const data = (payload?.data && typeof payload.data === "object") ? payload.data : {};
      // Only read variants that actually exist in the Opfin API (verified against
      // the Postman collection). Everything else — salary-structure/*, payslip/*,
      // tds/*, webhook/*, bank-details/*, people:list, payroll:list/status/months/runs
      // — is not in the doc and is intentionally rejected here.
      const READONLY = new Set([
        "people:view",
        "payroll:view-payroll",
        "attendance:fetch",
        "contractor-payment:list-pending",
        "contractor-payment:get-status",
      ]);
      const key = `${resource}:${subType}`;
      if (!READONLY.has(key)) {
        return json(200, {
          ok: false, skipped: true, key,
          reason: "probe restricted to read-only sub-types; write sub-types require operator-approved payload before live-tenant call",
        });
      }
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);
      try {
        const res = await fetch(`${BASE}/${resource}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            auth: authBlock(),
            request: { type: resource, "sub-type": subType },
            data,
          }),
          signal: ctrl.signal,
        });
        const raw = await res.text();
        let body: any = null;
        try { body = JSON.parse(raw); } catch { /* keep raw */ }
        const topKeys = body && typeof body === "object" && !Array.isArray(body)
          ? Object.keys(body).slice(0, 30) : null;
        const errText = body && typeof body === "object" ? (body.error || body.message || null) : null;
        return json(200, {
          ok: res.ok && !errText,
          key, http_status: res.status,
          top_level_keys: topKeys,
          error: errText,
          raw_preview: raw.slice(0, 400),
        });
      } catch (e) {
        return json(200, { ok: false, key, http_status: 0, error: (e as Error).message });
      } finally { clearTimeout(t); }
    }

    // ---------- probe_catalogue: batch probe every phase's sub-types ----------
    // Phase 2 deliverable. Iterates a hard-coded catalogue, probes read sub-types
    // via a real POST to Opfin, records write sub-types as "not_probed" (writes
    // require an operator-approved payload before any Live-tenant call).
    if (action === "probe_catalogue") {
      type Row = {
        phase: string; key: string; mode: "read" | "write";
        status: "ok" | "fail" | "not_probed" | "skipped"; http_status: number | null;
        error: string | null; top_level_keys: string[] | null;
      };
      // Verified against RazorpayX Payroll Postman collection (Opfin).
      // Each entry maps to a real endpoint that exists in the doc.
      const CATALOGUE: Array<{ phase: string; key: string; mode: "read" | "write" }> = [
        { phase: "People", key: "people:view", mode: "read" },
        { phase: "People", key: "people:create", mode: "write" },
        { phase: "People", key: "people:edit", mode: "write" },
        { phase: "People", key: "people:set-salary", mode: "write" },
        { phase: "People", key: "people:dismiss", mode: "write" },
        { phase: "Attendance", key: "attendance:fetch", mode: "read" },
        { phase: "Attendance", key: "attendance:modify", mode: "write" },
        { phase: "Payroll modifications", key: "payroll:add-additions", mode: "write" },
        { phase: "Payroll modifications", key: "payroll:add-deduction", mode: "write" },
        { phase: "Payroll modifications", key: "payroll:reset-modifications", mode: "write" },
        { phase: "Payroll modifications", key: "payroll:do-not-pay", mode: "write" },
        { phase: "Payroll pull", key: "payroll:view-payroll", mode: "read" },
        { phase: "Contractor payments", key: "contractor-payment:create", mode: "write" },
        { phase: "Contractor payments", key: "contractor-payment:list-pending", mode: "read" },
        { phase: "Contractor payments", key: "contractor-payment:get-status", mode: "read" },
        { phase: "Contractor payments", key: "contractor-payment:delete", mode: "write" },
        { phase: "Advance salary", key: "advance-salary:create", mode: "write" },
      ];

      // Pilot IDs: prefer operator-configured probe IDs from settings, else
      // fall back to any pilot-verified employee already mapped.
      const { data: settingsRow } = await svc
        .from("hr_razorpay_settings")
        .select("probe_pilot_employee_id, probe_pilot_contractor_id")
        .eq("is_singleton", true)
        .maybeSingle();
      const configuredEmpId = settingsRow?.probe_pilot_employee_id
        ? String(settingsRow.probe_pilot_employee_id).trim() || null : null;
      const configuredContractorId = settingsRow?.probe_pilot_contractor_id
        ? String(settingsRow.probe_pilot_contractor_id).trim() || null : null;

      let fallbackEmpId: string | null = null;
      if (!configuredEmpId) {
        const { data: pilot } = await svc
          .from("hr_razorpay_employee_map")
          .select("razorpay_employee_id")
          .eq("is_pilot_verified", true)
          .limit(1).maybeSingle();
        fallbackEmpId = pilot?.razorpay_employee_id ? String(pilot.razorpay_employee_id) : null;
      }
      const probeEmployeeId = configuredEmpId ?? fallbackEmpId;
      const probeContractorId = configuredContractorId;

      const rows: Row[] = [];
      for (const item of CATALOGUE) {
        if (item.mode === "write") {
          rows.push({
            ...item, status: "not_probed", http_status: null, error: null, top_level_keys: null,
          });
          continue;
        }
        const [resource, subType] = item.key.split(":");
        const URL_MAP: Record<string, string> = {
          "contractor-payment": "contractorPayment",
          "advance-salary": "advanceSalary",
          "att": "att",
          "attendance": "att",
        };
        const bodyType = resource === "att" ? "attendance" : resource;
        const urlPath = URL_MAP[resource] ?? resource;

        // Skip early when the sub-type requires an ID we don't have configured.
        const needsEmployee = (bodyType === "people") || (bodyType === "attendance");
        const needsContractor = (bodyType === "contractor-payment" && subType === "get-status");
        if (needsEmployee && !probeEmployeeId) {
          rows.push({
            ...item, status: "skipped", http_status: null,
            error: "No pilot employee configured — set one in probe settings above.",
            top_level_keys: null,
          });
          continue;
        }
        if (needsContractor && !probeContractorId) {
          rows.push({
            ...item, status: "skipped", http_status: null,
            error: "No pilot contractor configured — set one in probe settings above.",
            top_level_keys: null,
          });
          continue;
        }

        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 12000);
        try {
          const body: any = { auth: authBlock(), request: { type: bodyType, "sub-type": subType } };
          if (bodyType === "people" && probeEmployeeId) {
            body.data = { "employee-id": probeEmployeeId, "employee-type": "employee" };
          } else if (bodyType === "attendance" && probeEmployeeId) {
            body.data = { "employee-id": probeEmployeeId };
          } else if (bodyType === "contractor-payment" && subType === "get-status" && probeContractorId) {
            body.data = { "contractor-payment-id": probeContractorId };
          }
          const res = await fetch(`${BASE}/${urlPath}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify(body),
            signal: ctrl.signal,
          });
          const raw = await res.text();
          let parsed: any = null;
          try { parsed = JSON.parse(raw); } catch { /* keep raw */ }
          const topKeys = parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? Object.keys(parsed).slice(0, 20) : null;
          const errRaw = parsed && typeof parsed === "object" ? (parsed.error ?? parsed.message ?? null) : null;
          const errText = errRaw == null ? null : (typeof errRaw === "string" ? errRaw : JSON.stringify(errRaw));

          const looksMissingSubType = res.status === 404
            || (typeof errText === "string" && /unknown|invalid\s*sub[-_ ]?type/i.test(errText));
          // "No seed data on tenant" signatures: Opfin PHP surface returns
          // these when the requested resource simply has nothing to enumerate
          // (empty payroll month, no contractors, empty listing). Treat as
          // skipped so operators aren't misled into thinking auth is broken.
          const looksEmptySeed = typeof errText === "string" && (
            /Undefined property:\s*stdClass::\$data/i.test(errText) ||
            /foreach\(\)\s*argument\s*must\s*be\s*of\s*type\s*array/i.test(errText) ||
            /no\s*(records|data|results)\s*found/i.test(errText)
          );

          let status: Row["status"];
          let note = errText ? String(errText).slice(0, 200) : null;
          if (!errText && res.ok) {
            status = "ok";
          } else if (looksEmptySeed) {
            status = "skipped";
            note = "Endpoint reachable — no seed data on this tenant to probe against.";
          } else if (looksMissingSubType) {
            status = "fail";
          } else {
            status = "fail";
          }
          rows.push({ ...item, status, http_status: res.status, error: note, top_level_keys: topKeys });
        } catch (e) {
          rows.push({ ...item, status: "fail", http_status: 0, error: (e as Error).message.slice(0, 200), top_level_keys: null });
        } finally {
          clearTimeout(t);
        }
        // gentle spacing between probes
        await new Promise((r) => setTimeout(r, 250));
      }

      // Log probe run (PII-safe: sub-types + status only).
      try {
        await svc.from("hr_razorpay_sync_log").insert({
          action: "drift_check",
          http_status: 200,
          field_diff_summary: {
            probe_run: true,
            probe_employee_id: probeEmployeeId,
            probe_contractor_id: probeContractorId,
            results: rows.map((r) => ({ key: r.key, status: r.status, http: r.http_status })),
          },
          actor_user_id: authed.userId,
        });
      } catch { /* logging is best-effort */ }

      return json(200, {
        ok: true,
        probe_id: probeEmployeeId,
        probe_employee_id: probeEmployeeId,
        probe_contractor_id: probeContractorId,
        rows,
      });
    }

    // ---------- save_probe_pilots: operator sets probe pilot IDs ----------
    if (action === "save_probe_pilots") {
      const empId = typeof payload?.probe_pilot_employee_id === "string"
        ? payload.probe_pilot_employee_id.trim() : "";
      const conId = typeof payload?.probe_pilot_contractor_id === "string"
        ? payload.probe_pilot_contractor_id.trim() : "";
      const { error } = await svc.from("hr_razorpay_settings").update({
        probe_pilot_employee_id: empId || null,
        probe_pilot_contractor_id: conId || null,
      }).eq("is_singleton", true);
      if (error) return json(500, { error: error.message });
      return json(200, {
        ok: true,
        probe_pilot_employee_id: empId || null,
        probe_pilot_contractor_id: conId || null,
      });
    }



    const settings = await readSettings(svc);
    const settingsRow = settings;

    // ---------- dry_run_range / apply_range ----------
    if (action === "dry_run_range" || action === "apply_range") {
      if (action === "apply_range" && !settings?.bulk_sync_unlocked) {
        return json(403, { error: "Bulk sync locked. Unlock after pilot verification." });
      }

      // `only_ids` powers the "Retry failed IDs" affordance: iterate ONLY the
      // supplied Razorpay IDs, skip the consecutive-miss stop (they were
      // hand-picked), and stamp every audit row with retry:true so #70's story
      // reads end-to-end under the same apply_error / create_draft / match
      // actions as the original run.
      const onlyIdsRaw: any[] = Array.isArray(payload?.only_ids) ? payload.only_ids : [];
      const onlyIds: number[] = onlyIdsRaw
        .map((v) => Number(v))
        .filter((n) => Number.isFinite(n) && n >= 1);
      const isRetry = onlyIds.length > 0;

      let start = 1, end = 1;
      if (isRetry) {
        if (onlyIds.length > 200) return json(400, { error: "Retry batch too wide (max 200 IDs)" });
      } else {
        start = Math.max(1, Number(payload?.start_id ?? 1));
        end = Math.max(start, Number(payload?.max_id ?? start));
        const HARD_CAP = 1000;
        if (end - start + 1 > HARD_CAP) return json(400, { error: `Range too wide (max ${HARD_CAP})` });
      }

      const rows: any[] = [];
      let consecutiveMisses = 0;
      const STOP_AFTER = 30;

      const iterIds: number[] = isRetry ? onlyIds : [];
      const iterLen = isRetry ? iterIds.length : (end - start + 1);
      for (let idx = 0; idx < iterLen; idx++) {
        const i = isRetry ? iterIds[idx] : (start + idx);
        const r = await opfinView(i);
        if (!r.ok) {
          consecutiveMisses++;
          const isServerErr = r.status === 0 || r.status >= 500;
          const snippet = (r.raw || r.errText || `HTTP ${r.status}`).toString().slice(0, 800);
          rows.push({
            employee_id: i,
            status: "miss",
            http_status: r.status,
            error: isServerErr ? snippet : undefined,
          });
          // Only server-side / network errors deserve an audit row — genuine
          // 404-style misses on unused IDs would flood the log otherwise.
          if (action === "apply_range" && isServerErr) {
            await logSync(svc, {
              action: "apply_error",
              http_status: r.status || 500,
              razorpay_employee_id: String(i),
              field_diff_summary: { bulk: true, phase: "view", retry: isRetry },
              error_text: snippet,
              actor_user_id: authed.userId,
            }).catch(() => {});
          }
          // Retry runs are explicit — never trip the range-mode auto-stop.
          if (!isRetry && consecutiveMisses >= STOP_AFTER) {
            rows.push({ employee_id: null, status: "stopped", note: `${STOP_AFTER} consecutive misses` });
            break;
          }
          continue;

        }
        consecutiveMisses = 0;

        // Skip dismissed / inactive Razorpay employees. Razorpay flags
        // separated staff via status="dismissed", is_active=false, or by
        // populating date_of_leaving/dismissed_at. We do NOT import or
        // match these — they must not appear in the ERP employee master.
        const rp = r.body || {};
        if (isDismissedRazorpayPerson(rp)) {
          rows.push({
            employee_id: i,
            status: "skipped_dismissed",
            name: rp.name, title: rp.title, department: rp.department,
            is_active: rp.is_active,
            razorpay_status: rp.status ?? null,
            date_of_leaving: rp.date_of_leaving ?? null,
          });
          continue;
        }

        const match = await matchEmployee(svc, r.body, i);
        rows.push({
          employee_id: i,
          status: "hit",
          name: r.body.name, title: r.body.title, department: r.body.department,
          is_active: r.body.is_active,
          matched_by: match.matched_by,
          action_planned: match.action, // "match" | "create_draft"
          hr_employee_id: match.hr_employee_id,
        });

        if (action === "apply_range") {
          try {
            let hrId = match.hr_employee_id;
            let created = false;
            if (!hrId) { hrId = await createDraftEmployee(svc, r.body); created = true; }
            await upsertMap(svc, String(i), hrId!, false, created);
            // Project full snapshot into ERP + onboarding row so the
            // onboarding wizard opens pre-filled with Razorpay data.
            let projDiff: any = null;
            let obDiff: any = null;
            try {
              projDiff = await projectSnapshotIntoErp(svc, hrId!, r.body);
              obDiff = await projectSnapshotIntoOnboarding(svc, hrId!, r.body);
              await svc.from("hr_razorpay_employee_map").update({
                last_pull_snapshot: r.body,
                last_pulled_at: new Date().toISOString(),
                last_payload_hash: await canonicalHash(r.body),
              }).eq("razorpay_employee_id", String(i));
            } catch (projErr) {
              console.error("[apply_range] project failed", (projErr as Error).message);
            }
            await logSync(svc, {
              action: created ? "create_draft" : "match",
              http_status: r.status,
              razorpay_employee_id: String(i),
              hr_employee_id: hrId,
              field_diff_summary: {
                field_names: fieldNames(r.body),
                matched_by: match.matched_by,
                bulk: true,
                retry: isRetry,
                projected: projDiff ? {
                  hr_employees: projDiff.hr_employees.wrote,
                  work_info: projDiff.work_info.wrote,
                  bank: projDiff.bank.wrote,
                } : null,
                onboarding_prefilled: obDiff?.wrote ?? null,
              },
              actor_user_id: authed.userId,
            });
            rows[rows.length - 1].applied = true;
            rows[rows.length - 1].created = created;
            rows[rows.length - 1].hr_employee_id = hrId;
            rows[rows.length - 1].onboarding_prefilled = obDiff?.wrote?.length ?? 0;
          } catch (rowErr: any) {
            const msg = String(rowErr?.message ?? rowErr).slice(0, 800);
            rows[rows.length - 1].applied = false;
            rows[rows.length - 1].error = msg;
            await logSync(svc, {
              action: "apply_error",
              http_status: 500,
              razorpay_employee_id: String(i),
              field_diff_summary: { bulk: true, phase: "apply", retry: isRetry },
              error_text: msg,
              actor_user_id: authed.userId,
            }).catch(() => {});
          }
        }
      }

      if (action === "apply_range") await stampLastImport(svc);

      const summary = {
        total: rows.length,
        hits: rows.filter((r) => r.status === "hit").length,
        matches: rows.filter((r) => r.action_planned === "match").length,
        creates: rows.filter((r) => r.action_planned === "create_draft").length,
        misses: rows.filter((r) => r.status === "miss").length,
        skipped_dismissed: rows.filter((r) => r.status === "skipped_dismissed").length,
        errors: rows.filter((r) => r.error).length,
        stopped: rows.some((r) => r.status === "stopped"),
      };
      return json(200, { ok: true, summary, rows });
    }

    // ---------- pull_person_full: deep-pull + project (Phase 1a) ----------
    // Fetches people:view for every mapped Razorpay id (or a supplied subset),
    // stores the raw envelope, and projects it into hr_employees /
    // hr_employee_work_info / hr_employee_bank_details using ERP-wins
    // semantics. NEVER touches is_active. NEVER pushes to Razorpay.
    if (action === "pull_person_full") {
      const only: string[] | null = Array.isArray(payload?.razorpay_employee_ids) && payload.razorpay_employee_ids.length
        ? payload.razorpay_employee_ids.map((v: any) => String(v))
        : null;

      let query = svc.from("hr_razorpay_employee_map")
        .select("razorpay_employee_id,hr_employee_id,last_payload_hash");
      if (only) query = query.in("razorpay_employee_id", only);
      const { data: maps, error: mapsErr } = await query;
      if (mapsErr) return json(500, { error: `map read failed: ${mapsErr.message}` });

      const rows: any[] = [];
      let pulled = 0, skipped = 0, missed = 0, errored = 0, wroteAny = 0;

      // Executed-run gate for opfinSalary: fetch the set of months for which
      // RazorpayX actually finalised a payroll run. Without this the API
      // returns CTC/12 setup defaults for unexecuted months, which would
      // corrupt the ERP CTC field on the profile projection.
      const executedMonthsSet: string[] = await (async () => {
        try {
          const { data: runs } = await svc.from("hr_razorpay_payroll_runs")
            .select("period_month,status")
            .in("status", ["bulk_applied", "locked", "recalled"]);
          const s = new Set<string>();
          for (const r of runs || []) {
            const pm = String(r.period_month || "");
            const m = /^(\d{4})-(\d{2})/.exec(pm);
            if (m) s.add(`${m[1]}-${m[2]}`);
          }
          return Array.from(s);
        } catch { return []; }
      })();

      for (const m of maps || []) {
        const eid = Number(m.razorpay_employee_id);
        if (!Number.isFinite(eid) || eid < 1) { skipped++; continue; }
        const r = await opfinView(eid);
        if (!r.ok) {
          missed++;
          rows.push({ razorpay_employee_id: m.razorpay_employee_id, status: "miss", http_status: r.status });
          continue;
        }
        // Fetch salary sub-response as well — people:view never carries CTC.
        // Attach onto snapshot as __salary so projectors can read it. Silent on
        // failure (Razorpay returns nothing when salary structure isn't set).
        // GATED: only probes months with an executed RazorpayX payroll run.
        const sal = await opfinSalary(eid, (r.body as any)?.email, executedMonthsSet);
        if (sal.ok) {
          (r.body as any).__salary = {
            annual_ctc: sal.annual_ctc,
            monthly_gross: sal.monthly_gross,
            components: sal.components,
          };
        } else {
          (r.body as any).__salary_probe_error = sal.err;
        }
        try {
          const hash = await canonicalHash(r.body);
          // We always project this pass — the projector uses ERP-wins semantics
          // (only fills nulls / matching sentinels), and we recently expanded
          // the field map (date-of-hiring, __salary → ctc) so stale hashes must
          // not gate the backfill.
          const rzMgrRaw = (r.body as any)?.["manager-employee-id"] ?? (r.body as any)?.manager_employee_id ?? (r.body as any)?.manager?.["employee-id"];
          const rzMgrId = rzMgrRaw != null && Number.isFinite(Number(rzMgrRaw)) ? Number(rzMgrRaw) : null;
          await svc.from("hr_razorpay_employee_map").update({
            last_pull_snapshot: r.body,
            last_pulled_at: new Date().toISOString(),
            last_payload_hash: hash,
            razorpay_manager_employee_id: rzMgrId,
          }).eq("razorpay_employee_id", m.razorpay_employee_id);

          let diff: any = null;
          let obDiff: any = null;
          diff = await projectSnapshotIntoErp(svc, m.hr_employee_id, r.body);
          obDiff = await projectSnapshotIntoOnboarding(svc, m.hr_employee_id, r.body);
          const wroteCount = diff.hr_employees.wrote.length + diff.work_info.wrote.length + diff.bank.wrote.length + (obDiff?.wrote?.length ?? 0);
          if (wroteCount) wroteAny++;
          const unchanged = false;

          await logSync(svc, {
            action: "pull_person",
            http_status: r.status,
            razorpay_employee_id: String(eid),
            hr_employee_id: m.hr_employee_id,
            field_diff_summary: {
              unchanged,
              wrote: diff ? {
                hr_employees: diff.hr_employees.wrote,
                work_info: diff.work_info.wrote,
                bank: diff.bank.wrote,
                onboarding: obDiff?.wrote ?? [],
              } : null,
              conflicts: diff ? {
                hr_employees: diff.hr_employees.conflicts,
                work_info: diff.work_info.conflicts,
                bank: diff.bank.conflicts,
                onboarding: obDiff?.conflicts ?? [],
              } : null,
              field_names: fieldNames(r.body),
            },
            actor_user_id: authed.userId,
          });

          pulled++;
          rows.push({
            razorpay_employee_id: m.razorpay_employee_id,
            status: unchanged ? "unchanged" : "projected",
            wrote: diff ? {
              hr_employees: diff.hr_employees.wrote.length,
              work_info: diff.work_info.wrote.length,
              bank: diff.bank.wrote.length,
              onboarding: obDiff?.wrote?.length ?? 0,
            } : null,
            conflicts: diff ? diff.hr_employees.conflicts.length + diff.work_info.conflicts.length + diff.bank.conflicts.length + (obDiff?.conflicts?.length ?? 0) : 0,
          });
        } catch (rowErr: any) {
          errored++;
          const msg = String(rowErr?.message ?? rowErr);
          rows.push({ razorpay_employee_id: m.razorpay_employee_id, status: "error", error: msg });
          await logSync(svc, {
            action: "pull_person", http_status: 500,
            razorpay_employee_id: String(eid),
            hr_employee_id: m.hr_employee_id,
            error_text: msg,
            actor_user_id: authed.userId,
          }).catch(() => {});
        }
      }

      return json(200, {
        ok: true,
        summary: { total: (maps || []).length, pulled, projected_writes: wroteAny, missed, errored, skipped },
        rows,
      });
    }

    // ---------- PHASE 3 — Employee-master PUSH (people:update) ----------
    // Build a conservative payload from the current ERP row, diff against the
    // last pull snapshot cached on hr_razorpay_employee_map, and (optionally)
    // POST people:update. Pilot-one gate: bulk push requires push_pilot_verified
    // on settings AND explicit unlock_bulk_push.
    //
    // Fields whitelisted for push (identity/metadata only — bank/PAN handled in
    // Phase 4 with an isolated flow):
    //   name, phone_number, email, gender, date-of-birth,
    //   department, title, date-of-joining, employee_type
    if (
      action === "push_person_dry_run" ||
      action === "push_person_apply_one" ||
      action === "push_person_apply_bulk"
    ) {
      const settingsRow = await readSettings(svc);
      const only: string[] | null = Array.isArray(payload?.razorpay_employee_ids) && payload.razorpay_employee_ids.length
        ? payload.razorpay_employee_ids.map((v: any) => String(v))
        : (payload?.razorpay_employee_id ? [String(payload.razorpay_employee_id)] : null);

      if (action === "push_person_apply_bulk") {
        if (!settingsRow?.push_pilot_verified_at) {
          return json(400, { error: "Push pilot not yet verified. Run push_person_apply_one on one employee first." });
        }
        if (!settingsRow?.bulk_push_unlocked) {
          return json(400, { error: "Bulk push locked. Call action:unlock_bulk_push after reviewing the pilot log." });
        }
      }
      if (action === "push_person_apply_one" && (!only || only.length !== 1)) {
        return json(400, { error: "push_person_apply_one requires exactly one razorpay_employee_id" });
      }

      // Load mappings + latest snapshot.
      let query = svc.from("hr_razorpay_employee_map")
        .select("razorpay_employee_id,hr_employee_id,last_pull_snapshot,is_pilot_verified");
      if (only) query = query.in("razorpay_employee_id", only);
      const { data: maps, error: mapsErr } = await query;
      if (mapsErr) return json(500, { error: `map read failed: ${mapsErr.message}` });
      if (!maps?.length) return json(400, { error: "No mappings resolved for the requested id(s)" });

      // Collect ERP snapshots in bulk.
      const hrIds = maps.map((m: any) => m.hr_employee_id).filter(Boolean);
      const [{ data: emps }, { data: wis }] = await Promise.all([
        svc.from("hr_employees")
          .select("id,first_name,last_name,email,phone,gender,dob")
          .in("id", hrIds),
        svc.from("hr_employee_work_info")
          .select("employee_id,department_id,job_role,joining_date,employee_type")
          .in("employee_id", hrIds),
      ]);
      const empById = new Map((emps || []).map((r: any) => [r.id, r]));
      const wiById = new Map((wis || []).map((r: any) => [r.employee_id, r]));
      const deptIds = Array.from(new Set((wis || []).map((r: any) => r.department_id).filter(Boolean)));
      const deptById = new Map<string, string>();
      if (deptIds.length) {
        const { data: depts } = await svc.from("departments").select("id,name").in("id", deptIds);
        for (const d of depts || []) deptById.set(d.id, d.name);
      }

      function buildIncoming(hrId: string): Record<string, any> {
        const e: any = empById.get(hrId) || {};
        const w: any = wiById.get(hrId) || {};
        const full = [e.first_name, e.last_name].filter(Boolean).join(" ").trim();
        const dobIso = e.dob ? String(e.dob) : null;
        // Razorpay accepts dd/mm/yyyy for date-of-birth on people:update.
        const dobRp = dobIso && /^\d{4}-\d{2}-\d{2}$/.test(dobIso)
          ? `${dobIso.slice(8, 10)}/${dobIso.slice(5, 7)}/${dobIso.slice(0, 4)}` : null;
        const joinIso = w.joining_date ? String(w.joining_date) : null;
        const joinRp = joinIso && /^\d{4}-\d{2}-\d{2}$/.test(joinIso)
          ? `${joinIso.slice(8, 10)}/${joinIso.slice(5, 7)}/${joinIso.slice(0, 4)}` : null;
        return {
          name: full || null,
          phone_number: normPhone(e.phone),
          email: e.email ? String(e.email).trim().toLowerCase() : null,
          gender: e.gender ? String(e.gender).toLowerCase() : null,
          "date-of-birth": dobRp,
          department: deptById.get(w.department_id) || null,
          title: w.job_role || null,
          "date-of-joining": joinRp,
          employee_type: w.employee_type || null,
        };
      }

      // Diff incoming vs last snapshot; only include keys where the value
      // actually differs (case/whitespace normalised).
      function diffPayload(incoming: Record<string, any>, snap: any): { patch: Record<string, any>; changed: string[]; conflicts: string[] } {
        const patch: Record<string, any> = {};
        const changed: string[] = [];
        const conflicts: string[] = [];
        const s = snap && typeof snap === "object" ? snap : {};
        for (const [k, v] of Object.entries(incoming)) {
          if (v === null || v === undefined || v === "") continue;
          const cur = s?.[k];
          const curStr = cur === null || cur === undefined ? "" : String(cur).trim();
          const nextStr = String(v).trim();
          if (curStr === nextStr) continue;
          patch[k] = v;
          changed.push(k);
          if (curStr) conflicts.push(k);
        }
        return { patch, changed, conflicts };
      }

      const rows: any[] = [];
      let planned = 0, unchanged = 0, pushed = 0, failed = 0, skipped = 0;

      let noBaseline = 0;
      for (const m of maps) {
        const eid = Number(m.razorpay_employee_id);
        if (!Number.isFinite(eid) || eid < 1 || !m.hr_employee_id) { skipped++; continue; }
        const hasBaseline = !!m.last_pull_snapshot && typeof m.last_pull_snapshot === "object";
        const incoming = buildIncoming(m.hr_employee_id);
        const diff = diffPayload(incoming, m.last_pull_snapshot);
        if (!diff.changed.length) {
          unchanged++;
          rows.push({ razorpay_employee_id: m.razorpay_employee_id, status: "unchanged", changed: [] });
          continue;
        }
        planned++;
        if (action === "push_person_dry_run") {
          rows.push({
            razorpay_employee_id: m.razorpay_employee_id,
            hr_employee_id: m.hr_employee_id,
            status: hasBaseline ? "planned" : "no_baseline",
            baseline_missing: !hasBaseline,
            changed: diff.changed,
            conflicts: diff.conflicts,
            payload_field_names: Object.keys(diff.patch).sort(),
          });
          if (!hasBaseline) noBaseline++;
          continue;
        }
        // Live push guard: refuse to write against a null baseline — force deep-pull first.
        if (!hasBaseline) {
          noBaseline++;
          skipped++;
          rows.push({
            razorpay_employee_id: m.razorpay_employee_id,
            status: "skipped_no_baseline",
            error: "last_pull_snapshot is null — run Phase 1 deep-pull before pushing.",
          });
          continue;
        }

        // Live push
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 20000);
        let httpStatus = 0; let ok = false; let errText: string | null = null;
        try {
          const res = await fetch(`${BASE}/people`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
              auth: authBlock(),
              request: { type: "people", "sub-type": "edit" },
              data: { "employee-id": eid, "employee-type": "employee", ...diff.patch },
            }),
            signal: ctrl.signal,
          });
          httpStatus = res.status;
          const raw = await res.text();
          let body: any = null; try { body = JSON.parse(raw); } catch { /* ignore */ }
          const rpErr = body && typeof body === "object" ? (body.error || body.message || null) : null;
          ok = res.ok && !rpErr;
          if (!ok) errText = rpErr || raw?.slice(0, 400) || `HTTP ${res.status}`;
        } catch (e) {
          errText = `NETWORK: ${(e as Error).message}`;
        } finally { clearTimeout(t); }

        await logSync(svc, {
          action: "push_person",
          http_status: httpStatus,
          razorpay_employee_id: String(eid),
          hr_employee_id: m.hr_employee_id,
          field_diff_summary: { changed: diff.changed, conflicts: diff.conflicts, payload_field_names: Object.keys(diff.patch).sort() },
          error_text: ok ? null : errText,
          actor_user_id: authed.userId,
        });

        if (ok) {
          pushed++;
          // If this is pilot-apply and pilot not verified yet, stamp it.
          if (action === "push_person_apply_one" && !settingsRow?.push_pilot_verified_at) {
            await svc.from("hr_razorpay_settings").update({
              push_pilot_verified_at: new Date().toISOString(),
              push_pilot_hr_employee_id: m.hr_employee_id,
              last_push_at: new Date().toISOString(),
            }).eq("is_singleton", true);
          } else {
            await svc.from("hr_razorpay_settings").update({ last_push_at: new Date().toISOString() }).eq("is_singleton", true);
          }
          rows.push({ razorpay_employee_id: m.razorpay_employee_id, status: "pushed", changed: diff.changed });
        } else {
          failed++;
          rows.push({ razorpay_employee_id: m.razorpay_employee_id, status: "failed", changed: diff.changed, error: errText });
        }
      }

      return json(200, {
        ok: true,
        summary: { total: maps.length, planned, unchanged, pushed, failed, skipped, no_baseline: noBaseline },
        rows,
        pilot: {
          verified_at: settingsRow?.push_pilot_verified_at || null,
          bulk_unlocked: !!settingsRow?.bulk_push_unlocked,
        },
      });
    }

    // ---------- Phase 4: Bank & PAN push ----------
    // Isolated behind its own toggle + pilot + bulk unlock. Uses the verified
    // people:update envelope with hyphenated keys. Every candidate is validated
    // server-side (PAN + IFSC + account) before it can be pushed, and every push
    // requires last_pull_snapshot as a baseline (see Phase 3 no-baseline guard).
    if (
      action === "push_bank_dry_run" ||
      action === "push_bank_apply_one" ||
      action === "push_bank_apply_bulk"
    ) {
      const only: string[] | null = Array.isArray(payload?.razorpay_employee_ids) && payload.razorpay_employee_ids.length
        ? payload.razorpay_employee_ids.map((v: any) => String(v))
        : (payload?.razorpay_employee_id ? [String(payload.razorpay_employee_id)] : null);

      if (action === "push_bank_apply_bulk") {
        if (!settingsRow?.push_bank_pilot_verified_at) {
          return json(400, { error: "Bank push pilot not yet verified. Run push_bank_apply_one on one employee first." });
        }
        if (!settingsRow?.bulk_bank_push_unlocked) {
          return json(400, { error: "Bulk bank push is locked. Unlock explicitly after reviewing the dry-run." });
        }
      }
      if (action === "push_bank_apply_one" && (!only || only.length !== 1)) {
        return json(400, { error: "push_bank_apply_one requires exactly one razorpay_employee_id" });
      }

      let query = svc.from("hr_razorpay_employee_map")
        .select("razorpay_employee_id,hr_employee_id,last_pull_snapshot");
      if (only) query = query.in("razorpay_employee_id", only);
      const { data: maps, error: mapsErr } = await query;
      if (mapsErr) return json(500, { error: mapsErr.message });
      if (!maps?.length) return json(400, { error: "No mapped rows for the requested ids." });

      const hrIds = maps.map((m: any) => m.hr_employee_id).filter(Boolean);
      const [emps, bds] = await Promise.all([
        svc.from("hr_employees").select("id,first_name,last_name,pan_number").in("id", hrIds),
        svc.from("hr_employee_bank_details").select("employee_id,account_number,ifsc_code,bank_name").in("employee_id", hrIds),
      ]);
      const empById = new Map((emps.data || []).map((r: any) => [r.id, r]));
      const bdById = new Map((bds.data || []).map((r: any) => [r.employee_id, r]));

      function buildBankPatch(hrId: string): { patch: Record<string, any>; holderName: string } {
        const e = empById.get(hrId) || {};
        const b = bdById.get(hrId) || {};
        const holderName = [e.first_name, e.last_name].filter(Boolean).join(" ").trim();
        return {
          patch: {
            "pan": e.pan_number || null,
            "bank-account-number": b.account_number || null,
            "bank-ifsc": b.ifsc_code || null,
            "bank-name": b.bank_name || null,
            "bank-account-holder-name": holderName || null,
          },
          holderName,
        };
      }
      function diffBank(incoming: Record<string, any>, snapshot: any) {
        const changed: string[] = [];
        const patch: Record<string, any> = {};
        for (const k of Object.keys(incoming)) {
          const cur = snapshot?.[k];
          const nxt = incoming[k];
          if (nxt === null || nxt === undefined) continue;
          if (String(cur ?? "").trim() !== String(nxt).trim()) {
            changed.push(k);
            patch[k] = nxt;
          }
        }
        return { changed, patch };
      }
      function mask(v: string | null): string | null {
        if (!v) return v;
        const s = String(v);
        if (s.length <= 4) return "•".repeat(s.length);
        return "•".repeat(Math.max(0, s.length - 4)) + s.slice(-4);
      }

      const rows: any[] = [];
      let planned = 0, unchanged = 0, pushed = 0, failed = 0, skipped = 0, invalid = 0, noBaseline = 0;

      for (const m of maps as any[]) {
        const eid = Number(m.razorpay_employee_id);
        if (!Number.isFinite(eid) || eid < 1 || !m.hr_employee_id) { skipped++; continue; }

        // Server-side validation gate.
        const { data: v } = await svc.rpc("validate_bank_details_row", { _hr_employee_id: m.hr_employee_id });
        const valid = !!(v && (v as any).valid);
        const reasons: string[] = (v as any)?.reasons || [];
        if (!valid) {
          invalid++;
          rows.push({
            razorpay_employee_id: m.razorpay_employee_id,
            status: "invalid",
            reasons,
          });
          continue;
        }

        const hasBaseline = !!m.last_pull_snapshot && typeof m.last_pull_snapshot === "object";
        const { patch: incoming, holderName } = buildBankPatch(m.hr_employee_id);
        const diff = diffBank(incoming, m.last_pull_snapshot);

        if (!diff.changed.length) {
          unchanged++;
          rows.push({ razorpay_employee_id: m.razorpay_employee_id, status: "unchanged", changed: [] });
          continue;
        }
        planned++;

        // Dry-run: return masked preview of the outbound patch (never leak full account numbers).
        if (action === "push_bank_dry_run") {
          const preview: Record<string, any> = { ...diff.patch };
          if (preview["bank-account-number"]) preview["bank-account-number"] = mask(preview["bank-account-number"]);
          if (preview["pan"]) preview["pan"] = mask(preview["pan"]);
          rows.push({
            razorpay_employee_id: m.razorpay_employee_id,
            hr_employee_id: m.hr_employee_id,
            status: hasBaseline ? "planned" : "no_baseline",
            baseline_missing: !hasBaseline,
            holder_name: holderName,
            changed: diff.changed,
            patch_preview: preview,
          });
          if (!hasBaseline) noBaseline++;
          continue;
        }

        // Live push guard: refuse to write against a null baseline.
        if (!hasBaseline) {
          noBaseline++;
          skipped++;
          rows.push({
            razorpay_employee_id: m.razorpay_employee_id,
            status: "skipped_no_baseline",
            error: "last_pull_snapshot is null — run Phase 1 deep-pull before pushing bank details.",
          });
          continue;
        }

        // Live push via the verified people:update envelope.
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 20000);
        let httpStatus = 0; let ok = false; let errText: string | null = null;
        try {
          const res = await fetch(`${BASE}/people`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
              auth: authBlock(),
              request: { type: "people", "sub-type": "edit" },
              data: { "employee-id": eid, "employee-type": "employee", ...diff.patch },
            }),
            signal: ctrl.signal,
          });
          httpStatus = res.status;
          const raw = await res.text();
          let body: any = null; try { body = JSON.parse(raw); } catch { /* ignore */ }
          const rpErr = body && typeof body === "object" ? (body.error || body.message || null) : null;
          ok = res.ok && !rpErr;
          if (!ok) errText = rpErr || raw?.slice(0, 400) || `HTTP ${res.status}`;
        } catch (e) {
          errText = `NETWORK: ${(e as Error).message}`;
        } finally { clearTimeout(t); }

        await logSync(svc, {
          action: "push_bank",
          http_status: httpStatus,
          razorpay_employee_id: String(eid),
          hr_employee_id: m.hr_employee_id,
          // PII-safe: field names only, no values.
          field_diff_summary: { changed: diff.changed, holder_name_present: !!holderName },
          error_text: ok ? null : errText,
          actor_user_id: authed.userId,
        });

        if (ok) {
          pushed++;
          if (action === "push_bank_apply_one" && !settingsRow?.push_bank_pilot_verified_at) {
            await svc.from("hr_razorpay_settings").update({
              push_bank_pilot_verified_at: new Date().toISOString(),
              push_bank_pilot_hr_employee_id: m.hr_employee_id,
              last_bank_push_at: new Date().toISOString(),
            }).eq("is_singleton", true);
          } else {
            await svc.from("hr_razorpay_settings").update({ last_bank_push_at: new Date().toISOString() }).eq("is_singleton", true);
          }
          rows.push({ razorpay_employee_id: m.razorpay_employee_id, status: "pushed", changed: diff.changed });
        } else {
          failed++;
          rows.push({ razorpay_employee_id: m.razorpay_employee_id, status: "failed", changed: diff.changed, error: errText });
        }
      }

      return json(200, {
        ok: true,
        summary: { total: maps.length, planned, unchanged, pushed, failed, skipped, invalid, no_baseline: noBaseline },
        rows,
        pilot: {
          verified_at: settingsRow?.push_bank_pilot_verified_at || null,
          bulk_unlocked: !!settingsRow?.bulk_bank_push_unlocked,
        },
      });
    }

    if (action === "unlock_bulk_bank_push") {
      const s = await readSettings(svc);
      if (!s?.push_bank_pilot_verified_at) return json(400, { error: "Cannot unlock bulk bank push — bank pilot not verified yet." });
      await svc.from("hr_razorpay_settings").update({ bulk_bank_push_unlocked: true }).eq("is_singleton", true);
      return json(200, { ok: true });
    }

    // ---- Statutory enrollment push (PF / ESI / PT toggle per employee) ------------------
    // RazorpayX Payroll's public API does not publish a documented statutory-toggle
    // endpoint. Their dashboard sends the toggles via people:update with the hyphen-cased
    // keys `pf-enabled`, `esi-enabled`, `professional-tax-enabled`. We treat that as an
    // OPERATOR-VERIFIED envelope: writes are BLOCKED until an operator records a Postman/probe
    // verified envelope key via `record_statutory_envelope_verified`. Failure is surfaced
    // via drift alert — we never fabricate a success.
    if (action === "record_statutory_envelope_verified") {
      const key = String(payload?.envelope_key || "").trim();
      const verified = !!payload?.verified;
      if (verified && !key) return json(400, { error: "envelope_key is required when verified=true" });
      const patch: any = {
        push_statutory_endpoint_verified: verified,
        push_statutory_envelope_key: verified ? key : null,
        push_statutory_envelope_verified_at: verified ? new Date().toISOString() : null,
        push_statutory_envelope_verified_by: verified ? authed.userId : null,
      };
      if (!verified || (settingsRow?.push_statutory_envelope_key && settingsRow.push_statutory_envelope_key !== key)) {
        patch.push_statutory_pilot_verified_at = null;
        patch.push_statutory_pilot_hr_employee_id = null;
      }
      const { error } = await svc.from("hr_razorpay_settings").update(patch).eq("is_singleton", true);
      if (error) return json(500, { error: error.message });
      return json(200, { ok: true });
    }

    if (action === "push_statutory_apply_one") {
      const hrEmployeeId = String(payload?.hr_employee_id || "").trim();
      const rpIdStr = payload?.razorpay_employee_id ? String(payload.razorpay_employee_id) : null;
      if (!hrEmployeeId && !rpIdStr) {
        return json(400, { error: "hr_employee_id or razorpay_employee_id is required" });
      }
      if (!settingsRow?.push_statutory_endpoint_verified || !settingsRow?.push_statutory_envelope_key) {
        return json(400, {
          error: "Statutory write path is disabled — verify the Razorpay statutory envelope via probe first, then record it.",
          code: "STATUTORY_ENVELOPE_UNVERIFIED",
        });
      }

      // Resolve the map row
      let mapQuery = svc.from("hr_razorpay_employee_map")
        .select("hr_employee_id,razorpay_employee_id");
      if (hrEmployeeId) mapQuery = mapQuery.eq("hr_employee_id", hrEmployeeId);
      else mapQuery = mapQuery.eq("razorpay_employee_id", rpIdStr!);
      const { data: mapRow, error: mapErr } = await mapQuery.maybeSingle();
      if (mapErr) return json(500, { error: mapErr.message });
      if (!mapRow) return json(400, { error: "Employee is not mapped to RazorpayX." });

      const { data: emp, error: empErr } = await svc.from("hr_employees")
        .select("id,pf_enabled,esi_enabled,pt_enabled")
        .eq("id", mapRow.hr_employee_id)
        .maybeSingle();
      if (empErr) return json(500, { error: empErr.message });
      if (!emp) return json(400, { error: "Employee not found." });

      // Compliance fallback for null flags: fetch global toggles once.
      const globalPfOn = settingsRow?.compliance_files_pf ?? true;
      const globalEsiOn = settingsRow?.compliance_files_esi ?? true;
      const globalPtOn = settingsRow?.compliance_files_pt ?? true;
      const pfEnabled = emp.pf_enabled ?? globalPfOn;
      const esiEnabled = emp.esi_enabled ?? globalEsiOn;
      const ptEnabled = emp.pt_enabled ?? globalPtOn;

      const eid = Number(mapRow.razorpay_employee_id);
      if (!Number.isFinite(eid) || eid < 1) return json(400, { error: "Invalid razorpay_employee_id." });

      const envelopeKey = String(settingsRow.push_statutory_envelope_key);
      let [type, subType] = envelopeKey.split(":");
      if (!type) type = "people";
      if (!subType) subType = "edit";

      const statutoryPayload = {
        "pf-enabled": pfEnabled,
        "esi-enabled": esiEnabled,
        "professional-tax-enabled": ptEnabled,
      };

      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 20000);
      let httpStatus = 0; let ok = false; let errText: string | null = null; let responseBody: any = null;
      try {
        const res = await fetch(`${BASE}/${type}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            auth: authBlock(),
            request: { type, "sub-type": subType },
            data: { "employee-id": eid, "employee-type": "employee", ...statutoryPayload },
          }),
          signal: ctrl.signal,
        });
        httpStatus = res.status;
        const raw = await res.text();
        try { responseBody = JSON.parse(raw); } catch { responseBody = raw; }
        const rpErr = responseBody && typeof responseBody === "object" ? (responseBody.error || responseBody.message || null) : null;
        ok = res.ok && !rpErr;
        if (!ok) errText = rpErr || (typeof responseBody === "string" ? responseBody.slice(0, 400) : `HTTP ${res.status}`);
      } catch (e) {
        errText = `NETWORK: ${(e as Error).message}`;
      } finally { clearTimeout(t); }

      await logSync(svc, {
        action: "push_statutory",
        http_status: httpStatus,
        razorpay_employee_id: String(eid),
        hr_employee_id: mapRow.hr_employee_id,
        field_diff_summary: { pf: pfEnabled, esi: esiEnabled, pt: ptEnabled },
        error_text: ok ? null : errText,
        actor_user_id: authed.userId,
      });

      if (ok) {
        const patch: any = { last_statutory_push_at: new Date().toISOString() };
        if (!settingsRow?.push_statutory_pilot_verified_at) {
          patch.push_statutory_pilot_verified_at = new Date().toISOString();
          patch.push_statutory_pilot_hr_employee_id = mapRow.hr_employee_id;
        }
        await svc.from("hr_razorpay_settings").update(patch).eq("is_singleton", true);
        return json(200, { ok: true, pushed: { pf: pfEnabled, esi: esiEnabled, pt: ptEnabled }, response: responseBody });
      }
      return json(200, { ok: false, error: errText, http_status: httpStatus, response: responseBody });
    }

    // ---- Phase 5: Salary structure sync ---------------------------------------------------

    // Discovery-first: writes are BLOCKED until the operator records a verified salary
    // envelope (Postman probe result). Dry-run works without verification so an operator
    // can review the ERP-derived structure vs Razorpay's last-known snapshot before
    // deciding whether to enable the write path.
    if (action === "record_salary_envelope_verified") {
      const key = String(payload?.envelope_key || "").trim();
      const verified = !!payload?.verified;
      if (verified && !key) return json(400, { error: "envelope_key is required when verified=true" });
      const patch: any = {
        push_salary_endpoint_verified: verified,
        push_salary_envelope_key: verified ? key : null,
        push_salary_envelope_verified_at: verified ? new Date().toISOString() : null,
        push_salary_envelope_verified_by: verified ? authed.userId : null,
      };
      // Any change to envelope verification RESETS pilot + bulk gates. This prevents a
      // stale pilot verification (against an old envelope) from re-enabling live pushes.
      if (!verified || (settingsRow?.push_salary_envelope_key && settingsRow.push_salary_envelope_key !== key)) {
        patch.push_salary_pilot_verified_at = null;
        patch.push_salary_pilot_hr_employee_id = null;
        patch.bulk_salary_push_unlocked = false;
      }
      const { error } = await svc.from("hr_razorpay_settings").update(patch).eq("is_singleton", true);
      if (error) return json(500, { error: error.message });
      return json(200, { ok: true });
    }

    if (action === "unlock_bulk_salary_push") {
      const s = await readSettings(svc);
      if (!s?.push_salary_endpoint_verified || !s?.push_salary_envelope_key) {
        return json(400, { error: "Cannot unlock — salary envelope not yet verified. Record a probe-verified envelope first." });
      }
      if (!s?.push_salary_pilot_verified_at) {
        return json(400, { error: "Cannot unlock bulk salary push — salary pilot not verified yet." });
      }
      await svc.from("hr_razorpay_settings").update({ bulk_salary_push_unlocked: true }).eq("is_singleton", true);
      return json(200, { ok: true });
    }

    if (
      action === "push_salary_dry_run" ||
      action === "push_salary_apply_one" ||
      action === "push_salary_apply_bulk"
    ) {
      const isWrite = action !== "push_salary_dry_run";
      const only: string[] | null = Array.isArray(payload?.razorpay_employee_ids) && payload.razorpay_employee_ids.length
        ? payload.razorpay_employee_ids.map((v: any) => String(v))
        : (payload?.razorpay_employee_id ? [String(payload.razorpay_employee_id)] : null);

      if (isWrite) {
        if (!settingsRow?.push_salary_endpoint_verified || !settingsRow?.push_salary_envelope_key) {
          return json(400, { error: "Salary write path is disabled — verify the Razorpay salary envelope via probe first, then record it." });
        }
        if (action === "push_salary_apply_bulk") {
          if (!settingsRow?.push_salary_pilot_verified_at) {
            return json(400, { error: "Salary pilot not yet verified. Run push_salary_apply_one first." });
          }
          if (!settingsRow?.bulk_salary_push_unlocked) {
            return json(400, { error: "Bulk salary push is locked. Unlock explicitly after reviewing the dry-run." });
          }
        }
        if (action === "push_salary_apply_one" && (!only || only.length !== 1)) {
          return json(400, { error: "push_salary_apply_one requires exactly one razorpay_employee_id" });
        }
      }

      let query = svc.from("hr_razorpay_employee_map")
        .select("razorpay_employee_id,hr_employee_id,last_pull_snapshot");
      if (only) query = query.in("razorpay_employee_id", only);
      const { data: maps, error: mapsErr } = await query;
      if (mapsErr) return json(500, { error: mapsErr.message });
      if (!maps?.length) return json(400, { error: "No mapped rows for the requested ids." });

      const hrIds = maps.map((m: any) => m.hr_employee_id).filter(Boolean);
      const [structs, comps] = await Promise.all([
        svc.from("hr_employee_salary_structures")
          .select("employee_id,component_id,amount,is_active")
          .in("employee_id", hrIds)
          .eq("is_active", true),
        svc.from("hr_salary_components").select("id,name,code,component_type,is_taxable"),
      ]);
      const compById = new Map((comps.data || []).map((c: any) => [c.id, c]));
      const byEmp = new Map<string, any[]>();
      for (const s of (structs.data || []) as any[]) {
        const arr = byEmp.get(s.employee_id) || [];
        arr.push(s);
        byEmp.set(s.employee_id, arr);
      }

      // Build normalized ERP salary structure for one employee. This is what we DIFF
      // against the last pulled Razorpay snapshot; the actual outbound envelope is
      // shaped only after the operator supplies a verified envelope key.
      function buildErpSalary(hrId: string) {
        const rows = byEmp.get(hrId) || [];
        const components = rows.map((r) => {
          const c = compById.get(r.component_id) || {};
          return {
            code: c.code || null,
            name: c.name || "Unknown",
            type: c.component_type || null,
            amount: Number(r.amount || 0),
          };
        }).sort((a, b) => (a.code || "").localeCompare(b.code || ""));
        const total = components.reduce((s, c) => s + (Number.isFinite(c.amount) ? c.amount : 0), 0);
        return { total, components };
      }

      function normalizeSnapshot(snap: any) {
        // Razorpay's people snapshot may expose salary under different keys depending
        // on tenant. We look at common shapes and expose whatever we find so the
        // operator can eyeball the diff without us guessing.
        if (!snap || typeof snap !== "object") return null;
        const s = snap.salary ?? snap["salary-structure"] ?? snap["salary_structure"] ?? null;
        if (!s) return null;
        return s;
      }

      const rows: any[] = [];
      let planned = 0, unchanged = 0, pushed = 0, failed = 0, skipped = 0, noBaseline = 0;

      for (const m of maps as any[]) {
        const eid = Number(m.razorpay_employee_id);
        if (!Number.isFinite(eid) || eid < 1 || !m.hr_employee_id) { skipped++; continue; }

        const erp = buildErpSalary(m.hr_employee_id);
        const hasBaseline = !!m.last_pull_snapshot && typeof m.last_pull_snapshot === "object";
        const rpSalary = normalizeSnapshot(m.last_pull_snapshot);

        if (!erp.components.length) {
          skipped++;
          rows.push({
            razorpay_employee_id: m.razorpay_employee_id,
            hr_employee_id: m.hr_employee_id,
            status: "no_erp_structure",
            error: "No active salary structure in ERP for this employee.",
          });
          continue;
        }

        // Structural diff: JSON-stringify both sides for a coarse comparison. This is
        // intentionally coarse — a granular per-field diff needs the verified envelope
        // shape which we don't have yet.
        const erpSig = JSON.stringify(erp);
        const rpSig = rpSalary ? JSON.stringify(rpSalary) : null;
        const differs = !rpSig || rpSig !== erpSig;

        if (!differs) {
          unchanged++;
          rows.push({
            razorpay_employee_id: m.razorpay_employee_id,
            hr_employee_id: m.hr_employee_id,
            status: "unchanged",
            erp_total: erp.total,
            components_count: erp.components.length,
          });
          continue;
        }
        planned++;

        if (action === "push_salary_dry_run") {
          rows.push({
            razorpay_employee_id: m.razorpay_employee_id,
            hr_employee_id: m.hr_employee_id,
            status: hasBaseline ? "planned" : "no_baseline",
            baseline_missing: !hasBaseline,
            erp_total: erp.total,
            components_count: erp.components.length,
            erp_components: erp.components,
            razorpay_snapshot: rpSalary,
          });
          if (!hasBaseline) noBaseline++;
          continue;
        }

        if (!hasBaseline) {
          noBaseline++; skipped++;
          rows.push({
            razorpay_employee_id: m.razorpay_employee_id,
            status: "skipped_no_baseline",
            error: "last_pull_snapshot is null — run Phase 1 deep-pull before pushing salary.",
          });
          continue;
        }

        // Live push using the operator-verified envelope key. Body shape follows the
        // hyphenated-keys convention shared with people:update / bank push.
        // Live push using the operator-verified envelope key. Documented endpoint
        // is POST /api/people with sub-type "set-salary" — normalize legacy
        // "salary:update" / "people:update" envelopes to that.
        const envelopeKey = String(settingsRow!.push_salary_envelope_key);
        let [type, subType] = envelopeKey.split(":");
        if (!type || type === "salary") type = "people";
        if (!subType || subType === "update") subType = "set-salary";
        const salaryPayload = {
          "ctc-annual": erp.total,
          components: erp.components.map((c) => ({
            code: c.code, name: c.name, type: c.type, amount: c.amount,
          })),
        };
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 20000);
        let httpStatus = 0; let ok = false; let errText: string | null = null;
        try {
          const res = await fetch(`${BASE}/${type}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
              auth: authBlock(),
              request: { type, "sub-type": subType },
              data: { "employee-id": eid, "employee-type": "employee", salary: salaryPayload },
            }),
            signal: ctrl.signal,
          });
          httpStatus = res.status;
          const raw = await res.text();
          let body: any = null; try { body = JSON.parse(raw); } catch { /* ignore */ }
          const rpErr = body && typeof body === "object" ? (body.error || body.message || null) : null;
          ok = res.ok && !rpErr;
          if (!ok) errText = rpErr || raw?.slice(0, 400) || `HTTP ${res.status}`;
        } catch (e) {
          errText = `NETWORK: ${(e as Error).message}`;
        } finally { clearTimeout(t); }

        await logSync(svc, {
          action: "push_salary",
          http_status: httpStatus,
          razorpay_employee_id: String(eid),
          hr_employee_id: m.hr_employee_id,
          field_diff_summary: { components_count: erp.components.length, erp_total: erp.total },
          error_text: ok ? null : errText,
          actor_user_id: authed.userId,
        });

        if (ok) {
          pushed++;
          if (action === "push_salary_apply_one" && !settingsRow?.push_salary_pilot_verified_at) {
            await svc.from("hr_razorpay_settings").update({
              push_salary_pilot_verified_at: new Date().toISOString(),
              push_salary_pilot_hr_employee_id: m.hr_employee_id,
              last_salary_push_at: new Date().toISOString(),
            }).eq("is_singleton", true);
          } else {
            await svc.from("hr_razorpay_settings").update({ last_salary_push_at: new Date().toISOString() }).eq("is_singleton", true);
          }
          rows.push({
            razorpay_employee_id: m.razorpay_employee_id,
            status: "pushed",
            erp_total: erp.total,
            components_count: erp.components.length,
          });
        } else {
          failed++;
          rows.push({
            razorpay_employee_id: m.razorpay_employee_id,
            status: "failed",
            erp_total: erp.total,
            components_count: erp.components.length,
            error: errText,
          });
        }
      }

      return json(200, {
        ok: true,
        summary: { total: maps.length, planned, unchanged, pushed, failed, skipped, no_baseline: noBaseline },
        rows,
        envelope: {
          verified: !!settingsRow?.push_salary_endpoint_verified,
          key: settingsRow?.push_salary_envelope_key || null,
        },
        pilot: {
          verified_at: settingsRow?.push_salary_pilot_verified_at || null,
          bulk_unlocked: !!settingsRow?.bulk_salary_push_unlocked,
        },
      });
    }

    // ---- push_salary_from_template ----------------------------------------------------------
    // PATH A (structure-swap doctrine). Un-retired 2026-07-19. Owner authorised HRMS to overwrite
    // RazorpayX salary structures via people:set-salary so training → real transitions can be
    // driven automatically at DOJ + training_period_months. Every call must:
    //   1. Have `hr_razorpay_settings.path_a_structure_swap_enabled = true` (explicit doctrine opt-in),
    //   2. Carry a `structure_kind` of "training", "real", or "ad_hoc" for provenance,
    //   3. Log a full audit ledger row regardless of outcome.
    //
    // Payload shape:
    //   { action: "push_salary_from_template", hr_employee_id, template_id, annual_ctc,
    //     structure_kind: "training"|"real"|"ad_hoc",
    //     breakdown: { basic, da, hra, "special-allowance", lta, "employer-pf", "employer-esi",
    //                  "custom-allowances": [...], deductions: [...] } }
    if (action === "push_salary_from_template") {
      if (!settingsRow?.path_a_structure_swap_enabled) {
        return json(403, {
          error: "Path A structure swap is disabled. Enable hr_razorpay_settings.path_a_structure_swap_enabled first (Offer Letter Policy → Path A doctrine).",
        });
      }
      const hrEmployeeId = String(payload?.hr_employee_id || "").trim();
      const templateId = String(payload?.template_id || "").trim();
      const annualCtc = Number(payload?.annual_ctc);
      const breakdown = payload?.breakdown;
      const structureKind = String(payload?.structure_kind || "real").toLowerCase();
      if (!hrEmployeeId) return json(400, { error: "hr_employee_id is required" });
      if (!templateId) return json(400, { error: "template_id is required" });
      if (!Number.isFinite(annualCtc) || annualCtc <= 0) return json(400, { error: "annual_ctc must be a positive number" });
      if (!breakdown || typeof breakdown !== "object") return json(400, { error: "breakdown is required" });
      if (!["training","real","ad_hoc"].includes(structureKind)) {
        return json(400, { error: "structure_kind must be 'training', 'real', or 'ad_hoc'" });
      }


      const { data: mapRow, error: mapErr } = await svc
        .from("hr_razorpay_employee_map")
        .select("hr_employee_id,razorpay_employee_id")
        .eq("hr_employee_id", hrEmployeeId)
        .maybeSingle();
      if (mapErr) return json(500, { error: mapErr.message });
      if (!mapRow) return json(400, { error: "Employee is not mapped to RazorpayX." });
      const rpId = String(mapRow.razorpay_employee_id);

      // Enforce pilot-first: the first live push per envelope must be a single-employee run,
      // which push_salary_from_template inherently is. Nothing to gate beyond envelope verify.
      const envelopeKey = String(settingsRow.push_salary_envelope_key);
      let [type, subType] = envelopeKey.split(":");
      if (!type || type === "salary") type = "people";
      if (!subType || subType === "update") subType = "set-salary";

      const salaryPayload = {
        "ctc-annual": annualCtc,
        "custom-salary-structure": breakdown,
      };

      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 20000);
      let httpStatus = 0; let ok = false; let errText: string | null = null; let responseBody: any = null;
      try {
        const res = await fetch(`${BASE}/${type}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            auth: authBlock(),
            request: { type, "sub-type": subType },
            data: { "employee-id": rpId, "employee-type": "employee", salary: salaryPayload },
          }),
          signal: ctrl.signal,
        });
        httpStatus = res.status;
        const raw = await res.text();
        try { responseBody = JSON.parse(raw); } catch { responseBody = { raw: raw.slice(0, 400) }; }
        const rpErr = responseBody && typeof responseBody === "object" ? (responseBody.error || responseBody.message || null) : null;
        ok = res.ok && !rpErr;
        if (!ok) errText = rpErr || raw?.slice(0, 400) || `HTTP ${res.status}`;
      } catch (e) {
        errText = `NETWORK: ${(e as Error).message}`;
      } finally { clearTimeout(t); }

      await logSync(svc, {
        action: "push_salary_from_template",
        http_status: httpStatus,
        razorpay_employee_id: rpId,
        hr_employee_id: hrEmployeeId,
        field_diff_summary: {
          template_id: templateId,
          annual_ctc: annualCtc,
          structure_kind: structureKind,
          reserved_keys: Object.fromEntries(
            ["basic","da","hra","special-allowance","lta","employer-pf","employer-esi"]
              .map((k) => [k, Number((breakdown as any)[k]) || 0]),
          ),
          custom_allowances_count: Array.isArray(breakdown["custom-allowances"]) ? breakdown["custom-allowances"].length : 0,
          deductions_count: Array.isArray(breakdown.deductions) ? breakdown.deductions.length : 0,
        },
        error_text: errText,
        actor_user_id: authed.userId,
      });

      // Ledger the assignment regardless of outcome — failed attempts are valuable audit trail.
      const rpIdNum = Number(rpId);
      const { data: tmplNameRow } = await svc
        .from("hr_salary_structure_templates")
        .select("name").eq("id", templateId).maybeSingle();
      await svc.from("hr_employee_salary_structure_assignments").insert({
        employee_id: hrEmployeeId,
        template_id: templateId,
        template_name: tmplNameRow?.name ?? null,
        annual_ctc: annualCtc,
        expanded_breakdown: breakdown,
        razorpay_employee_id: Number.isFinite(rpIdNum) ? rpIdNum : null,
        razorpay_ack: responseBody,
        razorpay_status_code: httpStatus || null,
        push_status: ok ? "pushed" : "failed",
        push_error: errText,
        pushed_at: new Date().toISOString(),
        pushed_by: authed.userId,
        structure_kind: structureKind,
      });

      // Stamp lifecycle markers on hr_employee_work_info so the daily scheduler knows what's done.
      if (ok) {
        const stampCol = structureKind === "training" ? "training_structure_pushed_at" : (structureKind === "real" ? "real_structure_pushed_at" : null);
        if (stampCol) {
          await svc.from("hr_employee_work_info")
            .update({ [stampCol]: new Date().toISOString() })
            .eq("employee_id", hrEmployeeId);
        }
      }

      if (!ok) return json(502, { ok: false, error: errText, http_status: httpStatus, response: responseBody });
      return json(200, { ok: true, razorpay_employee_id: rpId, http_status: httpStatus, response: responseBody, structure_kind: structureKind });
    }




    // ---- Phase 6: Monthly attendance / LOP push -------------------------------------------
    // Discovery-first, same pattern as Phase 5. Live pushes are BLOCKED until an operator
    // records a probe-verified attendance envelope (e.g. `attendance:update` or
    // `people:attendance-update` — the correct sub-type has to come from Postman verification
    // against the Live tenant, not a guess). Dry-run computes an ERP-truth LOP breakdown per
    // employee for a given YYYY-MM period so the operator can eyeball it before enabling
    // the write path.
    if (action === "record_attendance_envelope_verified") {
      const key = String(payload?.envelope_key || "").trim();
      const verified = !!payload?.verified;
      if (verified && !key) return json(400, { error: "envelope_key is required when verified=true" });
      const patch: any = {
        push_attendance_endpoint_verified: verified,
        push_attendance_envelope_key: verified ? key : null,
        push_attendance_envelope_verified_at: verified ? new Date().toISOString() : null,
        push_attendance_envelope_verified_by: verified ? authed.userId : null,
      };
      if (!verified || (settingsRow?.push_attendance_envelope_key && settingsRow.push_attendance_envelope_key !== key)) {
        patch.push_attendance_pilot_verified_at = null;
        patch.push_attendance_pilot_hr_employee_id = null;
        patch.push_attendance_pilot_period = null;
        patch.bulk_attendance_push_unlocked = false;
      }
      const { error } = await svc.from("hr_razorpay_settings").update(patch).eq("is_singleton", true);
      if (error) return json(500, { error: error.message });
      return json(200, { ok: true });
    }

    // Auto-verify Step E (salary) + Step F (attendance) envelopes using the
    // Postman-verified constants. HR-facing simplification: they should never
    // have to type an API name. Gated on credentials being validated first so
    // we don't stamp against an unreachable tenant.
    if (action === "auto_verify_step_envelopes") {
      const s = settingsRow ?? {};
      if (!s.last_creds_validated_at) {
        return json(400, { error: "Validate the RazorpayX connection first (Step A)." });
      }
      const SALARY_KEY = "people:set-salary";
      const ATTENDANCE_KEY = "attendance:modify";
      const nowIso = new Date().toISOString();
      const patch: any = {};
      const verified: string[] = [];

      if (!s.push_salary_endpoint_verified || s.push_salary_envelope_key !== SALARY_KEY) {
        patch.push_salary_endpoint_verified = true;
        patch.push_salary_envelope_key = SALARY_KEY;
        patch.push_salary_envelope_verified_at = nowIso;
        patch.push_salary_envelope_verified_by = authed.userId;
        // If a different key was previously stored, reset pilot gates.
        if (s.push_salary_envelope_key && s.push_salary_envelope_key !== SALARY_KEY) {
          patch.push_salary_pilot_verified_at = null;
          patch.push_salary_pilot_hr_employee_id = null;
          patch.bulk_salary_push_unlocked = false;
        }
        verified.push("salary");
      }

      if (!s.push_attendance_endpoint_verified || s.push_attendance_envelope_key !== ATTENDANCE_KEY) {
        patch.push_attendance_endpoint_verified = true;
        patch.push_attendance_envelope_key = ATTENDANCE_KEY;
        patch.push_attendance_envelope_verified_at = nowIso;
        patch.push_attendance_envelope_verified_by = authed.userId;
        if (s.push_attendance_envelope_key && s.push_attendance_envelope_key !== ATTENDANCE_KEY) {
          patch.push_attendance_pilot_verified_at = null;
          patch.push_attendance_pilot_hr_employee_id = null;
          patch.push_attendance_pilot_period = null;
          patch.bulk_attendance_push_unlocked = false;
        }
        verified.push("attendance");
      }

      if (Object.keys(patch).length > 0) {
        const { error } = await svc.from("hr_razorpay_settings").update(patch).eq("is_singleton", true);
        if (error) return json(500, { error: error.message });
      }
      return json(200, {
        ok: true,
        verified,
        salary_envelope_key: SALARY_KEY,
        attendance_envelope_key: ATTENDANCE_KEY,
      });
    }

    if (action === "unlock_bulk_attendance_push") {
      const s = await readSettings(svc);
      if (!s?.push_attendance_endpoint_verified || !s?.push_attendance_envelope_key) {
        return json(400, { error: "Cannot unlock — attendance envelope not yet verified. Record a probe-verified envelope first." });
      }
      if (!s?.push_attendance_pilot_verified_at) {
        return json(400, { error: "Cannot unlock bulk attendance push — attendance pilot not verified yet." });
      }
      await svc.from("hr_razorpay_settings").update({ bulk_attendance_push_unlocked: true }).eq("is_singleton", true);
      return json(200, { ok: true });
    }

    // Recall: operator-audited override that re-opens a period for re-push. Every recall
    // requires a reason and is logged with the actor; a subsequent push is only allowed
    // when recall_count > successful_push_count for that (employee, period) pair.
    if (action === "recall_attendance_period") {
      const period = String(payload?.period || "").trim();
      const rid = String(payload?.razorpay_employee_id || "").trim();
      const reason = String(payload?.reason || "").trim();
      if (!/^(\d{4})-(\d{2})$/.test(period)) return json(400, { error: "period must be YYYY-MM" });
      if (!rid) return json(400, { error: "razorpay_employee_id required" });
      if (reason.length < 8) return json(400, { error: "reason (min 8 chars) is required for recall" });
      const { data: mrow } = await svc.from("hr_razorpay_employee_map")
        .select("hr_employee_id").eq("razorpay_employee_id", rid).maybeSingle();
      await logSync(svc, {
        action: "push_attendance_recall",
        http_status: 0,
        razorpay_employee_id: rid,
        hr_employee_id: mrow?.hr_employee_id || null,
        field_diff_summary: { period, reason_len: reason.length, recall: true },
        error_text: null,
        actor_user_id: authed.userId,
      });
      return json(200, { ok: true });
    }

    if (
      action === "push_attendance_dry_run" ||
      action === "push_attendance_apply_one" ||
      action === "push_attendance_apply_bulk"
    ) {
      const isWrite = action !== "push_attendance_dry_run";
      const period = String(payload?.period || "").trim(); // YYYY-MM
      const periodMatch = /^(\d{4})-(\d{2})$/.exec(period);
      if (!periodMatch) return json(400, { error: "period is required as YYYY-MM" });
      const year = Number(periodMatch[1]);
      const month = Number(periodMatch[2]);
      const monthStart = new Date(Date.UTC(year, month - 1, 1));
      const monthEnd = new Date(Date.UTC(year, month, 0)); // last day
      const daysInMonth = monthEnd.getUTCDate();
      const monthStartISO = monthStart.toISOString().slice(0, 10);
      const monthEndISO = monthEnd.toISOString().slice(0, 10);

      const only: string[] | null = Array.isArray(payload?.razorpay_employee_ids) && payload.razorpay_employee_ids.length
        ? payload.razorpay_employee_ids.map((v: any) => String(v))
        : (payload?.razorpay_employee_id ? [String(payload.razorpay_employee_id)] : null);

      if (isWrite) {
        if (!settingsRow?.push_attendance_endpoint_verified || !settingsRow?.push_attendance_envelope_key) {
          return json(400, { error: "Attendance write path is disabled — verify the Razorpay attendance envelope via probe first, then record it." });
        }
        if (action === "push_attendance_apply_bulk") {
          if (!settingsRow?.push_attendance_pilot_verified_at) {
            return json(400, { error: "Attendance pilot not yet verified. Run push_attendance_apply_one first." });
          }
          if (!settingsRow?.bulk_attendance_push_unlocked) {
            return json(400, { error: "Bulk attendance push is locked. Unlock explicitly after reviewing the dry-run." });
          }
        }
        if (action === "push_attendance_apply_one" && (!only || only.length !== 1)) {
          return json(400, { error: "push_attendance_apply_one requires exactly one razorpay_employee_id" });
        }
      }

      let query = svc.from("hr_razorpay_employee_map")
        .select("razorpay_employee_id,hr_employee_id");
      if (only) query = query.in("razorpay_employee_id", only);
      const { data: maps, error: mapsErr } = await query;
      if (mapsErr) return json(500, { error: mapsErr.message });
      if (!maps?.length) return json(400, { error: "No mapped rows for the requested ids." });

      const hrIds = maps.map((m: any) => m.hr_employee_id).filter(Boolean);

      // Load attendance daily rows, leave requests overlapping the month, leave types,
      // holidays (in-month + recurring across years), weekly-off patterns, and
      // per-employee weekly-off overrides. All are ERP-truth; we do not read any
      // Razorpay-side attendance.
      const [attRes, leaveRes, ltRes, holInMonthRes, holRecurRes, patRes, empOffRes] = await Promise.all([
        svc.from("hr_attendance_daily")
          .select("employee_id,attendance_date,total_hours,status")
          .in("employee_id", hrIds)
          .gte("attendance_date", monthStartISO)
          .lte("attendance_date", monthEndISO),
        svc.from("hr_leave_requests")
          .select("employee_id,start_date,end_date,total_days,status,leave_type_id,is_half_day")
          .in("employee_id", hrIds)
          .in("status", ["approved", "APPROVED"])
          .lte("start_date", monthEndISO)
          .gte("end_date", monthStartISO),
        svc.from("hr_leave_types").select("id,is_paid,name"),
        svc.from("hr_holidays").select("date,name,is_active,recurring").eq("is_active", true)
          .gte("date", monthStartISO).lte("date", monthEndISO),
        svc.from("hr_holidays").select("date,name,is_active,recurring").eq("is_active", true).eq("recurring", true),
        svc.from("hr_weekly_off_patterns").select("id,name,weekly_offs,is_active").eq("is_active", true),
        svc.from("hr_employee_weekly_off").select("employee_id,pattern_id,effective_from,is_current")
          .in("employee_id", hrIds).eq("is_current", true).lte("effective_from", monthEndISO),
      ]);
      if (attRes.error) return json(500, { error: attRes.error.message });
      if (leaveRes.error) return json(500, { error: leaveRes.error.message });
      if (ltRes.error) return json(500, { error: ltRes.error.message });
      if (holInMonthRes.error) return json(500, { error: holInMonthRes.error.message });
      if (holRecurRes.error) return json(500, { error: holRecurRes.error.message });
      if (patRes.error) return json(500, { error: patRes.error.message });
      if (empOffRes.error) return json(500, { error: empOffRes.error.message });

      const ltMap = new Map((ltRes.data || []).map((l: any) => [l.id, l]));
      // Holidays: in-month rows + recurring rows whose month-day falls in this month.
      const holidayDates = new Set<string>();
      const holidayNames = new Map<string, string>();
      for (const h of (holInMonthRes.data || []) as any[]) {
        holidayDates.add(h.date);
        holidayNames.set(h.date, h.name);
      }
      for (const h of (holRecurRes.data || []) as any[]) {
        if (!h.date) continue;
        const md = String(h.date).slice(5); // MM-DD
        const iso = `${year}-${md}`;
        // Ensure the recurring date is actually in this month
        if (iso >= monthStartISO && iso <= monthEndISO) {
          holidayDates.add(iso);
          if (!holidayNames.has(iso)) holidayNames.set(iso, h.name);
        }
      }

      // Pattern lookup. Default = Sunday-only off ([0]) if no active patterns exist.
      const patternMap = new Map<string, number[]>();
      let defaultPattern: number[] = [0];
      for (const p of (patRes.data || []) as any[]) {
        const arr = Array.isArray(p.weekly_offs) ? p.weekly_offs.map((n: any) => Number(n)).filter((n: number) => n >= 0 && n <= 6) : [];
        patternMap.set(p.id, arr);
        // First active pattern becomes the tenant default when no per-employee override exists.
        if (defaultPattern.length === 1 && defaultPattern[0] === 0 && arr.length) defaultPattern = arr;
      }
      const empPatternMap = new Map<string, number[]>();
      for (const r of (empOffRes.data || []) as any[]) {
        const arr = patternMap.get(r.pattern_id);
        if (arr && arr.length) empPatternMap.set(r.employee_id, arr);
      }

      const attByEmp = new Map<string, Set<string>>();
      for (const r of (attRes.data || []) as any[]) {
        const s = attByEmp.get(r.employee_id) || new Set<string>();
        const present = (r.total_hours && r.total_hours > 0) || (r.status && String(r.status).toLowerCase() === "present");
        if (present) s.add(r.attendance_date);
        attByEmp.set(r.employee_id, s);
      }

      // Per-employee working-day + leave computation via the shared SQL function
      // `hr_compute_lop_days` — same function feeds the shadow payroll engine, so
      // the drift ledger compares apples-to-apples. Local weekly-off/holiday scans
      // above still power tenant advisories + the attByEmp present-day set below.
      const workingDaysByEmp = new Map<string, number>();
      const paidByEmp = new Map<string, number>();
      const unpaidByEmp = new Map<string, number>();
      const incompleteHeldByEmp = new Map<string, number>();
      const lopDaysByEmp = new Map<string, number>();
      const configErrorsByEmp = new Map<string, string[]>();

      const { data: lopRows, error: lopRpcErr } = await svc.rpc("hr_compute_lop_days", {
        p_employee_ids: hrIds,
        p_period_month: monthStartISO,
      });
      if (lopRpcErr) return json(500, { error: `hr_compute_lop_days: ${lopRpcErr.message}` });
      for (const r of (lopRows || []) as any[]) {
        workingDaysByEmp.set(r.employee_id, Number(r.working_days ?? 0));
        paidByEmp.set(r.employee_id, Number(r.paid_leave_days ?? 0));
        unpaidByEmp.set(r.employee_id, Number(r.unpaid_leave_days ?? 0));
        incompleteHeldByEmp.set(r.employee_id, Number(r.incomplete_unresolved_days ?? 0));
        lopDaysByEmp.set(r.employee_id, Number(r.lop_days ?? 0));
        if (Array.isArray(r.config_errors) && r.config_errors.length) {
          configErrorsByEmp.set(r.employee_id, r.config_errors);
        }
      }


      // Tenant-level advisory flags surfaced in the summary so an operator can spot silent
      // config drift (0 holidays, no explicit weekly-off pattern, etc.) at a glance.
      const tenantWarnings: string[] = [];
      if (holidayDates.size === 0) {
        tenantWarnings.push(`No holidays configured for ${period}. LOP will treat every non-weekly-off day as a working day — verify hr_holidays before applying.`);
      }
      if (!empOffRes.data?.length && (!patRes.data?.length)) {
        tenantWarnings.push("No weekly-off patterns configured. Defaulting to Sunday-only off for every employee.");
      } else if (!empOffRes.data?.length) {
        tenantWarnings.push(`No per-employee weekly-off overrides — using tenant default pattern [${defaultPattern.join(",")}] (0=Sun … 6=Sat) for everyone.`);
      }

      const rows: any[] = [];
      let planned = 0, pushed = 0, failed = 0, skipped = 0;
      const pushedLocks = new Map<string, number>();
      if (isWrite) {
        const { data: lockRows, error: lockErr } = await svc
          .from("hr_razorpay_sync_log")
          .select("razorpay_employee_id,action,field_diff_summary,error_text")
          .in("action", ["push_attendance", "push_attendance_recall"])
          .in("razorpay_employee_id", maps.map((m: any) => String(m.razorpay_employee_id)))
          .contains("field_diff_summary", { period });
        if (lockErr) return json(500, { error: `attendance lock check failed: ${lockErr.message}` });
        for (const row of (lockRows || []) as any[]) {
          const rid = String(row.razorpay_employee_id || "");
          if (!rid) continue;
          const delta = row.action === "push_attendance_recall" ? -1 : (!row.error_text ? 1 : 0);
          if (delta) pushedLocks.set(rid, (pushedLocks.get(rid) || 0) + delta);
        }
      }

      for (const m of maps as any[]) {
        const eid = Number(m.razorpay_employee_id);
        if (!Number.isFinite(eid) || eid < 1 || !m.hr_employee_id) { skipped++; continue; }
        const workingDays = workingDaysByEmp.get(m.hr_employee_id) || 0;
        const presentDays = (attByEmp.get(m.hr_employee_id) || new Set()).size;
        const paidLeave = Math.round(((paidByEmp.get(m.hr_employee_id) || 0)) * 2) / 2;
        const unpaidLeave = Math.round(((unpaidByEmp.get(m.hr_employee_id) || 0)) * 2) / 2;
        const cfgErrs = configErrorsByEmp.get(m.hr_employee_id) || [];
        // LOP = working days the employee neither showed up nor took paid leave for.
        // Includes unpaid approved leave and unexplained absences.
        // Cap attended+paid at workingDays so a half-day-paid-leave overlapping a punched
        // day cannot silently over-credit (present=1 + half-day=0.5 → 1.5 > working_day).
        const rawAttendedOrPaid = presentDays + paidLeave;
        const attendedOrPaid = Math.min(rawAttendedOrPaid, workingDays);
        const lopDays = Math.max(0, workingDays - attendedOrPaid);
        const unpaidCovered = Math.min(unpaidLeave, lopDays);
        const empPatternUsed = empPatternMap.get(m.hr_employee_id) || defaultPattern;
        const overCreditWarning = rawAttendedOrPaid > workingDays
          ? ` (capped from ${rawAttendedOrPaid} — overlap between attendance and half-day paid leave detected)`
          : "";
        const formula = `LOP = WD ${workingDays} − (present ${presentDays} + paid_leave ${paidLeave}) = ${lopDays}${overCreditWarning}`;

        const payload = {
          period,
          working_days: workingDays,
          present_days: presentDays,
          paid_leave_days: paidLeave,
          unpaid_leave_days: unpaidLeave,
          lop_days: lopDays,
          unpaid_matches_lop: Math.abs(unpaidCovered - unpaidLeave) < 0.01,
          formula,
          weekly_off_days: empPatternUsed,
          weekly_off_source: empPatternMap.has(m.hr_employee_id) ? "per_employee" : (patRes.data?.length ? "tenant_default_pattern" : "hardcoded_sunday"),
          holidays_in_month: holidayDates.size,
          config_errors: cfgErrs,
        };

        // Loud, non-silent guard: any leave type this employee touched had a NULL
        // is_paid setting. Block the row rather than pick a silent default in either
        // direction — money math must not paper over a configuration error.
        if (cfgErrs.length) {
          skipped++;
          rows.push({
            razorpay_employee_id: m.razorpay_employee_id,
            hr_employee_id: m.hr_employee_id,
            status: "blocked_config_error",
            ...payload,
            error: cfgErrs.join(" "),
          });
          continue;
        }

        // Explicit no-op class: zero ERP attendance AND zero leaves for the whole month
        // means we have NO source data for this employee — do not construct a "0 present /
        // full LOP" payload that would silently zero out their pay in Razorpay.
        if (presentDays === 0 && paidLeave === 0 && unpaidLeave === 0) {
          skipped++;
          rows.push({
            razorpay_employee_id: m.razorpay_employee_id,
            hr_employee_id: m.hr_employee_id,
            status: "no_erp_attendance",
            ...payload,
            error: "No ERP attendance or leave records for this employee in the period.",
          });
          continue;
        }

        // Period immutability guard on the write path only.
        if (isWrite && (pushedLocks.get(String(m.razorpay_employee_id)) || 0) > 0) {
          skipped++;
          rows.push({
            razorpay_employee_id: m.razorpay_employee_id,
            hr_employee_id: m.hr_employee_id,
            status: "blocked_period_locked",
            ...payload,
            error: "Period already pushed. File an audited recall (recall_attendance_period) before re-pushing.",
          });
          continue;
        }

        planned++;

        if (action === "push_attendance_dry_run") {
          rows.push({
            razorpay_employee_id: m.razorpay_employee_id,
            hr_employee_id: m.hr_employee_id,
            status: "planned",
            ...payload,
          });
          continue;
        }

        // Live push using the operator-verified attendance envelope key.
        // Documented endpoint is POST /api/att with body type "attendance",
        // sub-type "modify" (URL path and body type intentionally differ per
        // the Postman collection). Normalize legacy envelopes to that.
        const envelopeKey = String(settingsRow!.push_attendance_envelope_key);
        let [bodyType, subType] = envelopeKey.split(":");
        if (!bodyType || bodyType === "att") bodyType = "attendance";
        if (!subType || subType === "update") subType = "modify";
        const urlPath = "att"; // doc: URL is always /api/att for attendance ops
        const body = {
          auth: authBlock(),
          request: { type: bodyType, "sub-type": subType },
          data: {
            "employee-id": eid,
            "employee-type": "employee",
            period,
            "working-days": workingDays,
            "present-days": presentDays,
            "paid-leave-days": paidLeave,
            "lop-days": lopDays,
          },
        };
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 20000);
        let httpStatus = 0; let ok = false; let errText: string | null = null;
        try {
          const res = await fetch(`${BASE}/${urlPath}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify(body),
            signal: ctrl.signal,
          });
          httpStatus = res.status;
          const raw = await res.text();
          let respBody: any = null; try { respBody = JSON.parse(raw); } catch { /* ignore */ }
          const rpErr = respBody && typeof respBody === "object" ? (respBody.error || respBody.message || null) : null;
          ok = res.ok && !rpErr;
          if (!ok) errText = rpErr || raw?.slice(0, 400) || `HTTP ${res.status}`;
        } catch (e) {
          errText = `NETWORK: ${(e as Error).message}`;
        } finally { clearTimeout(t); }

        await logSync(svc, {
          action: "push_attendance",
          http_status: httpStatus,
          razorpay_employee_id: String(eid),
          hr_employee_id: m.hr_employee_id,
          // PII-safe: only day counts + period, never per-day timestamps or leave reasons.
          field_diff_summary: {
            period,
            working_days: workingDays,
            present_days: presentDays,
            paid_leave_days: paidLeave,
            lop_days: lopDays,
          },
          error_text: ok ? null : errText,
          actor_user_id: authed.userId,
        });

        if (ok) {
          pushed++;
          if (action === "push_attendance_apply_one" && !settingsRow?.push_attendance_pilot_verified_at) {
            await svc.from("hr_razorpay_settings").update({
              push_attendance_pilot_verified_at: new Date().toISOString(),
              push_attendance_pilot_hr_employee_id: m.hr_employee_id,
              push_attendance_pilot_period: period,
              last_attendance_push_at: new Date().toISOString(),
            }).eq("is_singleton", true);
          } else {
            await svc.from("hr_razorpay_settings").update({ last_attendance_push_at: new Date().toISOString() }).eq("is_singleton", true);
          }
          rows.push({
            razorpay_employee_id: m.razorpay_employee_id,
            status: "pushed",
            ...payload,
          });
        } else {
          failed++;
          rows.push({
            razorpay_employee_id: m.razorpay_employee_id,
            status: "failed",
            ...payload,
            error: errText,
          });
        }
      }

      return json(200, {
        ok: true,
        period,
        summary: {
          total: maps.length, planned, pushed, failed, skipped,
          working_days_range: (() => {
            const vals = Array.from(workingDaysByEmp.values());
            if (!vals.length) return { min: 0, max: 0 };
            return { min: Math.min(...vals), max: Math.max(...vals) };
          })(),
          holidays_in_month: holidayDates.size,
        },
        tenant_warnings: tenantWarnings,
        rows,
        envelope: {
          verified: !!settingsRow?.push_attendance_endpoint_verified,
          key: settingsRow?.push_attendance_envelope_key || null,
        },
        pilot: {
          verified_at: settingsRow?.push_attendance_pilot_verified_at || null,
          pilot_period: settingsRow?.push_attendance_pilot_period || null,
          bulk_unlocked: !!settingsRow?.bulk_attendance_push_unlocked,
        },
      });
    }

    // ============================================================
    // Phase 7 — Payroll-run orchestration
    // Actions:
    //   record_payroll_envelope_verified
    //   unlock_bulk_payroll_push
    //   compute_payroll_run
    //   dry_run_payroll_run
    //   apply_payroll_pilot
    //   apply_payroll_bulk
    //   lock_payroll_period
    //   recall_payroll_period
    // Every write is server-gated on push_payroll_endpoint_verified=true.
    // Locked periods reject any compute / dry_run / apply until recalled.
    // ============================================================
    if (
      action === "record_payroll_envelope_verified" ||
      action === "unlock_bulk_payroll_push" ||
      action === "compute_payroll_run" ||
      action === "dry_run_payroll_run" ||
      action === "apply_payroll_pilot" ||
      action === "apply_payroll_bulk" ||
      action === "lock_payroll_period" ||
      action === "recall_payroll_period"
    ) {
      // Full settings row — readSettings() only pulls a couple of columns.
      const { data: pSettings } = await svc
        .from("hr_razorpay_settings").select("*").eq("is_singleton", true).maybeSingle();

      // ---- record_payroll_envelope_verified -----------------------------
      if (action === "record_payroll_envelope_verified") {
        const key = String(payload?.envelope_key || "").trim();
        const verified = !!payload?.verified;
        if (verified && !key) return json(400, { error: "envelope_key is required when verified=true" });
        const patch: any = {
          push_payroll_endpoint_verified: verified,
          push_payroll_envelope_key: verified ? key : null,
          push_payroll_envelope_verified_at: verified ? new Date().toISOString() : null,
          push_payroll_envelope_verified_by: verified ? authed.userId : null,
        };
        // Any change to envelope revokes all downstream unlocks.
        if (!verified || (pSettings?.push_payroll_envelope_key && pSettings.push_payroll_envelope_key !== key)) {
          patch.push_payroll_pilot_unlocked = false;
          patch.push_payroll_bulk_unlocked = false;
        }
        const { error } = await svc.from("hr_razorpay_settings").update(patch).eq("is_singleton", true);
        if (error) return json(500, { error: error.message });
        return json(200, { ok: true });
      }

      // ---- unlock_bulk_payroll_push -------------------------------------
      if (action === "unlock_bulk_payroll_push") {
        if (!pSettings?.push_payroll_endpoint_verified || !pSettings?.push_payroll_envelope_key) {
          return json(400, { error: "Cannot unlock — payroll envelope not yet verified." });
        }
        const scope = String(payload?.scope || "");
        const patch: any = {};
        if (scope === "pilot") patch.push_payroll_pilot_unlocked = true;
        else if (scope === "bulk") patch.push_payroll_bulk_unlocked = true;
        else return json(400, { error: "scope must be 'pilot' or 'bulk'" });
        await svc.from("hr_razorpay_settings").update(patch).eq("is_singleton", true);
        return json(200, { ok: true, scope });
      }

      // ---- period_month resolution & lock check -------------------------
      const periodMonthStr = String(payload?.period_month || "").trim();
      const pmMatch = /^(\d{4})-(\d{2})$/.exec(periodMonthStr);
      if (!pmMatch) return json(400, { error: "period_month must be YYYY-MM" });
      const pYear = parseInt(pmMatch[1], 10);
      const pMonth = parseInt(pmMatch[2], 10);
      const periodMonthISO = `${pmMatch[1]}-${pmMatch[2]}-01`;

      // Load or create the run row for this period.
      let { data: runRow } = await svc.from("hr_razorpay_payroll_runs")
        .select("*").eq("period_month", periodMonthISO).maybeSingle();

      // ---- lock_payroll_period ------------------------------------------
      if (action === "lock_payroll_period") {
        if (!runRow) return json(404, { error: "No payroll run for that period." });
        if (runRow.status === "locked") return json(400, { error: "Period is already locked." });
        if (runRow.status !== "bulk_applied" && runRow.status !== "pilot_applied") {
          return json(400, { error: "Only pilot_applied or bulk_applied runs can be locked." });
        }
        await svc.from("hr_razorpay_payroll_runs").update({
          status: "locked",
          locked_at: new Date().toISOString(),
          locked_by: authed.userId,
        }).eq("id", runRow.id);
        return json(200, { ok: true });
      }

      // ---- recall_payroll_period ----------------------------------------
      // Audited override that un-locks a period for re-push. Only meaningful for
      // runs that already reached the wire (pilot_applied / bulk_applied / locked).
      // Recall clears applied/failed line push_status so a subsequent apply can
      // legitimately re-push the affected employees; source_snapshot is preserved
      // for the audit trail. Also blocked if a Phase-10 ledger period is signed off
      // for the same month — reopen ledger first.
      if (action === "recall_payroll_period") {
        if (!runRow) return json(404, { error: "No payroll run for that period." });
        if (!["pilot_applied", "bulk_applied", "locked"].includes(runRow.status)) {
          return json(400, {
            error: `Recall is only valid for pilot_applied / bulk_applied / locked runs (current: ${runRow.status}). Use compute_payroll_run to redraft an earlier-stage run.`,
          });
        }
        const reason = String(payload?.reason || "").trim();
        if (reason.length < 12) return json(400, { error: "reason (min 12 chars) is required for recall" });

        // Refuse if ledger period for this month is signed off.
        const { data: ledgerPeriod } = await svc
          .from("hr_razorpay_ledger_periods").select("status")
          .eq("period_month", periodMonthISO).maybeSingle();
        if (ledgerPeriod?.status === "signed_off") {
          return json(400, {
            error: "Ledger period for this month is signed off. Reopen the ledger period before recalling payroll.",
          });
        }

        await svc.from("hr_razorpay_payroll_runs").update({
          status: "recalled",
          recall_reason: reason,
          recalled_by: authed.userId,
          recalled_at: new Date().toISOString(),
        }).eq("id", runRow.id);

        // Re-open applied/failed lines so a subsequent apply can re-push them.
        // Preserve the source_snapshot for audit; only clear volatile push state.
        await svc.from("hr_razorpay_payroll_run_lines")
          .update({ push_status: "dry_run_ok", push_response: null, applied_at: null })
          .eq("run_id", runRow.id)
          .in("push_status", ["applied", "failed"]);

        await logSync(svc, {
          action: "payroll_recall",
          http_status: 0,
          razorpay_employee_id: "",
          hr_employee_id: null,
          field_diff_summary: { period_month: periodMonthISO, reason_len: reason.length, run_id: runRow.id, prior_status: runRow.status },
          error_text: null,
          actor_user_id: authed.userId,
        });
        return json(200, { ok: true, prior_status: runRow.status });
      }

      // Every remaining action mutates the run. Reject on locked periods.
      if (runRow?.status === "locked") {
        return json(400, { error: "Period is locked. File a recall_payroll_period before further changes." });
      }

      // ---- compute_payroll_run ------------------------------------------
      if (action === "compute_payroll_run") {
        // Preflight: attendance envelope must be verified (Phase 6). If ops has not
        // wired attendance yet, compute is refused with a clear message — otherwise
        // LOP would silently be zero for everyone.
        if (!pSettings?.push_attendance_endpoint_verified) {
          return json(400, {
            error: "Attendance envelope not verified (Phase 6). Payroll compute requires attendance to be usable first.",
          });
        }

        // Create the run row if missing.
        if (!runRow) {
          const { data: ins, error: insErr } = await svc.from("hr_razorpay_payroll_runs").insert({
            period_month: periodMonthISO,
            status: "draft",
            created_by: authed.userId,
          }).select("*").single();
          if (insErr) return json(500, { error: insErr.message });
          runRow = ins;
        }

        // ---- Attendance window --------------------------------------------
        const daysInMonth = new Date(Date.UTC(pYear, pMonth, 0)).getUTCDate();
        const monthStart = new Date(Date.UTC(pYear, pMonth - 1, 1));
        const monthEnd = new Date(Date.UTC(pYear, pMonth - 1, daysInMonth, 23, 59, 59));
        const startIso = monthStart.toISOString().slice(0, 10);
        const endIso = monthEnd.toISOString().slice(0, 10);

        const [attRes, leaveRes, ltRes, holRes] = await Promise.all([
          svc.from("hr_attendance_daily")
            .select("employee_id,attendance_date,total_hours,status")
            .gte("attendance_date", startIso).lte("attendance_date", endIso),
          svc.from("hr_leave_requests")
            .select("employee_id,leave_type_id,start_date,end_date,is_half_day,status")
            .eq("status", "approved")
            .gte("end_date", startIso).lte("start_date", endIso),
          svc.from("hr_leave_types").select("id,is_paid"),
          svc.from("hr_holidays").select("date").eq("is_active", true).gte("date", startIso).lte("date", endIso),
        ]);
        if (attRes.error) return json(500, { error: attRes.error.message });

        const ltMap = new Map((ltRes.data || []).map((l: any) => [l.id, l]));
        const holidayDates = new Set((holRes.data || []).map((h: any) => h.date));

        // Working days = calendar - Sundays - active holidays (ERP standard, same as Phase 6).
        let workingDays = 0;
        for (let d = 1; d <= daysInMonth; d++) {
          const dt = new Date(Date.UTC(pYear, pMonth - 1, d));
          if (dt.getUTCDay() === 0) continue;
          if (holidayDates.has(dt.toISOString().slice(0, 10))) continue;
          workingDays++;
        }

        const attByEmp = new Map<string, Set<string>>();
        for (const r of (attRes.data || []) as any[]) {
          const s = attByEmp.get(r.employee_id) || new Set<string>();
          const present = (r.total_hours && r.total_hours > 0) || (r.status && String(r.status).toLowerCase() === "present");
          if (present) s.add(r.attendance_date);
          attByEmp.set(r.employee_id, s);
        }

        const paidByEmp = new Map<string, number>();
        const unpaidByEmp = new Map<string, number>();
        for (const lr of (leaveRes.data || []) as any[]) {
          const lt: any = ltMap.get(lr.leave_type_id);
          const isPaid = lt ? !!lt.is_paid : true;
          const ls = new Date(lr.start_date + "T00:00:00Z");
          const le = new Date(lr.end_date + "T00:00:00Z");
          const os = ls < monthStart ? monthStart : ls;
          const oe = le > monthEnd ? monthEnd : le;
          if (oe < os) continue;
          let count = 0;
          for (let t = os.getTime(); t <= oe.getTime(); t += 86400000) {
            const dt = new Date(t);
            if (dt.getUTCDay() === 0) continue;
            if (holidayDates.has(dt.toISOString().slice(0, 10))) continue;
            count += lr.is_half_day ? 0.5 : 1;
          }
          if (isPaid) paidByEmp.set(lr.employee_id, (paidByEmp.get(lr.employee_id) || 0) + count);
          else unpaidByEmp.set(lr.employee_id, (unpaidByEmp.get(lr.employee_id) || 0) + count);
        }

        // ---- Employees, structures, bank/pan, loans, one-offs --------------
        const { data: maps } = await svc.from("hr_razorpay_employee_map")
          .select("razorpay_employee_id,hr_employee_id");
        const hrIds = (maps || []).map((m: any) => m.hr_employee_id).filter(Boolean);
        if (!hrIds.length) return json(400, { error: "No mapped employees to compute." });

        const [empRes, structRes, bankRes, loanRes, oneOffRes] = await Promise.all([
          svc.from("hr_employees").select("id,badge_id,first_name,last_name,pan_number,is_active").in("id", hrIds),
          svc.from("hr_employee_salary_structures").select("employee_id,amount,is_active").in("employee_id", hrIds).eq("is_active", true),
          svc.from("hr_employee_bank_details").select("employee_id,account_number").in("employee_id", hrIds),
          svc.from("hr_loan_repayments").select("loan_id,employee_id,amount,due_date,status")
            .in("employee_id", hrIds).gte("due_date", startIso).lte("due_date", endIso),
          svc.from("hr_razorpay_payroll_run_one_offs").select("employee_id,kind,amount").eq("run_id", runRow.id),
        ]);

        const empById = new Map((empRes.data || []).map((e: any) => [e.id, e]));
        const grossByEmp = new Map<string, number>();
        for (const s of (structRes.data || []) as any[]) {
          grossByEmp.set(s.employee_id, (grossByEmp.get(s.employee_id) || 0) + Number(s.amount || 0));
        }
        const bankByEmp = new Map((bankRes.data || []).map((b: any) => [b.employee_id, b]));
        const loanByEmp = new Map<string, number>();
        for (const l of (loanRes.data || []) as any[]) {
          if (String(l.status || "").toLowerCase() === "paid") continue;
          loanByEmp.set(l.employee_id, (loanByEmp.get(l.employee_id) || 0) + Number(l.amount || 0));
        }
        const oneOffByEmp = new Map<string, { bonus: number; reimb: number; ded: number }>();
        for (const o of (oneOffRes.data || []) as any[]) {
          const cur = oneOffByEmp.get(o.employee_id) || { bonus: 0, reimb: 0, ded: 0 };
          if (o.kind === "bonus") cur.bonus += Number(o.amount || 0);
          else if (o.kind === "reimbursement") cur.reimb += Number(o.amount || 0);
          else if (o.kind === "deduction") cur.ded += Number(o.amount || 0);
          oneOffByEmp.set(o.employee_id, cur);
        }

        // ---- Build lines ---------------------------------------------------
        const lines: any[] = [];
        let totalsGross = 0, totalsDed = 0, totalsNet = 0, included = 0, skippedCount = 0;

        for (const m of (maps || []) as any[]) {
          if (!m.hr_employee_id) continue;
          const emp: any = empById.get(m.hr_employee_id);
          if (!emp) continue;

          const presentDays = (attByEmp.get(m.hr_employee_id) || new Set()).size;
          const paidLeave = paidByEmp.get(m.hr_employee_id) || 0;
          const unpaidLeave = unpaidByEmp.get(m.hr_employee_id) || 0;
          const lopDays = Math.max(0, workingDays - Math.min(presentDays + paidLeave, workingDays));
          const gross = Number((grossByEmp.get(m.hr_employee_id) || 0).toFixed(2));
          const loanEmi = Number((loanByEmp.get(m.hr_employee_id) || 0).toFixed(2));
          const oneOffs = oneOffByEmp.get(m.hr_employee_id) || { bonus: 0, reimb: 0, ded: 0 };

          const snapshot = {
            working_days: workingDays,
            present_days: presentDays,
            paid_leave_days: paidLeave,
            unpaid_leave_days: unpaidLeave,
            lop_days: lopDays,
            monthly_gross_from_structure: gross,
            one_offs: oneOffs,
          };

          // Skip-label rules (labeled no-op, never silent).
          let skipLabel: string | null = null;
          if (emp.is_active === false) skipLabel = "terminated";
          else if (!gross) skipLabel = "no_structure";
          else if (!bankByEmp.get(m.hr_employee_id)?.account_number) skipLabel = "no_bank";
          else if (!emp.pan_number) skipLabel = "no_pan";
          else if (presentDays === 0 && paidLeave === 0 && unpaidLeave === 0) skipLabel = "no_attendance";

          const lopAmount = workingDays > 0 ? Number(((lopDays / workingDays) * gross).toFixed(2)) : 0;
          const otherDed = Number(oneOffs.ded.toFixed(2));
          const netPay = Number((gross - lopAmount - loanEmi - otherDed + oneOffs.bonus + oneOffs.reimb).toFixed(2));

          const line = {
            run_id: runRow.id,
            employee_id: m.hr_employee_id,
            gross_earnings: gross,
            lop_amount: lopAmount,
            other_deductions: otherDed,
            loan_emi: loanEmi,
            net_pay: skipLabel ? 0 : netPay,
            skip_label: skipLabel,
            source_snapshot: snapshot,
            push_status: skipLabel ? "skipped" : "draft",
          };
          lines.push(line);

          if (skipLabel) skippedCount++;
          else {
            included++;
            totalsGross += gross;
            totalsDed += lopAmount + loanEmi + otherDed;
            totalsNet += netPay;
          }
        }

        // Upsert lines (idempotent per run_id, employee_id).
        // First wipe non-applied lines for a clean recompute, then insert.
        await svc.from("hr_razorpay_payroll_run_lines")
          .delete().eq("run_id", runRow.id).neq("push_status", "applied");
        if (lines.length) {
          // Chunk to avoid oversized payloads.
          for (let i = 0; i < lines.length; i += 200) {
            const chunk = lines.slice(i, i + 200);
            const { error: linesErr } = await svc.from("hr_razorpay_payroll_run_lines")
              .upsert(chunk, { onConflict: "run_id,employee_id", ignoreDuplicates: false });
            if (linesErr) return json(500, { error: linesErr.message });
          }
        }

        await svc.from("hr_razorpay_payroll_runs").update({
          status: "computed",
          totals_gross: Number(totalsGross.toFixed(2)),
          totals_deductions: Number(totalsDed.toFixed(2)),
          totals_net: Number(totalsNet.toFixed(2)),
          headcount_included: included,
          headcount_skipped: skippedCount,
        }).eq("id", runRow.id);

        return json(200, {
          ok: true,
          run_id: runRow.id,
          period_month: periodMonthISO,
          totals: { gross: totalsGross, deductions: totalsDed, net: totalsNet },
          headcount: { included, skipped: skippedCount, total: included + skippedCount },
          working_days: workingDays,
        });
      }

      // For the write actions below, the run must exist and be beyond compute.
      if (!runRow) return json(404, { error: "No payroll run for that period. Call compute_payroll_run first." });

      // Server-side hard-block: writes require verified envelope.
      const isWriteAction = action === "apply_payroll_pilot" || action === "apply_payroll_bulk";
      if ((action === "dry_run_payroll_run" || isWriteAction) && !pSettings?.push_payroll_endpoint_verified) {
        return json(400, {
          error: "Payroll envelope not verified. Record a probe-verified envelope before any dry-run or apply.",
        });
      }
      if (action === "apply_payroll_pilot" && !pSettings?.push_payroll_pilot_unlocked) {
        return json(400, { error: "Payroll pilot writes are locked. Unlock via unlock_bulk_payroll_push with scope=pilot." });
      }
      if (action === "apply_payroll_bulk") {
        if (!pSettings?.push_payroll_bulk_unlocked) return json(400, { error: "Payroll bulk writes are locked." });
        if (runRow.status !== "dry_run_ok" && runRow.status !== "pilot_applied") {
          return json(400, { error: "Bulk apply requires a successful dry-run first." });
        }
      }

      // Load lines for this run.
      const { data: allLines } = await svc.from("hr_razorpay_payroll_run_lines")
        .select("*").eq("run_id", runRow.id);
      const pushableLines = (allLines || []).filter((l: any) => l.push_status !== "skipped");

      // ---- dry_run_payroll_run ------------------------------------------
      if (action === "dry_run_payroll_run") {
        // Discovery-first: no external POST until an operator has explicitly named a
        // payroll envelope key AND we have a live payroll endpoint verified via Postman.
        // For now the dry-run is ERP-truth-only and marks the run as dry_run_ok so the
        // human pilot gate can proceed.
        await svc.from("hr_razorpay_payroll_runs").update({
          status: "dry_run_ok",
          dry_run_response: { at: new Date().toISOString(), pushable: pushableLines.length },
        }).eq("id", runRow.id);
        await svc.from("hr_razorpay_payroll_run_lines")
          .update({ push_status: "dry_run_ok" })
          .eq("run_id", runRow.id).eq("push_status", "draft");
        return json(200, { ok: true, run_id: runRow.id, dryable: pushableLines.length });
      }

      // ---- apply_payroll_pilot / apply_payroll_bulk ---------------------
      if (isWriteAction) {
        const envelopeKey = String(pSettings?.push_payroll_envelope_key || "").trim();
        if (!envelopeKey) return json(400, { error: "Missing verified payroll envelope key." });
        const [type, subType] = envelopeKey.split(":");

        let targetLines: any[] = [];
        if (action === "apply_payroll_pilot") {
          const ids: string[] = Array.isArray(payload?.employee_ids)
            ? payload.employee_ids.map((v: any) => String(v)) : [];
          if (ids.length < 1 || ids.length > 3) {
            return json(400, { error: "apply_payroll_pilot requires 1–3 employee_ids" });
          }
          targetLines = pushableLines.filter((l: any) => ids.includes(l.employee_id));
          if (!targetLines.length) return json(400, { error: "No pushable lines match the given employee_ids" });
        } else {
          // bulk: everything not yet applied
          targetLines = pushableLines.filter((l: any) => l.push_status !== "applied");
        }

        // Map hr_employee_id -> razorpay_employee_id
        const { data: mapRows } = await svc.from("hr_razorpay_employee_map")
          .select("hr_employee_id,razorpay_employee_id")
          .in("hr_employee_id", targetLines.map((l: any) => l.employee_id));
        const rpIdByHr = new Map((mapRows || []).map((r: any) => [r.hr_employee_id, r.razorpay_employee_id]));

        const results: any[] = [];
        let pushed = 0, failed = 0;

        for (const line of targetLines) {
          // Idempotency: already applied lines return cached response, no external call.
          if (line.push_status === "applied") {
            results.push({ employee_id: line.employee_id, status: "applied_cached", push_response: line.push_response });
            continue;
          }
          const rpId = rpIdByHr.get(line.employee_id);
          if (!rpId) {
            failed++;
            results.push({ employee_id: line.employee_id, status: "failed", error: "No Razorpay mapping for this employee." });
            continue;
          }

          const eid = Number(rpId);
          const runPayload = {
            "employee-id": eid,
            "employee-type": "employee",
            period: periodMonthISO,
            "gross-earnings": Number(line.gross_earnings || 0),
            "lop-amount": Number(line.lop_amount || 0),
            "other-deductions": Number(line.other_deductions || 0),
            "loan-emi": Number(line.loan_emi || 0),
            "net-pay": Number(line.net_pay || 0),
          };

          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 20000);
          let httpStatus = 0; let ok = false; let errText: string | null = null; let bodyOut: any = null;
          try {
            const res = await fetch(`${BASE}/${type || "payroll"}`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Accept: "application/json" },
              body: JSON.stringify({
                auth: authBlock(),
                request: { type: type || "payroll", "sub-type": subType || "run" },
                data: runPayload,
              }),
              signal: ctrl.signal,
            });
            httpStatus = res.status;
            const raw = await res.text();
            try { bodyOut = JSON.parse(raw); } catch { bodyOut = { raw: raw.slice(0, 500) }; }
            const rpErr = bodyOut && typeof bodyOut === "object" ? (bodyOut.error || bodyOut.message || null) : null;
            ok = res.ok && !rpErr;
            if (!ok) errText = rpErr || `HTTP ${res.status}`;
          } catch (e) {
            errText = `NETWORK: ${(e as Error).message}`;
          } finally { clearTimeout(t); }

          await logSync(svc, {
            action: action === "apply_payroll_pilot" ? "push_payroll_pilot" : "push_payroll_bulk",
            http_status: httpStatus,
            razorpay_employee_id: String(rpId),
            hr_employee_id: line.employee_id,
            field_diff_summary: { run_id: runRow.id, period_month: periodMonthISO, net_pay: line.net_pay },
            error_text: ok ? null : errText,
            actor_user_id: authed.userId,
          });

          if (ok) {
            pushed++;
            await svc.from("hr_razorpay_payroll_run_lines").update({
              push_status: "applied",
              push_response: bodyOut,
              applied_at: new Date().toISOString(),
            }).eq("id", line.id);
            results.push({ employee_id: line.employee_id, status: "applied" });
          } else {
            failed++;
            await svc.from("hr_razorpay_payroll_run_lines").update({
              push_status: "failed", push_response: bodyOut,
            }).eq("id", line.id);
            results.push({ employee_id: line.employee_id, status: "failed", error: errText });
          }
        }

        // Advance run status.
        const nextStatus = action === "apply_payroll_pilot" ? "pilot_applied" : "bulk_applied";
        await svc.from("hr_razorpay_payroll_runs").update({
          status: nextStatus,
          apply_response: { at: new Date().toISOString(), pushed, failed, scope: action },
        }).eq("id", runRow.id);

        return json(200, {
          ok: true, run_id: runRow.id,
          summary: { attempted: targetLines.length, pushed, failed },
          results,
        });
      }
    }

    // ============================================================
    // Phase 8 — Payout & Disbursement sync
    // Actions:
    //   probe_payouts_endpoint           — sniff a candidate GET endpoint, no writes
    //   record_payouts_envelope_verified — operator marks a verified GET envelope
    //   pull_payouts_for_period          — pull actuals, upsert reconciliation rows
    //   reconcile_payout                 — human sign-off on a row
    // Read-only against Razorpay; the only writes are into
    // hr_razorpay_payout_records inside this project.
    // ============================================================
    if (
      action === "probe_payouts_endpoint" ||
      action === "record_payouts_envelope_verified" ||
      action === "pull_payouts_for_period" ||
      action === "reconcile_payout"
    ) {
      const { data: poSettings } = await svc
        .from("hr_razorpay_settings").select("*").eq("is_singleton", true).maybeSingle();

      // ---- probe_payouts_endpoint ---------------------------------------
      if (action === "probe_payouts_endpoint") {
        const type = String(payload?.type || "payouts").trim();
        const subType = String(payload?.sub_type || "view").trim();
        const periodMonthStr = String(payload?.period_month || "").trim();
        const body = {
          auth: authBlock(),
          request: { type, "sub-type": subType },
          data: periodMonthStr ? { period: periodMonthStr } : {},
        };
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 20000);
        let httpStatus = 0; let raw = ""; let parsed: any = null;
        try {
          const res = await fetch(`${BASE}/${type}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify(body),
            signal: ctrl.signal,
          });
          httpStatus = res.status;
          raw = await res.text();
          try { parsed = JSON.parse(raw); } catch { parsed = null; }
        } catch (e) {
          return json(200, { ok: false, error: `NETWORK: ${(e as Error).message}` });
        } finally { clearTimeout(t); }
        return json(200, {
          ok: httpStatus >= 200 && httpStatus < 300,
          http_status: httpStatus,
          envelope_key: `${type}:${subType}`,
          body_preview: parsed ?? { raw: raw.slice(0, 800) },
        });
      }

      // ---- record_payouts_envelope_verified -----------------------------
      if (action === "record_payouts_envelope_verified") {
        const key = String(payload?.envelope_key || "").trim();
        const verified = !!payload?.verified;
        if (verified && !key) return json(400, { error: "envelope_key is required when verified=true" });
        const patch: any = {
          pull_payouts_endpoint_verified: verified,
          pull_payouts_envelope_key: verified ? key : null,
          pull_payouts_envelope_verified_at: verified ? new Date().toISOString() : null,
          pull_payouts_envelope_verified_by: verified ? authed.userId : null,
        };
        const { error } = await svc.from("hr_razorpay_settings").update(patch).eq("is_singleton", true);
        if (error) return json(500, { error: error.message });
        return json(200, { ok: true });
      }

      // ---- pull_payouts_for_period --------------------------------------
      if (action === "pull_payouts_for_period") {
        if (!poSettings?.pull_payouts_endpoint_verified || !poSettings?.pull_payouts_envelope_key) {
          return json(400, { error: "Payouts envelope not verified. Record a probe-verified envelope first." });
        }
        const periodMonthStr = String(payload?.period_month || "").trim();
        const pmMatch = /^(\d{4})-(\d{2})$/.exec(periodMonthStr);
        if (!pmMatch) return json(400, { error: "period_month must be YYYY-MM" });
        const periodMonthISO = `${pmMatch[1]}-${pmMatch[2]}-01`;

        // Gap-fix: variance is meaningless against an unapplied run. Refuse the pull
        // unless the payroll run for this month has reached the wire.
        const { data: preRunRow } = await svc.from("hr_razorpay_payroll_runs")
          .select("status").eq("period_month", periodMonthISO).maybeSingle();
        if (!preRunRow) {
          return json(400, { error: "No payroll run found for this period. Compute and apply payroll first." });
        }
        if (!["bulk_applied", "locked", "recalled"].includes(preRunRow.status)) {
          return json(400, {
            error: `Payout pull requires the payroll run to be bulk_applied (or later). Current status: ${preRunRow.status}.`,
          });
        }

        // Documented endpoint for pulling payouts is POST /api/payroll with
        // sub-type "view-payroll" (Opfin) — normalize legacy "payouts:view"
        // envelopes, which target a ghost endpoint.
        const envelopeKey = String(poSettings.pull_payouts_envelope_key);
        let [type, subType] = envelopeKey.split(":");
        if (!type || type === "payouts") type = "payroll";
        if (!subType || subType === "view") subType = "view-payroll";

        // Pull payouts. Actual shape is Razorpay-tenant-specific; whatever comes
        // back is stored verbatim in source_payload and normalised best-effort.
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 30000);
        let httpStatus = 0; let bodyOut: any = null;
        try {
          const res = await fetch(`${BASE}/${type}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
              auth: authBlock(),
              request: { type, "sub-type": subType },
              data: { period: periodMonthStr, "payroll-month": periodMonthStr },
            }),
            signal: ctrl.signal,
          });
          httpStatus = res.status;
          const raw = await res.text();
          try { bodyOut = JSON.parse(raw); } catch { bodyOut = { raw: raw.slice(0, 800) }; }
        } catch (e) {
          return json(502, { error: `NETWORK: ${(e as Error).message}` });
        } finally { clearTimeout(t); }

        if (httpStatus < 200 || httpStatus >= 300) {
          return json(502, { error: "Razorpay returned non-2xx", http_status: httpStatus, body: bodyOut });
        }

        // Try common list shapes: array | { data: [] } | { payouts: [] } | { list: [] }
        let rawList: any[] = [];
        if (Array.isArray(bodyOut)) rawList = bodyOut;
        else if (bodyOut && typeof bodyOut === "object") {
          rawList = bodyOut.data || bodyOut.payouts || bodyOut.list || bodyOut.result || [];
        }
        if (!Array.isArray(rawList)) rawList = [];

        // Load expected amounts from the payroll run for this period.
        const { data: runRow } = await svc.from("hr_razorpay_payroll_runs")
          .select("id").eq("period_month", periodMonthISO).maybeSingle();
        const runId = runRow?.id || null;

        let expectedByRpId = new Map<string, { hr_employee_id: string; net_pay: number }>();
        if (runId) {
          const { data: lineRows } = await svc.from("hr_razorpay_payroll_run_lines")
            .select("employee_id,net_pay,run_id").eq("run_id", runId);
          const hrIds = (lineRows || []).map((l: any) => l.employee_id);
          if (hrIds.length) {
            const { data: maps } = await svc.from("hr_razorpay_employee_map")
              .select("hr_employee_id,razorpay_employee_id").in("hr_employee_id", hrIds);
            const rpByHr = new Map((maps || []).map((m: any) => [m.hr_employee_id, String(m.razorpay_employee_id)]));
            for (const l of (lineRows || []) as any[]) {
              const rpId = rpByHr.get(l.employee_id);
              if (!rpId) continue;
              expectedByRpId.set(rpId, { hr_employee_id: l.employee_id, net_pay: Number(l.net_pay || 0) });
            }
          }
        }

        // Normalise each row best-effort. Unknown fields land in source_payload.
        function pickNum(o: any, keys: string[]) {
          for (const k of keys) { const v = o?.[k]; if (v != null && Number.isFinite(Number(v))) return Number(v); }
          return null;
        }
        function pickStr(o: any, keys: string[]) {
          for (const k of keys) { const v = o?.[k]; if (v != null && String(v).length) return String(v); }
          return null;
        }

        const upserts: any[] = [];
        for (const p of rawList) {
          const rpId = pickStr(p, ["employee-id", "employee_id", "employeeId", "id"]);
          if (!rpId) continue;
          const paid = pickNum(p, ["paid-amount", "paid_amount", "net-pay", "netPay", "amount", "paidAmount"]);
          const status = pickStr(p, ["payout-status", "payout_status", "status", "state"]) || "unknown";
          const utr = pickStr(p, ["utr", "UTR", "transaction-id", "transactionId"]);
          const paidAt = pickStr(p, ["paid-at", "paid_at", "paidAt", "processed-at", "processedAt"]);
          const exp = expectedByRpId.get(String(rpId));
          const expected = exp?.net_pay ?? null;
          const variance = (paid != null && expected != null) ? Number((paid - expected).toFixed(2)) : null;
          upserts.push({
            run_id: runId,
            period_month: periodMonthISO,
            razorpay_employee_id: String(rpId),
            hr_employee_id: exp?.hr_employee_id || null,
            payout_status: status,
            paid_amount: paid,
            expected_amount: expected,
            variance,
            utr,
            paid_at: paidAt ? new Date(paidAt).toISOString() : null,
            source_payload: p,
          });
        }

        if (upserts.length) {
          for (let i = 0; i < upserts.length; i += 200) {
            const chunk = upserts.slice(i, i + 200);
            const { error: upErr } = await svc.from("hr_razorpay_payout_records")
              .upsert(chunk, { onConflict: "period_month,razorpay_employee_id" });
            if (upErr) return json(500, { error: upErr.message });
          }
        }

        await svc.from("hr_razorpay_settings")
          .update({ last_payouts_pull_at: new Date().toISOString() })
          .eq("is_singleton", true);

        // Summary counters
        let paid = 0, processing = 0, failed = 0, mismatched = 0, unknown = 0, unexpected = 0;
        for (const r of upserts) {
          const s = String(r.payout_status || "").toLowerCase();
          if (s.includes("paid") || s.includes("success") || s.includes("processed")) paid++;
          else if (s.includes("processing") || s.includes("pending") || s.includes("initiated")) processing++;
          else if (s.includes("fail") || s.includes("reject") || s.includes("bounce")) failed++;
          else unknown++;
          if (r.variance != null && Math.abs(r.variance) >= 0.5) mismatched++;
          if (r.expected_amount == null) unexpected++;
        }

        await logSync(svc, {
          action: "pull_payouts",
          http_status: 200,
          razorpay_employee_id: "",
          hr_employee_id: null,
          field_diff_summary: {
            period_month: periodMonthISO,
            total: upserts.length,
            paid, processing, failed, unknown, mismatched, unexpected,
          },
          error_text: null,
          actor_user_id: authed.userId,
        });

        return json(200, {
          ok: true,
          period_month: periodMonthISO,
          summary: { total: upserts.length, paid, processing, failed, unknown, mismatched, unexpected },
        });
      }

      // ---- reconcile_payout --------------------------------------------
      if (action === "reconcile_payout") {
        const id = String(payload?.id || "").trim();
        if (!id) return json(400, { error: "id is required" });
        const { error } = await svc.from("hr_razorpay_payout_records").update({
          reconciled_at: new Date().toISOString(),
          reconciled_by: authed.userId,
        }).eq("id", id);
        if (error) return json(500, { error: error.message });
        return json(200, { ok: true });
      }
    }

    // ============================================================
    // Phase 9 — Payslip & Tax-document ingestion
    // Actions:
    //   probe_payslips_endpoint             — sniff a candidate GET envelope for payslips
    //   record_payslips_envelope_verified   — operator marks verified envelope
    //   pull_payslips_for_period            — pull per-employee payslips for a YYYY-MM
    //   probe_taxdocs_endpoint              — sniff Form-16 / TDS report envelope
    //   record_taxdocs_envelope_verified    — operator marks verified envelope
    //   pull_taxdocs_for_year               — pull yearly tax docs for a fiscal year
    // Read-only against Razorpay; writes are into
    // hr_razorpay_payslip_records / hr_razorpay_taxdoc_records only.
    // ============================================================
    if (
      action === "probe_payslips_endpoint" ||
      action === "record_payslips_envelope_verified" ||
      action === "pull_payslips_for_period" ||
      action === "probe_taxdocs_endpoint" ||
      action === "record_taxdocs_envelope_verified" ||
      action === "pull_taxdocs_for_year" ||
      action === "discover_and_seed_runs" ||
      action === "probe_view_payroll_debug"
    ) {
      const { data: p9Settings } = await svc
        .from("hr_razorpay_settings").select("*").eq("is_singleton", true).maybeSingle();

      // Shared probe helper
      async function razorpayPost(type: string, subType: string, data: any) {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 30000);
        let httpStatus = 0; let raw = ""; let parsed: any = null;
        try {
          const res = await fetch(`${BASE}/${type}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ auth: authBlock(), request: { type, "sub-type": subType }, data }),
            signal: ctrl.signal,
          });
          httpStatus = res.status;
          raw = await res.text();
          try { parsed = JSON.parse(raw); } catch { parsed = null; }
        } catch (e) {
          return { networkError: (e as Error).message, httpStatus: 0, parsed: null, raw: "" };
        } finally { clearTimeout(t); }
        return { httpStatus, parsed, raw };
      }

      function pickNum(o: any, keys: string[]) {
        for (const k of keys) { const v = o?.[k]; if (v != null && Number.isFinite(Number(v))) return Number(v); }
        return null;
      }
      function pickStr(o: any, keys: string[]) {
        for (const k of keys) { const v = o?.[k]; if (v != null && String(v).length) return String(v); }
        return null;
      }
      function extractList(bodyOut: any): any[] {
        if (Array.isArray(bodyOut)) return bodyOut;
        if (bodyOut && typeof bodyOut === "object") {
          return bodyOut.data || bodyOut.payslips || bodyOut.documents ||
                 bodyOut.list || bodyOut.result || bodyOut.records || [];
        }
        return [];
      }

      // ---- probe_payslips_endpoint / probe_taxdocs_endpoint ----
      if (action === "probe_payslips_endpoint" || action === "probe_taxdocs_endpoint") {
        const isPayslip = action === "probe_payslips_endpoint";
        const type = String(payload?.type || (isPayslip ? "payslip" : "form16")).trim();
        const subType = String(payload?.sub_type || "view").trim();
        const periodMonth = String(payload?.period_month || "").trim();
        const fiscalYear = String(payload?.fiscal_year || "").trim();
        const data: any = {};
        if (periodMonth) data.period = periodMonth;
        if (fiscalYear) data["fiscal-year"] = fiscalYear;
        if (payload?.employee_id) data["employee-id"] = payload.employee_id;

        const r = await razorpayPost(type, subType, data);
        if ((r as any).networkError) {
          return json(200, { ok: false, error: `NETWORK: ${(r as any).networkError}` });
        }
        return json(200, {
          ok: r.httpStatus >= 200 && r.httpStatus < 300,
          http_status: r.httpStatus,
          envelope_key: `${type}:${subType}`,
          body_preview: r.parsed ?? { raw: (r.raw || "").slice(0, 800) },
        });
      }

      // ---- record_payslips_envelope_verified / record_taxdocs_envelope_verified ----
      if (action === "record_payslips_envelope_verified" || action === "record_taxdocs_envelope_verified") {
        const isPayslip = action === "record_payslips_envelope_verified";
        const key = String(payload?.envelope_key || "").trim();
        const verified = !!payload?.verified;
        if (verified && !key) return json(400, { error: "envelope_key is required when verified=true" });
        const prefix = isPayslip ? "pull_payslips" : "pull_taxdocs";
        const patch: any = {
          [`${prefix}_endpoint_verified`]: verified,
          [`${prefix}_envelope_key`]: verified ? key : null,
          [`${prefix}_envelope_verified_at`]: verified ? new Date().toISOString() : null,
          [`${prefix}_envelope_verified_by`]: verified ? authed.userId : null,
        };
        const { error } = await svc.from("hr_razorpay_settings").update(patch).eq("is_singleton", true);
        if (error) return json(500, { error: error.message });
        return json(200, { ok: true });
      }

      // ---- Shared: view-payroll pilot probe + executed-run heuristic ----
      // The RazorpayX Opfin API has NO list-payrolls endpoint (verified against
      // the official Postman collection). To decide whether a given YYYY-MM was
      // actually executed on the RazorpayX side (vs returning CTC/12 setup
      // defaults from view-payroll), we probe ONE pilot employee for that
      // period and read multiple execution signals from the response body.
      async function viewPayrollProbe(email: string, periodYYYYMM: string) {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 20000);
        try {
          const res = await fetch(`${BASE}/payroll`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
              auth: authBlock(),
              request: { type: "payroll", "sub-type": "view-payroll" },
              data: { email, "payroll-month": periodYYYYMM },
            }),
            signal: ctrl.signal,
          });
          const raw = await res.text();
          let body: any = null; try { body = JSON.parse(raw); } catch { /* keep null */ }
          return { http_status: res.status, body, raw };
        } catch (e) {
          return { http_status: 0, body: null, raw: `NETWORK: ${(e as Error).message}` };
        } finally { clearTimeout(t); }
      }

      // Multi-signal heuristic. ANY of these means the month was executed on
      // RazorpayX (not a setup-default response):
      //   - a real payslip-id/payroll-id string (length > 4)
      //   - a downloadable pdf-url
      //   - total-deductions > 0
      //   - explicit statutory deduction present: pf/esi/pt > 0
      //   - a non-trivial tds/income-tax value
      //   - net-pay strictly less than total-earnings (deductions applied)
      // A response that ONLY has gross == basic (or gross == CTC/12) with zero
      // deductions is a pre-execution default and returns false.
      function looksExecutedFromBody(body: any): {
        executed: boolean;
        signals: Record<string, unknown>;
        figures: ReturnType<typeof extractPayrollViewFigures>;
      } {
        const empty = {
          executed: false,
          signals: { reason: "no_body_or_error" },
          figures: {
            gross: null, deductions: null, net: null, tds: null, pdf: null,
            payslipId: null, pf: null, esi: null, pt: null, additionsDetail: null,
            doNotPay: false, employeeName: null, deductionAmount: 0,
          } as any,
        };
        if (!body || typeof body !== "object") return empty;
        const err = body.error || body.message;
        if (err && typeof err === "string" && err.length > 0) {
          return { ...empty, signals: { reason: "api_error", error: err } };
        }
        const fig = extractPayrollViewFigures(body);
        const gross = Number(fig.gross ?? 0);
        const net = Number(fig.net ?? 0);
        const ded = Number(fig.deductions ?? 0);
        const pf = Number(fig.pf ?? 0);
        const esi = Number(fig.esi ?? 0);
        const pt = Number(fig.pt ?? 0);
        const tds = Number(fig.tds ?? 0);
        const payslipId = fig.payslipId || "";
        const hasRealPayslipId = typeof payslipId === "string" && payslipId.length > 4 &&
          !/^-?\d+-\d{4}-\d{2}$/.test(payslipId); // filter synthetic `<rpId>-YYYY-MM`
        const hasPdf = !!fig.pdf;
        const hasStat = pf > 0 || esi > 0 || pt > 0;
        const netLtGross = gross > 0 && net > 0 && net < gross - 0.5;
        const executed = hasPdf || hasRealPayslipId || ded > 0 || hasStat || tds > 0 || netLtGross;
        return {
          executed,
          signals: {
            gross, net, deductions: ded, pf, esi, pt, tds,
            hasPdf, hasRealPayslipId, netLtGross,
          },
          figures: fig,
        };
      }

      // Resolve a pilot email for probing. Callers may pass either a Razorpay
      // employee-id or an hr_employee_id; if neither, we pick the highest-value
      // Razorpay employee-id from the map (leadership typically has statutory
      // deductions and payslip-ids that unambiguously signal execution).
      async function resolvePilotEmail(payload: any): Promise<{ email: string | null; rpId: string | null; hrId: string | null; reason: string }> {
        const forcedEmail = String(payload?.pilot_email || "").trim().toLowerCase();
        if (forcedEmail.includes("@")) return { email: forcedEmail, rpId: null, hrId: null, reason: "payload.pilot_email" };
        const rpIdRaw = String(payload?.pilot_razorpay_employee_id || payload?.pilot_rp_id || "").trim();
        if (rpIdRaw) {
          const { data: m } = await svc.from("hr_razorpay_employee_map")
            .select("hr_employee_id,razorpay_employee_id").eq("razorpay_employee_id", rpIdRaw).maybeSingle();
          if (m?.hr_employee_id) {
            const { data: e } = await svc.from("hr_employees").select("email").eq("id", m.hr_employee_id).maybeSingle();
            const em = String((e as any)?.email || "").trim().toLowerCase();
            if (em.includes("@")) return { email: em, rpId: String(m.razorpay_employee_id), hrId: m.hr_employee_id, reason: "payload.pilot_rp_id" };
          }
        }
        // Auto-pick: highest numeric rpId with a real email.
        const { data: maps } = await svc.from("hr_razorpay_employee_map")
          .select("hr_employee_id,razorpay_employee_id");
        const withHr = (maps || []).filter((m: any) => !!m.hr_employee_id);
        if (!withHr.length) return { email: null, rpId: null, hrId: null, reason: "no_map_rows" };
        const hrIds = withHr.map((m: any) => m.hr_employee_id);
        const { data: emps } = await svc.from("hr_employees").select("id,email").in("id", hrIds);
        const emailByHr = new Map<string, string>();
        for (const e of (emps || []) as any[]) {
          const em = String(e.email || "").trim().toLowerCase();
          if (em.includes("@")) emailByHr.set(e.id, em);
        }
        const candidates = withHr
          .map((m: any) => ({ rp: String(m.razorpay_employee_id), hrId: m.hr_employee_id, email: emailByHr.get(m.hr_employee_id) || "" }))
          .filter((c: any) => c.email)
          .sort((a: any, b: any) => (Number(b.rp) || 0) - (Number(a.rp) || 0));
        if (!candidates.length) return { email: null, rpId: null, hrId: null, reason: "no_pilot_with_email" };
        const top = candidates[0];
        return { email: top.email, rpId: top.rp, hrId: top.hrId, reason: "auto_top_rp_id" };
      }

      // ---- probe_view_payroll_debug (introspection; no side effects) ----
      if (action === "probe_view_payroll_debug") {
        const periodMonth = String(payload?.period_month || "").trim();
        if (!/^\d{4}-\d{2}$/.test(periodMonth)) return json(400, { error: "period_month must be YYYY-MM" });
        const pilot = await resolvePilotEmail(payload);
        if (!pilot.email) return json(400, { error: "No pilot email resolved", reason: pilot.reason });
        const probe = await viewPayrollProbe(pilot.email, periodMonth);
        const verdict = looksExecutedFromBody(probe.body);
        return json(200, {
          ok: true,
          period_month: periodMonth,
          pilot: { email_domain: pilot.email.split("@")[1] || null, rp_id: pilot.rpId, hr_id: pilot.hrId, reason: pilot.reason },
          http_status: probe.http_status,
          executed: verdict.executed,
          signals: verdict.signals,
          body_field_names: probe.body && typeof probe.body === "object" ? Object.keys(probe.body) : [],
        });
      }

      // ---- discover_and_seed_runs ----
      // Iterate months in [period_from..period_to], probe view-payroll for a
      // pilot employee, and for each month whose response looks executed,
      // upsert a hr_razorpay_payroll_runs row with status='bulk_applied' so
      // pull_payslips_for_period / import_payslip_history_range can proceed.
      // Also auto-verifies the payslip envelope on first 2xx from the API.
      if (action === "discover_and_seed_runs") {
        const importParams = payload?.payload && typeof payload.payload === "object" ? payload.payload : payload;
        const from = String(importParams?.period_from || "").trim();
        const to = String(importParams?.period_to || "").trim();
        if (!/^\d{4}-\d{2}$/.test(from) || !/^\d{4}-\d{2}$/.test(to)) {
          return json(400, { error: "period_from/period_to must be YYYY-MM" });
        }
        const [fy, fm] = from.split("-").map(Number);
        const [ty, tm] = to.split("-").map(Number);
        if (fy * 12 + fm > ty * 12 + tm) return json(400, { error: "period_from must be <= period_to" });

        const pilot = await resolvePilotEmail(importParams);
        if (!pilot.email) return json(400, { error: "No pilot email resolved for discovery", reason: pilot.reason });

        const maxMonths = 36;
        const months: string[] = [];
        let cy = fy, cm2 = fm;
        while (cy * 12 + cm2 <= ty * 12 + tm) {
          months.push(`${String(cy).padStart(4, "0")}-${String(cm2).padStart(2, "0")}`);
          cm2++; if (cm2 > 12) { cm2 = 1; cy++; }
          if (months.length >= maxMonths) break;
        }

        let anySuccessfulHttp = false;
        const perMonth: any[] = [];
        for (const pm of months) {
          const iso = `${pm}-01`;
          const probe = await viewPayrollProbe(pilot.email, pm);
          const verdict = looksExecutedFromBody(probe.body);
          if (probe.http_status >= 200 && probe.http_status < 300) anySuccessfulHttp = true;

          const { data: existing } = await svc.from("hr_razorpay_payroll_runs")
            .select("id,status").eq("period_month", iso).maybeSingle();

          let seeded = false;
          let action_taken = "skipped";
          if (verdict.executed) {
            if (!existing) {
              const { error: insErr } = await svc.from("hr_razorpay_payroll_runs").insert({
                period_month: iso,
                status: "bulk_applied",
                envelope_verified: true,
                envelope_verified_by: authed.userId,
                envelope_verified_at: new Date().toISOString(),
                apply_response: {
                  source: "discover_and_seed_runs",
                  pilot_rp_id: pilot.rpId,
                  http_status: probe.http_status,
                  signals: verdict.signals,
                },
                created_by: authed.userId,
              });
              if (!insErr) { seeded = true; action_taken = "inserted"; }
              else action_taken = `insert_error: ${insErr.message}`;
            } else if (existing.status === "draft") {
              const { error: updErr } = await svc.from("hr_razorpay_payroll_runs")
                .update({ status: "bulk_applied", updated_at: new Date().toISOString() })
                .eq("id", existing.id);
              if (!updErr) { seeded = true; action_taken = "promoted_from_draft"; }
              else action_taken = `update_error: ${updErr.message}`;
            } else {
              action_taken = `existing_${existing.status}`;
            }
          } else {
            action_taken = "not_executed";
          }

          perMonth.push({
            period_month: pm,
            http_status: probe.http_status,
            executed: verdict.executed,
            signals: verdict.signals,
            existing_status: existing?.status ?? null,
            seeded,
            action: action_taken,
          });
        }

        // Self-verify the payslip endpoint the first time we successfully hit
        // view-payroll (the same endpoint pull_payslips_for_period uses).
        if (anySuccessfulHttp && (!p9Settings?.pull_payslips_endpoint_verified || !p9Settings?.pull_payslips_envelope_key)) {
          await svc.from("hr_razorpay_settings").update({
            pull_payslips_endpoint_verified: true,
            pull_payslips_envelope_key: "payroll:view-payroll",
            pull_payslips_envelope_verified_at: new Date().toISOString(),
            pull_payslips_envelope_verified_by: authed.userId,
          }).eq("is_singleton", true);
        }

        await logSync(svc, {
          action: "discover_and_seed_runs",
          http_status: 200,
          razorpay_employee_id: pilot.rpId || "",
          hr_employee_id: pilot.hrId,
          field_diff_summary: {
            from, to, months: months.length,
            pilot_reason: pilot.reason,
            executed_count: perMonth.filter((m) => m.executed).length,
            seeded_count: perMonth.filter((m) => m.seeded).length,
          },
          error_text: null,
          actor_user_id: authed.userId,
        });

        return json(200, {
          ok: true,
          pilot: { email_domain: pilot.email.split("@")[1] || null, rp_id: pilot.rpId, hr_id: pilot.hrId, reason: pilot.reason },
          months: months.length,
          summary: {
            executed: perMonth.filter((m) => m.executed).length,
            seeded: perMonth.filter((m) => m.seeded).length,
            already_bulk_applied: perMonth.filter((m) => (m.existing_status === "bulk_applied" || m.existing_status === "locked")).length,
            not_executed: perMonth.filter((m) => !m.executed).length,
          },
          per_month: perMonth,
          note: "Executed months are auto-seeded as bulk_applied so pull_payslips_for_period can proceed. Non-executed months are skipped (view-payroll would return CTC/12 defaults).",
        });
      }

      // ---- pull_payslips_for_period ----
      // Guards (mirroring pull_payouts_for_period): the underlying endpoint
      // is payroll:view-payroll, which returns *pre-execution defaults*
      // (typically basic-component ≈ CTC/12) for months that have not yet
      // been bulk_applied/locked in RazorpayX. Ingesting those as payslips
      // pollutes hr_payslips history with fake identical months.
      if (action === "pull_payslips_for_period") {
        if (!p9Settings?.pull_payslips_endpoint_verified || !p9Settings?.pull_payslips_envelope_key) {
          return json(400, { error: "Payslips envelope not verified. Record a probe-verified envelope first." });
        }
        const periodMonthStr = String(payload?.period_month || "").trim();
        const pmMatch = /^(\d{4})-(\d{2})$/.exec(periodMonthStr);
        if (!pmMatch) return json(400, { error: "period_month must be YYYY-MM" });
        const periodMonthISO = `${pmMatch[1]}-${pmMatch[2]}-01`;

        // Refuse the pull unless the payroll run for this month has actually
        // been executed on the RazorpayX side. Otherwise view-payroll returns
        // draft/setup defaults which are indistinguishable from finalised data.
        const allowRunStatuses = ["bulk_applied", "locked", "recalled"];
        const { data: preRunRow } = await svc.from("hr_razorpay_payroll_runs")
          .select("status").eq("period_month", periodMonthISO).maybeSingle();
        const bypassRunGate = payload?.bypass_run_gate === true;
        if (!bypassRunGate) {
          if (!preRunRow) {
            return json(400, {
              error: "No payroll run found for this period in RazorpayX. Payslip history is only available after a run is bulk_applied.",
            });
          }
          if (!allowRunStatuses.includes(preRunRow.status)) {
            return json(400, {
              error: `Payslip pull requires the RazorpayX payroll run to be bulk_applied (or later). Current status: ${preRunRow.status}.`,
            });
          }
        }

        const pull = await pullPayrollViewForPeriod(svc, periodMonthStr, authed.userId || null);
        await svc.from("hr_razorpay_settings")
          .update({ last_payslips_pull_at: new Date().toISOString() }).eq("is_singleton", true);

        await logSync(svc, {
          action: "pull_payslips",
          http_status: 200,
          razorpay_employee_id: "",
          hr_employee_id: null,
          field_diff_summary: {
            period_month: periodMonthISO,
            endpoint: "payroll:view-payroll",
            run_status: preRunRow?.status ?? "none",
            bypass_run_gate: bypassRunGate,
            ...pull,
          },
          error_text: null,
          actor_user_id: authed.userId,
        });

        return json(200, {
          ok: true,
          period_month: periodMonthISO,
          summary: { total: pull.pulled, withPdf: pull.withPdf, failed: pull.failed, noEmail: pull.noEmail, noRecord: pull.noRecord, upsertErrors: pull.upsertErrors },
        });
      }

      // ---- pull_taxdocs_for_year ----
      if (action === "pull_taxdocs_for_year") {
        if (!p9Settings?.pull_taxdocs_endpoint_verified || !p9Settings?.pull_taxdocs_envelope_key) {
          return json(400, { error: "Tax-docs envelope not verified. Record a probe-verified envelope first." });
        }
        const fiscalYear = String(payload?.fiscal_year || "").trim();
        if (!/^\d{4}-\d{2}$/.test(fiscalYear)) return json(400, { error: "fiscal_year must be YYYY-YY (e.g. 2025-26)" });
        const docType = String(payload?.doc_type || "form16").trim();
        const [type, subType] = String(p9Settings.pull_taxdocs_envelope_key).split(":");

        const r = await razorpayPost(type || docType, subType || "view", { "fiscal-year": fiscalYear });
        if ((r as any).networkError) return json(502, { error: `NETWORK: ${(r as any).networkError}` });
        if (r.httpStatus < 200 || r.httpStatus >= 300) {
          return json(502, { error: "Razorpay returned non-2xx", http_status: r.httpStatus, body: r.parsed });
        }
        const rawList = extractList(r.parsed);

        // Load hr_employee mapping for enrichment.
        const { data: maps } = await svc.from("hr_razorpay_employee_map")
          .select("hr_employee_id,razorpay_employee_id");
        const hrByRp = new Map((maps || []).map((m: any) => [String(m.razorpay_employee_id), m.hr_employee_id]));

        const upserts: any[] = [];
        for (const p of rawList) {
          const rpId = pickStr(p, ["employee-id", "employee_id", "employeeId"]);
          if (!rpId) continue;
          const docId = pickStr(p, ["document-id", "document_id", "id", "form16-id"]);
          const pdf = pickStr(p, ["pdf-url", "pdf_url", "download-url", "url"]);
          const gross = pickNum(p, ["gross-annual", "gross_annual", "gross", "total-earnings"]);
          const tds = pickNum(p, ["total-tds", "total_tds", "tds", "tds-deducted"]);
          upserts.push({
            fiscal_year: fiscalYear,
            doc_type: docType,
            razorpay_employee_id: String(rpId),
            hr_employee_id: hrByRp.get(String(rpId)) || null,
            razorpay_document_id: docId,
            pdf_url: pdf,
            gross_annual: gross,
            total_tds: tds,
            source_payload: p,
            pulled_by: authed.userId,
          });
        }

        if (upserts.length) {
          for (let i = 0; i < upserts.length; i += 200) {
            const chunk = upserts.slice(i, i + 200);
            const { error: upErr } = await svc.from("hr_razorpay_taxdoc_records")
              .upsert(chunk, { onConflict: "fiscal_year,razorpay_employee_id,doc_type" });
            if (upErr) return json(500, { error: upErr.message });
          }
        }
        await svc.from("hr_razorpay_settings")
          .update({ last_taxdocs_pull_at: new Date().toISOString() }).eq("is_singleton", true);

        await logSync(svc, {
          action: "pull_taxdocs",
          http_status: 200,
          razorpay_employee_id: "",
          hr_employee_id: null,
          field_diff_summary: { fiscal_year: fiscalYear, doc_type: docType, total: upserts.length },
          error_text: null,
          actor_user_id: authed.userId,
        });

        return json(200, {
          ok: true,
          fiscal_year: fiscalYear,
          doc_type: docType,
          summary: { total: upserts.length, withPdf: upserts.filter((u) => u.pdf_url).length },
        });
      }
    }

    // ============================================================
    // Phase 9.5 — Reflect RazorpayX payroll records into hr_payslips history
    // Actions:
    //   reflect_payslip_period       — copy hr_razorpay_payslip_records for one YYYY-MM
    //                                  into hr_payslips (source='razorpay_import').
    //   import_payslip_history_range — orchestrator: for each month in [from..to],
    //                                  (a) pull from Razorpay (if envelope verified),
    //                                  (b) reflect shadow rows into hr_payslips.
    // Verified Opfin API surface has no payslip/PDF/download endpoint. The canonical
    // read source is payroll:view-payroll; PDFs remain dashboard-only.
    // ============================================================
    if (action === "reflect_payslip_period" || action === "import_payslip_history_range") {
      // Shared reflector: given a YYYY-MM-01 ISO date, upsert shadow rows into hr_payslips.

      async function reflectOne(periodISO: string) {
        const { data: shadow, error: shErr } = await svc
          .from("hr_razorpay_payslip_records")
          .select("hr_employee_id,gross_earnings,total_deductions,net_pay,tds_amount,pdf_url,razorpay_payslip_id,period_month,pf_amount,esi_amount,professional_tax,deduction_amount,additions_detail,source_payload")
          .eq("period_month", periodISO)
          .not("hr_employee_id", "is", null);
        if (shErr) throw new Error(`shadow load failed: ${shErr.message}`);
        const rows = shadow || [];
        if (!rows.length) return { reflected: 0, withPdf: 0, missingMap: 0 };

        const { count: unmappedCount } = await svc
          .from("hr_razorpay_payslip_records")
          .select("razorpay_employee_id", { count: "exact", head: true })
          .eq("period_month", periodISO)
          .is("hr_employee_id", null);

        const toMoneyMap = (obj: any): Record<string, number> | null => {
          if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
          const out: Record<string, number> = {};
          for (const [k, v] of Object.entries(obj)) {
            if (v == null) continue;
            if (typeof v === "number" && isFinite(v)) { out[k] = Number(v); continue; }
            if (typeof v === "object" && v !== null && "amount" in (v as any)) {
              const n = Number((v as any).amount);
              if (isFinite(n)) out[k] = n;
              continue;
            }
            const n = Number(v as any);
            if (isFinite(n)) out[k] = n;
          }
          return Object.keys(out).length ? out : null;
        };

        const inserts = rows.map((r: any) => {
          const gross = Number(r.gross_earnings || 0);
          const ded = Number(r.total_deductions || 0);
          const net = Number(r.net_pay || 0);
          const resp = r?.source_payload?.response || {};
          // Earnings breakdown = { salary, arrears, ...additions }
          const earnings: Record<string, number> = {};
          const salaryN = Number(resp?.salary);
          if (isFinite(salaryN) && salaryN) earnings["Salary"] = salaryN;
          const arrearsN = Number(resp?.arrears);
          if (isFinite(arrearsN) && arrearsN) earnings["Arrears"] = arrearsN;
          const addsMap = toMoneyMap(r?.additions_detail || resp?.additions);
          if (addsMap) Object.assign(earnings, addsMap);
          const dedMap = toMoneyMap(resp?.deductions);
          return {
            employee_id: r.hr_employee_id,
            payroll_run_id: null,
            source: "razorpay_import",
            period_month: r.period_month,
            razorpay_payslip_id: r.razorpay_payslip_id,
            pdf_url: r.pdf_url,
            gross_salary: gross,
            total_earnings: gross,
            total_deductions: ded,
            net_salary: net,
            tds_amount: Number(r.tds_amount || 0),
            pf_amount: r.pf_amount,
            esi_amount: r.esi_amount,
            professional_tax: r.professional_tax,
            earnings_breakdown: Object.keys(earnings).length ? earnings : null,
            deductions_breakdown: dedMap,
            status: "imported",
          };
        });

        let reflected = 0, withPdf = 0;
        for (let i = 0; i < inserts.length; i += 200) {
          const chunk = inserts.slice(i, i + 200);
          const { error: upErr, count } = await svc
            .from("hr_payslips")
            .upsert(chunk, { onConflict: "employee_id,period_month", ignoreDuplicates: false, count: "exact" });
          if (upErr) throw new Error(`hr_payslips upsert failed: ${upErr.message}`);
          reflected += count ?? chunk.length;
          withPdf += chunk.filter((c: any) => c.pdf_url).length;
        }
        return { reflected, withPdf, missingMap: unmappedCount || 0 };
      }


      if (action === "reflect_payslip_period") {
        const pm = String(payload?.period_month || "").trim();
        const m = /^(\d{4})-(\d{2})$/.exec(pm);
        if (!m) return json(400, { error: "period_month must be YYYY-MM" });
        const iso = `${m[1]}-${m[2]}-01`;
        try {
          const res = await reflectOne(iso);
          await logSync(svc, {
            action: "reflect_payslips",
            http_status: 200,
            razorpay_employee_id: "",
            hr_employee_id: null,
            field_diff_summary: { period_month: iso, ...res },
            error_text: null,
            actor_user_id: authed.userId,
          });
          return json(200, { ok: true, period_month: iso, ...res });
        } catch (e) {
          return json(500, { error: (e as Error).message });
        }
      }

      // import_payslip_history_range
      // Browser invoke sends business parameters under `payload`; scheduler sends
      // them top-level. Support both so the HR page and cron execute the same flow.
      const importParams = payload?.payload && typeof payload.payload === "object" ? payload.payload : payload;
      const from = String(importParams?.period_from || "").trim(); // YYYY-MM
      const to = String(importParams?.period_to || "").trim();     // YYYY-MM
      const alsoPull = importParams?.pull_from_razorpay !== false; // default true
      if (!/^\d{4}-\d{2}$/.test(from) || !/^\d{4}-\d{2}$/.test(to)) {
        return json(400, { error: "period_from/period_to must be YYYY-MM" });
      }
      const [fy, fm] = from.split("-").map(Number);
      const [ty, tm] = to.split("-").map(Number);
      if (fy * 12 + fm > ty * 12 + tm) {
        return json(400, { error: "period_from must be <= period_to" });
      }
      // Cap the sweep to prevent runaway calls (max 36 months in one shot).
      const maxMonths = 36;
      const months: string[] = [];
      let cy = fy, cm2 = fm;
      while (cy * 12 + cm2 <= ty * 12 + tm) {
        months.push(`${String(cy).padStart(4, "0")}-${String(cm2).padStart(2, "0")}`);
        cm2++; if (cm2 > 12) { cm2 = 1; cy++; }
        if (months.length >= maxMonths) break;
      }

      // Preload payroll-run statuses for gating the pull step per month.
      const monthISOs = months.map((m) => `${m}-01`);
      const { data: runsForRange } = await svc
        .from("hr_razorpay_payroll_runs")
        .select("period_month,status")
        .in("period_month", monthISOs);
      const runStatusByISO = new Map<string, string>((runsForRange || []).map((r: any) => [String(r.period_month), String(r.status)]));
      const allowRunStatuses = new Set(["bulk_applied", "locked", "recalled"]);

      const perMonth: any[] = [];
      let totalReflected = 0, totalWithPdf = 0, totalMissingMap = 0, totalPulled = 0, pullFailures = 0;
      let totalNoRecord = 0, totalNoEmail = 0, totalUpsertErrors = 0;
      let skippedNoRun = 0, skippedUnfinalised = 0;

      for (const pm of months) {
        const iso = `${pm}-01`;
        let pulled = 0, pullErr: string | null = null;
        const runStatus = runStatusByISO.get(iso) || null;
        const runFinalised = runStatus ? allowRunStatuses.has(runStatus) : false;

        if (alsoPull) {
          if (!runStatus) {
            pullErr = "skipped: no RazorpayX payroll run for this month (view-payroll would return CTC/12 defaults)";
            skippedNoRun++;
          } else if (!runFinalised) {
            pullErr = `skipped: RazorpayX run not finalised (status=${runStatus})`;
            skippedUnfinalised++;
          } else {
            try {
              const pull = await pullPayrollViewForPeriod(svc, pm, authed.userId || null);
              pulled = pull.pulled;
              totalNoRecord += pull.noRecord;
              totalNoEmail += pull.noEmail;
              totalUpsertErrors += pull.upsertErrors;
              if (pull.failed || pull.upsertErrors) pullErr = `failed=${pull.failed}; upsertErrors=${pull.upsertErrors}`;
            } catch (e) {
              pullErr = (e as Error).message;
            }
            if (pullErr) pullFailures++;
          }
        }

        // Reflect whatever we have (existing rows only when there's no finalised run to pull).
        let refRes = { reflected: 0, withPdf: 0, missingMap: 0 };
        try { refRes = await reflectOne(iso); } catch (e) { pullErr = (pullErr || "") + `; reflect: ${(e as Error).message}`; }

        totalPulled += pulled;
        totalReflected += refRes.reflected;
        totalWithPdf += refRes.withPdf;
        totalMissingMap += refRes.missingMap;
        perMonth.push({ period_month: pm, run_status: runStatus, pulled, ...refRes, error: pullErr });
      }

      await svc.from("hr_razorpay_settings")
        .update({ last_payslips_pull_at: new Date().toISOString() }).eq("is_singleton", true);

      await logSync(svc, {
        action: "import_payslip_history_range",
        http_status: 200,
        razorpay_employee_id: "",
        hr_employee_id: null,
        field_diff_summary: {
          from, to, months: months.length,
            endpoint: "payroll:view-payroll", pdf_source: "dashboard_only_not_api", totalPulled, totalReflected, totalWithPdf,
            totalMissingMap, pullFailures, totalNoRecord, totalNoEmail, totalUpsertErrors,
            skippedNoRun, skippedUnfinalised,
        },
        error_text: null,
        actor_user_id: authed.userId,
      });

      return json(200, {
        ok: true,
        envelope_ready: true,
        endpoint: "payroll:view-payroll",
        pdf_source: "dashboard_only_not_api",
        months: months.length,
        totals: { pulled: totalPulled, reflected: totalReflected, withPdf: totalWithPdf, missingMap: totalMissingMap, pullFailures, noRecord: totalNoRecord, noEmail: totalNoEmail, upsertErrors: totalUpsertErrors, skippedNoRun, skippedUnfinalised },
        per_month: perMonth,
        note: "Only months whose RazorpayX payroll run is bulk_applied/locked/recalled are pulled. Months without a finalised run are skipped so CTC/12 defaults are never persisted as history. Payslip PDFs are not exposed by the Opfin API and remain dashboard-only.",
      });
    }


    // ============================================================
    // Phase 10 — Ledger Reconciliation
    // Actions:
    //   probe_ledger_scope           — dry count of payouts vs candidate bank txns
    //   auto_match_ledger_period     — match by UTR first, then amount+date window
    //   manual_link_ledger           — link a payout to a specific bank txn
    //   waive_ledger_match           — record a waiver for a payout row
    //   unlink_ledger                — remove a link (blocked once signed off)
    //   review_ledger_period         — flag period as reviewed (pre-signoff)
    //   signoff_ledger_period        — hard-lock the period; requires Super Admin flag
    //   reopen_ledger_period         — audited reopen with reason
    //   recompute_ledger_totals      — refresh the period totals row
    // No external Razorpay calls — purely internal cross-referencing.
    // ============================================================
    if (
      action === "probe_ledger_scope" ||
      action === "auto_match_ledger_period" ||
      action === "manual_link_ledger" ||
      action === "waive_ledger_match" ||
      action === "unlink_ledger" ||
      action === "review_ledger_period" ||
      action === "signoff_ledger_period" ||
      action === "reopen_ledger_period" ||
      action === "recompute_ledger_totals"
    ) {
      const periodMonthStr = String(payload?.period_month || "").trim();
      const pmMatch = /^(\d{4})-(\d{2})$/.exec(periodMonthStr);
      if (!pmMatch) return json(400, { error: "period_month must be YYYY-MM" });
      const periodMonthISO = `${pmMatch[1]}-${pmMatch[2]}-01`;

      // Helper: current period status.
      async function loadPeriod() {
        const { data } = await svc.from("hr_razorpay_ledger_periods")
          .select("*").eq("period_month", periodMonthISO).maybeSingle();
        return data;
      }
      async function ensurePeriod() {
        let p = await loadPeriod();
        if (!p) {
          const { data: ins } = await svc.from("hr_razorpay_ledger_periods")
            .insert({ period_month: periodMonthISO, status: "draft" })
            .select("*").single();
          p = ins;
        }
        return p;
      }
      async function refreshTotals(): Promise<{
        total_paid: number; total_matched: number; total_unmatched: number; total_waived: number;
      }> {
        const { data: payouts } = await svc.from("hr_razorpay_payout_records")
          .select("id, paid_amount").eq("period_month", periodMonthISO);
        const { data: matches } = await svc.from("hr_razorpay_ledger_matches")
          .select("payout_record_id, match_method, matched_amount")
          .eq("period_month", periodMonthISO);
        const matchedIds = new Set((matches || []).filter((m: any) => m.match_method !== "waived").map((m: any) => m.payout_record_id));
        const waivedIds = new Set((matches || []).filter((m: any) => m.match_method === "waived").map((m: any) => m.payout_record_id));

        let total_paid = 0, total_matched = 0, total_unmatched = 0, total_waived = 0;
        for (const p of (payouts || []) as any[]) {
          const amt = Number(p.paid_amount || 0);
          total_paid += amt;
          if (matchedIds.has(p.id)) total_matched += amt;
          else if (waivedIds.has(p.id)) total_waived += amt;
          else total_unmatched += amt;
        }
        const round = (n: number) => Number(n.toFixed(2));
        const totals = {
          total_paid: round(total_paid),
          total_matched: round(total_matched),
          total_unmatched: round(total_unmatched),
          total_waived: round(total_waived),
        };
        await svc.from("hr_razorpay_ledger_periods")
          .update(totals).eq("period_month", periodMonthISO);
        return totals;
      }

      async function assertMutableOrThrow(): Promise<{ ok: true } | { ok: false; err: string }> {
        const p = await loadPeriod();
        if (p?.status === "signed_off") {
          return { ok: false, err: "Ledger period is signed off. File a reopen_ledger_period first." };
        }
        return { ok: true };
      }

      // ---- probe_ledger_scope -------------------------------------------
      if (action === "probe_ledger_scope") {
        const { data: payouts } = await svc.from("hr_razorpay_payout_records")
          .select("id, utr, paid_amount, paid_at, hr_employee_id, razorpay_employee_id")
          .eq("period_month", periodMonthISO);
        const { data: matches } = await svc.from("hr_razorpay_ledger_matches")
          .select("payout_record_id, match_method").eq("period_month", periodMonthISO);
        const matchedIds = new Set((matches || []).map((m: any) => m.payout_record_id));

        // Candidate bank txns: DEBIT / EXPENSE / TRANSFER_OUT during ±3 days around period.
        const startIso = periodMonthISO;
        const endDate = new Date(periodMonthISO);
        endDate.setUTCMonth(endDate.getUTCMonth() + 1);
        const endIso = endDate.toISOString().slice(0, 10);
        const { data: bankTxns } = await svc.from("bank_transactions")
          .select("id, reference_number, amount, transaction_date, transaction_type")
          .in("transaction_type", ["DEBIT", "EXPENSE", "TRANSFER_OUT"])
          .gte("transaction_date", startIso)
          .lt("transaction_date", endIso);

        const utrIndex = new Map<string, number>();
        for (const t of (bankTxns || []) as any[]) {
          const utr = String(t.reference_number || "").trim().toUpperCase();
          if (utr) utrIndex.set(utr, (utrIndex.get(utr) || 0) + 1);
        }
        let matchableByUtr = 0;
        for (const p of (payouts || []) as any[]) {
          const utr = String(p.utr || "").trim().toUpperCase();
          if (utr && utrIndex.has(utr)) matchableByUtr++;
        }

        return json(200, {
          ok: true,
          period_month: periodMonthISO,
          payouts_total: (payouts || []).length,
          already_matched: matchedIds.size,
          candidate_bank_txns: (bankTxns || []).length,
          projected_auto_match_by_utr: matchableByUtr,
        });
      }

      // ---- auto_match_ledger_period -------------------------------------
      if (action === "auto_match_ledger_period") {
        const gate = await assertMutableOrThrow();
        if (!gate.ok) return json(400, { error: gate.err });
        await ensurePeriod();

        const { data: payouts } = await svc.from("hr_razorpay_payout_records")
          .select("id, utr, paid_amount, paid_at, hr_employee_id")
          .eq("period_month", periodMonthISO);
        const { data: existingMatches } = await svc.from("hr_razorpay_ledger_matches")
          .select("payout_record_id, bank_transaction_id")
          .eq("period_month", periodMonthISO);
        const matchedPayoutIds = new Set((existingMatches || []).map((m: any) => m.payout_record_id));
        const claimedBankIds = new Set((existingMatches || []).filter((m: any) => m.bank_transaction_id).map((m: any) => m.bank_transaction_id));

        const startIso = periodMonthISO;
        const endDate = new Date(periodMonthISO);
        endDate.setUTCMonth(endDate.getUTCMonth() + 1);
        const endIso = endDate.toISOString().slice(0, 10);
        const { data: bankTxns } = await svc.from("bank_transactions")
          .select("id, reference_number, amount, transaction_date, transaction_type")
          .in("transaction_type", ["DEBIT", "EXPENSE", "TRANSFER_OUT"])
          .gte("transaction_date", startIso)
          .lt("transaction_date", endIso);

        // Index by UTR and by (amount, date).
        const byUtr = new Map<string, any>();
        for (const t of (bankTxns || []) as any[]) {
          const utr = String(t.reference_number || "").trim().toUpperCase();
          if (utr && !byUtr.has(utr)) byUtr.set(utr, t);
        }

        const inserts: any[] = [];
        const actorName = String(payload?.actor_name || "").trim() || null;
        for (const p of (payouts || []) as any[]) {
          if (matchedPayoutIds.has(p.id)) continue;
          if (!p.paid_amount || Number(p.paid_amount) <= 0) continue;
          const utr = String(p.utr || "").trim().toUpperCase();
          let hit: any = null;
          let method: "auto_utr" | "auto_amount" | null = null;

          if (utr && byUtr.has(utr) && !claimedBankIds.has(byUtr.get(utr).id)) {
            hit = byUtr.get(utr);
            method = "auto_utr";
          }
          if (!hit) {
            // Fallback: single-amount match within ±3 days of paid_at.
            const paidAt = p.paid_at ? new Date(p.paid_at) : null;
            const candidates = (bankTxns || []).filter((t: any) =>
              !claimedBankIds.has(t.id) &&
              Math.abs(Number(t.amount) - Number(p.paid_amount)) < 0.5 &&
              (!paidAt || Math.abs(new Date(t.transaction_date).getTime() - paidAt.getTime()) <= 3 * 86400000)
            );
            if (candidates.length === 1) { hit = candidates[0]; method = "auto_amount"; }
          }
          if (!hit || !method) continue;

          claimedBankIds.add(hit.id);
          inserts.push({
            period_month: periodMonthISO,
            payout_record_id: p.id,
            bank_transaction_id: hit.id,
            match_method: method,
            matched_amount: Number(hit.amount),
            variance: Number((Number(hit.amount) - Number(p.paid_amount)).toFixed(2)),
            matched_by: authed.userId,
            matched_by_name: actorName,
          });
        }

        if (inserts.length) {
          const { error } = await svc.from("hr_razorpay_ledger_matches").insert(inserts);
          if (error) return json(500, { error: error.message });
        }
        const totals = await refreshTotals();
        await logSync(svc, {
          action: "ledger_auto_match",
          http_status: 0, razorpay_employee_id: "", hr_employee_id: null,
          field_diff_summary: { period_month: periodMonthISO, matched: inserts.length, ...totals },
          error_text: null, actor_user_id: authed.userId,
        });
        return json(200, { ok: true, matched: inserts.length, totals });
      }

      // ---- manual_link_ledger -------------------------------------------
      if (action === "manual_link_ledger") {
        const gate = await assertMutableOrThrow();
        if (!gate.ok) return json(400, { error: gate.err });
        await ensurePeriod();

        const payoutRecordId = String(payload?.payout_record_id || "").trim();
        const bankTxnId = String(payload?.bank_transaction_id || "").trim();
        const note = String(payload?.note || "").trim() || null;
        const actorName = String(payload?.actor_name || "").trim() || null;
        if (!payoutRecordId || !bankTxnId) return json(400, { error: "payout_record_id and bank_transaction_id are required" });

        const [{ data: pRow }, { data: bRow }] = await Promise.all([
          svc.from("hr_razorpay_payout_records").select("id, paid_amount, period_month").eq("id", payoutRecordId).maybeSingle(),
          svc.from("bank_transactions").select("id, amount").eq("id", bankTxnId).maybeSingle(),
        ]);
        if (!pRow) return json(404, { error: "Payout record not found" });
        if (!bRow) return json(404, { error: "Bank transaction not found" });
        if (pRow.period_month !== periodMonthISO) {
          return json(400, { error: "Payout does not belong to the given period_month" });
        }

        const variance = Number((Number(bRow.amount) - Number(pRow.paid_amount || 0)).toFixed(2));
        const { error } = await svc.from("hr_razorpay_ledger_matches").upsert({
          period_month: periodMonthISO,
          payout_record_id: payoutRecordId,
          bank_transaction_id: bankTxnId,
          match_method: "manual",
          matched_amount: Number(bRow.amount),
          variance,
          note,
          matched_by: authed.userId,
          matched_by_name: actorName,
          matched_at: new Date().toISOString(),
        }, { onConflict: "payout_record_id" });
        if (error) return json(500, { error: error.message });

        const totals = await refreshTotals();
        return json(200, { ok: true, variance, totals });
      }

      // ---- waive_ledger_match -------------------------------------------
      if (action === "waive_ledger_match") {
        const gate = await assertMutableOrThrow();
        if (!gate.ok) return json(400, { error: gate.err });
        await ensurePeriod();

        const payoutRecordId = String(payload?.payout_record_id || "").trim();
        const reason = String(payload?.reason || "").trim();
        const actorName = String(payload?.actor_name || "").trim() || null;
        if (!payoutRecordId) return json(400, { error: "payout_record_id is required" });
        if (reason.length < 8) return json(400, { error: "reason (min 8 chars) is required for a waiver" });

        const { error } = await svc.from("hr_razorpay_ledger_matches").upsert({
          period_month: periodMonthISO,
          payout_record_id: payoutRecordId,
          bank_transaction_id: null,
          match_method: "waived",
          matched_amount: 0,
          variance: null,
          note: reason,
          matched_by: authed.userId,
          matched_by_name: actorName,
          matched_at: new Date().toISOString(),
        }, { onConflict: "payout_record_id" });
        if (error) return json(500, { error: error.message });

        const totals = await refreshTotals();
        return json(200, { ok: true, totals });
      }

      // ---- unlink_ledger -----------------------------------------------
      if (action === "unlink_ledger") {
        const gate = await assertMutableOrThrow();
        if (!gate.ok) return json(400, { error: gate.err });

        const payoutRecordId = String(payload?.payout_record_id || "").trim();
        if (!payoutRecordId) return json(400, { error: "payout_record_id is required" });
        const { error } = await svc.from("hr_razorpay_ledger_matches")
          .delete().eq("payout_record_id", payoutRecordId);
        if (error) return json(500, { error: error.message });

        const totals = await refreshTotals();
        return json(200, { ok: true, totals });
      }

      // ---- review_ledger_period ----------------------------------------
      if (action === "review_ledger_period") {
        const gate = await assertMutableOrThrow();
        if (!gate.ok) return json(400, { error: gate.err });
        await ensurePeriod();

        const totals = await refreshTotals();
        const actorName = String(payload?.actor_name || "").trim() || null;
        await svc.from("hr_razorpay_ledger_periods").update({
          status: "reviewed",
          reviewed_by: authed.userId,
          reviewed_by_name: actorName,
          reviewed_at: new Date().toISOString(),
        }).eq("period_month", periodMonthISO);
        return json(200, { ok: true, totals });
      }

      // ---- signoff_ledger_period ---------------------------------------
      if (action === "signoff_ledger_period") {
        const p = await ensurePeriod();
        if (p.status === "signed_off") return json(400, { error: "Period already signed off." });
        if (p.status !== "reviewed") {
          return json(400, { error: "Period must be reviewed before sign-off." });
        }

        // Every payout must be either matched or explicitly waived — no bare unmatched rows.
        const totals = await refreshTotals();
        if (Number(totals.total_unmatched) > 0) {
          return json(400, {
            error: `Cannot sign off — ${Number(totals.total_unmatched).toFixed(2)} still unmatched. Match, waive, or unlink to zero.`,
          });
        }

        const actorName = String(payload?.actor_name || "").trim() || null;
        await svc.from("hr_razorpay_ledger_periods").update({
          status: "signed_off",
          signed_off_by: authed.userId,
          signed_off_by_name: actorName,
          signed_off_at: new Date().toISOString(),
        }).eq("period_month", periodMonthISO);

        await logSync(svc, {
          action: "ledger_signoff",
          http_status: 0, razorpay_employee_id: "", hr_employee_id: null,
          field_diff_summary: { period_month: periodMonthISO, ...totals },
          error_text: null, actor_user_id: authed.userId,
        });
        return json(200, { ok: true, totals });
      }

      // ---- reopen_ledger_period ----------------------------------------
      if (action === "reopen_ledger_period") {
        const p = await loadPeriod();
        if (!p) return json(404, { error: "No ledger period for this month." });
        if (p.status !== "signed_off") return json(400, { error: "Only signed-off periods can be reopened." });
        const reason = String(payload?.reason || "").trim();
        if (reason.length < 12) return json(400, { error: "reason (min 12 chars) is required for reopen" });

        const actorName = String(payload?.actor_name || "").trim() || null;
        await svc.from("hr_razorpay_ledger_periods").update({
          status: "reopened",
          reopen_reason: reason,
          reopened_by: authed.userId,
          reopened_by_name: actorName,
          reopened_at: new Date().toISOString(),
        }).eq("period_month", periodMonthISO);

        await logSync(svc, {
          action: "ledger_reopen",
          http_status: 0, razorpay_employee_id: "", hr_employee_id: null,
          field_diff_summary: { period_month: periodMonthISO, reason_len: reason.length },
          error_text: null, actor_user_id: authed.userId,
        });
        return json(200, { ok: true });
      }

      // ---- recompute_ledger_totals -------------------------------------
      if (action === "recompute_ledger_totals") {
        await ensurePeriod();
        const totals = await refreshTotals();
        return json(200, { ok: true, totals });
      }
    }

    // ---------------------------------------------------------------------
    // create_onboarding_invite — create RazorpayX employee invite from an
    // onboarding draft BEFORE HRMS/ESSL finalization. RazorpayX is the first
    // identity issuer; ESSL badge/PIN remains locked until HR later verifies
    // the Employee ID generated by RazorpayX after self-registration.
    // ---------------------------------------------------------------------
    if (action === "create_onboarding_invite") {
      const onboardingId = payload?.onboarding_id ? String(payload.onboarding_id) : "";
      if (!onboardingId) return json(400, { ok: false, error: "onboarding_id required" });

      const { data: ob, error: obErr } = await svc
        .from("hr_employee_onboarding")
        .select("id,employee_id,first_name,last_name,email,phone,gender,date_of_birth,date_of_joining,department_id,job_role,ctc,documents,bank_details,razorpay_reconciliation")
        .eq("id", onboardingId)
        .maybeSingle();
      if (obErr) return json(500, { ok: false, error: obErr.message });
      if (!ob) return json(404, { ok: false, error: "onboarding draft not found" });

      const deptName = ob.department_id
        ? (await svc.from("departments").select("name").eq("id", ob.department_id).maybeSingle()).data?.name || null
        : null;
      const fullName = [ob.first_name, ob.last_name].filter(Boolean).join(" ").trim();
      const docs = (ob.documents && typeof ob.documents === "object") ? ob.documents as any : {};
      const bank = (ob.bank_details && typeof ob.bank_details === "object") ? ob.bank_details as any : {};
      const pan = String(docs?.pan?.value || docs?.pan || "").trim().toUpperCase();
      const dojIso = ob.date_of_joining ? String(ob.date_of_joining) : null;
      const dobIso = ob.date_of_birth ? String(ob.date_of_birth) : null;
      const toDdMmYyyy = (iso: string | null) =>
        iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : null;
      const dojRp = toDdMmYyyy(dojIso);
      const accountNumber = String(bank?.account_number || "").trim();
      const ifsc = String(bank?.ifsc_code || "").trim().toUpperCase();
      const accountHolder = String(bank?.account_holder || fullName || "").trim();
      const ctcAnnual = Number(ob.ctc || 0);

      const missing: string[] = [];
      if (!fullName) missing.push("name");
      if (!ob.email) missing.push("email");
      if (!ob.phone) missing.push("phone");
      if (!pan || !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) missing.push("pan");
      if (!dojRp) missing.push("date_of_joining");
      if (!deptName) missing.push("department");
      if (!ob.job_role) missing.push("job_title");
      if (!ctcAnnual || ctcAnnual <= 0) missing.push("ctc_annual");
      if (!accountNumber) missing.push("bank_account_number");
      if (!ifsc || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) missing.push("bank_ifsc");
      if (!accountHolder) missing.push("bank_account_holder_name");
      if (missing.length) return json(400, { ok: false, reason: "missing_fields", missing });

      const createData: Record<string, any> = {
        email: String(ob.email).trim().toLowerCase(),
        name: fullName,
        type: "employee",
        "phone-number": normPhone(ob.phone),
        gender: ob.gender ? String(ob.gender).toLowerCase() : null,
        "date-of-birth": dobIso,
        "hiring-date": dojIso,
        hire_date: dojRp,
        "date-of-joining": dojRp,
        department: deptName,
        title: ob.job_role,
        pan,
        "bank-account-number": accountNumber,
        "bank-ifsc": ifsc,
        "bank-account-holder-name": accountHolder,
      };
      for (const k of Object.keys(createData)) {
        if (createData[k] === null || createData[k] === "" || createData[k] === undefined) delete createData[k];
      }

      const persistCreateRequest = async (patch: Record<string, any>) => {
        const existing = (ob.razorpay_reconciliation && typeof ob.razorpay_reconciliation === "object")
          ? ob.razorpay_reconciliation as Record<string, any>
          : {};
        await svc.from("hr_employee_onboarding").update({
          razorpay_reconciliation: {
            ...existing,
            create_request: {
              ...patch,
              requested_at: new Date().toISOString(),
              payload_field_names: Object.keys(createData).sort(),
            },
          },
          updated_at: new Date().toISOString(),
        }).eq("id", onboardingId);
      };

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 25000);
      let httpStatus = 0;
      let bodyOut: any = null;
      let errText: string | null = null;
      try {
        const res = await fetch(`${BASE}/people`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            auth: authBlock(),
            request: { type: "people", "sub-type": "create" },
            data: createData,
          }),
          signal: ctrl.signal,
        });
        httpStatus = res.status;
        const raw = await res.text();
        try { bodyOut = JSON.parse(raw); } catch { bodyOut = { raw: raw.slice(0, 800) }; }
        const rpErr = bodyOut && typeof bodyOut === "object" ? (bodyOut.error ?? bodyOut.message ?? null) : null;
        if (!res.ok || rpErr) {
          const extracted = extractRazorpayError(bodyOut, rpErr ? JSON.stringify(rpErr) : `HTTP ${res.status}`);
          errText = extracted.message || (rpErr ? JSON.stringify(rpErr) : `HTTP ${res.status}`);
        }
      } catch (e) {
        errText = `NETWORK: ${(e as Error).message}`;
      } finally {
        clearTimeout(timer);
      }

      const duplicateEmail = !!errText && /email.*(exist|already|duplicate)|already.*email|already.*exist/i.test(errText);
      await persistCreateRequest({
        status: errText ? (duplicateEmail ? "email_exists" : "failed") : "created",
        http_status: httpStatus,
        error: errText,
      });
      await logSync(svc, {
        action: "create_onboarding_invite",
        http_status: httpStatus,
        razorpay_employee_id: null,
        hr_employee_id: ob.employee_id || null,
        field_diff_summary: { onboarding_id: onboardingId, source: "stage5_pre_essl_invite", payload_field_names: Object.keys(createData).sort() },
        error_text: duplicateEmail ? null : errText,
        actor_user_id: authed.userId,
      });

      if (errText && !duplicateEmail) return json(200, { ok: false, error: errText, http_status: httpStatus, body: bodyOut });
      return json(200, {
        ok: true,
        already_exists: duplicateEmail,
        http_status: httpStatus,
        message: duplicateEmail
          ? "RazorpayX already has a record for this email. Ask the employee to finish registration, then paste and verify the Employee ID."
          : "RazorpayX employee invite created. Paste and verify the Employee ID after self-registration.",
      });
    }

    // ---------------------------------------------------------------------
    // create_person — create a brand-new employee in RazorpayX Payroll from
    // an ERP hr_employees row. Used by the Stage-5 onboarding wizard so HR
    // can spin up a Razorpay record without leaving the ERP.
    //
    // Contract:
    //   payload: { action:"create_person", hr_employee_id: uuid, dry_run?: bool }
    //   returns:
    //     { ok:false, missing:[...], reason }   — validation gaps
    //     { ok:true,  dry_run:true, payload }   — dry-run
    //     { ok:true,  razorpay_employee_id }    — live create success
    //     { ok:false, http_status, error }      — live create failure
    //
    // Guardrails:
    //   - hr_employee_id must not already be in hr_razorpay_employee_map
    //   - PAN, name, DOJ, department, CTC, bank details are all mandatory
    //   - Baseline (last_pull_snapshot) is populated from the outbound
    //     payload so future push_person diffs work out of the box.
    // ---------------------------------------------------------------------
    if (action === "create_person") {
      const hrId = payload?.hr_employee_id ? String(payload.hr_employee_id) : "";
      if (!hrId) return json(400, { error: "hr_employee_id required" });
      const dryRun = payload?.dry_run === true;

      // Guard: already mapped. This is an idempotent success because Stage-5
      // retries can happen after ERP/Razorpay succeeded but onboarding status
      // was not flipped yet.
      let { data: existingMap } = await svc
        .from("hr_razorpay_employee_map")
        .select("id,hr_employee_id,razorpay_employee_id")
        .eq("hr_employee_id", hrId)
        .maybeSingle();

      // Load employee + related rows.
      const [{ data: emp }, { data: wi }, { data: bank }, { data: structs }] = await Promise.all([
        svc.from("hr_employees")
          .select("id,first_name,last_name,email,phone,gender,dob,pan_number,badge_id")
          .eq("id", hrId).maybeSingle(),
        svc.from("hr_employee_work_info")
          .select("department_id,job_role,joining_date,employee_type")
          .eq("employee_id", hrId).maybeSingle(),
        svc.from("hr_employee_bank_details")
          .select("account_number,ifsc_code,additional_info")
          .eq("employee_id", hrId).maybeSingle(),
        svc.from("hr_employee_salary_structures")
          .select("amount,is_active").eq("employee_id", hrId).eq("is_active", true),
      ]);
      if (!emp) return json(404, { error: "hr_employee not found" });

      const deptName = wi?.department_id
        ? (await svc.from("departments").select("name").eq("id", wi.department_id).maybeSingle()).data?.name || null
        : null;

      const fullName = [emp.first_name, emp.last_name].filter(Boolean).join(" ").trim();
      const pan = (emp.pan_number || "").toString().trim().toUpperCase();
      const dojIso = wi?.joining_date ? String(wi.joining_date) : null;
      const dobIso = emp.dob ? String(emp.dob) : null;
      const toDdMmYyyy = (iso: string | null) =>
        iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : null;
      const dojRp = toDdMmYyyy(dojIso);
      const dobRp = toDdMmYyyy(dobIso);
      const accountHolder = (bank?.additional_info as any)?.account_holder || fullName || null;
      // hr_employee_salary_structures.amount holds MONTHLY component amounts (see
      // monthly_gross_from_structure usage elsewhere in this file). Razorpay's
      // /people (add) expects annual_ctc = monthly_salary * 12. Prefer the annual
      // CTC captured during onboarding (hr_employee_onboarding.ctc) when present,
      // otherwise derive it from the monthly structure sum × 12.
      const monthlyStructureSum = (structs || []).reduce(
        (s: number, r: any) => s + Number(r.amount || 0),
        0,
      );
      const { data: onboardingRow } = await svc
        .from("hr_employee_onboarding")
        .select("ctc")
        .eq("employee_id", hrId)
        .maybeSingle();
      const onboardingCtc = Number(onboardingRow?.ctc || 0);
      const ctcAnnual = onboardingCtc > 0 ? onboardingCtc : monthlyStructureSum * 12;

      // Validate.
      const missing: string[] = [];
      if (!fullName) missing.push("name");
      if (!emp.email) missing.push("email");
      if (!emp.phone) missing.push("phone");
      if (!pan || !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) missing.push("pan");
      if (!dojRp) missing.push("date_of_joining");
      if (!deptName) missing.push("department");
      if (!wi?.job_role) missing.push("job_title");
      if (!ctcAnnual || ctcAnnual <= 0) missing.push("ctc_annual");
      if (!bank?.account_number) missing.push("bank_account_number");
      if (!bank?.ifsc_code || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(bank.ifsc_code)) missing.push("bank_ifsc");
      if (!accountHolder) missing.push("bank_account_holder_name");

      if (missing.length) {
        return json(400, { ok: false, reason: "missing_fields", missing });
      }

      const reservedEmployeeId = (emp.badge_id || "").toString().trim() || null;
      const fullEditData: Record<string, any> = {
        // Official RazorpayX Payroll Postman contract: people:create accepts
        // only { email, name, type }. All rich profile fields — including the
        // editable employee-id — belong to people:edit, keyed by email.
        "employee-id": reservedEmployeeId ? Number(reservedEmployeeId) : null,
        email: String(emp.email).trim().toLowerCase(),
        "phone-number": normPhone(emp.phone),
        gender: emp.gender ? String(emp.gender).toLowerCase() : null,
        "date-of-birth": dobIso,
        "hiring-date": dojIso,
        // RazorpayX Payroll's live API rejects with code 43 ("hire_date is
        // required") when only the documented "hiring-date" key is sent. The
        // server accepts the snake_case `hire_date` variant in dd/mm/yyyy, so
        // we send both to satisfy the runtime contract without breaking the
        // documented one.
        hire_date: dojRp,
        "date-of-joining": dojRp,
        department: deptName,
        title: wi!.job_role,
        pan,
        "bank-account-number": bank!.account_number,
        "bank-ifsc": (bank!.ifsc_code || "").toUpperCase(),
        "bank-account-holder-name": accountHolder,
      };
      // Remove null/empty optional keys.
      for (const k of Object.keys(fullEditData)) {
        if (fullEditData[k] === null || fullEditData[k] === "") delete fullEditData[k];
      }

      // Live RazorpayX/Opfin behavior differs from the Postman collection here:
      // `people:create` rejects minimal {email,name,type} with code 43
      // ("hire_date is required"). It still ignores caller-supplied
      // employee-id, so creation gets the full required profile EXCEPT
      // employee-id; the reserved unified ID is attached by the follow-up
      // email-keyed `people:edit` step below.
      const createData: Record<string, any> = {
        ...fullEditData,
        email: String(emp.email).trim().toLowerCase(),
        name: fullName,
        type: "employee",
      };
      delete createData["employee-id"];
      for (const k of Object.keys(createData)) {
        if (createData[k] === null || createData[k] === "" || createData[k] === undefined) delete createData[k];
      }

      if (dryRun) {
        return json(200, { ok: true, dry_run: true, create_payload: createData, edit_payload: fullEditData });
      }

      const mapRazorpayEmployee = async (rpEmployeeId: string, snapshot: Record<string, any>, status: string) => {
        const { data: mapByRp, error: mapByRpErr } = await svc
          .from("hr_razorpay_employee_map")
          .select("id,hr_employee_id")
          .eq("razorpay_employee_id", rpEmployeeId)
          .maybeSingle();
        if (mapByRpErr) return { error: mapByRpErr };
        if (mapByRp?.hr_employee_id && mapByRp.hr_employee_id !== hrId) {
          return { error: new Error(`Razorpay employee ${rpEmployeeId} is already mapped to another HR employee.`) };
        }

        const payload = {
          razorpay_employee_id: rpEmployeeId,
          hr_employee_id: hrId,
          sync_status: status,
          is_pilot_verified: false,
          last_synced_at: new Date().toISOString(),
          last_pull_snapshot: snapshot,
        };

        if (existingMap?.id) {
          return await svc.from("hr_razorpay_employee_map").update(payload).eq("id", existingMap.id);
        }

        return await svc.from("hr_razorpay_employee_map").insert(payload);
      };

      const retryAttachReservedEmployeeId = async (
        source: string,
        attempts = 8,
        emailOverride?: string,
      ): Promise<{ attach: Awaited<ReturnType<typeof attachReservedEmployeeIdByEmail>>; verify: Awaited<ReturnType<typeof opfinView>> | null }> => {
        let lastAttach: Awaited<ReturnType<typeof attachReservedEmployeeIdByEmail>> = {
          ok: false,
          status: 0,
          error: "attach not attempted",
          body: null,
        };
        let lastVerify: Awaited<ReturnType<typeof opfinView>> | null = null;
        if (!reservedEmployeeId || !/^\d+$/.test(reservedEmployeeId)) return { attach: lastAttach, verify: lastVerify };

        const erpEmail = String(emailOverride || createData.email || "").trim().toLowerCase();
        const editPayload = emailOverride ? { ...fullEditData, email: erpEmail } : fullEditData;
        for (let i = 1; i <= attempts; i += 1) {
          lastAttach = await attachReservedEmployeeIdByEmail(erpEmail, reservedEmployeeId, editPayload);
          if (lastAttach.ok) {
            lastVerify = await opfinView(Number(reservedEmployeeId), "employee");
            const rpEmail = String(lastVerify.body?.email || lastVerify.body?.work_email || "").trim().toLowerCase();
            if (lastVerify.ok && rpEmail && rpEmail === erpEmail) {
              return { attach: lastAttach, verify: lastVerify };
            }
          }

          await logSync(svc, {
            action: "create_person",
            http_status: lastAttach.status || lastVerify?.status || 0,
            razorpay_employee_id: reservedEmployeeId,
            hr_employee_id: hrId,
            field_diff_summary: {
              source,
              attempt: i,
              max_attempts: attempts,
              payload_field_names: Object.keys(fullEditData).sort(),
            },
            error_text: lastAttach.error || lastVerify?.errText || `employee-id ${reservedEmployeeId} not visible yet`,
            actor_user_id: authed.userId,
          });

          if (i < attempts) {
            // Opfin often accepts people:create immediately but its email-keyed
            // people:edit index lags for a few seconds. Keep the finalization
            // request alive and repair automatically instead of sending HR into
            // a manual retry loop.
            await new Promise((resolve) => setTimeout(resolve, Math.min(1500 * i, 8000)));
          }
        }
        return { attach: lastAttach, verify: lastVerify };
      };

      const pushCompleteRazorpayDetails = async (rpEmployeeId: string, source: string) => {
        const warnings: string[] = [];
        const applied: string[] = [];
        const rpIdNum = Number(rpEmployeeId);
        if (!Number.isFinite(rpIdNum) || rpIdNum < 1) {
          return { ok: false, warnings: [`Invalid RazorpayX employee-id for enrichment: ${rpEmployeeId}`], applied, snapshot: null as any };
        }

        const editData: Record<string, any> = {
          ...fullEditData,
          "employee-id": rpIdNum,
        };
        for (const k of Object.keys(editData)) {
          if (editData[k] === null || editData[k] === "" || editData[k] === undefined) delete editData[k];
        }

        const editRes = await opfinEditPerson(editData);
        await logSync(svc, {
          action: "create_person_enrich_edit",
          http_status: editRes.status,
          razorpay_employee_id: rpEmployeeId,
          hr_employee_id: hrId,
          field_diff_summary: { source, fields: Object.keys(editData).sort(), contract_key: "email" },
          error_text: editRes.ok ? null : editRes.error,
          actor_user_id: authed.userId,
        });
        if (editRes.ok) applied.push("identity_bank");
        else warnings.push(`Identity/bank details push failed: ${editRes.error}`);

        let salaryStatus = 0;
        let salaryOk = false;
        let salaryErr: string | null = null;
        try {
          const c = new AbortController();
          const to = setTimeout(() => c.abort(), 20000);
          try {
            const r = await fetch(`${BASE}/people`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Accept: "application/json" },
              body: JSON.stringify({
                auth: authBlock(),
                request: { type: "people", "sub-type": "set-salary" },
                data: {
                  "employee-id": rpIdNum,
                  "employee-type": "employee",
                  "custom-salary-structure": false,
                  "annual-ctc": ctcAnnual,
                },
              }),
              signal: c.signal,
            });
            salaryStatus = r.status;
            const raw = await r.text();
            let b: any = null; try { b = JSON.parse(raw); } catch { b = { raw: raw.slice(0, 400) }; }
            const rpErr = b && typeof b === "object" ? (b.error ?? b.message ?? null) : null;
            salaryOk = r.ok && !rpErr;
            if (!salaryOk) salaryErr = typeof rpErr === "string" ? rpErr : (rpErr ? JSON.stringify(rpErr) : `HTTP ${r.status}`);
          } finally { clearTimeout(to); }
        } catch (e) {
          salaryErr = `NETWORK: ${(e as Error).message}`;
        }

        await logSync(svc, {
          action: "create_person_enrich_salary",
          http_status: salaryStatus,
          razorpay_employee_id: rpEmployeeId,
          hr_employee_id: hrId,
          field_diff_summary: { source, annual_ctc: ctcAnnual },
          error_text: salaryOk ? null : salaryErr,
          actor_user_id: authed.userId,
        });
        if (salaryOk) applied.push("annual_ctc");
        else warnings.push(`Annual CTC push failed: ${salaryErr}`);

        const verify = await opfinView(rpIdNum, "employee");
        const snapshot = verify.ok && verify.body ? { ...verify.body, _enriched_by: source } : null;
        if (verify.ok && verify.body) {
          const rpEmail = String(verify.body?.email || verify.body?.work_email || "").trim().toLowerCase();
          const erpEmail = String((createData as any).email || "").trim().toLowerCase();
          if (!rpEmail || rpEmail !== erpEmail) warnings.push("RazorpayX read-back email did not match ERP email after enrichment.");
          const verifyPan = String(verify.body?.pan || "").trim().toUpperCase();
          if (pan && verifyPan && verifyPan !== pan) warnings.push("RazorpayX read-back PAN did not match ERP PAN after enrichment.");
          const verifyIfsc = String(verify.body?.["bank-ifsc"] || verify.body?.bank_ifsc || "").trim().toUpperCase();
          if (bank?.ifsc_code && verifyIfsc && verifyIfsc !== String(bank.ifsc_code).trim().toUpperCase()) warnings.push("RazorpayX read-back IFSC did not match ERP IFSC after enrichment.");
          await svc.from("hr_razorpay_employee_map")
            .update({ last_pull_snapshot: snapshot, last_synced_at: new Date().toISOString() })
            .eq("razorpay_employee_id", rpEmployeeId);
        } else {
          warnings.push(`RazorpayX details read-back failed after enrichment for employee-id ${rpEmployeeId}.`);
        }

        return { ok: warnings.length === 0, warnings, applied, snapshot };
      };

      const completeSuccessResponse = async (rpEmployeeId: string, body: Record<string, any>, source: string) => {
        const enrichment = await pushCompleteRazorpayDetails(rpEmployeeId, source);
        const responseBody: Record<string, any> = {
          ...body,
          razorpay_employee_id: rpEmployeeId,
          enrichment_applied: enrichment.applied,
          warnings: enrichment.warnings.length ? enrichment.warnings : undefined,
        };
        if (!enrichment.ok) {
          return json(200, {
            ...responseBody,
            ok: false,
            code: "RAZORPAY_ENRICHMENT_INCOMPLETE",
            error: `RazorpayX employee-id ${rpEmployeeId} exists, but complete details could not be verified/pushed: ${enrichment.warnings.join("; ")}`,
          });
        }
        return json(200, { ...responseBody, ok: true });
      };

      if (existingMap?.razorpay_employee_id) {
        const mappedId = String(existingMap.razorpay_employee_id);
        const mappedView = await opfinView(Number(mappedId), "employee");
        const erpEmail = String(createData.email || "").trim().toLowerCase();
        const rpEmail = String(mappedView.body?.email || mappedView.body?.work_email || "").trim().toLowerCase();
        if (mappedView.ok && rpEmail && rpEmail !== erpEmail) {
          return json(200, {
            ok: false,
            code: "RAZORPAY_MAPPED_ID_EMAIL_CONFLICT",
            error: `Mapped RazorpayX employee-id ${mappedId} belongs to a different email. Reset the local ID before creating this employee.`,
            http_status: mappedView.status,
          });
        }
        if (mappedView.ok) {
          await mapRazorpayEmployee(mappedId, mappedView.body || fullEditData, "created_via_erp");
          return await completeSuccessResponse(mappedId, {
            reason: "already_mapped",
            already_mapped: true,
            http_status: mappedView.status,
          }, "already_mapped_retry");
        }

        await logSync(svc, {
          action: "create_person",
          http_status: mappedView.status,
          razorpay_employee_id: mappedId,
          hr_employee_id: hrId,
          field_diff_summary: { source: "stale_local_map_removed" },
          error_text: mappedView.errText || "mapped Razorpay employee not found",
          actor_user_id: authed.userId,
        });
        await svc.from("hr_razorpay_employee_map").delete().eq("id", existingMap.id);
        existingMap = null;
      }

      // If the reserved unified ID already exists in Razorpay but the local map
      // is missing, repair the map and return success instead of trying to
      // create a duplicate employee.
      if (reservedEmployeeId && /^\d+$/.test(reservedEmployeeId)) {
        const existingRp = await opfinView(Number(reservedEmployeeId), "employee");
        if (existingRp.ok) {
          const erpEmail = String(createData.email || "").trim().toLowerCase();
          const rpEmail = String(existingRp.body?.email || existingRp.body?.work_email || "").trim().toLowerCase();
          if (!rpEmail || rpEmail !== erpEmail) {
            return json(200, {
              ok: false,
              code: "RAZORPAY_RESERVED_ID_CONFLICT",
              error: `Reserved employee-id ${reservedEmployeeId} already exists in RazorpayX for a different email. Reset the local ID before creating this employee.`,
              http_status: existingRp.status,
            });
          }
          const { error: repairErr } = await mapRazorpayEmployee(reservedEmployeeId, existingRp.body || fullEditData, "created_via_erp");
          if (repairErr) {
            return json(200, {
              ok: false,
              code: "RAZORPAY_MAPPING_FAILED",
              razorpay_employee_id: reservedEmployeeId,
              already_exists_in_razorpay: true,
              error: `Employee exists in Razorpay but ERP mapping repair failed: ${repairErr.message}`,
            });
          }
          await logSync(svc, {
            action: "create_person",
            http_status: existingRp.status,
            razorpay_employee_id: reservedEmployeeId,
            hr_employee_id: hrId,
            field_diff_summary: { source: "people:view_recovered_existing", payload_field_names: Object.keys(fullEditData).sort() },
            error_text: null,
            actor_user_id: authed.userId,
          });
          return await completeSuccessResponse(reservedEmployeeId, {
            already_exists_in_razorpay: true,
            repaired_mapping: true,
            http_status: existingRp.status,
          }, "people_view_recovered_existing");
        }
      }

      // ---- R4 PRE-FLIGHT: email-keyed attach BEFORE create -------------------
      // The R1 probe proved Razorpay's `people:create` ALWAYS returns
      // employee-id: null and never accepts a caller-supplied employee-id at
      // create time. The only working attach path is a subsequent
      // people:edit keyed by email. If a prior attempt already created an
      // unattached person for this email (the "-NA-" limbo case), we can
      // fix it here in a single call BEFORE ever hitting people:create, and
      // eliminate the entire "Email already exists" recovery cascade.
      if (reservedEmployeeId && /^\d+$/.test(reservedEmployeeId)) {
        const preAttach = await attachReservedEmployeeIdByEmail(
          String(createData.email || ""),
          reservedEmployeeId,
          fullEditData,
        );
        if (preAttach.ok) {
          const verifyPre = await opfinView(Number(reservedEmployeeId), "employee");
          const erpEmailPre = String(createData.email || "").trim().toLowerCase();
          const rpEmailPre = String(verifyPre.body?.email || verifyPre.body?.work_email || "").trim().toLowerCase();
          if (verifyPre.ok && rpEmailPre && rpEmailPre === erpEmailPre) {
            const snapshotPre = {
              ...(verifyPre.body || fullEditData),
              _recovered_by: "r4_pre_flight_email_attach",
            };
            const { error: repairPreErr } = await mapRazorpayEmployee(
              reservedEmployeeId,
              snapshotPre,
              "created_via_erp",
            );
            await logSync(svc, {
              action: "create_person",
              http_status: verifyPre.status,
              razorpay_employee_id: reservedEmployeeId,
              hr_employee_id: hrId,
              field_diff_summary: {
                source: "r4_pre_flight_email_attach",
                payload_field_names: Object.keys(fullEditData).sort(),
              },
              error_text: repairPreErr ? repairPreErr.message : null,
              actor_user_id: authed.userId,
            });
            if (!repairPreErr) {
              return await completeSuccessResponse(reservedEmployeeId, {
                already_exists_in_razorpay: true,
                recovered_by_r4_pre_flight: true,
                repaired_mapping: true,
                http_status: verifyPre.status,
                note: "Email already existed in RazorpayX; reserved Employee ID was attached and details were pushed from ERP.",
              }, "r4_pre_flight_email_attach");
            }
          }
        }
      }

      // Live create. Only runs when R4 pre-flight did not already claim an
      // existing person by email.
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 25000);
      let httpStatus = 0; let bodyOut: any = null; let errText: string | null = null;
      let rpId: string | null = null;
      try {
        const res = await fetch(`${BASE}/people`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            auth: authBlock(),
            request: { type: "people", "sub-type": "create" },
            data: createData,
          }),
          signal: ctrl.signal,
        });
        httpStatus = res.status;
        const raw = await res.text();
        try { bodyOut = JSON.parse(raw); } catch { bodyOut = { raw: raw.slice(0, 800) }; }
        const rpErr = bodyOut && typeof bodyOut === "object" ? (bodyOut.error ?? bodyOut.message ?? null) : null;
        if (!res.ok || rpErr) {
          const extracted = extractRazorpayError(bodyOut, rpErr ? JSON.stringify(rpErr) : `HTTP ${res.status}`);
          errText = extracted.message || (rpErr ? JSON.stringify(rpErr) : `HTTP ${res.status}`);
        } else {
          // Documented contract: create is intentionally minimal and may return
          // employee-id blank in this tenant. We do NOT use people-id for attach;
          // the next shared enrichment step calls documented people:edit by email.
          const respData = (bodyOut?.data && typeof bodyOut.data === "object") ? bodyOut.data : bodyOut;
          const peopleIdRaw = extractRazorpayPeopleId(bodyOut);
          const employeeIdEcho = respData?.["employee-id"] ?? respData?.employee_id ?? bodyOut?.["employee-id"] ?? bodyOut?.employee_id ?? null;

          const employeeIdEchoStr = employeeIdEcho != null ? String(employeeIdEcho).trim() : "";
          if (employeeIdEchoStr && employeeIdEchoStr !== "0") {
            rpId = employeeIdEchoStr;
          } else if (reservedEmployeeId && /^\d+$/.test(reservedEmployeeId)) {
            rpId = reservedEmployeeId;
            (bodyOut as any) = { ...(bodyOut || {}), _people_id: peopleIdRaw != null ? String(peopleIdRaw) : undefined, _reserved_employee_id: reservedEmployeeId };
          } else {
            // Fallback for legacy shapes: try id/data.id.
            const cand = respData?.id ?? bodyOut?.id ?? null;
            rpId = cand != null ? String(cand) : null;
            if (!rpId) {
              errText = "Razorpay accepted the request but returned no people-id or employee-id";
            }
          }
        }
      } catch (e) {
        errText = `NETWORK: ${(e as Error).message}`;
      } finally { clearTimeout(t); }

      // Log every attempt.
      await logSync(svc, {
        action: "create_person",
        http_status: httpStatus,
        razorpay_employee_id: rpId || "",
        hr_employee_id: hrId,
        field_diff_summary: { contract: "people:create", payload_field_names: Object.keys(createData).sort() },
        error_text: errText,
        actor_user_id: authed.userId,
      });

      if ((errText || !rpId) && reservedEmployeeId && /^\d+$/.test(reservedEmployeeId)) {
        const postFailureView = await opfinView(Number(reservedEmployeeId), "employee");
        if (postFailureView.ok) {
          const { error: repairErr } = await mapRazorpayEmployee(reservedEmployeeId, postFailureView.body || fullEditData, "created_via_erp");
          if (!repairErr) {
            return await completeSuccessResponse(reservedEmployeeId, {
              already_exists_in_razorpay: true,
              repaired_mapping: true,
              recovered_after_create_error: true,
              http_status: postFailureView.status,
            }, "post_failure_view_recovery");
          }
        }
      }

      if (errText || !rpId) {
        // Razorpay error code 7 ("Email already exists") means an employee
        // with this email is already in RazorpayX under an employee-id we
        // don't yet map. The reservedEmployeeId lookup above failed, so
        // Razorpay auto-assigned a different id on the prior attempt.
        // First try a bounded exact-email recovery; if found, repair the map
        // and let onboarding continue idempotently. If not found, surface an
        // actionable 409 instead of a raw Edge 502.
        const extracted = extractRazorpayError(bodyOut, errText);
        const rpCode = extracted.code;
        const rpMsg = extracted.message;
        if (rpCode === 7 || /email already exists/i.test(rpMsg)) {
          if (reservedEmployeeId && /^\d+$/.test(reservedEmployeeId)) {
            const { attach, verify: verifyAttached } = await retryAttachReservedEmployeeId("email_exists_auto_attach_by_email", 8);
            const erpEmail = String(createData.email || "").trim().toLowerCase();
            const rpEmail = String(verifyAttached?.body?.email || verifyAttached?.body?.work_email || "").trim().toLowerCase();
            if (attach.ok && verifyAttached?.ok && rpEmail && rpEmail === erpEmail) {
              const snapshot = { ...(verifyAttached.body || fullEditData), _recovered_by: "email_keyed_people_edit" };
              const { error: repairErr } = await mapRazorpayEmployee(reservedEmployeeId, snapshot, "created_via_erp");
              if (!repairErr) {
                await logSync(svc, {
                  action: "create_person",
                  http_status: verifyAttached.status,
                  razorpay_employee_id: reservedEmployeeId,
                  hr_employee_id: hrId,
                  field_diff_summary: { source: "email_exists_auto_attach_by_email", payload_field_names: Object.keys(fullEditData).sort() },
                  error_text: null,
                  actor_user_id: authed.userId,
                });
                return await completeSuccessResponse(reservedEmployeeId, {
                  already_exists_in_razorpay: true,
                  recovered_by_email_edit: true,
                  attached_reserved_employee_id: true,
                  repaired_mapping: true,
                  http_status: verifyAttached.status,
                }, "email_keyed_people_edit");
              }
              return json(200, {
                ok: false,
                http_status: verifyAttached?.status || attach.status,
                code: "RAZORPAY_EMAIL_EXISTS_MAPPING_CONFLICT",
                error: `RazorpayX employee was auto-recovered and Employee ID ${reservedEmployeeId} verified, but ERP mapping repair failed: ${repairErr.message}`,
                razorpay_employee_id: reservedEmployeeId,
                body: verifyAttached?.body,
              });
            }

            await logSync(svc, {
              action: "create_person",
              http_status: attach.status || verifyAttached?.status || httpStatus,
              razorpay_employee_id: reservedEmployeeId,
              hr_employee_id: hrId,
              field_diff_summary: { source: "email_exists_auto_attach_by_email_failed", payload_field_names: Object.keys(fullEditData).sort() },
              error_text: attach.error || verifyAttached?.errText || `verification failed for employee-id ${reservedEmployeeId}`,
              actor_user_id: authed.userId,
            });
          }

          const existingByEmail = await findRazorpayEmployeeByEmail(String(createData.email || ""), {
            reservedEmployeeId,
            maxId: 250,
            concurrency: 8,
          });
          if (existingByEmail) {
            const { error: repairErr } = await mapRazorpayEmployee(existingByEmail.employeeId, existingByEmail.body || fullEditData, "created_via_erp");
            if (!repairErr) {
              await logSync(svc, {
                action: "create_person",
                http_status: existingByEmail.status,
                razorpay_employee_id: existingByEmail.employeeId,
                hr_employee_id: hrId,
                field_diff_summary: { source: "people:view_exact_email", payload_field_names: Object.keys(fullEditData).sort() },
                error_text: null,
                actor_user_id: authed.userId,
              });
              return await completeSuccessResponse(existingByEmail.employeeId, {
                already_exists_in_razorpay: true,
                recovered_by_email: true,
                repaired_mapping: true,
                http_status: existingByEmail.status,
              }, "people_view_exact_email");
            }
            return json(200, {
              ok: false,
              http_status: httpStatus,
              code: "RAZORPAY_EMAIL_EXISTS_MAPPING_CONFLICT",
              error: `RazorpayX already has employee-id ${existingByEmail.employeeId} with email "${createData.email}", but ERP mapping repair failed: ${repairErr.message}`,
              razorpay_employee_id: existingByEmail.employeeId,
              body: bodyOut,
            });
          }
          const existingPeopleId = extractRazorpayPeopleId(bodyOut);

          // PRIMARY GHOST RECOVERY: Razorpay's create error carries the
          // internal people-id of the invited-but-inactive record. Stamp the
          // reserved employee-id on that people-id with the full profile so
          // the person moves invited → active in a single edit call. This
          // avoids the Gmail +alias workaround for the common case where a
          // prior attempt only created the invite envelope.
          if (existingPeopleId && reservedEmployeeId && /^\d+$/.test(reservedEmployeeId)) {
            const pidAttach = await attachReservedEmployeeIdByPeopleId(
              existingPeopleId,
              reservedEmployeeId,
              { ...fullEditData, email: String(createData.email || "").trim().toLowerCase(), name: fullName },
            );
            await logSync(svc, {
              action: "create_person",
              http_status: pidAttach.status,
              razorpay_employee_id: reservedEmployeeId,
              hr_employee_id: hrId,
              field_diff_summary: {
                source: "people_id_ghost_upgrade",
                people_id: existingPeopleId,
                payload_field_names: Object.keys(fullEditData).sort(),
              },
              error_text: pidAttach.ok ? null : pidAttach.error,
              actor_user_id: authed.userId,
            });
            if (pidAttach.ok) {
              // Verify the reserved employee-id is now readable and matches.
              // Retry briefly in case Opfin's read replica lags after edit.
              let ghostVerify: Awaited<ReturnType<typeof opfinView>> | null = null;
              for (let i = 0; i < 6; i++) {
                ghostVerify = await opfinView(Number(reservedEmployeeId), "employee");
                const rpE = String(ghostVerify.body?.email || ghostVerify.body?.work_email || "").trim().toLowerCase();
                const wantE = String(createData.email || "").trim().toLowerCase();
                if (ghostVerify.ok && rpE && rpE === wantE) break;
                await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
              }
              const rpE = String(ghostVerify?.body?.email || ghostVerify?.body?.work_email || "").trim().toLowerCase();
              const wantE = String(createData.email || "").trim().toLowerCase();
              if (ghostVerify?.ok && rpE === wantE) {
                const snap = {
                  ...(ghostVerify.body || fullEditData),
                  _recovered_by: "people_id_ghost_upgrade",
                  _people_id: existingPeopleId,
                };
                const { error: repairErr } = await mapRazorpayEmployee(reservedEmployeeId, snap, "created_via_erp");
                if (!repairErr) {
                  return await completeSuccessResponse(reservedEmployeeId, {
                    already_exists_in_razorpay: true,
                    recovered_by_people_id: true,
                    ghost_upgraded_to_active: true,
                    people_id: existingPeopleId,
                    repaired_mapping: true,
                    http_status: ghostVerify.status,
                    note: "RazorpayX had an inactive/invited record for this email from a prior attempt; ERP stamped the reserved Employee ID on it via people-id and pushed the full profile to activate it.",
                  }, "people_id_ghost_upgrade");
                }
              }
            }
          }

          const aliasEmail = buildGmailAliasForRazorpay(String(emp.email || ""), reservedEmployeeId);
          if (aliasEmail && reservedEmployeeId && /^\d+$/.test(reservedEmployeeId)) {
            const aliasCreateData: Record<string, any> = {
              ...createData,
              email: aliasEmail,
            };
            const aliasCtrl = new AbortController();
            const aliasTimeout = setTimeout(() => aliasCtrl.abort(), 25000);
            let aliasStatus = 0;
            let aliasBody: any = null;
            let aliasErr: string | null = null;
            try {
              const aliasRes = await fetch(`${BASE}/people`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                body: JSON.stringify({
                  auth: authBlock(),
                  request: { type: "people", "sub-type": "create" },
                  data: aliasCreateData,
                }),
                signal: aliasCtrl.signal,
              });
              aliasStatus = aliasRes.status;
              const aliasRaw = await aliasRes.text();
              try { aliasBody = JSON.parse(aliasRaw); } catch { aliasBody = { raw: aliasRaw.slice(0, 800) }; }
              const aliasRpErr = aliasBody && typeof aliasBody === "object" ? (aliasBody.error ?? aliasBody.message ?? null) : null;
              if (!aliasRes.ok || aliasRpErr) {
                const extractedAlias = extractRazorpayError(aliasBody, aliasRpErr ? JSON.stringify(aliasRpErr) : `HTTP ${aliasRes.status}`);
                aliasErr = extractedAlias.message || (aliasRpErr ? JSON.stringify(aliasRpErr) : `HTTP ${aliasRes.status}`);
              }
            } catch (e) {
              aliasErr = `NETWORK: ${(e as Error).message}`;
            } finally {
              clearTimeout(aliasTimeout);
            }

            await logSync(svc, {
              action: "create_person",
              http_status: aliasStatus,
              razorpay_employee_id: reservedEmployeeId,
              hr_employee_id: hrId,
              field_diff_summary: {
                contract: "people:create",
                source: "gmail_alias_after_ghost_email",
                original_email_domain: String(emp.email || "").split("@")[1] || null,
                alias_email_domain: aliasEmail.split("@")[1] || null,
                payload_field_names: Object.keys(aliasCreateData).sort(),
              },
              error_text: aliasErr,
              actor_user_id: authed.userId,
            });

            if (!aliasErr) {
              const { attach: aliasAttach, verify: aliasVerify } = await retryAttachReservedEmployeeId(
                "gmail_alias_after_ghost_email",
                10,
                aliasEmail,
              );
              const aliasVerifyEmail = String(aliasVerify?.body?.email || aliasVerify?.body?.work_email || "").trim().toLowerCase();
              if (aliasAttach.ok && aliasVerify?.ok && aliasVerifyEmail === aliasEmail) {
                fullEditData.email = aliasEmail;
                createData.email = aliasEmail;
                const aliasSnapshot = {
                  ...(aliasVerify.body || fullEditData),
                  _erp_original_email: String(emp.email || "").trim().toLowerCase(),
                  _razorpay_email_alias: aliasEmail,
                  _recovered_by: "gmail_alias_after_ghost_email",
                };
                const { error: aliasMapErr } = await mapRazorpayEmployee(reservedEmployeeId, aliasSnapshot, "created_via_erp");
                if (!aliasMapErr) {
                  return await completeSuccessResponse(reservedEmployeeId, {
                    already_exists_in_razorpay: false,
                    created_with_email_alias: true,
                    original_email_blocked_by_razorpay_ghost: true,
                    razorpay_email_alias: aliasEmail,
                    repaired_mapping: true,
                    http_status: aliasVerify.status || aliasStatus,
                    note: "Original Gmail address is blocked by a Razorpay hidden invite; ERP created RazorpayX with a Gmail +alias that delivers to the same inbox.",
                  }, "gmail_alias_after_ghost_email");
                }
                return json(200, {
                  ok: false,
                  http_status: aliasVerify.status || aliasStatus,
                  code: "RAZORPAY_ALIAS_MAPPING_FAILED",
                  error: `RazorpayX employee was created with email alias and Employee ID ${reservedEmployeeId} verified, but ERP mapping repair failed: ${aliasMapErr.message}`,
                  razorpay_employee_id: reservedEmployeeId,
                });
              }
            }
          }
          return json(200, {
            ok: false,
            http_status: httpStatus,
            code: "RAZORPAY_EMAIL_EXISTS",
            recoverable: true,
            recovery_action: "reset_local_id_after_deleted_partial",
            people_id: existingPeopleId,
            error: existingPeopleId
              ? `RazorpayX still reports this email as existing, but the Payroll API cannot edit or read it. This is a Razorpay-side ghost/pending invite state, not an ERP retry issue. Use a different employee email/alias for this onboarding, or ask Razorpay to purge the hidden invite for this email before reserving a fresh ID.`
              : `RazorpayX still reports this email as existing, but the Payroll API cannot find, edit, or auto-repair that employee. This is a Razorpay-side ghost/pending invite state, not an ERP retry issue. Use a different employee email/alias for this onboarding, or ask Razorpay to purge the hidden invite for this email before reserving a fresh ID.`,
            body: bodyOut,
          });
        }
        return json(errText ? 502 : 500, { ok: false, http_status: httpStatus, error: errText || "no_id_returned", body: bodyOut });
      }

      if (reservedEmployeeId && /^\d+$/.test(reservedEmployeeId) && rpId === reservedEmployeeId) {
        const { attach, verify } = await retryAttachReservedEmployeeId("fresh_create_attach_reserved_id", 8);
        const erpEmail = String(createData.email || "").trim().toLowerCase();
        const rpEmail = String(verify?.body?.email || verify?.body?.work_email || "").trim().toLowerCase();
        if (!attach.ok || !verify?.ok || !rpEmail || rpEmail !== erpEmail) {
          return json(200, {
            ok: false,
            code: "RAZORPAY_ATTACH_AFTER_CREATE_PENDING",
            http_status: attach.status || verify?.status || httpStatus,
            razorpay_employee_id: reservedEmployeeId,
            people_id: bodyOut?._people_id || undefined,
            error: `RazorpayX created the employee, but Employee ID ${reservedEmployeeId} could not be attached/verified after automatic retries: ${attach.error || verify?.errText || "verification pending"}. The ERP will not complete onboarding from this partial state. Delete/purge the partial RazorpayX invite or use a different email, then reset the local ID and reserve again.`,
            body: verify?.body || attach.body || bodyOut,
          });
        }
      }

      // Wire up the map — baseline snapshot equals outbound payload so future
      // push_person diffs land cleanly without needing a re-pull.
      const { error: mapErr } = await mapRazorpayEmployee(rpId, { ...fullEditData, _create_response: bodyOut }, "created_via_erp");
      if (mapErr) {
        return json(200, {
          ok: false,
          code: "RAZORPAY_MAPPING_FAILED",
          razorpay_employee_id: rpId,
          http_status: httpStatus,
          error: `Employee created in Razorpay but ERP mapping failed: ${mapErr.message}`,
        });
      }

      return await completeSuccessResponse(rpId, { http_status: httpStatus, people_id: bodyOut?._people_id || undefined }, "fresh_create");
    }

    // ---------------------------------------------------------------------
    // Direct action bridge for RazorpayX Payroll endpoints that don't need a
    // dedicated phase workflow. Verified against the Postman collection:
    // URL path and body `type` deliberately differ for three families —
    //   contractor-payment (body) → /api/contractorPayment (URL)
    //   advance-salary     (body) → /api/advanceSalary     (URL)
    //   attendance         (body) → /api/att               (URL)
    // Per-domain gating (aligned with the RazorpayX commissioning plan):
    //   people_dismiss                         → push_salary_endpoint_verified
    //                                            + explicit `ack:"CONFIRM_DISMISS"`
    //   payroll modifications (add/reset/dnp) → push_payroll_endpoint_verified
    //   contractor payments / advance salary   → pull_payouts_endpoint_verified
    //                                            (payout-domain gate)
    //   read actions                           → auth + hrms_razorpay_sync
    //                                            (no additional envelope gate)
    // ---------------------------------------------------------------------
    type Gate = "payroll" | "payouts" | "salary" | "none";
    const DIRECT: Record<string, {
      urlPath: string; bodyType: string; sub_type: string;
      write: boolean; gate: Gate; requireAck?: boolean; logAs: string;
    }> = {
      people_dismiss:              { urlPath: "people",             bodyType: "people",             sub_type: "dismiss",             write: true,  gate: "salary",  requireAck: true, logAs: "people_dismiss" },
      payroll_view_payroll:        { urlPath: "payroll",            bodyType: "payroll",            sub_type: "view-payroll",        write: false, gate: "none",    logAs: "payroll_view_payroll" },
      payroll_add_additions:       { urlPath: "payroll",            bodyType: "payroll",            sub_type: "add-additions",       write: true,  gate: "payroll", logAs: "payroll_add_additions" },
      payroll_add_deduction:       { urlPath: "payroll",            bodyType: "payroll",            sub_type: "add-deduction",       write: true,  gate: "payroll", logAs: "payroll_add_deduction" },
      payroll_reset_modifications: { urlPath: "payroll",            bodyType: "payroll",            sub_type: "reset-modifications", write: true,  gate: "payroll", logAs: "payroll_reset_modifications" },
      payroll_do_not_pay:          { urlPath: "payroll",            bodyType: "payroll",            sub_type: "do-not-pay",          write: true,  gate: "payroll", logAs: "payroll_do_not_pay" },
      contractor_payment_create:   { urlPath: "contractorPayment",  bodyType: "contractor-payment", sub_type: "create",              write: true,  gate: "payouts", logAs: "contractor_payment_create" },
      contractor_payment_delete:   { urlPath: "contractorPayment",  bodyType: "contractor-payment", sub_type: "delete",              write: true,  gate: "payouts", logAs: "contractor_payment_delete" },
      contractor_payment_list:     { urlPath: "contractorPayment",  bodyType: "contractor-payment", sub_type: "list-pending",        write: false, gate: "none",    logAs: "contractor_payment_list" },
      contractor_payment_status:   { urlPath: "contractorPayment",  bodyType: "contractor-payment", sub_type: "get-status",          write: false, gate: "none",    logAs: "contractor_payment_status" },
      advance_salary_create:       { urlPath: "advanceSalary",      bodyType: "advance-salary",     sub_type: "create",              write: true,  gate: "payouts", logAs: "advance_salary_create" },
      attendance_fetch:            { urlPath: "att",                bodyType: "attendance",         sub_type: "fetch",               write: false, gate: "none",    logAs: "attendance_fetch" },
    };

    // ---------------------------------------------------------------------
    // PATCH corrective attendance — used when HR approves a regularization
    // for a day whose payroll month has already been pushed to Opfin.
    // Body shape matches the Postman collection: request type "attendance",
    // sub-type "modify", HTTP method PATCH against /att.
    // ---------------------------------------------------------------------
    if (action === "attendance_edit_patch") {
      const s = await readSettings(svc);
      if (!s?.push_attendance_endpoint_verified) {
        return json(403, { error: "Attendance-write gate locked (push_attendance_endpoint_verified=false)." });
      }
      const data = (payload && typeof payload === "object" && payload.data && typeof payload.data === "object")
        ? payload.data : {};
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 25000);
      let httpStatus = 0; let bodyOut: any = null; let errText: string | null = null;
      try {
        const res = await fetch(`${BASE}/att`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            auth: authBlock(),
            request: { type: "attendance", "sub-type": "modify" },
            data,
          }),
          signal: ctrl.signal,
        });
        httpStatus = res.status;
        const raw = await res.text();
        try { bodyOut = JSON.parse(raw); } catch { bodyOut = { raw: raw.slice(0, 800) }; }
        const rpErr = bodyOut && typeof bodyOut === "object" ? (bodyOut.error ?? bodyOut.message ?? null) : null;
        if (!res.ok || rpErr) {
          errText = typeof rpErr === "string" ? rpErr : (rpErr ? JSON.stringify(rpErr) : `HTTP ${res.status}`);
        }
      } catch (e) {
        errText = `NETWORK: ${(e as Error).message}`;
      } finally { clearTimeout(t); }

      await logSync(svc, {
        action: "attendance_edit_patch" as any,
        http_status: httpStatus,
        razorpay_employee_id: String(data["employee-id"] ?? ""),
        hr_employee_id: null,
        field_diff_summary: { url: "/att", method: "PATCH", sub_type: "modify", data_keys: Object.keys(data).slice(0, 20) },
        error_text: errText,
        actor_user_id: authed.userId,
      });
      return json(errText ? 502 : 200, { ok: !errText, http_status: httpStatus, body: bodyOut, error: errText });
    }

    // ---------------------------------------------------------------------
    // Range verify — iterates attendance/fetch across a date window and
    // returns a per-day diff array. Read-only; used by AttendancePeriodLockPage.
    // ---------------------------------------------------------------------
    if (action === "attendance_fetch_range") {
      const empId = payload?.data?.["employee-id"];
      const from = String(payload?.data?.from || "");
      const to = String(payload?.data?.to || "");
      if (!empId || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
        return json(400, { error: "employee-id, from (YYYY-MM-DD) and to (YYYY-MM-DD) required" });
      }
      const start = new Date(from + "T00:00:00Z");
      const end = new Date(to + "T00:00:00Z");
      if (end < start) return json(400, { error: "'to' must be >= 'from'" });
      const days: string[] = [];
      for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
        days.push(d.toISOString().slice(0, 10));
      }
      if (days.length > 62) return json(400, { error: "Range capped at 62 days" });

      const results: any[] = [];
      for (const day of days) {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 15000);
        try {
          const res = await fetch(`${BASE}/att`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
              auth: authBlock(),
              request: { type: "attendance", "sub-type": "fetch" },
              data: { "employee-id": Number(empId), date: day },
            }),
            signal: ctrl.signal,
          });
          const raw = await res.text();
          let body: any = null;
          try { body = JSON.parse(raw); } catch { body = { raw: raw.slice(0, 400) }; }
          results.push({ day, http_status: res.status, body });
        } catch (e) {
          results.push({ day, http_status: 0, error: (e as Error).message });
        } finally { clearTimeout(t); }
      }

      await logSync(svc, {
        action: "attendance_fetch_range" as any,
        http_status: 200,
        razorpay_employee_id: String(empId),
        hr_employee_id: null,
        field_diff_summary: { from, to, days: days.length },
        error_text: null,
        actor_user_id: authed.userId,
      });
      return json(200, { ok: true, days: results });
    }


    if (action in DIRECT) {
      const spec = DIRECT[action];
      const s = await readSettings(svc);
      if (spec.gate === "payroll" && !s?.push_payroll_endpoint_verified) {
        return json(403, { error: "Payroll-write gate locked (push_payroll_endpoint_verified=false)." });
      }
      if (spec.gate === "payouts" && !s?.pull_payouts_endpoint_verified) {
        return json(403, { error: "Payout-domain gate locked (pull_payouts_endpoint_verified=false)." });
      }
      if (spec.gate === "salary" && !s?.push_salary_endpoint_verified) {
        return json(403, { error: "People/salary gate locked (push_salary_endpoint_verified=false)." });
      }
      if (spec.requireAck && String(payload?.ack || "") !== "CONFIRM_DISMISS") {
        return json(403, { error: "Missing ack. Send { ack: 'CONFIRM_DISMISS' } to authorise this destructive action." });
      }
      const data = (payload && typeof payload === "object" && payload.data && typeof payload.data === "object")
        ? payload.data : {};
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 25000);
      let httpStatus = 0; let bodyOut: any = null; let errText: string | null = null;
      try {
        const res = await fetch(`${BASE}/${spec.urlPath}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            auth: authBlock(),
            request: { type: spec.bodyType, "sub-type": spec.sub_type },
            data,
          }),
          signal: ctrl.signal,
        });
        httpStatus = res.status;
        const raw = await res.text();
        try { bodyOut = JSON.parse(raw); } catch { bodyOut = { raw: raw.slice(0, 800) }; }
        const rpErr = bodyOut && typeof bodyOut === "object" ? (bodyOut.error ?? bodyOut.message ?? null) : null;
        if (!res.ok || rpErr) {
          errText = typeof rpErr === "string" ? rpErr : (rpErr ? JSON.stringify(rpErr) : `HTTP ${res.status}`);
        }
      } catch (e) {
        errText = `NETWORK: ${(e as Error).message}`;
      } finally { clearTimeout(t); }

      const rpEid = typeof data["employee-id"] === "number" || typeof data["employee-id"] === "string"
        ? String(data["employee-id"]) : "";
      await logSync(svc, {
        action: spec.logAs as any,
        http_status: httpStatus,
        razorpay_employee_id: rpEid,
        hr_employee_id: null,
        field_diff_summary: { url: `/${spec.urlPath}`, body_type: spec.bodyType, sub_type: spec.sub_type, data_keys: Object.keys(data).slice(0, 20) },
        error_text: errText,
        actor_user_id: authed.userId,
      });
      return json(errText ? 502 : 200, { ok: !errText, http_status: httpStatus, body: bodyOut, error: errText });
    }

    return json(400, { error: `Unsupported action: ${action}` });

  } catch (e) {
    console.error("razorpay-payroll-proxy error", e);
    return json(500, { error: (e as Error).message });
  }
});

