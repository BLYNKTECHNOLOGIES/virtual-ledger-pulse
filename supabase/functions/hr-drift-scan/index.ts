// deno-lint-ignore-file no-explicit-any
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
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
  // Extracts a normalized string from each system's raw record; return null if
  // the system doesn't hold this field for this employee.
  extract: (ctx: {
    emp: any;
    workInfo: any;
    bank: any;
    salary: any;
    rzp: any;                 // snapshot from hr_razorpay_employee_map.last_pull_snapshot
    esslUser: any;
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
    extract: ({ bank, rzp }) => ({
      hrms: normDigits(bank?.account_number),
      razorpay: normDigits(rzpVal(rzp, "bank-account-number") || rzp?.bank_account?.account_number),
    }),
  },
  {
    field: "bank_ifsc",
    severity: "critical",
    extract: ({ bank, rzp }) => ({
      hrms: normIfsc(bank?.ifsc_code),
      razorpay: normIfsc(rzpVal(rzp, "bank-ifsc") || rzp?.bank_account?.ifsc),
    }),
  },
  {
    field: "annual_ctc",
    severity: "high",
    extract: ({ salary, rzp }) => {
      const hrmsCtc = salary?.annual_ctc ?? salary?.gross_annual ?? null;
      const rzpSalary = rzp?.__salary ?? null;
      const rzpCtc =
        rzpSalary?.annual_ctc ??
        rzpSalary?.["annual-ctc"] ??
        rzpSalary?.["annual_ctc"] ??
        null;
      return {
        hrms: hrmsCtc != null ? String(Math.round(Number(hrmsCtc))) : null,
        razorpay: rzpCtc != null ? String(Math.round(Number(rzpCtc))) : null,
      };
    },
  },
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const url = new URL(req.url);
  const employeeIdFilter = url.searchParams.get("employee_id");

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

    const [workInfoRes, bankRes, salaryRes, rzpMapRes, esslRes] = await Promise.all([
      supa.from("hr_employee_work_info").select("*").in("employee_id", empIds),
      supa.from("hr_employee_bank_details").select("*").in("employee_id", empIds),
      supa.from("hr_employee_salary_structures").select("*").in("employee_id", empIds).order("effective_from", { ascending: false }),
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
    const salaryByEmp = new Map<string, any>();
    for (const s of salaryRes.data ?? []) if (!salaryByEmp.has(s.employee_id)) salaryByEmp.set(s.employee_id, s);
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
    const maxAgeHours = Math.max(0, Number(url.searchParams.get("max_age_hours") ?? "12"));
    const refreshLimit = Math.max(0, Math.min(200, Number(url.searchParams.get("refresh_limit") ?? "120")));
    const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const proxyUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/razorpay-payroll-proxy`;
    const staleCutoff = Date.now() - maxAgeHours * 3600_000;

    const rzpByEmp = new Map<string, any>();
    const rzpStale = new Set<string>();
    const mapRows = rzpMapRes.data ?? [];
    let refreshed = 0;
    let refreshFailed = 0;

    const needsRefresh = mapRows.filter((r: any) => {
      if (!r.razorpay_employee_id) return false;
      const pulled = r.last_pulled_at ? Date.parse(r.last_pulled_at) : 0;
      return !r.last_pull_snapshot || !pulled || pulled < staleCutoff;
    }).slice(0, refreshLimit);

    const freshSnapshots = new Map<string, any>();
    for (const row of needsRefresh) {
      try {
        const r = await fetch(proxyUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${svcKey}` },
          body: JSON.stringify({
            action: "read_person_by_id",
            payload: { razorpay_employee_id: row.razorpay_employee_id, allow_dismissed: true },
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
    }

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

    for (const emp of employees) {
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
        const values = spec.extract({ emp, workInfo, bank, salary, rzp, esslUser });
        const present: SystemKey[] = (Object.keys(values) as SystemKey[]).filter(
          (k) => values[k] !== null && values[k] !== undefined,
        );
        if (present.length < 2) continue; // need at least 2 systems to compare

        const distinct = new Set(present.map((k) => values[k]));
        const hasDrift = distinct.size > 1;

        if (hasDrift) {
          const payload = {
            hr_employee_id: emp.id,
            field: spec.field,
            systems_involved: present,
            hrms_value: values.hrms ?? null,
            razorpay_value: values.razorpay ?? null,
            essl_value: values.essl ?? null,
            severity: spec.severity,
            last_seen_at: new Date().toISOString(),
            resolved_at: null,
            resolution_note: null,
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
              .update({ resolved_at: new Date().toISOString(), resolution_note: "Auto-resolved: values now match" })
              .eq("id", existing.id);
            resolved++;
          }
        }
      }
    }

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
