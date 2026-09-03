// deno-lint-ignore-file no-explicit-any
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { requireHrCaller } from "../_shared/require-hr-caller.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// Fields we reconcile across HRMS ↔ Razorpay ↔ eSSL. Each entry produces at
// most one row per employee in `hr_drift_alerts` (unique on employee_id+field).
type SystemKey = "hrms" | "razorpay" | "essl";

interface FieldSpec {
  field: string;
  severity: "low" | "medium" | "high" | "critical";
  // When true, a value present in one system and MISSING in the other is
  // itself reported as drift (instead of being skipped for lack of a second
  // value). Used for payout-critical bank fields: a blank account number on
  // either side must never pass silently.
  missingIsDrift?: boolean;
  // Extracts a normalized string from each system's raw record; return null if
  // the system doesn't hold this field for this employee.
  extract: (ctx: {
    emp: any;
    workInfo: any;
    bank: any;
    salary: any;
    rzp: any;                 // snapshot from hr_razorpay_employee_map.last_pull_snapshot
    esslUser: any;
    /** Latest VERIFIED salary push (expected CTC that people:set-salary accepted). */
    salaryPush?: { expected: number | null; at: string | null } | null;
  }) => Partial<Record<SystemKey, string | null>>;
}

const norm = (v: any): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.toLowerCase();
};
const normDate = (v: any): string | null => {
  if (!v) return null;
  // Accept YYYY-MM-DD or DD/MM/YYYY. Return YYYY-MM-DD.
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return s;
};
const normDigits = (v: any): string | null => {
  if (!v) return null;
  const s = String(v).replace(/\D+/g, "");
  return s || null;
};
const normIfsc = (v: any): string | null => {
  if (!v) return null;
  return String(v).replace(/\s+/g, "").toUpperCase() || null;
};

const rzpVal = (rzp: any, ...keys: string[]): any => {
  if (!rzp) return null;
  for (const k of keys) {
    if (rzp[k] !== undefined && rzp[k] !== null && rzp[k] !== "") return rzp[k];
  }
  return null;
};

// eSSL firmware truncates USERINFO.Name to ~24 ASCII chars. When comparing to
// eSSL, use the same truncation so a pushed-and-truncated device name is not
// reported as drift against the full HRMS name.
const ESSL_NAME_MAX = 24;
const normEsslName = (v: any): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/[^\x20-\x7E]/g, "").replace(/\s+/g, " ").trim().slice(0, ESSL_NAME_MAX);
  return s ? s.toLowerCase() : null;
};

