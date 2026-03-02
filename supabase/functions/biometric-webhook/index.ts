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

    // Accept single punch, array of punches, or { punches: [...] }
    const punches: any[] = Array.isArray(body) ? body : body.punches ? body.punches : [body];

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
      const badge_id = punch.badge_id || punch.user_id || punch.userId;
      const punch_time = punch.punch_time || punch.timestamp || punch.time;
      const punch_type = punch.punch_type;
      const device_name = punch.device_name || punch.deviceName || "eSSL Device";
      const device_serial = punch.device_serial || punch.serialNumber || null;
      const raw_status = punch.status ?? punch.raw_status ?? null;

      if (!badge_id || !punch_time) {
        results.errors.push(`Missing badge_id or punch_time: ${JSON.stringify(punch)}`);
        continue;
      }

      const punchISO = new Date(punch_time).toISOString();
      const punchDate = punchISO.split("T")[0];

      // 1. Store raw punch in hr_attendance_punches
      await supabase.from("hr_attendance_punches").insert({
        badge_id: String(badge_id),
        employee_id: String(badge_id), // badge_id = employee_id direct mapping
        punch_time: punchISO,
        punch_type: punch_type || "auto",
        device_name,
        device_serial,
        raw_status: typeof raw_status === "number" ? raw_status : null,
      });

      // 2. Find employee by badge_id (employee_id field in employees table)
      const { data: employee } = await supabase
        .from("hr_employees")
        .select("id, badge_id, first_name, last_name")
        .eq("badge_id", badge_id)
        .maybeSingle();

      const empId = employee?.id || String(badge_id);

      // 3. Update hr_attendance_activity (clock in/out toggle)
      if (employee) {
        const { data: existingActivity } = await supabase
          .from("hr_attendance_activity")
          .select("*")
          .eq("employee_id", employee.id)
          .eq("activity_date", punchDate)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!existingActivity || existingActivity.clock_out) {
          await supabase.from("hr_attendance_activity").insert({
            employee_id: employee.id,
            activity_date: punchDate,
            clock_in: punchISO,
            clock_in_note: `Via ${device_name}`,
          });
        } else if (!existingActivity.clock_out) {
          await supabase.from("hr_attendance_activity").update({
            clock_out: punchISO,
            clock_out_note: `Via ${device_name}`,
          }).eq("id", existingActivity.id);
        }

        // 4. Update hr_attendance for daily summary
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
            check_in: punchISO,
            attendance_status: "present",
          });
        } else {
          await supabase.from("hr_attendance").update({
            check_out: punchISO,
          }).eq("id", existingAttendance.id);
        }
      }

      // 5. Update hr_attendance_daily (computed summary from all punches)
      const { data: dayPunches } = await supabase
        .from("hr_attendance_punches")
        .select("punch_time")
        .eq("employee_id", String(badge_id))
        .gte("punch_time", `${punchDate}T00:00:00`)
        .lt("punch_time", `${punchDate}T23:59:59.999`)
        .order("punch_time", { ascending: true });

      if (dayPunches && dayPunches.length > 0) {
        const firstIn = dayPunches[0].punch_time;
        const lastOut = dayPunches[dayPunches.length - 1].punch_time;
        const totalMs = new Date(lastOut).getTime() - new Date(firstIn).getTime();
        const totalHours = Math.round((totalMs / 3600000) * 100) / 100;

        const firstInDate = new Date(firstIn);
        const shiftStart = new Date(firstInDate);
        shiftStart.setHours(9, 30, 0, 0);
        const isLate = firstInDate > shiftStart;
        const lateByMinutes = isLate
          ? Math.round((firstInDate.getTime() - shiftStart.getTime()) / 60000)
          : 0;

        const lastOutDate = new Date(lastOut);
        const shiftEnd = new Date(lastOutDate);
        shiftEnd.setHours(18, 30, 0, 0);
        const earlyDeparture = dayPunches.length > 1 && lastOutDate < shiftEnd;
        const earlyByMinutes = earlyDeparture
          ? Math.round((shiftEnd.getTime() - lastOutDate.getTime()) / 60000)
          : 0;

        const status = totalHours < 4 ? "half_day" : isLate ? "late" : "present";

        await supabase.from("hr_attendance_daily").upsert(
          {
            employee_id: String(badge_id),
            attendance_date: punchDate,
            first_in: firstIn,
            last_out: lastOut,
            total_hours: totalHours,
            punch_count: dayPunches.length,
            status,
            is_late: isLate,
            late_by_minutes: lateByMinutes,
            early_departure: earlyDeparture,
            early_by_minutes: earlyByMinutes,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "employee_id,attendance_date" }
        );
      }

      results.inserted++;
    }

    // Update device heartbeat
    const deviceName = punches[0]?.device_name || punches[0]?.deviceName;
    const deviceSerial = punches[0]?.device_serial || punches[0]?.serialNumber;
    if (deviceName || deviceSerial) {
      const matchCol = deviceSerial ? "device_serial" : "device_name";
      const matchVal = deviceSerial || deviceName;

      const { data: existing } = await supabase
        .from("hr_biometric_devices")
        .select("id")
        .eq(matchCol, matchVal)
        .maybeSingle();

      if (existing) {
        await supabase.from("hr_biometric_devices")
          .update({ status: "online", last_heartbeat: new Date().toISOString() })
          .eq("id", existing.id);
      } else {
        await supabase.from("hr_biometric_devices").insert({
          device_name: deviceName || "eSSL Device",
          device_serial: deviceSerial,
          status: "online",
          last_heartbeat: new Date().toISOString(),
        });
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
