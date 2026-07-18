// deno-lint-ignore-file no-explicit-any
// ERP → eSSL Biometric Device Pushback.
//
// Queues a `DATA UPDATE USERINFO` (or `DATA DELETE USERINFO`) command in
// `hr_biometric_device_commands` for every registered device, so the device
// picks it up on its next poll. Every attempt is logged to
// `hr_essl_pushback_log` for Data Health.
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// eSSL USERINFO fields — Name is 8-bit ASCII, ~24 chars max on most firmware.
const ESSL_NAME_MAX = 24;

function esslSafeName(raw: string): string {
  return String(raw ?? "")
    // strip non-ASCII (device would truncate/garble it anyway)
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\t/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, ESSL_NAME_MAX);
}

function escapeField(v: string): string {
  return String(v ?? "").replace(/\t/g, " ").replace(/\n/g, " ");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json().catch(() => ({}));
    const {
      hr_employee_id,
      action = "upsert", // 'upsert' | 'delete'
      device_serial: onlySerial, // optional: restrict to one device
      triggered_by,
      triggered_from,
      // Raw override — used from onboarding Stage 5 where the hr_employees row
      // does not yet exist. When provided, we skip the employee lookup and
      // queue commands using this pin/name directly.
      pin: rawPin,
      name: rawName,
    } = body || {};

    if (!["upsert", "delete"].includes(action)) {
      return new Response(JSON.stringify({ ok: false, error: `Unsupported action: ${action}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let pin = "";
    let displayName = "";
    let resolvedEmpId: string | null = hr_employee_id ?? null;

    if (rawPin) {
      pin = String(rawPin).trim();
      displayName = esslSafeName(String(rawName || ""));
    } else {
      if (!hr_employee_id) {
        return new Response(JSON.stringify({ ok: false, error: "hr_employee_id or pin is required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: emp, error: empErr } = await supa
        .from("hr_employees")
        .select("id, first_name, last_name, badge_id, is_active")
        .eq("id", hr_employee_id)
        .maybeSingle();
      if (empErr) throw empErr;
      if (!emp) throw new Error("Employee not found");
      pin = String(emp.badge_id || "").trim();
      displayName = esslSafeName(`${emp.first_name || ""} ${emp.last_name || ""}`.trim());
      resolvedEmpId = emp.id;
    }

    if (!pin) {
      await supa.from("hr_essl_pushback_log").insert({
        hr_employee_id: resolvedEmpId,
        device_serial: null,
        pin: null,
        kind: action === "delete" ? "delete" : "identity",
        action: action === "delete" ? "DATA DELETE USERINFO" : "DATA UPDATE USERINFO",
        status: "skipped",
        error_message: "No badge_id / eSSL PIN provided",
        triggered_by: triggered_by ?? null,
        triggered_from: triggered_from ?? null,
      });
      return new Response(JSON.stringify({ ok: false, skipped: true, reason: "no_badge_id" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    // Target device set: either a specific serial, or every registered device.
    let devQ: any = supa.from("hr_biometric_devices").select("device_serial, name");
    if (onlySerial) devQ = devQ.eq("device_serial", onlySerial);
    const { data: devices } = await devQ;
    const targets = (devices ?? []).filter((d: any) => d.device_serial);

    if (targets.length === 0) {
      await supa.from("hr_essl_pushback_log").insert({
        hr_employee_id: resolvedEmpId,
        device_serial: null,
        pin,
        kind: action === "delete" ? "delete" : "identity",
        action: action === "delete" ? "DATA DELETE USERINFO" : "DATA UPDATE USERINFO",
        status: "skipped",
        error_message: "No registered biometric devices",
        triggered_by: triggered_by ?? null,
        triggered_from: triggered_from ?? null,
      });
      return new Response(JSON.stringify({ ok: false, skipped: true, reason: "no_devices" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const queued: Array<{ device_serial: string; command_id: string }> = [];

    for (const dev of targets) {
      const serial = dev.device_serial;
      const cmdSeed = Date.now() + Math.floor(Math.random() * 10_000);
      const commandText =
        action === "delete"
          ? `C:${cmdSeed}:DATA DELETE USERINFO PIN=${escapeField(pin)}`
          : `C:${cmdSeed}:DATA UPDATE USERINFO PIN=${escapeField(pin)}\tName=${displayName}\tPri=0\tGrp=1`;

      const { data: cmdRow, error: qErr } = await supa
        .from("hr_biometric_device_commands")
        .insert({
          device_serial: serial,
          command_text: commandText,
          status: "pending",
          created_by: triggered_by ?? null,
        })
        .select("id")
        .single();

      if (qErr) {
        await supa.from("hr_essl_pushback_log").insert({
          hr_employee_id: resolvedEmpId,
          device_serial: serial,
          pin,
          kind: action === "delete" ? "delete" : "identity",
          action: action === "delete" ? "DATA DELETE USERINFO" : "DATA UPDATE USERINFO",
          status: "error",
          error_message: qErr.message,
          triggered_by: triggered_by ?? null,
          triggered_from: triggered_from ?? null,
          request_snapshot: { command_text: commandText },
        });
        continue;
      }

      queued.push({ device_serial: serial, command_id: cmdRow.id });

      await supa.from("hr_essl_pushback_log").insert({
        hr_employee_id: resolvedEmpId,
        device_serial: serial,
        pin,
        kind: action === "delete" ? "delete" : "identity",
        action: action === "delete" ? "DATA DELETE USERINFO" : "DATA UPDATE USERINFO",
        status: "queued",
        command_id: cmdRow.id,
        request_snapshot: { command_text: commandText, name: displayName },
        triggered_by: triggered_by ?? null,
        triggered_from: triggered_from ?? null,
      });
    }

    return new Response(
      JSON.stringify({
        ok: queued.length > 0,
        queued_count: queued.length,
        devices: queued,
        pin,
        name: displayName,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
