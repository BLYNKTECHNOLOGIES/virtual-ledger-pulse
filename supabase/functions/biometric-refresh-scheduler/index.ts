// Queues a nightly full-refresh command batch to every configured biometric device.
// Attendance (ATTLOG) is live-pushed by the device and is NOT included here;
// this scheduler only refreshes reference data: users, templates, operator log,
// photos, and device info/counters. Runs every 24 hours via pg_cron.
//
// The device picks up these commands on its next GET ?type=getrequest heartbeat
// (typically every 10–30s) and pushes the requested tables back via POST.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: devices, error } = await supabase
    .from("hr_biometric_devices")
    .select("id, name, device_serial")
    .not("device_serial", "is", null);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...cors },
    });
  }

  // ZKTeco / eSSL iclock query commands to refresh reference data.
  // Note: we deliberately DO NOT queue ATTLOG queries — attendance is live push.
  const buildCommands = (serial: string) => {
    const now = Date.now();
    // Current IST timestamp for the device clock-sync command.
    // eSSL/ZKTeco SET TIME format: YYYY-MM-DD HH:MM:SS in device local time (IST for us).
    const istIso = new Date(now + 5.5 * 3600_000).toISOString();
    const setTime = `${istIso.slice(0, 10)} ${istIso.slice(11, 19)}`;
    return [
      { device_serial: serial, command_text: `C:${now}:CHECK`, status: "pending" },
      { device_serial: serial, command_text: `C:${now + 1}:INFO`, status: "pending" },
      // F5 · Daily clock-sync — device compares its local time to the pushed value
      // when it next handshakes; the operlog push-back stamps clock_drift_seconds.
      { device_serial: serial, command_text: `C:${now + 2}:SET TIME ${setTime}`, status: "pending" },
      // Broad USERINFO query is the most compatible with eSSL/ZKTeco ADMS firmware.
      { device_serial: serial, command_text: `C:${now + 3}:DATA QUERY USERINFO`, status: "pending" },
      { device_serial: serial, command_text: `C:${now + 4}:DATA QUERY TEMPLATE`, status: "pending" },
      { device_serial: serial, command_text: `C:${now + 5}:DATA QUERY BIODATA`, status: "pending" },
      { device_serial: serial, command_text: `C:${now + 6}:LOG`, status: "pending" },
    ];
  };


  let queued = 0;
  const results: any[] = [];

  for (const d of devices || []) {
    if (!d.device_serial) continue;
    const cmds = buildCommands(d.device_serial);
    const { error: insErr } = await supabase.from("hr_biometric_device_commands").insert(cmds);
    if (insErr) {
      results.push({ device: d.name, serial: d.device_serial, error: insErr.message });
    } else {
      queued += cmds.length;
      results.push({ device: d.name, serial: d.device_serial, queued: cmds.length });
    }
  }

  return new Response(
    JSON.stringify({ ok: true, devices: devices?.length ?? 0, commands_queued: queued, results }),
    { headers: { "Content-Type": "application/json", ...cors } },
  );
});
