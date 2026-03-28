import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

/**
 * ESSL Biometric Webhook — supports TWO protocols:
 * 
 * 1. ICLOCK/ADMS Push Protocol (used by ESSL devices natively)
 *    - GET  /biometric-webhook?SN=xxx&options=all  → handshake
 *    - POST /biometric-webhook?SN=xxx&table=ATTLOG → attendance data (text/plain)
 *    - GET  /biometric-webhook?SN=xxx&type=getrequest → device polling for commands
 * 
 * 2. JSON POST (used by custom middleware / manual push)
 *    - POST with Content-Type: application/json
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const serialNumber = url.searchParams.get("SN");

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // ─── ICLOCK PROTOCOL: GET requests ───
    if (req.method === "GET" && serialNumber) {
      const options = url.searchParams.get("options");
      const requestType = url.searchParams.get("type");

      // Heartbeat: update device status on every GET
      await updateDeviceHeartbeat(supabase, serialNumber);

      // 1. Initial handshake: GET ?SN=xxx&options=all
      if (options === "all" || options === "all&") {
        console.log(`ICLOCK handshake from device: ${serialNumber}`);

        // Fetch the last stamp from the device record
        const { data: device } = await supabase
          .from("hr_biometric_devices")
          .select("last_stamp")
          .eq("device_serial", serialNumber)
          .maybeSingle();

        let lastStamp = device?.last_stamp || "0";

        // Fallback: if stamp was never initialized, derive from latest punch for this device
        if (!lastStamp || lastStamp === "0") {
          const { data: latestPunch } = await supabase
            .from("hr_attendance_punches")
            .select("punch_time")
            .eq("device_serial", serialNumber)
            .order("punch_time", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (latestPunch?.punch_time) {
            lastStamp = formatESSLStamp(new Date(latestPunch.punch_time));
          }
        }

        const config = [
          "GET OPTION FROM: " + serialNumber,
          `Stamp=${lastStamp}`,
          "OpStamp=9999",
          "PhotoStamp=9999",
          "ErrorDelay=60",
          "Delay=30",
          "TransTimes=00:00;14:05",
          "TransInterval=1",
          "TransFlag=TransData AttLog\tOpLog\tAttPhoto\tEnrollUser\tChgUser\tEnrollFP\tChgFP\tFPImag",
          "TimeZone=5.5",
          "Realtime=1",
          "Encrypt=0",
        ].join("\n");

        return new Response(config, {
          status: 200,
          headers: { "Content-Type": "text/plain", ...corsHeaders },
        });
      }

      // 2. Device polling for commands: GET ?SN=xxx&type=getrequest
      if (requestType === "getrequest") {
        const { data: commands } = await supabase
          .from("hr_biometric_device_commands")
          .select("*")
          .eq("device_serial", serialNumber)
          .eq("status", "pending")
          .order("created_at", { ascending: true })
          .limit(1);

        if (commands && commands.length > 0) {
          const cmd = commands[0];
          await supabase
            .from("hr_biometric_device_commands")
            .update({ status: "sent", sent_at: new Date().toISOString() })
            .eq("id", cmd.id);
          return new Response(cmd.command_text, {
            status: 200,
            headers: { "Content-Type": "text/plain", ...corsHeaders },
          });
        }

        return new Response("OK", {
          status: 200,
          headers: { "Content-Type": "text/plain", ...corsHeaders },
        });
      }

      return new Response("OK", {
        status: 200,
        headers: { "Content-Type": "text/plain", ...corsHeaders },
      });
    }

    // ─── ICLOCK PROTOCOL: POST with ATTLOG data ───
    if (req.method === "POST" && serialNumber) {
      const table = url.searchParams.get("table");
      const bodyText = await req.text();

      console.log(`ICLOCK POST from ${serialNumber}, table=${table}, body length=${bodyText.length}`);

      if (table === "ATTLOG" && bodyText.trim()) {
        const lines = bodyText.trim().split("\n");
        const results = { inserted: 0, skipped: 0, errors: [] as string[] };
        let maxPunchDate: Date | null = null;

        // Cutoff: only process punches from the last 7 days
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 7);

        for (const line of lines) {
          try {
            const parts = line.trim().split("\t");
            if (parts.length < 2) {
              results.errors.push(`Invalid ATTLOG line: ${line}`);
              continue;
            }

            const badge_id = parts[0].trim();
            const punch_time_str = parts[1].trim();
            const raw_status = parts.length > 2 ? parseInt(parts[2]) : null;
            const verify_type = parts.length > 3 ? parseInt(parts[3]) : null;
            const work_code = parts.length > 4 ? parts[4].trim() : null;

            // Parse punch time
            const punchISO = parseESSLTimestamp(punch_time_str);
            const punchDateObj = new Date(punchISO);
            const punchDate = getPunchDateFromESSLTimestamp(punch_time_str);

            // Track max punch time for stamp sync
            if (!maxPunchDate || punchDateObj > maxPunchDate) {
              maxPunchDate = punchDateObj;
            }

            // Skip old punches beyond cutoff
            if (punchDateObj < cutoffDate) {
              results.skipped++;
              continue;
            }

            // Determine punch type
            const punch_type = raw_status === 1 || raw_status === 2 || raw_status === 5
              ? "out" : "in";

            // ── Deduplication: skip if same badge punched within last 2 minutes ──
            const dedup_window = new Date(punchDateObj.getTime() - 2 * 60 * 1000).toISOString();
            const { data: recentPunch } = await supabase
              .from("hr_attendance_punches")
              .select("id")
              .eq("badge_id", badge_id)
              .gte("punch_time", dedup_window)
              .lte("punch_time", punchISO)
              .limit(1)
              .maybeSingle();

            if (recentPunch) {
              results.skipped++;
              continue;
            }

            // 1. Store raw punch
            const { error: punchError } = await supabase.from("hr_attendance_punches").insert({
              badge_id,
              employee_id: badge_id,
              punch_time: punchISO,
              punch_type,
              device_name: "eSSL Push",
              device_serial: serialNumber,
              raw_status,
            });

            if (punchError) {
              if (punchError.code === "23505") continue; // duplicate
              results.errors.push(`Punch insert error: ${punchError.message}`);
              continue;
            }

            // 2. Process attendance records
            await processAttendance(supabase, badge_id, punchISO, punchDate, punch_type);

            results.inserted++;
          } catch (lineErr) {
            results.errors.push(`Line parse error: ${lineErr.message}`);
          }
        }

        // Update device heartbeat and stamp
        const newStamp = maxPunchDate ? formatESSLStamp(maxPunchDate) : undefined;
        await updateDeviceHeartbeat(supabase, serialNumber, results.inserted, newStamp);

        console.log(`Processed ${results.inserted} new, ${results.skipped} skipped (old) out of ${lines.length} from ${serialNumber}`);

        return new Response("OK", {
          status: 200,
          headers: { "Content-Type": "text/plain", ...corsHeaders },
        });
      }

      // OPERLOG or other tables — acknowledge
      if (table === "OPERLOG" || table === "ATTPHOTO") {
        console.log(`Received ${table} from ${serialNumber}, acknowledged`);
        return new Response("OK", {
          status: 200,
          headers: { "Content-Type": "text/plain", ...corsHeaders },
        });
      }

      return new Response("OK", {
        status: 200,
        headers: { "Content-Type": "text/plain", ...corsHeaders },
      });
    }

    // ─── JSON PROTOCOL: POST with application/json ───
    if (req.method === "POST") {
      const webhookSecret = Deno.env.get("BIOMETRIC_WEBHOOK_SECRET");
      const providedSecret = req.headers.get("x-webhook-secret");

      if (webhookSecret && providedSecret !== webhookSecret) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const body = await req.json();
      const punches: any[] = Array.isArray(body) ? body : body.punches ? body.punches : [body];

      if (punches.length === 0) {
        return new Response(
          JSON.stringify({ error: "No punch data provided" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

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

        await supabase.from("hr_attendance_punches").insert({
          badge_id: String(badge_id),
          employee_id: String(badge_id),
          punch_time: punchISO,
          punch_type: punch_type || "auto",
          device_name,
          device_serial,
          raw_status: typeof raw_status === "number" ? raw_status : null,
        });

        await processAttendance(supabase, String(badge_id), punchISO, punchDate, punch_type || "auto");

        results.inserted++;

        if (device_serial) {
          await updateDeviceHeartbeat(supabase, device_serial, results.inserted);
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
    }

    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ─── Helper: Parse ESSL timestamp (local time, usually IST) to ISO ───
function parseESSLTimestamp(timeStr: string): string {
  const cleaned = timeStr.replace(/\s+/g, " ").trim();
  const date = new Date(cleaned + "+05:30"); // Assume IST
  return date.toISOString();
}

// Keep attendance date aligned to device-local date (prevents UTC date shift issues)
function getPunchDateFromESSLTimestamp(timeStr: string): string {
  const iso = parseESSLTimestamp(timeStr);
  const utc = new Date(iso);
  const ist = new Date(utc.getTime() + 330 * 60 * 1000);

  const yyyy = ist.getUTCFullYear();
  const mm = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(ist.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatESSLStamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const ist = new Date(date.getTime() + 330 * 60 * 1000);

  return `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(ist.getUTCDate())} ${pad(ist.getUTCHours())}:${pad(ist.getUTCMinutes())}:${pad(ist.getUTCSeconds())}`;
}

// ─── Helper: Process attendance records ───
async function processAttendance(
  supabase: any,
  badge_id: string,
  punchISO: string,
  punchDate: string,
  punch_type: string
) {
  // Find employee by badge_id
  const { data: employee } = await supabase
    .from("hr_employees")
    .select("id, badge_id, first_name, last_name")
    .eq("badge_id", badge_id)
    .maybeSingle();

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
        clock_in_note: "Via eSSL Push",
      });
    } else if (!existingActivity.clock_out) {
      await supabase.from("hr_attendance_activity").update({
        clock_out: punchISO,
        clock_out_note: "Via eSSL Push",
      }).eq("id", existingActivity.id);
    }

    // Update hr_attendance daily summary
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

  // Update hr_attendance_daily computed summary
  const { data: dayPunches } = await supabase
    .from("hr_attendance_punches")
    .select("punch_time")
    .eq("employee_id", badge_id)
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
        employee_id: badge_id,
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
}

// ─── Helper: Update device heartbeat ───
// Uses correct columns: name, is_connected, last_sync_at, device_serial
async function updateDeviceHeartbeat(supabase: any, serialNumber: string, punchCount?: number, lastStamp?: string) {
  const now = new Date().toISOString();
  
  // Try to find device by device_serial first
  const { data: existing } = await supabase
    .from("hr_biometric_devices")
    .select("id")
    .eq("device_serial", serialNumber)
    .maybeSingle();

  const updateData: any = {
    is_connected: true,
    last_sync_at: now,
  };
  if (punchCount !== undefined) {
    updateData.last_push_count = punchCount;
  }
  if (lastStamp) {
    updateData.last_stamp = lastStamp;
  }

  if (existing) {
    await supabase.from("hr_biometric_devices")
      .update(updateData)
      .eq("id", existing.id);
  } else {
    // Try matching rows with empty serial as fallback, then any existing ESSL row
    const { data: byName } = await supabase
      .from("hr_biometric_devices")
      .select("id")
      .is("device_serial", null)
      .limit(1)
      .maybeSingle();

    if (byName) {
      await supabase.from("hr_biometric_devices")
        .update({ ...updateData, device_serial: serialNumber })
        .eq("id", byName.id);
    } else {
      const { data: esslRow } = await supabase
        .from("hr_biometric_devices")
        .select("id")
        .ilike("name", "%essl%")
        .limit(1)
        .maybeSingle();

      if (esslRow) {
        await supabase.from("hr_biometric_devices")
          .update({ ...updateData, device_serial: serialNumber })
          .eq("id", esslRow.id);
      } else {
        // Create new device record
        await supabase.from("hr_biometric_devices").insert({
          name: `eSSL Device (${serialNumber})`,
          device_type: "ZKTeco / eSSL Biometric",
          machine_ip: "unknown",
          port_no: "4370",
          password: "",
          device_serial: serialNumber,
          ...updateData,
        });
      }
    }
  }
}
