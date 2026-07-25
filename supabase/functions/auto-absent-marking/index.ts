// Auto-absent marking — v4 window-aware.
//
// Runs daily after the v4 attendance window closes (05:00 IST → 05:00 IST).
// Marks employees as 'absent' in hr_attendance_daily for the previous
// window-date when: no daily row (or status='no_data'), no approved leave,
// no weekly-off, no holiday. Writes an audit row to
// hr_attendance_absent_marker_runs so we can prove it ran.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchAllRows } from "../_shared/paginate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// v4 "yesterday" in IST — the window-date that JUST closed at 05:00 IST today.
function v4YesterdayIST(): { dateStr: string; dow: number } {
  const nowUtcMs = Date.now();
  const istMs = nowUtcMs + 5.5 * 60 * 60 * 1000;
  const ist = new Date(istMs);
  // If it's IST 00:00–04:59, we're still inside "yesterday"'s window;
  // shift back an extra day so we always mark the window that fully closed.
  const shiftDays = ist.getUTCHours() < 5 ? 2 : 1;
  ist.setUTCDate(ist.getUTCDate() - shiftDays);
  const y = ist.getUTCFullYear();
  const m = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const d = String(ist.getUTCDate()).padStart(2, "0");
  return { dateStr: `${y}-${m}-${d}`, dow: ist.getUTCDay() };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { dateStr, dow } = v4YesterdayIST();
    const dowNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const dowName = dowNames[dow];

    // Gate: require at least one active policy with absent_if_no_punch=true.
    const { data: policies } = await supabase
      .from("hr_attendance_policies")
      .select("id")
      .eq("is_active", true)
      .eq("absent_if_no_punch", true)
      .limit(1);
    if (!policies || policies.length === 0) {
      await audit(supabase, dateStr, 0, 0, 0, false, "absent_if_no_punch disabled");
      return json({ message: "absent_if_no_punch disabled", date: dateStr, marked: 0 });
    }

    // Holiday? skip whole window and log it.
    const { data: holiday } = await supabase
      .from("hr_holidays")
      .select("id")
      .eq("date", dateStr)
      .eq("is_active", true)
      .limit(1);
    if (holiday && holiday.length > 0) {
      await audit(supabase, dateStr, 0, 0, 0, true, "public holiday, skipped");
      return json({ message: "public holiday, skipping", date: dateStr, marked: 0 });
    }

    // Active employees.
    const employees = await fetchAllRows((from, to) =>
      supabase.from("hr_employees").select("id").eq("is_active", true).range(from, to)
    );
    if (!employees.length) {
      await audit(supabase, dateStr, 0, 0, 0, false, "no active employees");
      return json({ message: "no active employees", date: dateStr, marked: 0 });
    }
    const employeeIds = employees.map((e: any) => e.id);

    // Employees whose v4 daily row is already meaningful (anything other
    // than 'no_data' / 'absent' / NULL means they were seen or handled).
    const dailyRows = await fetchAllRows((from, to) =>
      supabase
        .from("hr_attendance_daily")
        .select("employee_id, status")
        .eq("attendance_date", dateStr)
        .in("employee_id", employeeIds)
        .range(from, to)
    );
    const alreadyHandled = new Set(
      (dailyRows || [])
        .filter((r: any) => r.status && r.status !== "no_data" && r.status !== "absent")
        .map((r: any) => r.employee_id)
    );

    // Approved leave overlapping the window.
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

    // Weekly-off for the window's weekday.
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
        if (offs.some((v: any) =>
          typeof v === "string" ? v.toLowerCase() === dowName : typeof v === "number" && v === dow
        )) offPatternIds.add((p as any).id);
      }
    }
    const onWeeklyOff = new Set(
      (weeklyOffLinks || [])
        .filter((r: any) => offPatternIds.has(r.pattern_id))
        .map((r: any) => r.employee_id)
    );

    const toMark = employeeIds.filter(
      (id: string) => !alreadyHandled.has(id) && !onLeave.has(id) && !onWeeklyOff.has(id)
    );
    if (!toMark.length) {
      await audit(supabase, dateStr, 0, onLeave.size, onWeeklyOff.size, false, "nothing to mark");
      return json({ message: "nothing to mark", date: dateStr, marked: 0 });
    }

    // Upsert into hr_attendance_daily as 'absent' (v4 is the source of truth).
    const rows = toMark.map((employee_id: string) => ({
      employee_id,
      attendance_date: dateStr,
      status: "absent",
      first_in: null,
      last_out: null,
      total_hours: 0,
      punch_count: 0,
      session_count: 0,
      suppressed_count: 0,
      engine_version: "v4",
      flags: { auto_absent: true, marked_at: new Date().toISOString() },
    }));

    const { error, count } = await supabase
      .from("hr_attendance_daily")
      .upsert(rows, { onConflict: "employee_id,attendance_date", count: "exact" });
    if (error) throw error;

    // Mirror to the legacy hr_attendance table so downstream reports still see it.
    const legacyRows = toMark.map((employee_id: string) => ({
      employee_id,
      attendance_date: dateStr,
      attendance_status: "absent",
      check_in: null,
      check_out: null,
      overtime_hours: 0,
      late_minutes: 0,
      early_leave_minutes: 0,
      notes: "auto-marked absent (v4 window)",
    }));
    await supabase
      .from("hr_attendance")
      .upsert(legacyRows, { onConflict: "employee_id,attendance_date", ignoreDuplicates: true });

    const marked = count ?? rows.length;
    await audit(supabase, dateStr, marked, onLeave.size, onWeeklyOff.size, false, `marked ${marked}`);
    console.log(`[auto-absent v4] ${dateStr}: marked ${marked}, leave=${onLeave.size}, weeklyOff=${onWeeklyOff.size}`);
    return json({
      message: "ok",
      date: dateStr,
      marked,
      skipped: { onLeave: onLeave.size, weeklyOff: onWeeklyOff.size, alreadyHandled: alreadyHandled.size },
    });
  } catch (e) {
    console.error("[auto-absent] error", e);
    return json({ error: (e as Error).message }, 500);
  }
});

async function audit(
  supabase: any,
  dateStr: string,
  marked: number,
  leave: number,
  weeklyOff: number,
  holiday: boolean,
  notes: string,
) {
  try {
    await supabase.from("hr_attendance_absent_marker_runs").insert({
      window_date: dateStr,
      marked_count: marked,
      skipped_leave: leave,
      skipped_weekly_off: weeklyOff,
      skipped_holiday: holiday,
      notes,
    });
  } catch (e) {
    console.error("[auto-absent] audit insert failed", e);
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
