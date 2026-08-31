// Auto-absent marking — v4 window-aware.
//
// Runs daily after the v4 attendance window closes (05:00 IST → 05:00 IST).
// Reconciles the last seven fully closed window-dates so a missed scheduler
// invocation self-heals. Marks employees as 'absent' only when there is no
// meaningful daily row, approved leave, weekly-off, or holiday. Writes an audit row to
// hr_attendance_absent_marker_runs so we can prove it ran.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { requireCaller } from "../_shared/require-caller.ts";
import { fetchAllRows } from "../_shared/paginate.ts";
import { dayOfWeek, rollingClosedDates } from "./dates.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const caller = await requireCaller(req, corsHeaders);
  if (!caller.ok) return caller.response;


  try {
    const supabase = caller.admin;

    // Reconcile a rolling window on every invocation. A failed cron/deploy can
    // therefore delay classification, but can no longer create a permanent
    // blank date in employee calendars.
    const dates = rollingClosedDates(new Date(), 7);
    const firstDate = dates[0];
    const lastDate = dates[dates.length - 1];
    const dowNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

    // Gate: require at least one active policy with absent_if_no_punch=true.
    const { data: policies } = await supabase
      .from("hr_attendance_policies")
      .select("id")
      .eq("is_active", true)
      .eq("absent_if_no_punch", true)
      .limit(1);
    if (!policies || policies.length === 0) {
      await audit(supabase, lastDate, 0, 0, 0, false, "absent_if_no_punch disabled");
      return json({ message: "absent_if_no_punch disabled", dates, marked: 0 });
    }

    // Active employees.
    const employees = await fetchAllRows((from, to) =>
      supabase.from("hr_employees").select("id").eq("is_active", true).range(from, to)
    );
    if (!employees.length) {
      await audit(supabase, lastDate, 0, 0, 0, false, "no active employees");
      return json({ message: "no active employees", dates, marked: 0 });
    }
    const employeeIds = employees.map((e: any) => e.id);

    const holidays = await fetchAllRows((from, to) =>
      supabase.from("hr_holidays").select("date, recurring")
        .eq("is_active", true).range(from, to)
    );
    const holidayDates = new Set(
      dates.filter((date) => (holidays || []).some((holiday: any) => {
        if (holiday.date === date) return true;
        return holiday.recurring === true && holiday.date?.slice(5) === date.slice(5);
      }))
    );

    const dailyRows = await fetchAllRows((from, to) =>
      supabase
        .from("hr_attendance_daily")
        .select("employee_id, attendance_date, status")
        .gte("attendance_date", firstDate)
        .lte("attendance_date", lastDate)
        .in("employee_id", employeeIds)
        .range(from, to)
    );
    const alreadyHandled = new Set<string>(
      (dailyRows || []).filter((r: any) => r.status && r.status !== "no_data")
        .map((r: any) => `${r.employee_id}|${r.attendance_date}`)
    );

    const leaves = await fetchAllRows((from, to) =>
      supabase
        .from("hr_leave_requests")
        .select("employee_id, start_date, end_date")
        .eq("status", "approved")
        .lte("start_date", lastDate)
        .gte("end_date", firstDate)
        .in("employee_id", employeeIds)
        .range(from, to)
    );

    const weeklyOffLinks = await fetchAllRows((from, to) =>
      supabase
        .from("hr_employee_weekly_off")
        .select("employee_id, pattern_id")
        .eq("is_current", true)
        .in("employee_id", employeeIds)
        .range(from, to)
    );
    const patternIds = [...new Set((weeklyOffLinks || []).map((r: any) => r.pattern_id).filter(Boolean))];
    const patternDays = new Map<string, Set<number>>();
    if (patternIds.length) {
      const { data: patterns } = await supabase
        .from("hr_weekly_off_patterns")
        .select("id, weekly_offs")
        .in("id", patternIds);
      for (const p of patterns || []) {
        const offs = Array.isArray((p as any).weekly_offs) ? (p as any).weekly_offs : [];
        const normalized = new Set<number>();
        for (const value of offs) {
          if (typeof value === "number" && value >= 0 && value <= 6) normalized.add(value);
          if (typeof value === "string") {
            const index = dowNames.indexOf(value.toLowerCase());
            if (index >= 0) normalized.add(index);
          }
        }
        patternDays.set((p as any).id, normalized);
      }
    }
    const employeeOffDays = new Map<string, Set<number>>();
    for (const link of weeklyOffLinks || []) {
      employeeOffDays.set((link as any).employee_id, patternDays.get((link as any).pattern_id) || new Set());
    }

    const isOnLeave = (employeeId: string, date: string) =>
      (leaves || []).some((leave: any) =>
        leave.employee_id === employeeId && leave.start_date <= date && leave.end_date >= date
      );

    const rows: any[] = [];
    const auditByDate = new Map<string, { leave: number; weeklyOff: number; holiday: boolean; marked: number }>();
    for (const date of dates) {
      const stats = { leave: 0, weeklyOff: 0, holiday: holidayDates.has(date), marked: 0 };
      auditByDate.set(date, stats);
      if (stats.holiday) continue;
      const dow = dayOfWeek(date);
      for (const employeeId of employeeIds) {
        if (alreadyHandled.has(`${employeeId}|${date}`)) continue;
        if (isOnLeave(employeeId, date)) { stats.leave += 1; continue; }
        if (employeeOffDays.get(employeeId)?.has(dow)) { stats.weeklyOff += 1; continue; }
        rows.push({ employee_id: employeeId, attendance_date: date });
        stats.marked += 1;
      }
    }

    const dailyPayload = rows.map(({ employee_id, attendance_date }) => ({
      employee_id,
      attendance_date,
      status: "absent",
      first_in: null,
      last_out: null,
      total_hours: 0,
      punch_count: 0,
      session_count: 0,
      suppressed_count: 0,
      engine_version: "v4",
      flags: { auto_absent: true, reconciled_at: new Date().toISOString() },
    }));

    if (dailyPayload.length) {
      const { error } = await supabase.from("hr_attendance_daily")
        .upsert(dailyPayload, { onConflict: "employee_id,attendance_date" });
      if (error) throw error;
    }

    const legacyRows = rows.map(({ employee_id, attendance_date }) => ({
      employee_id,
      attendance_date,
      attendance_status: "absent",
      check_in: null,
      check_out: null,
      overtime_hours: 0,
      late_minutes: 0,
      early_leave_minutes: 0,
      notes: "auto-marked absent (v4 rolling reconciliation)",
    }));
    if (legacyRows.length) {
      const { error } = await supabase.from("hr_attendance")
        .upsert(legacyRows, { onConflict: "employee_id,attendance_date", ignoreDuplicates: true });
      if (error) throw error;
    }

    for (const date of dates) {
      const stats = auditByDate.get(date);
      if (!stats) continue;
      const notes = stats.holiday ? "public holiday, skipped" : stats.marked ? `reconciled ${stats.marked}` : "reconciled, nothing to mark";
      await audit(supabase, date, stats.marked, stats.leave, stats.weeklyOff, stats.holiday, notes);
    }
    console.log(`[auto-absent v4] reconciled ${firstDate}..${lastDate}: marked ${rows.length}`);
    return json({
      message: "ok",
      dates,
      marked: rows.length,
      reconciled: dates.length,
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
