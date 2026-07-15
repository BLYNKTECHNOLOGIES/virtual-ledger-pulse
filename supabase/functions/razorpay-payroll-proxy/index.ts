// RazorpayX Payroll (Opfin) proxy — Phase 1a.
//
// IMPORTANT: This API is NOT a REST API. It is a JSON-RPC style API where every
// request POSTs a body of the form:
//   { auth: { id: <numeric org id>, key: "<secret>" },
//     request: { type: "<resource>", "sub-type": "<action>" },
//     data: { ... } }
//
// Base URL: https://payroll.razorpay.com/api/{resource}
// Supported resources: people, payroll, contractor-payment, attendance, advance-salary
// There is NO "list all employees" endpoint — `people/view` requires an
// employee-id. Bulk import must therefore be seeded/ID-driven.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const KEY_ID = Deno.env.get("RAZORPAY_PAYROLL_KEY_ID") ?? "";
const KEY_SECRET = Deno.env.get("RAZORPAY_PAYROLL_KEY_SECRET") ?? "";
const BASE = "https://payroll.razorpay.com/api";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function requireAuth(req: Request): Promise<{ userId: string } | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "Unauthorized" });
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

function buildAuthBlock() {
  // KEY_ID is Opfin's numeric org id. Accept string form but coerce.
  const idNum = Number(KEY_ID);
  const id = Number.isFinite(idNum) && idNum > 0 ? idNum : KEY_ID;
  return { id, key: KEY_SECRET };
}

async function opfinPost(resource: string, subType: string, data: Record<string, unknown>) {
  const url = `${BASE}/${resource}`;
  const body = {
    auth: buildAuthBlock(),
    request: { type: resource, "sub-type": subType },
    data,
  };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const raw = await res.text();
    let parsed: any = null;
    try { parsed = JSON.parse(raw); } catch { /* keep raw */ }
    return { url, status: res.status, ok: res.ok, body: parsed, raw };
  } catch (e) {
    return { url, status: 0, ok: false, body: null, raw: `NETWORK: ${(e as Error).message}` };
  } finally {
    clearTimeout(t);
  }
}

function shapeOf(body: any) {
  const isArray = Array.isArray(body);
  const isObj = body && typeof body === "object" && !isArray;
  const topKeys = isObj ? Object.keys(body) : [];
  let arrayKey: string | null = null;
  let arrayLen: number | null = isArray ? body.length : null;
  let elementFieldNames: string[] | null = null;
  if (isArray && body.length && typeof body[0] === "object") {
    arrayKey = "(root)";
    elementFieldNames = Object.keys(body[0]);
  } else if (isObj) {
    for (const k of topKeys) {
      const v = body[k];
      if (Array.isArray(v)) {
        arrayKey = k;
        arrayLen = v.length;
        if (v.length && typeof v[0] === "object") elementFieldNames = Object.keys(v[0]);
        break;
      }
    }
    // If no array, expose field names of the object itself (single-employee view)
    if (!elementFieldNames) elementFieldNames = topKeys;
  }
  const scalarKeys = isObj ? topKeys.filter((k) => {
    const v = body[k];
    return typeof v === "number" || typeof v === "string" || typeof v === "boolean";
  }) : [];
  return {
    body_type: isArray ? "array" : (isObj ? "object" : typeof body),
    top_level_keys: topKeys,
    array_key: arrayKey,
    array_length: arrayLen,
    scalar_keys: scalarKeys,
    element_field_names: elementFieldNames,
  };
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
    const probeId = Number(payload?.employee_id ?? 1);
    const probeType = (payload?.employee_type ?? "employee") as string;

    if (action === "validate_creds" || action === "introspect_envelope") {
      // Both actions share the same probe: people/view for the given employee-id.
      // Auth errors (wrong id/key) surface as non-200 or an `error` field in the JSON body.
      const r = await opfinPost("people", "view", {
        "employee-id": probeId,
        "employee-type": probeType,
      });

      const shape = shapeOf(r.body);
      const preview = typeof r.raw === "string" ? r.raw.slice(0, 500) : null;
      const authFailed = r.body && typeof r.body === "object" &&
        (String(r.body.error ?? "").toLowerCase().includes("auth") ||
         String(r.body.message ?? "").toLowerCase().includes("auth"));

      console.log("[opfin probe]", JSON.stringify({
        url: r.url, status: r.status, body_type: shape.body_type,
        top_keys: shape.top_level_keys, has_fields: !!shape.element_field_names,
        auth_failed: authFailed,
      }));

      const attempt = {
        url: r.url,
        http_status: r.status,
        ...shape,
        raw_length: r.raw?.length ?? 0,
        raw_preview: preview,
      };

      if (action === "validate_creds") {
        return json(200, {
          ok: r.ok && !authFailed && !!shape.element_field_names,
          base_url_used: r.url,
          http_status: r.status,
          sample_employee_count: shape.array_length,
          error_body_snippet: (r.ok && !authFailed) ? null : preview,
          note: !shape.element_field_names
            ? "RazorpayX Payroll has no bulk employee-list endpoint. Only people/view by employee-id is supported."
            : null,
          attempts: [attempt],
        });
      }

      return json(200, {
        ok: r.ok && !!shape.element_field_names,
        http_status: r.status,
        ...shape,
        attempts: [attempt],
        note: "RazorpayX Payroll (Opfin) exposes only per-employee `people/view`. Bulk import must be seeded by known employee-ids.",
      });
    }

    return json(400, { error: `Unsupported action: ${action}` });
  } catch (e) {
    console.error("razorpay-payroll-proxy error", e);
    return json(500, { error: (e as Error).message });
  }
});
