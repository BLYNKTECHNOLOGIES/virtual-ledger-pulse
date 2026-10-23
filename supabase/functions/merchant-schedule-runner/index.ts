import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { requireCaller } from "../_shared/require-caller.ts";
import { decide, occurrenceKey, type CurrentRest } from "./decisions.ts";

const scheduleSchema = z.object({
  id: z.string().uuid(), name: z.string().min(1).max(255), exchange_account_id: z.string().uuid(),
  action: z.enum(["go_online", "go_offline", "take_rest"]), day_of_week: z.number().int().min(0).max(6),
  start_time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?$/),
  end_time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?$/), is_active: z.boolean(),
}).refine(s => s.action === "go_online" || s.start_time !== s.end_time, "Rest window must have different start and end times");
const bodySchema = z.object({ dryRun: z.boolean().optional(), now: z.string().datetime({ offset: true }).optional(),
  schedules: z.array(scheduleSchema).max(200).optional(),
  currentRest: z.object({ id: z.string().uuid(), source: z.string().max(30), exchange_account_id: z.string().uuid().nullable(), is_active: z.boolean() }).nullable().optional(),
  seenOccurrences: z.array(z.object({ schedule_id: z.string().uuid(), occurrence_start: z.string().datetime({ offset: true }) })).max(500).optional(),
}).strict();
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply({ error: "POST required" }, 405);
  let dueSchedules: unknown[] | null = null;
  const schedulerSecret = req.headers.get("x-scheduler-secret");
  let caller;
  if (schedulerSecret) {
    const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return reply({ error: "Missing internal configuration" }, 503);
    const admin = createClient(url, key);
    const { data, error } = await admin.rpc("tau_merchant_schedule_tick", { p_secret: schedulerSecret });
    if (error) return reply({ error: "Scheduler lookup failed" }, 503);
    if (!data?.authorized) return reply({ error: "Unauthorized" }, 401);
    dueSchedules = data.schedules;
    caller = { ok: true as const, kind: "scheduler" as const, userId: null, admin };
  } else caller = await requireCaller(req, corsHeaders);
  if (!caller.ok) return caller.response;
  if (caller.kind === "user") return reply({ error: "Internal scheduler or service callers only" }, 403);
  let raw: unknown;
  try { raw = await req.json(); } catch { return reply({ error: "Invalid JSON body" }, 400); }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return reply({ error: parsed.error.flatten() }, 400);
  const body = parsed.data;
  if (body.dryRun && caller.kind !== "service") return reply({ error: "dryRun is service-only" }, 403);
  if (!body.dryRun && (body.now || body.schedules || body.currentRest !== undefined || body.seenOccurrences)) {
    return reply({ error: "Synthetic inputs are allowed only with service-only dryRun" }, 400);
  }
  try {
    const seen = new Set((body.seenOccurrences ?? []).map(x => occurrenceKey(x.schedule_id, new Date(x.occurrence_start).toISOString())));
    let rest: CurrentRest | null = body.currentRest ?? null;
    if (body.dryRun) {
      const now = body.now ? new Date(body.now) : new Date();
      const decisions = [];
      for (const schedule of body.schedules ?? []) {
        const d = decide(schedule, now, rest, seen);
        if (!d) continue;
        decisions.push(d);
        seen.add(occurrenceKey(d.schedule_id, d.occurrence_start));
        if (d.outcome === "started") rest = { id: schedule.id, source: "schedule", exchange_account_id: schedule.exchange_account_id, is_active: true };
        if (d.outcome === "ended_rest") rest = null;
      }
      return reply({ dryRun: true, decisions, writes: 0, binanceCalls: 0 });
    }
    // Single SQL SELECT returns only due, unclaimed occurrences. Empty tick exits here.
    let data = dueSchedules;
    if (data === null) {
      const result = await caller.admin.rpc("tau_due_merchant_schedules");
      if (result.error) throw result.error;
      data = result.data;
    }
    if (!data?.length) return reply({ processed: 0, message: "No schedules due" });
    const schedules = z.array(scheduleSchema).parse(data);
    const results = [];
    for (const schedule of schedules) {
      const { data: timer, error: restError } = await caller.admin.from("ad_rest_timer").select("id,source,exchange_account_id,is_active")
        .eq("is_active", true).limit(1).maybeSingle();
      if (restError) throw restError;
      rest = timer;
      const d = decide(schedule, new Date(), rest, seen);
      if (!d) continue;
      const { durationMinutes, ...row } = d;
      // Claim before the external action. Failed/uncertain calls are never blindly replayed.
      const { data: run, error: claimError } = await caller.admin.from("p2p_merchant_schedule_runs")
        .insert({ ...row, outcome: "failed", message: "Occurrence claimed; execution not yet confirmed" }).select("id").single();
      if (claimError?.code === "23505") continue;
      if (claimError) throw claimError;
      let outcome: string = d.outcome, message = d.message, timerId = d.rest_timer_id ?? null;
      try {
        if (d.outcome === "started" || d.outcome === "ended_rest") {
          const url = Deno.env.get("SUPABASE_URL"), serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
          if (!url || !serviceKey) throw new Error("Missing internal service configuration");
          const response = await fetch(`${url}/functions/v1/binance-ads`, {
            method: "POST", signal: AbortSignal.timeout(150_000),
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
            body: JSON.stringify(d.outcome === "started" ? {
              action: "startAdRest", accountIds: [d.exchange_account_id], durationMinutes,
              source: "schedule", scheduleId: d.schedule_id, occurrenceEnd: d.occurrence_end, userName: `Merchant schedule · ${d.schedule_name}`,
            } : { action: "endAdRest", timerId, scheduleOnlyAccountId: d.exchange_account_id,
              userName: `Merchant schedule · ${d.schedule_name}` }),
          });
          const result = await response.json();
          if (!response.ok || !result.success) throw new Error(result.error || `Rest action returned ${response.status}`);
          timerId = result.data?.timerId ?? timerId;
          if (d.outcome === "started" && !result.data?.started) throw new Error(result.data?.message || "No rest started");
          if (d.outcome === "ended_rest" && (!result.data?.claimed || result.data?.failed?.length)) {
            throw new Error(result.data?.reason || "Rest restoration incomplete — automatic recovery or operator review required");
          }
        }
      } catch (e) { outcome = "failed"; message = (e as Error).message; }
      const { error: saveError } = await caller.admin.from("p2p_merchant_schedule_runs").update({ outcome, message, rest_timer_id: timerId }).eq("id", run.id);
      if (saveError) throw saveError;
      results.push({ ...d, outcome, message, rest_timer_id: timerId });
    }
    return reply({ processed: results.length, results });
  } catch (e) { console.error("merchant schedule runner:", (e as Error).message); return reply({ error: (e as Error).message }, 500); }
});