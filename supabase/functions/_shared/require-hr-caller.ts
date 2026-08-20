// HR-staff caller gate for edge functions that run with verify_jwt = false.
//
// Wraps requireCaller() (service role / internal cron secret / signed-in user)
// and, when the caller is a signed-in user, additionally requires that the user
// is HR staff — mirroring the hr_is_hr_staff(auth.uid()) RLS checks used on the
// underlying HR tables. Service-role and scheduler callers are trusted as-is.

import { requireCaller, type CallerResult } from "./require-caller.ts";

export async function requireHrCaller(
  req: Request,
  corsHeaders: Record<string, string>,
  opts: { allowPayrollAuthorized?: boolean } = {},
): Promise<CallerResult> {
  const caller = await requireCaller(req, corsHeaders);
  if (!caller.ok) return caller;
  if (caller.kind !== "user") return caller;

  const forbidden = (): CallerResult => ({
    ok: false,
    response: new Response(JSON.stringify({ error: "Forbidden — HR staff only" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }),
  });

  try {
    const { data: isHr } = await caller.admin.rpc("hr_is_hr_staff", { _user_id: caller.userId });
    if (isHr === true) return caller;

    if (opts.allowPayrollAuthorized) {
      const { data: isPayroll } = await caller.admin.rpc("hr_payroll_cockpit_authorized", {
        _user_id: caller.userId,
      });
      if (isPayroll === true) return caller;
    }
  } catch (_e) {
    return forbidden();
  }
  return forbidden();
}
