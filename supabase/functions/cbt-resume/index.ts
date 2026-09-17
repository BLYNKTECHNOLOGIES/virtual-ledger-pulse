import { z } from "https://esm.sh/zod@3.23.8";
import { admin, buildState, constantTimeEqual, corsHeaders, fail, ipHash, json, randomToken, rateLimit, sha256Hex } from "../_shared/cbt.ts";

const Schema = z.object({
  code: z.string().length(6),
  mobile: z.string().regex(/^[6-9]\d{9}$/),
  resume_code: z.string().length(6),
}).strict();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const db = admin();
    const ip = await ipHash(req);
    if (!(await rateLimit(db, `resume:${ip}`, 5, 15))) {
      return fail("locked_out", "Too many tries. Try again in 15 minutes.", 429);
    }
    const parsed = Schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return fail("invalid", "Please check the details you entered.", 400);
    const b = parsed.data;

    const { data: drive } = await db.from("cbt_drives").select("*").eq("access_code", b.code.toUpperCase()).maybeSingle();
    if (!drive) return fail("bad_code", "That code doesn't match an open test. Check the code and try again.", 404);

    const { data: candidates } = await db.from("cbt_candidates").select("id").eq("mobile", b.mobile);
    const ids = (candidates ?? []).map((c) => c.id);
    if (!ids.length) return fail("no_attempt", "We couldn't find your test. Please ask HR for help.", 404);

    const { data: attempts } = await db.from("cbt_attempts").select("*")
      .eq("drive_id", drive.id).in("candidate_id", ids)
      .in("status", ["registered", "in_progress"]).order("created_at", { ascending: false }).limit(1);
    const attempt = attempts?.[0];
    if (!attempt) return fail("no_attempt", "We couldn't find your test. Please ask HR for help.", 404);

    const { data: codes } = await db.from("cbt_resume_codes").select("*")
      .eq("attempt_id", attempt.id).is("used_at", null).gt("expires_at", new Date().toISOString());
    const wanted = await sha256Hex(b.resume_code);
    const match = (codes ?? []).find((c) => constantTimeEqual(c.code_hash as string, wanted));
    if (!match) return fail("bad_resume_code", "That resume code is not valid any more. Please ask HR for a new one.", 403);

    const token = randomToken();
    const nonce = crypto.randomUUID();
    await db.from("cbt_resume_codes").update({ used_at: new Date().toISOString() }).eq("id", match.id);
    await db.from("cbt_attempts").update({
      token_hash: await sha256Hex(token), session_nonce: nonce,
      token_expires_at: new Date(Date.now() + 4 * 3600_000).toISOString(),
      last_heartbeat_at: new Date().toISOString(), ip_hash: ip,
    }).eq("id", attempt.id);
    await db.from("cbt_proctor_events").insert({ attempt_id: attempt.id, event_type: "resume", meta: { by: "candidate" } });
    await db.rpc("cbt_sweep_attempt", { p_attempt_id: attempt.id });

    const state = await buildState(db, attempt.id);
    return json({ ...state, token, session_nonce: nonce });
  } catch (e) {
    return fail("server_error", String((e as Error).message ?? e), 500);
  }
});
