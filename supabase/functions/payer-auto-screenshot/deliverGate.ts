// AM-SEC-5b — the "deliver" phase posts an image into a live Binance order chat,
// so it gets the same checks as markOrderAsPaid in binance-ads, before any
// upload or send: an order-action Terminal right, and the account (the default
// account — where this service always posts) must be one the user may use.
import { checkAccountAccess, type AccessDeps } from "../_shared/binance-access.ts";

export const DELIVER_PERMISSIONS = ["terminal_orders_actions", "terminal_orders_manage"];

export interface DeliverGateDeps {
  /** get_terminal_permissions(user) — throws on lookup error. */
  permissions(userId: string): Promise<Set<string>>;
  access: AccessDeps;
}

export type DeliverGateResult =
  | { ok: true }
  | { ok: false; status: number; body: { success: false; error: string; code: string } };

export async function gateDeliver(deps: DeliverGateDeps, userId: string, accountId: string | null = null): Promise<DeliverGateResult> {
  let perms: Set<string>;
  try {
    perms = await deps.permissions(userId);
  } catch (e) {
    console.error("payer deliver permission lookup failed:", (e as Error).message);
    return { ok: false, status: 503, body: { success: false, error: "Permission check failed — please try again. Nothing was sent.", code: "PERMISSION_CHECK_FAILED" } };
  }
  if (!DELIVER_PERMISSIONS.some((p) => perms.has(p))) {
    return { ok: false, status: 403, body: { success: false, error: "Permission denied: you need the Orders 'Actions' right to send a payment screenshot.", code: "PERMISSION_DENIED" } };
  }
  const access = await checkAccountAccess(deps.access, userId, [accountId]);
  if (!access.ok) return access;
  return { ok: true };
}
