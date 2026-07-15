// RazorpayX Payroll proxy — Phase 1a scaffold.
// Only implements the read-only `validate_creds` action for now.
// No DB writes yet — audit table lands in the Phase 1a migration.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const KEY_ID = Deno.env.get("RAZORPAY_PAYROLL_KEY_ID") ?? "";
const KEY_SECRET = Deno.env.get("RAZORPAY_PAYROLL_KEY_SECRET") ?? "";

const CANDIDATE_BASES = [
  { base: "https://api.razorpay.com/v1/payroll", path: "/employees" },
  { base: "https://payroll.razorpay.com/v1", path: "/employees" },
];

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function requireAuth(req: Request): Promise<{ userId: string } | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json(401, { error: "Unauthorized" });
  }
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) return json(401, { error: "Unauthorized" });
  return { userId: data.claims.sub as string };
}

async function tryFetchOnce(base: string, path: string, timeoutMs = 15000) {
  const url = `${base}${path}?page=1&count=1`;
  const auth = btoa(`${KEY_ID}:${KEY_SECRET}`);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
      },
      signal: ctrl.signal,
    });
    const text = await res.text();
    let parsed: any = null;
    try { parsed = JSON.parse(text); } catch { /* keep raw */ }
    return { status: res.status, ok: res.ok, body: parsed, raw: text };
  } catch (e) {
    return { status: 0, ok: false, body: null, raw: (e as Error).message };
  } finally {
    clearTimeout(t);
  }
}

function summariseSample(body: any): number | null {
  if (!body) return null;
  if (Array.isArray(body?.items)) return body.items.length;
  if (Array.isArray(body?.data)) return body.data.length;
  if (Array.isArray(body?.employees)) return body.employees.length;
  if (Array.isArray(body)) return body.length;
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authed = await requireAuth(req);
    if (authed instanceof Response) return authed;

    if (!KEY_ID || !KEY_SECRET) {
      return json(500, { error: "Missing RAZORPAY_PAYROLL_KEY_ID / RAZORPAY_PAYROLL_KEY_SECRET" });
    }

    const payload = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = payload?.action ?? "validate_creds";

    if (action !== "validate_creds") {
      return json(400, { error: `Unsupported action: ${action}` });
    }

    const attempts: Array<Record<string, unknown>> = [];
    for (const { base, path } of CANDIDATE_BASES) {
      const r = await tryFetchOnce(base, path);
      const snippet = typeof r.raw === "string" ? r.raw.slice(0, 400) : null;
      const sample = summariseSample(r.body);
      attempts.push({
        base_url: base,
        path,
        http_status: r.status,
        ok: r.ok,
        sample_employee_count: sample,
        error_body_snippet: r.ok ? null : snippet,
      });
      console.log(`[validate_creds] ${base}${path} -> ${r.status} ok=${r.ok} sample=${sample}`);
      if (r.ok) {
        return json(200, {
          ok: true,
          base_url_used: base,
          http_status: r.status,
          sample_employee_count: sample,
          attempts,
        });
      }
    }

    return json(200, {
      ok: false,
      base_url_used: null,
      http_status: attempts[attempts.length - 1]?.http_status ?? 0,
      error_body_snippet: attempts[attempts.length - 1]?.error_body_snippet ?? null,
      attempts,
    });
  } catch (e) {
    console.error("razorpay-payroll-proxy error", e);
    return json(500, { error: (e as Error).message });
  }
});
