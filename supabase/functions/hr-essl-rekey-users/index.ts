// deno-lint-ignore-file no-explicit-any
// Rekey ESSL/ZKTeco device users: change a device user's PIN by queueing
//   1) DATA DELETE USERINFO PIN=<old>
//   2) DATA UPDATE USERINFO PIN=<new> Name=... Pri=... Grp=...
// on both target devices. Templates (fingerprint/face) cannot be moved via
// ADMS/iclock — the user must physically re-enroll on each device after the
// commands are consumed. This function only queues the identity swap.
//
// Body: { operations: [{ pin_old, pin_new, name, privilege?, group_no?, card_no?,
//                        hr_employee_id?, rekey_log_id?, device_serials?: string[] }],
//         triggered_by?: uuid, triggered_from?: string }
// If device_serials is omitted, all active devices are targeted.
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const ESSL_NAME_MAX = 24;

function esslSafeName(raw: string): string {
  return String(raw ?? "")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\t/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, ESSL_NAME_MAX);
}
function esc(v: any): string {
  return String(v ?? "").replace(/\t/g, " ").replace(/\n/g, " ");
}
function seed() {
  return Date.now() + Math.floor(Math.random() * 100_000);
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
      operations = [],
      device_serials,
      triggered_by,
      triggered_from = "rekey-users",
    } = body || {};

    if (!Array.isArray(operations) || operations.length === 0) {
      return new Response(
        JSON.stringify({ ok: false, error: "operations[] required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Resolve target devices
    let targets: string[] = [];
    if (Array.isArray(device_serials) && device_serials.length) {
      targets = device_serials.map((s: any) => String(s));
    } else {
      const { data: devs, error: devErr } = await supa
        .from("hr_biometric_devices")
        .select("device_serial");
      if (devErr) throw devErr;
      targets = (devs || []).map((d: any) => d.device_serial).filter(Boolean);
    }
    if (targets.length === 0) {
      return new Response(
        JSON.stringify({ ok: false, error: "no target devices" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const results: any[] = [];
    let queued = 0, skipped = 0, errors = 0;
    // Track PINs freed by an earlier op in this same batch, per device.
    // Once we queue a DELETE for PIN X on device D, subsequent ops targeting
    // PIN X on device D should not see the collision-guard trip on X.
    const freedInBatch = new Map<string, Set<string>>(); // device -> set of freed pins
    const claimedInBatch = new Map<string, Set<string>>(); // device -> set of new pins claimed

    for (const op of operations) {
      const oldPin = String(op.pin_old ?? "").trim();
      const newPin = String(op.pin_new ?? "").trim();
      const name = esslSafeName(op.name || "");
      const pri = op.privilege ?? 0;
      const grp = op.group_no ?? 1;
      if (!oldPin || !newPin || oldPin === newPin) {
        skipped++;
        results.push({ pin_old: oldPin, pin_new: newPin, status: "skipped_invalid" });
        continue;
      }

      for (const dev of targets) {
        if (!freedInBatch.has(dev)) freedInBatch.set(dev, new Set());
        if (!claimedInBatch.has(dev)) claimedInBatch.set(dev, new Set());
        const freed = freedInBatch.get(dev)!;
        const claimed = claimedInBatch.get(dev)!;

        // Guard: refuse if newPin already occupied on this device by a different name,
        // unless it was freed by an earlier op in this same batch.
        if (claimed.has(newPin)) {
          errors++;
          const detail = `PIN ${newPin} already claimed earlier in this batch on ${dev}`;
          results.push({ device: dev, pin_old: oldPin, pin_new: newPin, status: "collision", detail });
          continue;
        }
        if (!freed.has(newPin)) {
          const { data: occupant } = await supa
            .from("hr_biometric_device_users")
            .select("pin, name")
            .eq("device_serial", dev)
            .eq("pin", newPin)
            .maybeSingle();
          if (occupant && esslSafeName(occupant.name || "") !== name) {
            errors++;
            const detail = `PIN ${newPin} occupied by "${occupant.name}" on ${dev}`;
            results.push({ device: dev, pin_old: oldPin, pin_new: newPin, status: "collision", detail });
            await supa.from("hr_essl_pushback_log").insert({
              device_serial: dev, pin: newPin, kind: "identity",
              action: "REKEY collision guard",
              status: "error", error_message: detail,
              triggered_by: triggered_by ?? null, triggered_from,
              request_snapshot: { pin_old: oldPin, pin_new: newPin, occupant },
            });
            continue;
          }
        }

        // 1) DELETE old PIN
        const delCmd = `C:${seed()}:DATA DELETE USERINFO PIN=${esc(oldPin)}`;
        const { data: delRow, error: delErr } = await supa
          .from("hr_biometric_device_commands")
          .insert({ device_serial: dev, command_text: delCmd, status: "pending", created_by: triggered_by ?? null })
          .select("id").single();
        if (delErr) {
          errors++;
          results.push({ device: dev, pin_old: oldPin, pin_new: newPin, step: "delete", status: "error", error: delErr.message });
          continue;
        }
        freed.add(oldPin);
        // Optimistically remove the device_users row so future batches also see PIN as free.
        await supa.from("hr_biometric_device_users").delete().eq("device_serial", dev).eq("pin", oldPin);

        // 2) CREATE under new PIN
        const parts = [`PIN=${esc(newPin)}`, `Name=${name}`, `Pri=${pri}`, `Grp=${grp}`];
        if (op.card_no) parts.push(`Card=${esc(op.card_no)}`);
        const setCmd = `C:${seed() + 1}:DATA UPDATE USERINFO ${parts.join("\t")}`;
        const { data: setRow, error: setErr } = await supa
          .from("hr_biometric_device_commands")
          .insert({ device_serial: dev, command_text: setCmd, status: "pending", created_by: triggered_by ?? null })
          .select("id").single();
        if (setErr) {
          errors++;
          results.push({ device: dev, pin_old: oldPin, pin_new: newPin, step: "create", status: "error", error: setErr.message, delete_command_id: delRow?.id });
          continue;
        }
        claimed.add(newPin);


        queued++;
        results.push({
          device: dev,
          pin_old: oldPin,
          pin_new: newPin,
          name,
          status: "queued",
          delete_command_id: delRow?.id,
          create_command_id: setRow?.id,
        });

        await supa.from("hr_essl_pushback_log").insert({
          device_serial: dev, pin: newPin, kind: "identity",
          action: "REKEY DELETE+UPDATE USERINFO",
          status: "queued",
          command_id: setRow?.id,
          request_snapshot: { pin_old: oldPin, pin_new: newPin, name, delete_command_id: delRow?.id },
          triggered_by: triggered_by ?? null, triggered_from,
        });
      }

      // Attach commands to the rekey log if provided
      if (op.rekey_log_id) {
        const opResults = results.filter((r) => r.pin_old === oldPin && r.pin_new === newPin);
        await supa
          .from("hr_employee_id_rekey_log")
          .update({
            devices_updated: opResults,
            status: opResults.every((r) => r.status === "queued") ? "success" : (opResults.some((r) => r.status === "queued") ? "partial" : "failed"),
            error_detail: opResults.filter((r) => r.status !== "queued").map((r) => `${r.device}: ${r.detail || r.error || r.status}`).join("; ") || null,
            completed_at: new Date().toISOString(),
          })
          .eq("id", op.rekey_log_id);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, target_devices: targets, queued, skipped, errors, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
