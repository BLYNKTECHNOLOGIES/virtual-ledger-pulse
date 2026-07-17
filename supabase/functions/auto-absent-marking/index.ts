import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchAllRows } from "../_shared/paginate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Get "yesterday" in IST (Asia/Kolkata, UTC+5:30) as YYYY-MM-DD
function istYesterday(): { dateStr: string; dow: number } {
  const nowMs = Date.now() + 5.5 * 60 * 60 * 1000; // shift UTC → IST
  const ist = new Date(nowMs);
  ist.setUTCDate(ist.getUTCDate() - 1);
  const y = ist.getUTCFullYear();
  const m = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const d = String(ist.getUTCDate()).padStart(2, "0");
  return { dateStr: `${y}-${m}-${d}`, dow: ist.getUTCDay() }; // 0=Sun..6=Sat
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { dateStr, dow } = istYesterday();
    const dowNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const dowName = dowNames[dow];

    // Gate: only run if at least one active policy has absent_if_no_punch=true
    const { data: policies } = await supabase
      .from("hr_attendance_policies")
      .select("id")
      .eq("is_active", true)
      .eq("absent_if_no_punch", true)
      .limit(1);
    if (!policies || policies.length === 0) {
      return json({ message: "absent_if_no_punch disabled", date: dateStr, marked: 0 });
    }

    // Holiday? skip whole day
    const { data: holiday } = await supabase
      .from("hr_holidays")
      .select("id")
      .eq("date", dateStr)
      .eq("is_active", true)
      .limit(1);
    if (holiday && holiday.length > 0) {
      return json({ message: "public holiday, skipping", date: dateStr, marked: 0 });
    }

    // Active employees
    const employees = await fetchAllRows((from, to) =>
      supabase.from("hr_employees").select("id").eq("status", "active").range(from, to)
    );
    if (!employees.length) return json({ message: "no active employees", date: dateStr, marked: 0 });
    const employeeIds = employees.map((e: any) => e.id);

    // Employees who already have a daily rollup for that date (any status)
    const existing = await fetchAllRows((from, to) =>
      supabase
        .from("hr_attendance_daily")
        .select("employee_id")
        .eq("attendance_date", dateStr)
        .in("employee_id", employeeIds)
        .range(from, to)
    );
    const already = new Set((existing || []).map((r: any) => r.employee_id));

    // Employees on approved leave that day
    const leaves = await fetchAllRows((from, to) =>
      supabase
        .from("hr_leave_requests")
        .select("employee_id")
        .eq("status", "approved")
        .lte("start_date", dateStr)
        .gte("end_date", dateStr)
        .in("employee_id", employeeIds)
        .range(from, to)
    );
    const onLeave = new Set((leaves || []).map((r: any) => r.employee_id));

    // Employees whose current weekly-off pattern includes yesterday's weekday
    const weeklyOffLinks = await fetchAllRows((from, to) =>
      supabase
        .from("hr_employee_weekly_off")
        .select("employee_id, pattern_id")
        .eq("is_current", true)
        .in("employee_id", employeeIds)
        .range(from, to)
    );
    const patternIds = [...new Set((weeklyOffLinks || []).map((r: any) => r.pattern_id).filter(Boolean))];
    const offPatternIds = new Set<string>();
    if (patternIds.length) {
      const { data: patterns } = await supabase
        .from("hr_weekly_off_patterns")
        .select("id, weekly_offs")
        .in("id", patternIds);
      for (const p of patterns || []) {
        const offs = Array.isArray((p as any).weekly_offs) ? (p as any).weekly_offs : [];
        const match = offs.some((v: any) =>
          typeof v === "string"
            ? v.toLowerCase() === dowName
            : typeof v === "number" && v === dow
        );
        if (match) offPatternIds.add((p as any).id);
      }
    }
    const onWeeklyOff = new Set(
      (weeklyOffLinks || [])
        .filter((r: any) => offPatternIds.has(r.pattern_id))
        .map((r: any) => r.employee_id)
    );

    const toMark = employeeIds.filter(
      (id: string) => !already.has(id) && !onLeave.has(id) && !onWeeklyOff.has(id)
    );
    if (!toMark.length) return json({ message: "nothing to mark", date: dateStr, marked: 0 });

    const rows = toMark.map((employee_id: string) => ({
      employee_id,
      attendance_date: dateStr,
      status: "absent",
      first_in: null,
      last_out: null,
      total_hours: 0,
      punch_count: 0,
      is_late: false,
      late_by_minutes: 0,
      early_departure: false,
      early_by_minutes: 0,
    }));

    const { error, count } = await supabase
      .from("hr_attendance_daily")
      .upsert(rows, { onConflict: "employee_id,attendance_date", ignoreDuplicates: true, count: "exact" });
    if (error) throw error;

    console.log(`[auto-absent] ${dateStr}: marked ${count ?? rows.length} absent (skipped leave=${onLeave.size}, weekly-off=${onWeeklyOff.size}, already=${already.size})`);
    return json({
      message: "ok",
      date: dateStr,
      marked: count ?? rows.length,
      skipped: { onLeave: onLeave.size, weeklyOff: onWeeklyOff.size, alreadyPresent: already.size },
    });
  } catch (e) {
    console.error("[auto-absent] error", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
