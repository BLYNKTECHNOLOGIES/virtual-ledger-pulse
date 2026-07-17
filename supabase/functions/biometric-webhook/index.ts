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
  const pathName = url.pathname.toLowerCase();

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // ─── AUTHENTICATE ICLOCK DEVICE REQUESTS (GET/POST with ?SN=) ───
    // Prevents anyone who guesses a serial number from forging attendance data.
    // Resolve the calling device once — used both for auth and for direction
    // enforcement further down. A device flagged as "In Device" / "Out Device"
    // forces every push it emits to that direction, regardless of raw_status.
    let deviceRow: { id: string; device_direction: string | null } | null = null;
    if (serialNumber) {
      const { data: knownDevice } = await supabase
        .from("hr_biometric_devices")
        .select("id, device_direction")
        .eq("device_serial", serialNumber)
        .maybeSingle();

      if (!knownDevice) {
        console.warn(`Rejected ICLOCK request from unknown serial: ${serialNumber}`);
        return new Response("Unauthorized", {
          status: 401,
          headers: { "Content-Type": "text/plain", ...corsHeaders },
        });
      }
      deviceRow = knownDevice as any;

      const deviceToken = Deno.env.get("BIOMETRIC_WEBHOOK_SECRET");
      const providedToken =
        url.searchParams.get("token") ?? req.headers.get("x-webhook-secret");

      if (deviceToken && providedToken !== deviceToken) {
        console.warn(`Rejected ICLOCK request with invalid token from serial: ${serialNumber}`);
        return new Response("Unauthorized", {
          status: 401,
          headers: { "Content-Type": "text/plain", ...corsHeaders },
        });
      }
    }

    const forcedDirection: "in" | "out" | null =
      deviceRow?.device_direction === "In Device"
        ? "in"
        : deviceRow?.device_direction === "Out Device"
        ? "out"
        : null;

    // ─── ICLOCK PROTOCOL: GET requests ───
    if (req.method === "GET" && serialNumber) {
      const options = url.searchParams.get("options");
      const requestType = url.searchParams.get("type")?.toLowerCase();
      const isCommandPoll =
        requestType === "getrequest" ||
        pathName.endsWith("/getrequest") ||
        pathName.endsWith("/getrequest.aspx") ||
        pathName.includes("/getrequest.");

      console.log(
        `ICLOCK GET from ${serialNumber}: path=${url.pathname}, options=${options || "-"}, type=${requestType || "-"}, queryKeys=${Array.from(url.searchParams.keys()).join(",") || "-"}`
      );

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
          "TransFlag=TransData AttLog\tOpLog\tAttPhoto\tEnrollUser\tChgUser\tEnrollFP\tChgFP\tFPImag\tUserPic\tFace\tPalm\tBioData\tOptions",
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
      if (isCommandPoll) {
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
          console.log(`ICLOCK command delivered to ${serialNumber}: ${cmd.command_text.slice(0, 120)}`);
          return new Response(cmd.command_text, {
            status: 200,
            headers: { "Content-Type": "text/plain", ...corsHeaders },
          });
        }

        console.log(`ICLOCK command poll from ${serialNumber}: no pending commands`);

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

      if (isCommandAckPayload(url.pathname, bodyText)) {
        await parseCommandAck(supabase, serialNumber, bodyText);
        return new Response("OK", { status: 200, headers: { "Content-Type": "text/plain", ...corsHeaders } });
      }

      if (table === "ATTLOG" && bodyText.trim()) {
        const lines = bodyText.trim().split("\n");
        const results = { inserted: 0, skipped: 0, unmatched: 0, quarantined: 0, errors: [] as string[] };
        const unmatchedPins = new Set<string>();
        let maxPunchDate: Date | null = null;

        // Cutoff: only process punches from the last 7 days
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 7);

        // ── Parse once, collect pins, then prefetch the PIN → employee map for
        //    this device in a single query. This turns 4-5 sequential DB
        //    round-trips per line into ~3 fixed round-trips per batch, so a
        //    backlog push of ~1000 lines finishes inside the invocation.
        type Parsed = {
          pin: string; punchISO: string; punchDateObj: Date;
          punchDate: string; punch_type: "in" | "out";
          raw_status: number | null; verify_type: number | null; work_code: string | null;
          raw_line: string;
        };
        const parsed: Parsed[] = [];
        const pinsInBatch = new Set<string>();
        for (const line of lines) {
          try {
            const parts = line.trim().split("\t");
            if (parts.length < 2) { results.errors.push(`Invalid ATTLOG line: ${line}`); continue; }
            const pin = parts[0].trim();
            const punch_time_str = parts[1].trim();
            const raw_status = parts.length > 2 ? parseInt(parts[2]) : null;
            const verify_type = parts.length > 3 ? parseInt(parts[3]) : null;
            const work_code = parts.length > 4 ? parts[4].trim() : null;
            const punchISO = parseESSLTimestamp(punch_time_str);
            const punchDateObj = new Date(punchISO);
            const punchDate = getPunchDateFromESSLTimestamp(punch_time_str);
            if (!maxPunchDate || punchDateObj > maxPunchDate) maxPunchDate = punchDateObj;
            if (punchDateObj < cutoffDate) { results.skipped++; continue; }
            const punch_type: "in" | "out" =
              raw_status === 1 || raw_status === 2 || raw_status === 5 ? "out" : "in";
            parsed.push({ pin, punchISO, punchDateObj, punchDate, punch_type, raw_status, verify_type, work_code, raw_line: line });
            pinsInBatch.add(pin);
          } catch (lineErr) {
            results.errors.push(`Line parse error: ${(lineErr as Error).message}`);
          }
        }

        // Prefetch mapping table for pins actually seen in this batch.
        const pinArr = Array.from(pinsInBatch);
        const pinToEmp = new Map<string, { employeeUUID: string; badge_id: string | null }>();
        if (pinArr.length > 0) {
          const { data: mapped } = await supabase
            .from("hr_biometric_device_users")
            .select("pin, matched_employee_id")
            .eq("device_serial", serialNumber)
            .in("pin", pinArr);
          const empIds = Array.from(new Set(((mapped ?? []).map((r: any) => r.matched_employee_id).filter(Boolean)))) as string[];
          const empIdToBadge = new Map<string, string | null>();
          if (empIds.length > 0) {
            const { data: emps } = await supabase.from("hr_employees").select("id, badge_id").in("id", empIds);
            (emps ?? []).forEach((e: any) => empIdToBadge.set(e.id, e.badge_id ?? null));
          }
          (mapped ?? []).forEach((r: any) => {
            if (r.matched_employee_id)
              pinToEmp.set(r.pin, { employeeUUID: r.matched_employee_id, badge_id: empIdToBadge.get(r.matched_employee_id) ?? null });
          });
          // Legacy fallback: hr_employees.badge_id = pin (for sites where PIN==badge).
          const unresolved = pinArr.filter((p) => !pinToEmp.has(p));
          if (unresolved.length > 0) {
            const { data: byBadge } = await supabase.from("hr_employees").select("id, badge_id").in("badge_id", unresolved);
            (byBadge ?? []).forEach((e: any) => {
              if (e.badge_id) pinToEmp.set(e.badge_id, { employeeUUID: e.id, badge_id: e.badge_id });
            });
          }
        }

        // Split parsed rows into matched vs unmapped.
        const punchInserts: any[] = [];
        const quarantineInserts: any[] = [];
        const matchedForProcess: { badge_id: string; punchISO: string; punchDate: string; punch_type: "in" | "out"; employeeUUID: string }[] = [];
        for (const p of parsed) {
          const emp = pinToEmp.get(p.pin);
          if (!emp) {
            results.unmatched++;
            unmatchedPins.add(p.pin);
            quarantineInserts.push({
              device_serial: serialNumber, pin: p.pin, punch_time: p.punchISO,
              punch_type: p.punch_type, raw_status: p.raw_status, verify_type: p.verify_type,
              work_code: p.work_code, raw_line: p.raw_line,
            });
            continue;
          }
          punchInserts.push({
            badge_id: emp.badge_id ?? p.pin,
            employee_id: emp.employeeUUID,
            punch_time: p.punchISO,
            punch_type: p.punch_type,
            device_name: "eSSL Push",
            device_serial: serialNumber,
            raw_status: p.raw_status,
          });
          matchedForProcess.push({
            badge_id: emp.badge_id ?? p.pin, punchISO: p.punchISO, punchDate: p.punchDate,
            punch_type: p.punch_type, employeeUUID: emp.employeeUUID,
          });
        }

        // Batch inserts. The unique index on (employee_id, punch_time) — combined
        // with ON CONFLICT DO NOTHING — handles the 2-min dedup that used to
        // require a per-line SELECT round-trip.
        if (punchInserts.length > 0) {
          const { error: batchErr, data: inserted } = await supabase
            .from("hr_attendance_punches")
            .upsert(punchInserts, { onConflict: "employee_id,punch_time", ignoreDuplicates: true })
            .select("id, employee_id, punch_time");
          if (batchErr) {
            results.errors.push(`Batch punch insert error: ${batchErr.message}`);
          } else {
            results.inserted += (inserted ?? []).length;
            results.skipped += punchInserts.length - (inserted ?? []).length;
          }
        }
        if (quarantineInserts.length > 0) {
          const { error: qErr, data: qData } = await supabase
            .from("hr_attendance_quarantine")
            .upsert(quarantineInserts, { onConflict: "device_serial,pin,punch_time", ignoreDuplicates: true })
            .select("id");
          if (qErr) results.errors.push(`Quarantine insert error: ${qErr.message}`);
          else results.quarantined = (qData ?? []).length;
        }
        // Roll up daily aggregates for matched rows (still sequential, but
        // only for matched punches — the expensive path is only paid for
        // real work).
        for (const m of matchedForProcess) {
          try { await processAttendance(supabase, m.badge_id, m.punchISO, m.punchDate, m.punch_type, m.employeeUUID); }
          catch (e) { results.errors.push(`processAttendance: ${(e as Error).message}`); }
        }

        // Update device heartbeat and stamp
        const newStamp = maxPunchDate ? formatESSLStamp(maxPunchDate) : undefined;
        await updateDeviceHeartbeat(supabase, serialNumber, results.inserted, newStamp);

        // Silence-alarm bookkeeping. Accumulate the total drop count with a
        // since-timestamp (so 1 drop in the current batch does not overwrite
        // "347 dropped since yesterday"); reset only when good punches land.
        if (results.unmatched > 0) {
          const { data: dev } = await supabase
            .from("hr_biometric_devices")
            .select("unmatched_pin_count_total, unmatched_since")
            .eq("device_serial", serialNumber)
            .maybeSingle();
          const newTotal = (dev?.unmatched_pin_count_total ?? 0) + results.unmatched;
          await supabase
            .from("hr_biometric_devices")
            .update({
              unmatched_pin_count: results.unmatched,
              unmatched_pin_count_total: newTotal,
              unmatched_since: (dev as any)?.unmatched_since ?? new Date().toISOString(),
              last_rejection_at: new Date().toISOString(),
              last_rejection_pins: Array.from(unmatchedPins).slice(0, 20).join(","),
            })
            .eq("device_serial", serialNumber);
        } else if (results.inserted > 0) {
          await supabase
            .from("hr_biometric_devices")
            .update({
              unmatched_pin_count: 0,
              unmatched_pin_count_total: 0,
              unmatched_since: null,
              last_rejection_pins: null,
            })
            .eq("device_serial", serialNumber);
        }

        console.log(`ATTLOG from ${serialNumber}: inserted=${results.inserted}, unmatched=${results.unmatched}, quarantined=${results.quarantined}, skipped=${results.skipped}, total=${lines.length}`);

        return new Response("OK", {
          status: 200,
          headers: { "Content-Type": "text/plain", ...corsHeaders },
        });
      }

      // OPERLOG / DATA QUERY responses — parse USER / FP / FACE / PALM / VEIN / USERPIC / OPLOG / BIODATA lines.
      // Different eSSL firmwares return roster pulls either as table=OPERLOG or table=USERINFO/TEMPLATE/BIODATA.
      if (isRosterPayload(table, bodyText)) {
        await parseOperlog(supabase, serialNumber, bodyText, table || undefined);
        return new Response("OK", { status: 200, headers: { "Content-Type": "text/plain", ...corsHeaders } });
      }

      // ATTPHOTO — attendance photo lines
      if (table === "ATTPHOTO") {
        await parseAttPhoto(supabase, serialNumber, bodyText);
        return new Response("OK", { status: 200, headers: { "Content-Type": "text/plain", ...corsHeaders } });
      }

      // OPTIONS / INFO — device pushes runtime info (firmware, counters, MAC etc.)
      if (table === "OPTIONS" || table === "options") {
        await parseDeviceInfo(supabase, serialNumber, bodyText);
        return new Response("OK", { status: 200, headers: { "Content-Type": "text/plain", ...corsHeaders } });
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

      // Require a configured secret — never accept punches if it is missing.
      if (!webhookSecret || providedSecret !== webhookSecret) {
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

        // Resolve badge_id → employee UUID
        const { data: empLookup } = await supabase
          .from("hr_employees")
          .select("id")
          .eq("badge_id", String(badge_id))
          .maybeSingle();

        if (!empLookup) {
          results.errors.push(`No employee found for badge_id=${badge_id}`);
          continue;
        }

        const employeeUUID = empLookup.id;

        await supabase.from("hr_attendance_punches").insert({
          badge_id: String(badge_id),
          employee_id: employeeUUID,
          punch_time: punchISO,
          punch_type: punch_type || "auto",
          device_name,
          device_serial,
          raw_status: typeof raw_status === "number" ? raw_status : null,
        });

        await processAttendance(supabase, String(badge_id), punchISO, punchDate, punch_type || "auto", employeeUUID);

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
      JSON.stringify({ error: (error as Error).message }),
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

// ─── Helper: Process attendance records (shift-aware, deterministic) ───
async function processAttendance(
  supabase: any,
  badge_id: string,
  punchISO: string,
  punchDate: string,
  punch_type: string,
  preResolvedEmployeeId?: string
) {
  // 1. Use pre-resolved UUID if available, otherwise look up
  let employeeId = preResolvedEmployeeId;
  if (!employeeId) {
    const { data: employee } = await supabase
      .from("hr_employees")
      .select("id")
      .eq("badge_id", badge_id)
      .maybeSingle();

    if (!employee) {
      console.log(`[ATTENDANCE] No employee found for badge_id=${badge_id}, skipping attendance processing`);
      return;
    }
    employeeId = employee.id;
  }

  const employeeIdStr: string = employeeId!;

  // 2. Look up employee's shift via hr_employee_work_info → hr_shifts
  const { data: workInfo } = await supabase
    .from("hr_employee_work_info")
    .select("shift_id")
    .eq("employee_id", employeeIdStr)
    .maybeSingle();

  let shiftStartTime = "09:00:00";
  let shiftEndTime = "18:00:00";
  let isNightShift = false;
  let gracePeriodMinutes = 15;
  let shiftDurationHours = 9;
  let shiftId: string | null = null;

  if (workInfo?.shift_id) {
    const { data: shift } = await supabase
      .from("hr_shifts")
      .select("id, start_time, end_time, is_night_shift, grace_period_minutes, duration_hours")
      .eq("id", workInfo.shift_id)
      .maybeSingle();

    if (shift) {
      shiftId = shift.id;
      shiftStartTime = shift.start_time;
      shiftEndTime = shift.end_time;
      isNightShift = shift.is_night_shift ?? false;
      gracePeriodMinutes = shift.grace_period_minutes ?? 15;
      shiftDurationHours = shift.duration_hours ?? 9;
    }
  }

  // 3. Compute shift window for punch date (handles overnight)
  const { windowStart, windowEnd, attendanceDate } = computeShiftWindow(
    punchDate, shiftStartTime, shiftEndTime, isNightShift
  );

  // 4. Query ALL punches within that shift window for this employee
  const { data: windowPunches } = await supabase
    .from("hr_attendance_punches")
    .select("id, punch_time")
    .eq("employee_id", employeeIdStr)
    .gte("punch_time", windowStart)
    .lte("punch_time", windowEnd)
    .order("punch_time", { ascending: true });

  if (!windowPunches || windowPunches.length === 0) {
    console.log(`[ATTENDANCE] No punches in shift window for employee=${employeeIdStr}, badge=${badge_id}, window=${windowStart}→${windowEnd}`);
    return;
  }

  // 5. Deterministic: First punch = check-in, Last punch = check-out
  const firstPunch = windowPunches[0].punch_time;
  const lastPunch = windowPunches.length > 1
    ? windowPunches[windowPunches.length - 1].punch_time
    : null;
  const punchCount = windowPunches.length;

  // Log intermediate punches that are ignored
  if (windowPunches.length > 2) {
    const ignored = windowPunches.slice(1, -1);
    console.log(`[ATTENDANCE] Ignored ${ignored.length} intermediate punches for employee=${employeeIdStr}, date=${attendanceDate}: ${ignored.map((p: any) => p.punch_time).join(", ")}`);
  }

  // 6. Shift-aware calculations
  const firstPunchDate = new Date(firstPunch);
  const shiftStartFull = parseTimeToDateOnDate(attendanceDate, shiftStartTime);
  const shiftEndFull = isNightShift
    ? parseTimeToNextDay(attendanceDate, shiftEndTime)
    : parseTimeToDateOnDate(attendanceDate, shiftEndTime);

  // Late calculation: compare first punch against shift start + grace period
  const graceEnd = new Date(shiftStartFull.getTime() + gracePeriodMinutes * 60 * 1000);
  const isLate = firstPunchDate > graceEnd;
  const lateByMinutes = isLate
    ? Math.round((firstPunchDate.getTime() - shiftStartFull.getTime()) / 60000)
    : 0;

  // Early departure calculation
  let earlyDeparture = false;
  let earlyByMinutes = 0;
  let totalHours = 0;

  if (lastPunch) {
    const lastPunchDate = new Date(lastPunch);
    earlyDeparture = lastPunchDate < shiftEndFull;
    earlyByMinutes = earlyDeparture
      ? Math.round((shiftEndFull.getTime() - lastPunchDate.getTime()) / 60000)
      : 0;
    const totalMs = lastPunchDate.getTime() - firstPunchDate.getTime();
    totalHours = Math.round((totalMs / 3600000) * 100) / 100;
  }

  // Status determination
  let status: string;
  if (punchCount === 1) {
    status = "incomplete";
  } else if (totalHours < shiftDurationHours * 0.5) {
    status = "half_day";
  } else if (isLate) {
    status = "late";
  } else {
    status = "present";
  }

  // 7. UPSERT hr_attendance_activity — one row per employee per shift-date
  const { data: existingActivity } = await supabase
    .from("hr_attendance_activity")
    .select("id")
    .eq("employee_id", employeeIdStr)
    .eq("activity_date", attendanceDate)
    .limit(1)
    .maybeSingle();

  const activityPayload = {
    employee_id: employeeIdStr,
    activity_date: attendanceDate,
    clock_in: firstPunch,
    clock_out: lastPunch,
    clock_in_note: "Via eSSL Push",
    clock_out_note: lastPunch ? "Via eSSL Push" : null,
  };

  if (existingActivity) {
    await supabase.from("hr_attendance_activity")
      .update(activityPayload)
      .eq("id", existingActivity.id);
  } else {
    await supabase.from("hr_attendance_activity").insert(activityPayload);
  }

  // 8. UPSERT hr_attendance — uses unique constraint (employee_id, attendance_date)
  const attendancePayload = {
    employee_id: employeeIdStr,
    attendance_date: attendanceDate,
    check_in: firstPunch,
    check_out: lastPunch,
    shift_id: shiftId,
    attendance_status: status,
    late_minutes: lateByMinutes,
    early_leave_minutes: earlyByMinutes,
    overtime_hours: totalHours > shiftDurationHours
      ? Math.round((totalHours - shiftDurationHours) * 100) / 100
      : 0,
    updated_at: new Date().toISOString(),
  };

  await supabase.from("hr_attendance").upsert(attendancePayload, {
    onConflict: "employee_id,attendance_date",
  });

  // 9. UPSERT hr_attendance_daily — uses unique constraint (employee_id, attendance_date)
  await supabase.from("hr_attendance_daily").upsert(
    {
      employee_id: employeeIdStr,
      attendance_date: attendanceDate,
      first_in: firstPunch,
      last_out: lastPunch,
      total_hours: totalHours,
      punch_count: punchCount,
      status,
      is_late: isLate,
      late_by_minutes: lateByMinutes,
      early_departure: earlyDeparture,
      early_by_minutes: earlyByMinutes,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "employee_id,attendance_date" }
  );

  console.log(`[ATTENDANCE] Processed employee=${employeeIdStr}, date=${attendanceDate}, status=${status}, punches=${punchCount}, checkIn=${firstPunch}, checkOut=${lastPunch || "N/A"}`);
}

// ─── Helper: Compute shift window boundaries ───
function computeShiftWindow(
  punchDate: string,
  startTime: string,
  endTime: string,
  isNightShift: boolean
): { windowStart: string; windowEnd: string; attendanceDate: string } {
  if (isNightShift) {
    // Overnight shift: window starts on punchDate at startTime, ends next day at endTime
    // But if punch is in the early morning hours (before endTime), it belongs to previous day's shift
    const punchHour = parseInt(punchDate.split("T")?.[1]?.split(":")?.[0] || "12");
    const endHour = parseInt(endTime.split(":")[0]);

    // If we're computing from a date string (YYYY-MM-DD), check if we need to look back
    const windowStart = `${punchDate}T${startTime}+05:30`;
    const windowEnd = addOneDay(punchDate) + `T${endTime}+05:30`;

    return {
      windowStart,
      windowEnd,
      attendanceDate: punchDate, // Attendance date = shift start date
    };
  }

  // Day shift: window is same day
  // Add 1 hour buffer on each side to catch edge punches
  const windowStart = `${punchDate}T${startTime}+05:30`;
  const windowEnd = `${punchDate}T${endTime}+05:30`;

  return {
    windowStart,
    windowEnd,
    attendanceDate: punchDate,
  };
}

// ─── Helper: Parse time string to Date on a specific date ───
function parseTimeToDateOnDate(dateStr: string, timeStr: string): Date {
  return new Date(`${dateStr}T${timeStr}+05:30`);
}

function parseTimeToNextDay(dateStr: string, timeStr: string): Date {
  return new Date(`${addOneDay(dateStr)}T${timeStr}+05:30`);
}

function addOneDay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().split("T")[0];
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

// ─── OPERLOG parser: USER, FP, FACE, PALM, VEIN, USERPIC, OPLOG, BIODATA ───
// eSSL/ZKTeco push protocol reference:
//   USER PIN=1\tName=John\tPri=0\tPasswd=\tCard=123\tGrp=1\tTZ=1\tVerify=0\tViceCard=
//   FP    PIN=1\tFID=0\tSize=512\tValid=1\tTMP=<b64>
//   FACE  PIN=1\tFID=50\tSize=1024\tValid=1\tTMP=<b64>
//   PALM  PIN=1\tFID=0\tSize=..\tValid=1\tTMP=<b64>
//   VEIN  PIN=1\tFID=0\tSize=..\tValid=1\tTMP=<b64>
//   USERPIC PIN=1\tSize=..\tContent=<b64>
//   OPLOG <code>\t<adminPin>\t<yyyy-mm-dd HH:MM:SS>\t<v1>\t<v2>\t<v3>\t<v4>
//   BIODATA Pin=1\tNo=0\tIndex=0\tValid=1\tDuress=0\tType=1\tMajorVer=0\tMinorVer=0\tFormat=0\tTmp=<b64>
function parseKV(line: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const seg of line.split(/[\t&]+/)) {
    const eq = seg.indexOf("=");
    if (eq > 0) out[seg.slice(0, eq).trim().toLowerCase()] = seg.slice(eq + 1).trim();
  }
  return out;
}

const OPLOG_LABELS: Record<number, string> = {
  0: "Startup", 1: "Shutdown", 2: "Auth Failure", 3: "Alarm", 4: "Menu Enter",
  5: "Menu Exit", 6: "Enroll User", 7: "Enroll FP", 8: "Enroll Password", 9: "Enroll Card",
  10: "Delete User", 11: "Delete FP", 12: "Delete Password", 13: "Delete Card",
  14: "Modify User Info", 15: "Timezone Change", 16: "Doorbell", 17: "Factory Reset",
  18: "Clear All Data", 19: "Clear Attendance", 20: "Time Set", 21: "Admin Sign-In",
  22: "Enroll Face", 23: "Delete Face", 24: "Enroll Palm", 25: "Delete Palm",
};

function isRosterPayload(table: string | null, body: string): boolean {
  const normalizedTable = (table || "").toUpperCase();
  if (["OPERLOG", "USERINFO", "USER", "TEMPLATE", "FP", "FACE", "PALM", "VEIN", "BIODATA", "USERPIC"].includes(normalizedTable)) {
    return body.trim().length > 0;
  }
  return /(^|\n)\s*(USER\s|USER\t|FP\s|FACE\s|PALM\s|VEIN\s|BIODATA\s|USERPIC\s|OPLOG\s)/i.test(body);
}

function normalizeRosterLine(tableHint: string | undefined, rawLine: string): string {
  const line = rawLine.trim();
  if (/^(USER\s|USER\t|FP\s|FACE\s|PALM\s|VEIN\s|BIODATA\s|USERPIC\s|OPLOG\s)/i.test(line)) {
    return line;
  }

  const table = (tableHint || "").toUpperCase();
  if (["USERINFO", "USER"].includes(table) && /(^|\t)PIN=/i.test(line)) return `USER ${line}`;
  if (["BIODATA"].includes(table) && /(^|\t)(PIN|Pin)=/i.test(line)) return `BIODATA ${line}`;
  if (["FP", "TEMPLATE"].includes(table) && /(^|\t)(PIN|FID|Size|TMP)=/i.test(line)) return `FP ${line}`;
  if (["FACE", "PALM", "VEIN", "USERPIC"].includes(table) && /(^|\t)PIN=/i.test(line)) return `${table} ${line}`;

  return line;
}

function isCommandAckPayload(pathname: string, body: string): boolean {
  return pathname.toLowerCase().includes("devicecmd") || /(^|\n)\s*ID=/i.test(body) || /(^|\n)\s*CMD=/i.test(body);
}

async function parseCommandAck(supabase: any, serialNumber: string, body: string) {
  const lines = body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let updated = 0;
  let cleaned = 0;

  for (const line of lines) {
    const kv = parseKV(line);
    const commandId = cleanCommandAckId(kv["id"] || kv["cmdid"] || kv["cmd"]);
    if (!commandId) continue;

    const returnCode = kv["return"] ?? kv["ret"] ?? kv["result"] ?? "0";
    const status = returnCode === "0" || /^ok$/i.test(returnCode) ? "ack" : "error";

    const { data: matchedCommands, error } = await supabase
      .from("hr_biometric_device_commands")
      .update({
        status,
        ack_at: new Date().toISOString(),
        ack_response: line.slice(0, 500),
      })
      .eq("device_serial", serialNumber)
      .like("command_text", `C:${commandId}:%`)
      .select("id, command_text");

    if (error) {
      console.warn(`Command ACK update failed for ${serialNumber}/${commandId}: ${error.message}`);
      continue;
    }

    updated += matchedCommands?.length || 0;

    if (status === "ack") {
      for (const cmd of matchedCommands || []) {
        cleaned += await applyAckedCommandSideEffects(supabase, serialNumber, cmd.command_text);
      }
    }
  }

  console.log(`Command ACK parsed from ${serialNumber}: updated=${updated}, cleaned=${cleaned}`);
}

function cleanCommandAckId(value?: string): string | null {
  if (!value) return null;
  const match = String(value).match(/\d+/);
  return match?.[0] || null;
}

async function applyAckedCommandSideEffects(supabase: any, serialNumber: string, commandText: string): Promise<number> {
  // DELETE USERINFO → purge the roster row locally.
  const deleteUserMatch = commandText.match(/DATA\s+DELETE\s+USERINFO\s+PIN=([^\t\r\n\s]+)/i);
  if (deleteUserMatch) {
    const pin = deleteUserMatch[1]?.trim();
    if (!pin || pin === "*" || /^all$/i.test(pin)) return 0;

    const tables = [
      "hr_biometric_device_templates",
      "hr_biometric_device_photos",
      "hr_biometric_device_users",
    ];
    let deleted = 0;
    for (const table of tables) {
      const { data, error } = await supabase
        .from(table)
        .delete()
        .eq("device_serial", serialNumber)
        .eq("pin", pin)
        .select("id");
      if (error) {
        console.warn(`Failed to clean ${table} for ${serialNumber}/PIN ${pin}: ${error.message}`);
        continue;
      }
      deleted += data?.length || 0;
    }
    return deleted;
  }

  // UPDATE USERINFO → mirror the pushed identity into the local device roster
  // so the Data Health scanner can immediately see the reconciled value.
  const updateUserMatch = commandText.match(/DATA\s+UPDATE\s+USERINFO\s+(.+)/i);
  if (updateUserMatch) {
    const kvs: Record<string, string> = {};
    for (const part of updateUserMatch[1].split(/\t+/)) {
      const eq = part.indexOf("=");
      if (eq === -1) continue;
      const k = part.slice(0, eq).trim().toLowerCase();
      const v = part.slice(eq + 1).trim();
      if (k) kvs[k] = v;
    }
    const pin = kvs["pin"];
    if (!pin) return 0;

    const row: any = {
      device_serial: serialNumber,
      pin,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (kvs["name"] != null) row.name = kvs["name"];
    if (kvs["pri"] != null) row.privilege = Number(kvs["pri"]) || 0;
    if (kvs["card"] != null) row.card_no = kvs["card"] || null;
    if (kvs["grp"] != null) {
      const g = Number(kvs["grp"]);
      if (!Number.isNaN(g)) row.group_no = g;
    }

    const { data: existing } = await supabase
      .from("hr_biometric_device_users")
      .select("id")
      .eq("device_serial", serialNumber)
      .eq("pin", pin)
      .maybeSingle();

    if (existing?.id) {
      const { error } = await supabase
        .from("hr_biometric_device_users")
        .update(row)
        .eq("id", existing.id);
      if (error) console.warn(`Failed to reflect USERINFO update for ${serialNumber}/PIN ${pin}: ${error.message}`);
    } else {
      const { error } = await supabase
        .from("hr_biometric_device_users")
        .insert({ ...row, first_seen_at: row.last_seen_at });
      if (error) console.warn(`Failed to insert USERINFO for ${serialNumber}/PIN ${pin}: ${error.message}`);
    }
    return 1;
  }

  return 0;
}

async function parseOperlog(supabase: any, serialNumber: string, body: string, tableHint?: string) {
  const lines = body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const userUpserts = new Map<string, any>();
  const templates: any[] = [];
  const photos: any[] = [];
  const oplogs: any[] = [];

  for (const rawLine of lines) {
    const line = normalizeRosterLine(tableHint, rawLine);
    try {
      if (line.startsWith("USER ") || line.startsWith("USER\t")) {
        const kv = parseKV(line.replace(/^USER\s+/i, ""));
        const pin = kv["pin"];
        if (!pin) continue;
        userUpserts.set(pin, {
          device_serial: serialNumber,
          pin,
          name: kv["name"] || null,
          privilege: kv["pri"] ? parseInt(kv["pri"]) : null,
          password_set: !!kv["passwd"],
          card_no: kv["card"] || null,
          group_no: kv["grp"] ? parseInt(kv["grp"]) : null,
          time_zones: kv["tz"] || null,
          verify_mode: kv["verify"] ? parseInt(kv["verify"]) : null,
          vice_card: kv["vicecard"] || null,
          raw_line: line.slice(0, 500),
          last_seen_at: new Date().toISOString(),
        });
      } else if (/^(FP|FACE|PALM|VEIN|BIODATA)\s/i.test(line)) {
        const [kindRaw, ...rest] = line.split(/\s+/);
        const kv = parseKV(rest.join("\t"));
        const pin = kv["pin"];
        if (!pin) continue;
        templates.push({
          device_serial: serialNumber,
          pin,
          template_kind: kindRaw.toUpperCase(),
          finger_index: kv["fid"] ? parseInt(kv["fid"]) : (kv["index"] ? parseInt(kv["index"]) : 0),
          size_bytes: kv["size"] ? parseInt(kv["size"]) : null,
          valid: kv["valid"] === "1",
          duress: kv["duress"] === "1",
          algorithm_version: kv["majorver"] ? `${kv["majorver"]}.${kv["minorver"] || 0}` : null,
        });
      } else if (line.startsWith("USERPIC")) {
        const kv = parseKV(line.replace(/^USERPIC\s+/i, ""));
        const pin = kv["pin"];
        if (!pin) continue;
        photos.push({
          device_serial: serialNumber,
          pin,
          kind: "USERPIC",
          size_bytes: kv["size"] ? parseInt(kv["size"]) : null,
          photo_base64: kv["content"] || null,
        });
      } else if (/^OPLOG\s/i.test(line)) {
        const parts = line.split(/\t/);
        // OPLOG\tcode\tadminPin\ttime\tv1\tv2\tv3\tv4
        const code = parts[1] ? parseInt(parts[1]) : null;
        oplogs.push({
          device_serial: serialNumber,
          op_code: code,
          op_label: code != null ? (OPLOG_LABELS[code] || `OP_${code}`) : null,
          admin_pin: parts[2] || null,
          occurred_at: parts[3] ? parseESSLTimestamp(parts[3]) : null,
          target_pin: parts[4] || null,
          value_1: parts[4] || null,
          value_2: parts[5] || null,
          value_3: parts[6] || null,
          value_4: parts[7] || null,
          raw_line: line.slice(0, 500),
        });
      }
    } catch (e) {
      console.warn("OPERLOG line parse error", (e as Error).message, line.slice(0, 120));
    }
  }

  if (userUpserts.size > 0) {
    // Mark photo_present after we know if photo came in same batch
    for (const p of photos) {
      const u = userUpserts.get(p.pin);
      if (u) u.photo_present = true;
    }
    await supabase.from("hr_biometric_device_users").upsert(
      Array.from(userUpserts.values()),
      { onConflict: "device_serial,pin" }
    );
    // Try to auto-link to hr_employees:
    //   (a) exact badge_id = pin (legacy where PIN==badge)
    //   (b) fuzzy match on normalized name (case/space/punct insensitive)
    for (const [pin, u] of userUpserts) {
      let empId: string | null = null;
      const { data: byBadge } = await supabase
        .from("hr_employees").select("id").eq("badge_id", pin).maybeSingle();
      if (byBadge) empId = byBadge.id;

      if (!empId && u.name) {
        const norm = String(u.name).toLowerCase().replace(/[^a-z0-9]+/g, "");
        if (norm.length >= 3) {
          const { data: byName } = await supabase.rpc("hr_match_employee_by_normalized_name", { p_name: norm });
          if (byName && typeof byName === "string") empId = byName;
        }
      }

      if (empId) {
        await supabase.from("hr_biometric_device_users")
          .update({ matched_employee_id: empId })
          .eq("device_serial", serialNumber).eq("pin", pin)
          .is("matched_employee_id", null);
      }
    }
  }

  if (templates.length > 0) {
    await supabase.from("hr_biometric_device_templates").upsert(
      templates,
      { onConflict: "device_serial,pin,template_kind,finger_index" }
    );
    // Update counts on user row
    const bucket = new Map<string, { fp: number; face: number; palm: number; vein: number }>();
    for (const t of templates) {
      const b = bucket.get(t.pin) || { fp: 0, face: 0, palm: 0, vein: 0 };
      if (t.template_kind === "FP" || t.template_kind === "BIODATA") b.fp++;
      else if (t.template_kind === "FACE") b.face++;
      else if (t.template_kind === "PALM") b.palm++;
      else if (t.template_kind === "VEIN") b.vein++;
      bucket.set(t.pin, b);
    }
    for (const [pin, b] of bucket) {
      await supabase.from("hr_biometric_device_users")
        .update({ fp_count: b.fp, face_count: b.face, palm_count: b.palm, vein_count: b.vein })
        .eq("device_serial", serialNumber).eq("pin", pin);
    }
  }

  if (photos.length > 0) {
    await supabase.from("hr_biometric_device_photos").insert(photos);
  }

  if (oplogs.length > 0) {
    await supabase.from("hr_biometric_device_operlog").insert(oplogs);
  }

  console.log(`OPERLOG parsed from ${serialNumber}: users=${userUpserts.size} tpl=${templates.length} pics=${photos.length} oplog=${oplogs.length}`);
}

async function parseAttPhoto(supabase: any, serialNumber: string, body: string) {
  // Lines: PIN=1\tSN=xxx\tsize=nnn\tCMD=xxx\tContent=<b64>  (optionally with time)
  const lines = body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rows: any[] = [];
  for (const line of lines) {
    const kv = parseKV(line);
    if (!kv["pin"]) continue;
    rows.push({
      device_serial: serialNumber,
      pin: kv["pin"],
      kind: "ATTPHOTO",
      size_bytes: kv["size"] ? parseInt(kv["size"]) : null,
      photo_base64: kv["content"] || null,
      punch_time: kv["time"] ? parseESSLTimestamp(kv["time"]) : null,
    });
  }
  if (rows.length) await supabase.from("hr_biometric_device_photos").insert(rows);
  console.log(`ATTPHOTO parsed from ${serialNumber}: ${rows.length} photos`);
}

async function parseDeviceInfo(supabase: any, serialNumber: string, body: string) {
  // Body is INI-like key=value lines: FWVersion=..., DeviceName=..., MAC=..., Platform=..., UserCount=..., FPCount=..., FaceCount=..., TransactionCount=..., etc.
  const info: Record<string, string> = {};
  for (const line of body.split(/\r?\n/)) {
    const eq = line.indexOf("=");
    if (eq > 0) info[line.slice(0, eq).trim().toLowerCase()] = line.slice(eq + 1).trim();
  }
  const num = (k: string) => info[k] ? parseInt(info[k]) : null;
  await supabase.from("hr_biometric_device_info").upsert({
    device_serial: serialNumber,
    firmware: info["fwversion"] || info["firmwareversion"] || null,
    platform: info["platform"] || null,
    device_name: info["devicename"] || null,
    oem_vendor: info["oemvendor"] || null,
    mac_address: info["mac"] || null,
    ip_address: info["ipaddress"] || null,
    push_version: info["pushversion"] || null,
    fp_algorithm_version: info["fpversion"] || null,
    face_algorithm_version: info["faceversion"] || null,
    user_count: num("usercount"),
    admin_count: num("admincount"),
    fp_count: num("fpcount"),
    face_count: num("facecount"),
    palm_count: num("palmcount"),
    password_count: num("pwdcount"),
    card_count: num("cardcount"),
    transaction_count: num("transactioncount"),
    attphoto_count: num("attphotocount"),
    updated_at: new Date().toISOString(),
  }, { onConflict: "device_serial" });
  console.log(`Device info updated for ${serialNumber}`);
}
