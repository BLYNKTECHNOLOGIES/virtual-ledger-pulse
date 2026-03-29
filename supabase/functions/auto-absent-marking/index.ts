import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get yesterday's date
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];

    // Check if any active policy has absent_if_no_punch enabled
    const { data: policies } = await supabase
      .from("hr_attendance_policies")
      .select("id, absent_if_no_punch")
      .eq("is_active", true)
      .eq("absent_if_no_punch", true);

    if (!policies || policies.length === 0) {
      return new Response(
        JSON.stringify({ message: "No policy with absent_if_no_punch enabled", marked: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get all active employees
    const { data: employees } = await supabase
      .from("hr_employees")
      .select("id")
      .eq("status", "active");

    if (!employees || employees.length === 0) {
      return new Response(
        JSON.stringify({ message: "No active employees", marked: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const employeeIds = employees.map((e: any) => e.id);

    // Get employees who already have attendance for yesterday
    const { data: existingAttendance } = await supabase
      .from("hr_attendance")
      .select("employee_id")
      .eq("attendance_date", yesterdayStr)
      .in("employee_id", employeeIds);

    const attendedIds = new Set((existingAttendance || []).map((a: any) => a.employee_id));
    const absentEmployees = employeeIds.filter((id: string) => !attendedIds.has(id));

    if (absentEmployees.length === 0) {
      return new Response(
        JSON.stringify({ message: "All employees have attendance records", marked: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Bulk insert absent records
    const absentRecords = absentEmployees.map((employeeId: string) => ({
      employee_id: employeeId,
      attendance_date: yesterdayStr,
      status: "absent",
      shift_id: null,
      check_in: null,
      check_out: null,
      worked_hours: 0,
      is_late: false,
      is_half_day: false,
      overtime_hours: 0,
    }));

    const { error: insertError, data: inserted } = await supabase
      .from("hr_attendance")
      .insert(absentRecords)
      .select("id");

    if (insertError) {
      throw new Error(`Insert failed: ${insertError.message}`);
    }

    console.log(`Auto-absent: marked ${inserted?.length || 0} employees absent for ${yesterdayStr}`);

    return new Response(
      JSON.stringify({ message: "Success", date: yesterdayStr, marked: inserted?.length || 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Auto-absent marking error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