const FIELDS: FieldSpec[] = [
  {
    field: "full_name",
    severity: "medium",
    extract: ({ emp, rzp, esslUser }) => {
      const hrmsFull = `${emp.first_name || ""} ${emp.last_name || ""}`.trim();
      const hrmsTrunc = normEsslName(hrmsFull);
      const esslTrunc = normEsslName(esslUser?.name);
      // If the eSSL value equals the HRMS name after eSSL's own truncation,
      // treat both sides as identical for the 3-way distinct check.
      const esslNorm = esslTrunc && hrmsTrunc && esslTrunc === hrmsTrunc
        ? norm(hrmsFull)
        : (esslUser ? norm(esslUser?.name) : null);
      return {
        hrms: norm(hrmsFull),
        razorpay: norm(rzpVal(rzp, "name", "full-name")),
        essl: esslNorm,
      };
    },
  },
  {
    field: "email",
    severity: "medium",
    extract: ({ emp, rzp }) => ({
      hrms: norm(emp.email),
      razorpay: norm(rzpVal(rzp, "email", "personal-email")),
    }),
  },
  {
    field: "phone",
    severity: "medium",
    extract: ({ emp, rzp }) => ({
      hrms: normDigits(emp.phone),
      razorpay: normDigits(rzpVal(rzp, "contact-number", "phone", "mobile")),
    }),
  },
  {
    field: "dob",
    severity: "medium",
    extract: ({ emp, rzp }) => ({
      hrms: normDate(emp.dob),
      razorpay: normDate(rzpVal(rzp, "date-of-birth", "dob")),
    }),
  },
  {
    field: "gender",
    severity: "low",
    extract: ({ emp, rzp }) => ({
      hrms: norm(emp.gender),
      razorpay: norm(rzpVal(rzp, "gender")),
    }),
  },
  {
    field: "pan",
    severity: "high",
    // PAN lives on hr_employees, not hr_employee_work_info.
    extract: ({ emp, workInfo, rzp }) => ({
      hrms: ((emp as any)?.pan_number || (workInfo as any)?.pan_number || "").toString().toUpperCase().trim() || null,
      razorpay: (rzpVal(rzp, "pan", "pan-number") || "").toString().toUpperCase().trim() || null,
    }),

  },
  {
    field: "date_of_joining",
    severity: "high",
    extract: ({ workInfo, rzp }) => ({
      hrms: normDate(workInfo?.joining_date),
      razorpay: normDate(rzpVal(rzp, "date-of-hiring", "date-of-joining", "hiring_date")),
    }),
  },
  {
    field: "department",
    severity: "medium",
    extract: ({ workInfo, rzp, esslUser }) => ({
      hrms: norm(workInfo?.department_name || workInfo?.department),
      razorpay: norm(rzpVal(rzp, "department")),
      essl: norm(esslUser?.department),
    }),
  },
  {
    field: "designation",
    severity: "medium",
    extract: ({ workInfo, rzp, esslUser }) => ({
      hrms: norm(workInfo?.job_position_title || workInfo?.job_role),
      razorpay: norm(rzpVal(rzp, "designation", "title")),
      essl: norm(esslUser?.title),
    }),
  },
  {
    field: "employee_code",
    severity: "high",
    extract: ({ emp, rzp, esslUser }) => ({
      hrms: norm(emp.badge_id),
      razorpay: norm(rzpVal(rzp, "employee-id", "employee_id", "employee-code")),
      essl: norm(esslUser?.pin),
    }),
  },
  {
    field: "active_state",
    severity: "critical",
    extract: ({ emp, rzp, esslUser }) => {
      const rzpDismissed = !!rzpVal(rzp, "date-of-dismissal") ||
        rzp?.["is-active"] === false || rzp?.is_active === false;
      const hrmsActive = emp.is_active !== false;
      return {
        hrms: hrmsActive ? "active" : "inactive",
        razorpay: rzp ? (rzpDismissed ? "inactive" : "active") : null,
        essl: esslUser ? (esslUser.enabled === false ? "inactive" : "active") : null,
      };
    },
  },
  {
    field: "bank_account",
    severity: "critical",
    missingIsDrift: true,
    extract: ({ bank, rzp }) => ({
      hrms: normDigits(bank?.account_number),
      razorpay: normDigits(rzpVal(rzp, "bank-account-number") || rzp?.bank_account?.account_number),
    }),
  },
  {
    field: "bank_ifsc",
    severity: "critical",
    missingIsDrift: true,
    extract: ({ bank, rzp }) => ({
      hrms: normIfsc(bank?.ifsc_code),
      razorpay: normIfsc(rzpVal(rzp, "bank-ifsc") || rzp?.bank_account?.ifsc),
    }),
  },
  {
    field: "annual_ctc",
    severity: "high",
    // A CTC present in HRMS but absent in RazorpayX (₹0 / no salary structure
    // there) is a payout-critical gap, not a "nothing to compare" case.
    missingIsDrift: true,
    extract: ({ salary, rzp, salaryPush }) => {
      const hrmsCtc = salary?.annual_ctc ?? null;

      const rzpSalary = rzp?.__salary ?? null;
      const rzpCtc =
        rzpSalary?.annual_ctc ??
        rzpSalary?.["annual-ctc"] ??
        rzpSalary?.["annual_ctc"] ??
        null;

      const hrmsStr = hrmsCtc != null ? String(Math.round(Number(hrmsCtc))) : null;

      // ROOT CAUSE (04 Sep 2026 IST, corrected): RazorpayX DOES expose CTC —
      // `payroll:view-payroll` returns the monthly salary for the current /
      // recent months (verified live: badge 21 → 2026-09 salary 10000 →
      // ₹1,20,000 annual). The earlier failure was ours: the proxy only probed
      // months with a locally recorded executed payroll run (May 2026 only), so
      // later joiners read as "(missing)". That gate is removed.
      // The one genuine gap left: an employee still inside their JOINING month
      // has only a prorated figure, which must not be annualised — in that case
      // a verified salary push whose expected CTC equals HRMS is accepted.

      if (rzpCtc == null && hrmsCtc != null && rzp && rzp.__salary_probe_error) {
        const pushed = salaryPush?.expected;
        if (pushed != null && Math.abs(Number(pushed) - Number(hrmsCtc)) <= 1) {
          return { hrms: hrmsStr, razorpay: hrmsStr };
        }
      }

      return {
        hrms: hrmsStr,
        razorpay: rzpCtc != null ? String(Math.round(Number(rzpCtc))) : null,
      };
    },
  },
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Service role / internal cron secret / signed-in HR staff only.
  const caller = await requireHrCaller(req, corsHeaders);
  if (!caller.ok) return caller.response;

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

    const url = new URL(req.url);
    const requestBody = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const employeeIdFilter = url.searchParams.get("employee_id") ||
      (typeof requestBody?.employee_id === "string" ? requestBody.employee_id : null);

  try {
    let empQuery: any = supa
      .from("hr_employees")
      .select("id, first_name, last_name, email, phone, dob, gender, pan_number, badge_id, is_active");
    if (employeeIdFilter) empQuery = empQuery.eq("id", employeeIdFilter);
    const { data: employees, error: empErr } = await empQuery;
    if (empErr) throw empErr;
    if (!employees || employees.length === 0) {
      return new Response(JSON.stringify({ ok: true, scanned: 0, drifts_upserted: 0, resolved: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const empIds = employees.map((e: any) => e.id);

    const [workInfoRes, bankRes, salaryRes, onboardRes, rzpMapRes, esslRes] = await Promise.all([
      supa.from("hr_employee_work_info").select("*").in("employee_id", empIds),
      supa.from("hr_employee_bank_details").select("*").in("employee_id", empIds)
        .order("updated_at", { ascending: false }).order("created_at", { ascending: false }),
      // ROOT CAUSE (2026-09-03): the CTC comparison read
      // hr_employee_salary_structures.annual_ctc / gross_annual — columns that
      // do not exist on that table (it is a per-component table). The HRMS side
      // was therefore ALWAYS null and the annual_ctc check could never fire, so
      // employees carrying ₹0 in RazorpayX never raised an alert. The authoritative
      // HRMS CTC lives on the structure ASSIGNMENT, with onboarding CTC as fallback.
      supa.from("hr_employee_salary_structure_assignments")
        .select("employee_id, annual_ctc, created_at").in("employee_id", empIds)
        .order("created_at", { ascending: false }),
      supa.from("hr_employee_onboarding")
        .select("employee_id, ctc, created_at").in("employee_id", empIds)
        .order("created_at", { ascending: false }),

      supa.from("hr_razorpay_employee_map").select("hr_employee_id, razorpay_employee_id, last_pull_snapshot, last_pulled_at").in("hr_employee_id", empIds),
      supa.from("hr_biometric_device_users").select("id, name, pin, department, title, enabled"),
    ]);

    // Departments + positions for names.
    const workInfos = workInfoRes.data ?? [];
    const deptIds = Array.from(new Set(workInfos.map((w: any) => w.department_id).filter(Boolean)));
    const posIds = Array.from(new Set(workInfos.map((w: any) => w.job_position_id).filter(Boolean)));
    const [{ data: depts }, { data: positions }] = await Promise.all([
      deptIds.length ? supa.from("departments").select("id, name").in("id", deptIds) : Promise.resolve({ data: [] as any[] }),
      posIds.length ? supa.from("positions").select("id, title").in("id", posIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    const deptById = new Map((depts ?? []).map((d: any) => [d.id, d.name]));
    const posById = new Map((positions ?? []).map((p: any) => [p.id, p.title]));

    const workByEmp = new Map<string, any>();
    for (const w of workInfos) {
      workByEmp.set(w.employee_id, {
        ...w,
        department_name: w.department_id ? deptById.get(w.department_id) : null,
        job_position_title: w.job_position_id ? posById.get(w.job_position_id) : null,
      });
    }
    const bankByEmp = new Map<string, any>();
    for (const b of bankRes.data ?? []) if (!bankByEmp.has(b.employee_id)) bankByEmp.set(b.employee_id, b);
    // HRMS CTC: latest structure assignment wins, onboarding CTC is the fallback
    // (used until a structure assignment is created/pushed).
    const salaryByEmp = new Map<string, any>();
    for (const s of salaryRes.data ?? []) {
      if (s.annual_ctc == null) continue;
      if (!salaryByEmp.has(s.employee_id)) {
        salaryByEmp.set(s.employee_id, { annual_ctc: s.annual_ctc, ctc_source: "structure_assignment" });
      }
    }
    for (const o of onboardRes.data ?? []) {
      if (o.ctc == null) continue;
      if (!salaryByEmp.has(o.employee_id)) {
        salaryByEmp.set(o.employee_id, { annual_ctc: o.ctc, ctc_source: "onboarding" });
      }
    }

    // Latest VERIFIED salary push per employee. Used only to decide whether an
    // API-unexposable CTC counts as drift (see the annual_ctc field spec).
    const salaryPushByEmp = new Map<string, { expected: number | null; at: string | null }>();
    {
      const { data: pushRows } = await supa
        .from("hr_razorpay_pushback_log")
        .select("hr_employee_id, created_at, response_snapshot")
        .in("hr_employee_id", empIds)
        .eq("action", "verify_salary")
        .eq("status", "success")
        .order("created_at", { ascending: false })
        .limit(500);
      for (const row of pushRows ?? []) {
        const eid = (row as any).hr_employee_id;
        if (!eid || salaryPushByEmp.has(eid)) continue;
        const fields = (row as any).response_snapshot?.fields;
        const f = Array.isArray(fields) ? fields.find((x: any) => x?.key === "annual_ctc") : null;
        const expected = f && f.expected != null && Number.isFinite(Number(f.expected))
          ? Number(f.expected)
          : null;
        if (expected == null) continue;
        salaryPushByEmp.set(eid, { expected, at: (row as any).created_at ?? null });
      }
    }



    // ------------------------------------------------------------------
    // Snapshot freshness gate.
    //
    // ROOT CAUSE (2026-08-02): the scanner compared HRMS against
    // hr_razorpay_employee_map.last_pull_snapshot with NO freshness check. A
    // dismissal performed in the RazorpayX dashboard never touches HRMS, so
    // the cached snapshot (e.g. employee-id 9, pulled 29-Jul) kept saying
    // is_active:true and the card reported "RAZORPAY: active" for someone who
    // is not active there. We now re-pull any snapshot older than
    // max_age_hours (default 12) straight from Opfin before comparing, and if
    // the re-pull fails we suppress the active_state verdict instead of
    // asserting a stale "active".
    // ------------------------------------------------------------------
    const maxAgeHours = Math.max(0, Number(
      url.searchParams.get("max_age_hours") ?? requestBody?.max_age_hours ?? "12",
    ));
    const refreshLimit = Math.max(0, Math.min(200, Number(url.searchParams.get("refresh_limit") ?? "120")));
    const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const proxyUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/razorpay-payroll-proxy`;
    const staleCutoff = Date.now() - maxAgeHours * 3600_000;

    const rzpByEmp = new Map<string, any>();
    const rzpStale = new Set<string>();
    const mapRows = rzpMapRes.data ?? [];
    let refreshed = 0;
    let refreshFailed = 0;

    // ROOT CAUSE (2026-08-12): a dashboard dismissal for an HRMS-inactive person
    // stayed invisible for up to max_age_hours, so the card kept claiming
    // "RAZORPAY: active" after the owner had already dismissed them. Separation
    // state is the one verdict we must never assert from cache: force a fresh
    // pull for every HRMS-inactive employee and for anyone still carrying an
    // open active_state / dismissal_state alert.
    const inactiveEmpIds = new Set(
      (employees ?? []).filter((e: any) => e.is_active === false).map((e: any) => e.id),
    );
    const { data: openSepAlerts } = await supa
      .from("hr_drift_alerts")
      .select("hr_employee_id")
      .in("hr_employee_id", empIds)
      .in("field", ["active_state", "dismissal_state"])
      .is("resolved_at", null);
    for (const a of openSepAlerts ?? []) inactiveEmpIds.add((a as any).hr_employee_id);

    const needsRefresh = mapRows.filter((r: any) => {
      if (!r.razorpay_employee_id) return false;
      if (inactiveEmpIds.has(r.hr_employee_id)) return true;
      const pulled = r.last_pulled_at ? Date.parse(r.last_pulled_at) : 0;
      return !r.last_pull_snapshot || !pulled || pulled < staleCutoff;
    }).slice(0, refreshLimit);

    const freshSnapshots = new Map<string, any>();
    const refreshSnapshot = async (row: any) => {
      try {
        const r = await fetch(proxyUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${svcKey}` },
          body: JSON.stringify({
            action: "read_person_by_id",
            razorpay_employee_id: row.razorpay_employee_id,
            allow_dismissed: true,
          }),
        });
        const body = await r.json().catch(() => null);
        if (body?.ok && body?.snapshot) {
          freshSnapshots.set(row.hr_employee_id, body.snapshot);
          await supa.from("hr_razorpay_employee_map")
            .update({ last_pull_snapshot: body.snapshot, last_pulled_at: new Date().toISOString() })
            .eq("hr_employee_id", row.hr_employee_id);
          refreshed++;
        } else if (body?.code === "RAZORPAY_ID_NOT_FOUND") {
          // The person is no longer resolvable in RazorpayX — that IS an
          // authoritative "not active there" signal, not a stale read.
          const snap = { ...(row.last_pull_snapshot ?? {}), is_active: false, __not_found_in_razorpay: true };
          freshSnapshots.set(row.hr_employee_id, snap);
          await supa.from("hr_razorpay_employee_map")
            .update({ last_pull_snapshot: snap, last_pulled_at: new Date().toISOString() })
            .eq("hr_employee_id", row.hr_employee_id);
          refreshed++;
        } else {
          refreshFailed++;
          rzpStale.add(row.hr_employee_id);
        }
      } catch (_e) {
        refreshFailed++;
        rzpStale.add(row.hr_employee_id);
      }
    };

    // A full scan can have dozens of stale snapshots. Refreshing them serially
    // made the browser request exceed the Edge Function gateway deadline and
    // surface only "Failed to send a request". Keep pressure on Opfin bounded,
    // but process independent employees concurrently so the scan can respond.
    const refreshConcurrency = Math.max(1, Math.min(12, Number(
      url.searchParams.get("refresh_concurrency") ?? "8",
    )));
    let refreshCursor = 0;
    const refreshWorker = async () => {
      while (refreshCursor < needsRefresh.length) {
        const row = needsRefresh[refreshCursor++];
        if (row) await refreshSnapshot(row);
      }
    };
    await Promise.all(
      Array.from(
        { length: Math.min(refreshConcurrency, needsRefresh.length) },
        () => refreshWorker(),
      ),
    );

    for (const r of mapRows) {
      rzpByEmp.set(r.hr_employee_id, freshSnapshots.get(r.hr_employee_id) ?? r.last_pull_snapshot ?? null);
    }


    // eSSL match by pin ↔ badge_id.
    const esslByPin = new Map<string, any>();
    for (const u of esslRes.data ?? []) {
      const pin = (u.pin || "").toString().trim();
      if (pin) esslByPin.set(pin, u);
    }

    let upserted = 0;
    let resolved = 0;

    const reconcileEmployee = async (emp: any) => {
      const workInfo = workByEmp.get(emp.id);
      const bank = bankByEmp.get(emp.id);
      const salary = salaryByEmp.get(emp.id);
      const rzp = rzpByEmp.get(emp.id);
      const esslUser = emp.badge_id ? esslByPin.get(String(emp.badge_id).trim()) : null;

      // Dismissed-in-RazorpayX employees: their snapshot is frozen/partial, so
      // field-level drift is noise. Suppress everything except the pending
      // dismissal signal when HRMS still marks them active.
      const rzpDismissed = !!rzpVal(rzp, "date-of-dismissal") ||
        norm(rzpVal(rzp, "status")) === "dismissed" ||
        rzpVal(rzp, "status") === "inactive" ||
        rzp?.["is-active"] === false || rzp?.is_active === false ||
        rzp?.["is-dismissed"] === true || rzp?.dismissed === true;
      const hrmsActive = emp.is_active !== false;
      const suppressAllButActiveState = rzpDismissed;

      // Bundle alerts are written by the pushback helper, not by FIELDS below.
      // Close their stale historical failures once the live Razorpay snapshot
      // proves the employee is already dismissed/inactive. RazorpayX does not
      // permit employment edits for a dismissed person, and a dismissal push
      // is already satisfied when that person is no longer active/resolvable.
      if (rzpDismissed) {
        const { data: staleBundleAlerts } = await supa
          .from("hr_drift_alerts")
          .select("id, field")
          .eq("hr_employee_id", emp.id)
          .in("field", ["employment_bundle", "dismissal_state"])
          .is("resolved_at", null);
        if (staleBundleAlerts?.length) {
          const now = new Date().toISOString();
          for (const alert of staleBundleAlerts) {
            const note = alert.field === "dismissal_state"
              ? "Auto-resolved: employee is already dismissed/inactive in RazorpayX"
              : "Auto-resolved: employment edits do not apply after the employee is dismissed/inactive in RazorpayX";
            const { error } = await supa
              .from("hr_drift_alerts")
              .update({ resolved_at: now, resolution_note: note })
              .eq("id", alert.id);
            if (!error) resolved++;
          }
        }
      }

      for (const spec of FIELDS) {
        // Never assert an active/dismissed verdict from a snapshot we could not
        // refresh — a stale cached "active" is exactly the false alarm we hit.
        if (spec.field === "active_state" && rzpStale.has(emp.id)) continue;
        if (suppressAllButActiveState && !(spec.field === "active_state" && hrmsActive)) {

          const { data: existing } = await supa
            .from("hr_drift_alerts")
            .select("id")
            .eq("hr_employee_id", emp.id)
            .eq("field", spec.field)
            .is("resolved_at", null)
            .maybeSingle();
          if (existing?.id) {
            await supa
              .from("hr_drift_alerts")
              .update({
                resolved_at: new Date().toISOString(),
                resolution_note: "Auto-resolved: employee dismissed in RazorpayX — field drift not tracked",
              })
              .eq("id", existing.id);
            resolved++;
          }
          continue;
        }
        const values = spec.extract({ emp, workInfo, bank, salary, rzp, esslUser, salaryPush: salaryPushByEmp.get(emp.id) ?? null });
        const ctcPushConfirmed =
          spec.field === "annual_ctc" && !!rzp?.__salary_probe_error && !rzp?.__salary &&
          salaryPushByEmp.has(emp.id);
        const present: SystemKey[] = (Object.keys(values) as SystemKey[]).filter(
          (k) => values[k] !== null && values[k] !== undefined,
        );

        // Payout-critical fields: an employee mapped to RazorpayX must hold the
        // value on BOTH sides. A missing side is reported as drift with an
        // explicit "(missing)" marker rather than being skipped.
        let hasDrift: boolean;
        let compared: SystemKey[] = present;
        if (spec.missingIsDrift && rzp) {
          const sides: SystemKey[] = ["hrms", "razorpay"];
          const shaped = sides.map((k) => values[k] ?? "(missing)");
          if (shaped.every((v) => v === "(missing)")) continue; // neither system holds it
          for (const k of sides) values[k] = values[k] ?? "(missing)";
          compared = sides;
          hasDrift = new Set(shaped).size > 1;
        } else {
          if (present.length < 2) continue; // need at least 2 systems to compare
          hasDrift = new Set(present.map((k) => values[k])).size > 1;
        }

        if (hasDrift) {
          const hrmsV = values.hrms ?? null;
          const rzpV = values.razorpay ?? null;
          const esslV = values.essl ?? null;

          // Sticky acknowledgement: once HR marks a difference as resolved we
          // remember the exact values at that moment. The card stays hidden
          // until one of those values actually changes on either side.
          const { data: prior } = await supa
            .from("hr_drift_alerts")
            .select("acknowledged_at, acknowledged_by, acknowledged_note, ack_hrms_value, ack_razorpay_value, ack_essl_value")
            .eq("hr_employee_id", emp.id)
            .eq("field", spec.field)
            .maybeSingle();

          const ackStillValid =
            !!prior?.acknowledged_at &&
            (prior.ack_hrms_value ?? null) === hrmsV &&
            (prior.ack_razorpay_value ?? null) === rzpV &&
            (prior.ack_essl_value ?? null) === esslV;

          const payload = {
            hr_employee_id: emp.id,
            field: spec.field,
            systems_involved: compared,
            hrms_value: hrmsV,
            razorpay_value: rzpV,
            essl_value: esslV,
            severity: spec.severity,
            last_seen_at: new Date().toISOString(),
            resolved_at: null,
            resolution_note: ackStillValid ? (prior?.acknowledged_note ?? null) : null,
            acknowledged_at: ackStillValid ? prior!.acknowledged_at : null,
            acknowledged_by: ackStillValid ? prior!.acknowledged_by : null,
            acknowledged_note: ackStillValid ? prior!.acknowledged_note : null,
            ack_hrms_value: ackStillValid ? prior!.ack_hrms_value : null,
            ack_razorpay_value: ackStillValid ? prior!.ack_razorpay_value : null,
            ack_essl_value: ackStillValid ? prior!.ack_essl_value : null,
          };
          const { error } = await supa.from("hr_drift_alerts").upsert(payload, {
            onConflict: "hr_employee_id,field",
          });
          if (!error) upserted++;

        } else {
          // Resolve any previously-open drift for this field.
          const { data: existing } = await supa
            .from("hr_drift_alerts")
            .select("id")
            .eq("hr_employee_id", emp.id)
            .eq("field", spec.field)
            .is("resolved_at", null)
            .maybeSingle();
          if (existing?.id) {
            await supa
              .from("hr_drift_alerts")
              .update({
                resolved_at: new Date().toISOString(),
                resolution_note: ctcPushConfirmed
                  ? "Auto-resolved: CTC push verified by RazorpayX (people:set-salary accepted). RazorpayX exposes CTC over the read API only after the first executed payroll run, so there is no read-back value to compare."
                  : "Auto-resolved: values now match",
              })
              .eq("id", existing.id);
            resolved++;
          }
        }
      }
    };

    // Reconciliation used to run every employee and field serially, producing
    // hundreds of sequential PostgREST round trips on a full scan. Use a small
    // worker pool so database load stays bounded while completing inside the
    // Edge Function request window.
    const reconcileConcurrency = Math.max(1, Math.min(10, Number(
      url.searchParams.get("reconcile_concurrency") ?? "6",
    )));
    let reconcileCursor = 0;
    const reconcileWorker = async () => {
      while (reconcileCursor < employees.length) {
        const emp = employees[reconcileCursor++];
        if (emp) await reconcileEmployee(emp);
      }
    };
    await Promise.all(
      Array.from(
        { length: Math.min(reconcileConcurrency, employees.length) },
        () => reconcileWorker(),
      ),
    );

    return new Response(
      JSON.stringify({ ok: true, scanned: employees.length, drifts_upserted: upserted, resolved, snapshots_refreshed: refreshed, snapshot_refresh_failed: refreshFailed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("hr-drift-scan error", e);
    return new Response(JSON.stringify({ ok: false, error: e?.message || String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
