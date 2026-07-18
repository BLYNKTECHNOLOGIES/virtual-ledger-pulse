// deno-lint-ignore-file no-explicit-any
// Scheduled 2-way parity job: treats the OUT device as primary and mirrors
// its user roster onto the IN device. Runs unattended (called by pg_cron
// every 48h). Reuses the same DATA UPDATE USERINFO command semantics as
// hr-essl-clone-users. Biometric templates are NOT transferable via ADMS
// and must still be re-enrolled physically.
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const ESSL_NAME_MAX = 24;
const esslSafeName = (raw: string) =>
  String(raw ?? "")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\t/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, ESSL_NAME_MAX);
const esc = (v: any) => String(v ?? "").replace(/\t/g, " ").replace(/\n/g, " ");

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = !!body?.dry_run;
    const triggeredFrom = body?.triggered_from ?? "cron-48h";

    // Resolve primary (OUT) and target (IN) devices dynamically.
    const { data: devices, error: devErr } = await supa
      .from("hr_biometric_devices")
      .select("device_serial, name, device_direction");
    if (devErr) throw devErr;

    const primary = (devices || []).find(
      (d) => String(d.device_direction || "").toLowerCase().includes("out"),
    );
    const target = (devices || []).find(
      (d) => String(d.device_direction || "").toLowerCase().includes("in") &&
        !String(d.device_direction || "").toLowerCase().includes("out"),
    );

    if (!primary?.device_serial || !target?.device_serial) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Could not resolve OUT (primary) and IN (target) devices from hr_biometric_devices.device_direction",
          devices,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const [{ data: srcUsers, error: srcErr }, { data: tgtUsers, error: tgtErr }] = await Promise.all([
      supa.from("hr_biometric_device_users")
        .select("pin, name, privilege, group_no, card_no")
        .eq("device_serial", primary.device_serial),
      supa.from("hr_biometric_device_users")
        .select("pin, name")
        .eq("device_serial", target.device_serial),
    ]);
    if (srcErr) throw srcErr;
    if (tgtErr) throw tgtErr;

    const tgtMap = new Map<string, string>();
    for (const u of tgtUsers || []) tgtMap.set(String(u.pin), esslSafeName(u.name || ""));

    let queued = 0, skipped = 0, errors = 0;
    const details: any[] = [];

    for (const u of srcUsers || []) {
      const pin = String(u.pin).trim();
      if (!pin) { skipped++; continue; }
      const safeName = esslSafeName(u.name || "");
      if (tgtMap.get(pin) === safeName && safeName) { skipped++; continue; }

      if (dryRun) {
        queued++;
        details.push({ pin, name: safeName, status: "would_queue" });
        continue;
      }

      const seed = Date.now() + Math.floor(Math.random() * 100_000);
      const parts = [
        `PIN=${esc(pin)}`,
        `Name=${safeName}`,
        `Pri=${u.privilege ?? 0}`,
        `Grp=${u.group_no ?? 1}`,
      ];
      if (u.card_no) parts.push(`Card=${esc(u.card_no)}`);
      const commandText = `C:${seed}:DATA UPDATE USERINFO ${parts.join("\t")}`;

      const { data: cmdRow, error: qErr } = await supa
        .from("hr_biometric_device_commands")
        .insert({
          device_serial: target.device_serial,
          command_text: commandText,
          status: "pending",
        })
        .select("id")
        .single();

      if (qErr) {
        errors++;
        details.push({ pin, status: "error", error: qErr.message });
        await supa.from("hr_essl_pushback_log").insert({
          device_serial: target.device_serial,
          pin,
          kind: "identity",
          action: "DATA UPDATE USERINFO",
          status: "error",
          error_message: qErr.message,
          triggered_from: triggeredFrom,
          request_snapshot: { command_text: commandText, source_serial: primary.device_serial },
        });
        continue;
      }

      queued++;
      details.push({ pin, name: safeName, status: "queued", command_id: cmdRow.id });
      await supa.from("hr_essl_pushback_log").insert({
        device_serial: target.device_serial,
        pin,
        kind: "identity",
        action: "DATA UPDATE USERINFO",
        status: "queued",
        command_id: cmdRow.id,
        request_snapshot: { command_text: commandText, name: safeName, source_serial: primary.device_serial },
        triggered_from: triggeredFrom,
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        primary_serial: primary.device_serial,
        target_serial: target.device_serial,
        source_user_count: srcUsers?.length ?? 0,
        target_user_count: tgtUsers?.length ?? 0,
        queued, skipped, errors,
        dry_run: dryRun,
        details: details.slice(0, 100),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
