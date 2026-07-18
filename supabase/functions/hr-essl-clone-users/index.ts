// deno-lint-ignore-file no-explicit-any
// Clone eSSL device users (USERINFO only — templates are NOT transferable via
// the ADMS/iclock protocol) from a source device onto a target device by
// queueing `DATA UPDATE USERINFO` commands the target picks up on its next
// heartbeat.
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json().catch(() => ({}));
    const {
      source_serial,
      target_serial,
      exclude_pins = [],
      triggered_by,
      triggered_from,
    } = body || {};

    if (!source_serial || !target_serial) {
      return new Response(
        JSON.stringify({ ok: false, error: "source_serial and target_serial are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (source_serial === target_serial) {
      return new Response(
        JSON.stringify({ ok: false, error: "source and target must differ" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const excludeSet = new Set((exclude_pins as any[]).map((p) => String(p).trim()));

    const { data: srcUsers, error: srcErr } = await supa
      .from("hr_biometric_device_users")
      .select("pin, name, privilege, group_no, card_no")
      .eq("device_serial", source_serial);
    if (srcErr) throw srcErr;

    const { data: tgtUsers, error: tgtErr } = await supa
      .from("hr_biometric_device_users")
      .select("pin, name")
      .eq("device_serial", target_serial);
    if (tgtErr) throw tgtErr;

    const tgtMap = new Map<string, string>();
    for (const u of tgtUsers || []) tgtMap.set(String(u.pin), esslSafeName(u.name || ""));

    let queued = 0, skipped = 0, excluded = 0, errors = 0;
    const details: any[] = [];

    for (const u of srcUsers || []) {
      const pin = String(u.pin).trim();
      if (!pin) { skipped++; continue; }
      if (excludeSet.has(pin)) { excluded++; details.push({ pin, status: "excluded" }); continue; }

      const safeName = esslSafeName(u.name || "");
      if (tgtMap.get(pin) === safeName && safeName) {
        skipped++;
        details.push({ pin, status: "already_present" });
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
          device_serial: target_serial,
          command_text: commandText,
          status: "pending",
          created_by: triggered_by ?? null,
        })
        .select("id")
        .single();

      if (qErr) {
        errors++;
        details.push({ pin, status: "error", error: qErr.message });
        await supa.from("hr_essl_pushback_log").insert({
          device_serial: target_serial,
          pin,
          kind: "identity",
          action: "DATA UPDATE USERINFO",
          status: "error",
          error_message: qErr.message,
          triggered_by: triggered_by ?? null,
          triggered_from: triggered_from ?? "clone-users",
          request_snapshot: { command_text: commandText, source_serial },
        });
        continue;
      }

      queued++;
      details.push({ pin, name: safeName, status: "queued", command_id: cmdRow.id });
      await supa.from("hr_essl_pushback_log").insert({
        device_serial: target_serial,
        pin,
        kind: "identity",
        action: "DATA UPDATE USERINFO",
        status: "queued",
        command_id: cmdRow.id,
        request_snapshot: { command_text: commandText, name: safeName, source_serial },
        triggered_by: triggered_by ?? null,
        triggered_from: triggered_from ?? "clone-users",
      });
    }

    return new Response(
      JSON.stringify({ ok: true, source_serial, target_serial, queued, skipped, excluded, errors, details }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
