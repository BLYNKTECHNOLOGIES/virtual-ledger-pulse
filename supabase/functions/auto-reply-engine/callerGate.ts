// AM-SEC-4b — a signed-in user may only force an auto-reply for one order, and
// only with the same right sendChatMessage needs (terminal_orders_chat or
// terminal_payer_manage, via get_terminal_permissions), on an order whose
// Binance account they may use (binance_accounts_for_user). Service role and
// scheduler callers are unchanged (full poll included). Refuses before any
// Binance call; lookup errors fail closed (503).
import { checkAccountAccess, type AccessDeps } from "../_shared/binance-access.ts";

export const AUTO_REPLY_PERMISSIONS = ["terminal_orders_chat", "terminal_payer_manage"];

export interface AutoReplyGateDeps {
  /** get_terminal_permissions(user) — throws on lookup error. */
  permissions(userId: string): Promise<Set<string>>;
  /** Exchange account id of the order; null = order not found. Throws on lookup error. */
  orderAccount(orderNumber: string): Promise<string | null>;
  access: AccessDeps;
}

type Denied = { ok: false; status: number; body: { success: false; error: string; code: string } };
const deny = (status: number, error: string, code: string): Denied => ({ ok: false, status, body: { success: false, error, code } });

export async function gateAutoReplyCaller(
  deps: AutoReplyGateDeps,
  kind: "service" | "scheduler" | "user",
  userId: string | null,
  forcedOrderNumber: string | null,
): Promise<{ ok: true } | Denied> {
  if (kind !== "user") return { ok: true };
  if (!userId) return deny(401, "Unauthorized", "UNAUTHORIZED");
  if (!forcedOrderNumber) {
    return deny(403, "Permission denied: only the scheduler runs the full auto-reply poll.", "PERMISSION_DENIED");
  }
  let perms: Set<string>;
  try {
    perms = await deps.permissions(userId);
  } catch (e) {
    console.error("auto-reply permission lookup failed:", (e as Error).message);
    return deny(503, "Permission check failed — please try again. Nothing was sent.", "PERMISSION_CHECK_FAILED");
  }
  if (!AUTO_REPLY_PERMISSIONS.some((p) => perms.has(p))) {
    return deny(403, "Permission denied: you need the Orders 'Chat' right (or Payer 'Manage') to send auto-replies.", "PERMISSION_DENIED");
  }
  let accountId: string | null;
  try {
    accountId = await deps.orderAccount(forcedOrderNumber);
  } catch (e) {
    console.error("auto-reply order lookup failed:", (e as Error).message);
    return deny(503, "Order lookup failed — please try again. Nothing was sent.", "ACCOUNT_CHECK_FAILED");
  }
  if (!accountId) return deny(403, "That order or its Binance account could not be found. Nothing was sent.", "ACCOUNT_DENIED");
  const access = await checkAccountAccess(deps.access, userId, [accountId]);
  if (!access.ok) return access;
  return { ok: true };
}

/** Production lookup: order history first, then the active-orders cache. */
// deno-lint-ignore no-explicit-any
export function supabaseOrderAccount(admin: any) {
  return async (orderNumber: string): Promise<string | null> => {
    for (const table of ["binance_order_history", "terminal_active_orders_cache"]) {
      const { data, error } = await admin.from(table).select("exchange_account_id")
        .eq("order_number", orderNumber).not("exchange_account_id", "is", null).limit(1);
      if (error) throw new Error(error.message);
      const id = data?.[0]?.exchange_account_id;
      if (id) return String(id);
    }
    return null;
  };
}
