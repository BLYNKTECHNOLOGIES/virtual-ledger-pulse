// Public, read-only headline stats for blynkex.com. Returns rounded figures only.
import { createClient } from "npm:@supabase/supabase-js@2";

const ONE_HOUR = 3600_000;
const GUARD_MS = 60_000;

function corsFor(origin: string | null): Record<string, string> {
  const ok = !!origin && (
    origin === "https://blynkex.com" ||
    origin === "https://www.blynkex.com" ||
    /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.lovable\.app$/i.test(origin)
  );
  const h: Record<string, string> = { Vary: "Origin" };
  if (ok) {
    h["Access-Control-Allow-Origin"] = origin!;
    h["Access-Control-Allow-Methods"] = "GET, OPTIONS";
    h["Access-Control-Allow-Headers"] = "content-type";
    h["Access-Control-Max-Age"] = "86400";
  }
  return h;
}

export function floor2sig(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  const p = Math.pow(10, Math.max(0, Math.floor(Math.log10(n)) - 1));
  return Math.floor(n / p) * p;
}
const floor5 = (n: number) => Math.max(0, Math.floor(n / 5) * 5);

Deno.serve(async (req) => {
  const cors = corsFor(req.headers.get("Origin"));
  if (req.method === "OPTIONS") {
    return new Response(null, { status: cors["Access-Control-Allow-Origin"] ? 204 : 403, headers: cors });
  }
  if (req.method !== "GET") return new Response(null, { status: 405, headers: { ...cors, Allow: "GET, OPTIONS" } });

  const json = (body: unknown, status = 200, cache = true) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": cache ? "public, max-age=3600" : "no-store" },
    });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: cached } = await db.from("public_site_stats_cache").select("payload, computed_at, refresh_started_at").eq("id", 1).maybeSingle();
  const now = Date.now();

  if (cached && now - new Date(cached.computed_at).getTime() < ONE_HOUR) return json(cached.payload);
  if (cached?.refresh_started_at && now - new Date(cached.refresh_started_at).getTime() < GUARD_MS) return json(cached.payload);

  try {
    if (cached) await db.from("public_site_stats_cache").update({ refresh_started_at: new Date().toISOString() }).eq("id", 1);
    const c = async (q: any) => { const { count, error } = await q; if (error) throw error; return count ?? 0; };
    const [kyc, bt, wt, risk, team] = await Promise.all([
      c(db.from("clients").select("id", { count: "exact", head: true }).eq("kyc_status", "VERIFIED").or("is_deleted.is.null,is_deleted.eq.false")),
      c(db.from("bank_transactions").select("id", { count: "exact", head: true })),
      c(db.from("wallet_transactions").select("id", { count: "exact", head: true })),
      c(db.from("risk_detection_logs").select("id", { count: "exact", head: true })),
      c(db.from("hr_employees").select("id", { count: "exact", head: true }).eq("is_active", true)),
    ]);
    const payload = {
      generated_at: new Date().toISOString(),
      identities_verified: floor2sig(kyc),
      ledger_records: floor2sig(bt + wt),
      risk_checks_run: floor2sig(risk),
      team_members: floor5(team),
    };
    await db.from("public_site_stats_cache").upsert({ id: 1, payload, computed_at: payload.generated_at, refresh_started_at: null });
    return json(payload);
  } catch (_e) {
    if (cached) return json(cached.payload);
    return json({ error: "unavailable" }, 503, false);
  }
});
