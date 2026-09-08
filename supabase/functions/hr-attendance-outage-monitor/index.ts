// Biometric outage monitor — every 10 minutes via pg_cron.
//
// Detects reader silence, pauses all attendance judgement + mail, and resumes
// (and kicks recovery) once every reader is pushing again.
//
// Rules confirmed with the app owner:
//   - pause after 2h of silence (configurable in hr_attendance_automation_state)
//   - if ANY reader is silent, everything pauses (in/out direction is derived
//     from which reader saw the punch, so one dead reader corrupts every day)
//   - on recovery, backfill runs and held notices are sent automatically

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { requireCaller } from "../_shared/require-caller.ts";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const istDate = (d: Date) =>
  new Date(d.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const caller = await requireCaller(req, corsHeaders);
  if (!caller.ok) return caller.response;
  const admin = caller.admin;

  try {
    const { data: state } = await admin
      .from("hr_attendance_automation_state")
      .select("*")
      .eq("id", true)
      .maybeSingle();

    const thresholdMin = state?.auto_pause_threshold_minutes ?? 120;
    const cutoff = Date.now() - thresholdMin * 60 * 1000;

    const { data: devices } = await admin
      .from("hr_biometric_devices")
      .select("id, name, device_serial, device_direction, last_sync_at")
      .not("device_serial", "is", null);

    const tracked = devices || [];
    const silent = tracked.filter(
      (d: any) => !d.last_sync_at || new Date(d.last_sync_at).getTime() < cutoff,
    );

    await admin
      .from("hr_attendance_automation_state")
      .update({ last_checked_at: new Date().toISOString() })
      .eq("id", true);

    const { data: openOutage } = await admin
      .from("hr_attendance_outages")
      .select("*")
      .is("ended_at", null)
      .order("started_at", { ascending: false })
      .maybeSingle();

    // ---- Outage starts -------------------------------------------------
    if (tracked.length > 0 && silent.length > 0) {
      if (state?.state === "running") {
        // Outage really began at the newest push we saw, not now.
        const lastPushes = silent
          .map((d: any) => (d.last_sync_at ? new Date(d.last_sync_at).getTime() : null))
          .filter((v: number | null): v is number => v !== null);
        const startedAt = lastPushes.length ? new Date(Math.max(...lastPushes)) : new Date(Date.now() - thresholdMin * 60 * 1000);
        const reason = `No push from ${silent.map((d: any) => d.name).join(", ")} for over ${thresholdMin} minutes`;

        if (!openOutage) {
          await admin.from("hr_attendance_outages").insert({
            started_at: startedAt.toISOString(),
            trigger: "auto",
            reason,
            silent_devices: silent.map((d: any) => ({ id: d.id, name: d.name, serial: d.device_serial, last_sync_at: d.last_sync_at })),
            from_date: istDate(startedAt),
          });
        }
        await admin.from("hr_attendance_automation_state").update({
          state: "paused_auto",
          paused_since: startedAt.toISOString(),
          paused_reason: reason,
          resumed_at: null,
        }).eq("id", true);

        console.log("[outage-monitor] paused:", reason);
        return json({ ok: true, action: "paused", silent: silent.length, reason });
      }
      return json({ ok: true, action: "still_paused", state: state?.state, silent: silent.length });
    }

    // ---- Devices are back ----------------------------------------------
    if (state?.state === "paused_auto") {
      const now = new Date();
      if (openOutage) {
        await admin.from("hr_attendance_outages").update({
          ended_at: now.toISOString(),
          to_date: istDate(now),
        }).eq("id", openOutage.id);
      }
      await admin.from("hr_attendance_automation_state").update({
        state: "running",
        paused_since: null,
        paused_reason: null,
        resumed_at: now.toISOString(),
      }).eq("id", true);
      console.log("[outage-monitor] resumed — readers pushing again");
    }

    // Kick recovery for any closed outage still awaiting backfill/mail release.
    const { data: pending } = await admin
      .from("hr_attendance_outages")
      .select("id")
      .not("ended_at", "is", null)
      .or("recovery_status.in.(pending,running),mail_release_status.in.(pending,running)")
      .limit(1);

    let recovery: unknown = null;
    if (pending && pending.length) {
      const res = await admin.functions.invoke("hr-attendance-outage-recover", { body: {} });
      recovery = res.error ? { error: res.error.message } : res.data;
    }

    return json({
      ok: true,
      action: state?.state === "paused_manual" ? "paused_manual" : "running",
      devices: tracked.length,
      silent: 0,
      recovery,
    });
  } catch (e) {
    console.error("[outage-monitor] error", e);
    return json({ error: (e as Error).message }, 500);
  }
});
