import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate webhook secret
    const webhookSecret = Deno.env.get("BIOMETRIC_WEBHOOK_SECRET");
    const providedSecret = req.headers.get("x-webhook-secret");

    if (webhookSecret && providedSecret !== webhookSecret) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();

    // Accept single punch or array of punches
    const punches: any[] = Array.isArray(body) ? body : [body];

    if (punches.length === 0) {
      return new Response(
        JSON.stringify({ error: "No punch data provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const results = { inserted: 0, errors: [] as string[] };

    for (const punch of punches) {
      // Expected payload from middleware:
      // {
      //   badge_id: "0001",           -- employee badge ID
      //   punch_time: "2026-02-15T09:00:00",  -- ISO datetime
      //   punch_type: "clock_in" | "clock_out",  -- optional, auto-detect if missing
      //   device_name: "Front Door ZKTeco",  -- optional
      //   device_ip: "192.168.1.100"   -- optional
      // }

      const { badge_id, punch_time, punch_type, device_name, device_ip } = punch;

      if (!badge_id || !punch_time) {
        results.errors.push(`Missing badge_id or punch_time: ${JSON.stringify(punch)}`);
        continue;
      }

      // Find employee by badge_id
      const { data: employee, error: empError } = await supabase
        .from("hr_employees")
        .select("id, badge_id, first_name, last_name")
        .eq("badge_id", badge_id)
        .maybeSingle();

      if (empError || !employee) {
        results.errors.push(`Employee not found for badge_id: ${badge_id}`);
        continue;
      }

      const punchDate = punch_time.split("T")[0];
      const punchTimestamp = punch_time;

      // Check if there's an existing activity for today
      const { data: existingActivity } = await supabase
        .from("hr_attendance_activity")
        .select("*")
        .eq("employee_id", employee.id)
        .eq("activity_date", punchDate)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!existingActivity || existingActivity.clock_out) {
        // Create new clock_in record
        const { error: insertErr } = await supabase
          .from("hr_attendance_activity")
          .insert({
            employee_id: employee.id,
            activity_date: punchDate,
            clock_in: punchTimestamp,
            clock_in_note: device_name ? `Via ${device_name}` : "Via biometric",
          });

        if (insertErr) {
          results.errors.push(`Insert error for ${badge_id}: ${insertErr.message}`);
        } else {
          results.inserted++;
        }
      } else if (!existingActivity.clock_out) {
        // Update with clock_out
        const { error: updateErr } = await supabase
          .from("hr_attendance_activity")
          .update({
            clock_out: punchTimestamp,
            clock_out_note: device_name ? `Via ${device_name}` : "Via biometric",
          })
          .eq("id", existingActivity.id);

        if (updateErr) {
          results.errors.push(`Update error for ${badge_id}: ${updateErr.message}`);
        } else {
          results.inserted++;
        }
      }

      // Also upsert into hr_attendance for daily summary
      const { data: existingAttendance } = await supabase
        .from("hr_attendance")
        .select("id")
        .eq("employee_id", employee.id)
        .eq("attendance_date", punchDate)
        .maybeSingle();

      if (!existingAttendance) {
        await supabase.from("hr_attendance").insert({
          employee_id: employee.id,
          attendance_date: punchDate,
          check_in: punchTimestamp,
          attendance_status: "present",
        });
      } else if (punch_type === "clock_out" || (!existingActivity || existingActivity.clock_in)) {
        await supabase.from("hr_attendance").update({
          check_out: punchTimestamp,
        }).eq("id", existingAttendance.id);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: punches.length,
        inserted: results.inserted,
        errors: results.errors,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
