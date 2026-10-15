// AM-SEC-6 — background jobs (verify_jwt = false) answer only the service role
// or the internal scheduler secret (app_scheduler_secrets 'internal_cron'),
// the same rule terminal-order-collector uses. Everything else → 401 before
// any Binance call or table write.

export type SecretLookup = () => Promise<string | null>;

export async function isTrustedJobCaller(
  req: Request,
  serviceRoleKey: string | undefined,
  lookupSecret: SecretLookup,
): Promise<boolean> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (serviceRoleKey && bearer && bearer === serviceRoleKey) return true;
  const sent = req.headers.get("x-scheduler-secret") ?? "";
  if (!sent) return false;
  try {
    const expected = await lookupSecret();
    return !!expected && expected === sent;
  } catch {
    return false;
  }
}

// deno-lint-ignore no-explicit-any
export function schedulerSecretLookup(admin: any): SecretLookup {
  return async () => {
    const { data, error } = await admin
      .from("app_scheduler_secrets").select("secret_value").eq("name", "internal_cron").maybeSingle();
    if (error) throw new Error(error.message);
    return data?.secret_value ?? null;
  };
}

export function unauthorizedJob(corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
