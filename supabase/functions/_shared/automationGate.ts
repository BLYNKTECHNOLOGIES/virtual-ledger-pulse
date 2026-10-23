export async function manualPricingGate(
  kind: "user" | "service" | "scheduler", userId: string | null, ruleId: string | null,
  canManage: (uid: string) => Promise<boolean>, claim: (id: string) => Promise<string>,
): Promise<{ status: number; error: string } | null> {
  if (kind !== "user") return null;
  if (!userId || !await canManage(userId)) return { status: 403, error: "Terminal Pricing Manage required" };
  if (!ruleId) return { status: 400, error: "Choose one rule to run manually" };
  const result = await claim(ruleId);
  if (result === "paused") return { status: 409, error: "Rule is paused — switch it on first" };
  if (result === "rate_limited") return { status: 429, error: "This rule was run manually less than 60 seconds ago — wait before trying again" };
  if (result === "not_found") return { status: 404, error: "Pricing rule not found" };
  if (result !== "claimed") throw new Error("Manual run check failed");
  return null;
}

/** Schedule options are exclusively server-owned; personal rests stay 60 minutes. */
export function restStartOptions(payload: Record<string, unknown>, service: boolean) {
  if (!service) return { durationMinutes: 60 };
  const duration = payload.durationMinutes ?? 60;
  if (typeof duration !== "number" || !Number.isInteger(duration) || duration < 1 || duration > 1440) {
    throw new Error("durationMinutes must be an integer between 1 and 1440");
  }
  if (payload.source !== "schedule") return { durationMinutes: duration };
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (typeof payload.scheduleId !== "string" || !uuid.test(payload.scheduleId) ||
      !Array.isArray(payload.accountIds) || payload.accountIds.length !== 1 ||
      typeof payload.accountIds[0] !== "string" || !uuid.test(payload.accountIds[0])) {
    throw new Error("Schedule rests require scheduleId and exactly one account UUID");
  }
  return { durationMinutes: duration, source: "schedule", scheduleId: payload.scheduleId, exchangeAccountId: payload.accountIds[0] };
}