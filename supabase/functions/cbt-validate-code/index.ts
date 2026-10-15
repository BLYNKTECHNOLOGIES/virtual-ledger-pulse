import { admin, corsHeaders, fail, json, ipHash, deviceHash, checkLimits, validateClearKey } from "../_shared/cbt.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const db = admin();
    const { code } = await req.json().catch(() => ({ code: "" }));
    const raw = String(code ?? "").trim().toUpperCase();
    const ip = await ipHash(req);
    const dev = await deviceHash(req);

    if (!/^[A-Z0-9]{6}$/.test(raw)) {
      return fail("bad_code", "That code doesn't match an open test. Check the code and try again.", 400);
    }
    const allowed = await checkLimits(db, "validate", ip, dev);
    if (!allowed) return fail("locked_out", "Too many tries. Try again in 15 minutes.", 429);

    const { data: drive } = await db.from("cbt_drives").select("*").eq("access_code", raw).maybeSingle();
    if (!drive) {
      return fail("bad_code", "That code doesn't match an open test. Check the code and try again.", 404);
    }
    if (drive.status !== "live") {
      return fail("not_open", "That code doesn't match an open test. Check the code and try again.", 404);
    }
    const now = Date.now();
    if (now < new Date(drive.starts_at).getTime() || now > new Date(drive.ends_at).getTime()) {
      return fail("window_closed", "This test isn't open right now.", 403, {
        starts_at: drive.starts_at, ends_at: drive.ends_at,
      });
    }
    // QZ7a: a "Try it" drive offers its test even before the test is switched on; real drives only offer active tests
    let rq = db.from("cbt_job_roles").select("id, code, name").in("id", drive.job_role_ids ?? []);
    if (!drive.is_try_run) rq = rq.eq("is_active", true);
    const { data: roles } = await rq;
    const { data: settings } = await db.from("cbt_settings").select("*").eq("id", true).single();

    // successful validation resets the lockout counter for this IP
    await db.from("cbt_rate_limits").delete().eq("key", validateClearKey(ip, dev));

    return json({
      ok: true,
      drive: {
        id: drive.id, name: drive.name, mode: drive.mode, access_code: drive.access_code,
        starts_at: drive.starts_at, ends_at: drive.ends_at, is_sandbox: drive.is_sandbox,
      },
      roles: roles ?? [],
      settings: {
        brand_name: settings?.brand_name, company_name: settings?.company_name,
        privacy_url: settings?.privacy_url, terms_url: settings?.terms_url,
        hr_email: settings?.hr_email, retention_days: settings?.retention_days,
        logo_url: settings?.logo_url,
      },
    });
  } catch (e) {
    return fail("server_error", String((e as Error).message ?? e), 500);
  }
});
