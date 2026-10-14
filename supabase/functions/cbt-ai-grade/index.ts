// Quiz: AI grading worker for written answers. Called by the database (on submit, and while retries wait) — never by candidates.
// Claims queued evaluations, sends only question + marking guide + word limits + scrubbed answer to the Lovable AI gateway,
// validates the strict JSON and hands the outcome to cbt_ai_record (applies, routes to "Needs a check", or schedules a retry).
import { requireCaller } from "../_shared/require-caller.ts";
import { AI_GRADE_MODEL, buildGradeRequest, classifyStatus, previewRoute, validateGrade, type GradeInput } from "../_shared/cbtAiGrade.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-scheduler-secret" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

async function callGateway(input: GradeInput) {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) return { kind: "unavailable" as const, status: 401, error: "AI key missing" };
  const body = buildGradeRequest(input);
  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const txt = (await resp.text().catch(() => "")).slice(0, 200);
      return { kind: classifyStatus(resp.status), status: resp.status, error: `AI gateway ${resp.status}${txt ? ": " + txt : ""}`, body };
    }
    const out = await resp.json();
    const content = String(out?.choices?.[0]?.message?.content ?? "");
    const result = validateGrade(content, input);
    if (!result) return { kind: "invalid" as const, status: 200, error: "AI returned unreadable output", body, content };
    return { kind: "ok" as const, status: 200, result, body, content };
  } catch (e) {
    return { kind: "retry" as const, status: 0, error: "AI gateway unreachable: " + String((e as Error).message ?? e).slice(0, 120), body };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const gate = await requireCaller(req, cors);
  if (!gate.ok) return gate.response;
  if (gate.kind === "user") return json({ error: "forbidden" }, 403);
  const db = gate.admin as any;
  const reqBody = await req.json().catch(() => ({}));

  // Dry run on made-up answers: nothing is stored.
  if (Array.isArray(reqBody?.dry_run)) {
    const { data: st } = await db.from("cbt_settings").select("ai_confidence_threshold").eq("id", true).single();
    const out = [];
    for (const input of reqBody.dry_run.slice(0, 5)) {
      const r = await callGateway(input);
      out.push({ request_body: r.body, model: AI_GRADE_MODEL, outcome: r.kind, raw: (r as any).content ?? null, result: (r as any).result ?? null,
        route: r.kind === "ok" ? previewRoute((r as any).result, Number(st?.ai_confidence_threshold ?? 0.8)) : "needs_check: AI unavailable", error: (r as any).error ?? null });
    }
    return json({ dry_run: out });
  }

  const results: unknown[] = [];
  let stop = false;
  for (let round = 0; round < 10 && !stop; round++) {
    const { data: batch, error } = await db.rpc("cbt_ai_claim", { p_limit: 5 });
    if (error) return json({ error: error.message }, 500);
    if (!batch?.length) break;
    for (const item of batch as any[]) {
      if (stop) { // credits/permission problem: every other claimed answer goes to a person too
        results.push((await db.rpc("cbt_ai_record", { p_eval_id: item.evaluation_id, p_outcome: "unavailable", p_model: AI_GRADE_MODEL, p_result: null, p_error: "AI unavailable (credits or access)", p_http: null })).data);
        continue;
      }
      const r = await callGateway(item);
      const outcome = r.kind === "ok" ? "ok" : r.kind === "invalid" ? (item.tries < 3 ? "retry" : "invalid") : r.kind;
      if (r.kind === "unavailable") stop = true;
      const { data } = await db.rpc("cbt_ai_record", {
        p_eval_id: item.evaluation_id, p_outcome: outcome, p_model: AI_GRADE_MODEL,
        p_result: r.kind === "ok" ? r.result : null, p_error: (r as any).error ?? null, p_http: r.status,
      });
      results.push({ evaluation_id: item.evaluation_id, ...(data ?? {}) });
    }
  }
  await db.rpc("cbt_disarm_ai_retry");
  console.log(JSON.stringify({ fn: "cbt-ai-grade", graded: results.length }));
  return json({ processed: results });
});
