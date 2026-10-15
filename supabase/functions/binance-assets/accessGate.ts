// AM-SEC-5 (AS-SEC-1/2) — caller gate for binance-assets, run before any Binance call.
import { ASSET_TRADE_PERMISSIONS, checkAccountAccess, type AccessDeps } from "../_shared/binance-access.ts";

/** Actions that place orders on Binance. */
export const TRADE_ACTIONS = new Set<string>(["executeTradeWithTransfer"]);

export interface AssetsGateDeps {
  serviceRoleKey: string;
  /** Verified user id for a bearer token, or null when the token is not a user session. */
  userIdFromToken(token: string): Promise<string | null>;
  /** get_terminal_permissions(user) — throws on lookup error. */
  permissions(userId: string): Promise<Set<string>>;
  access: AccessDeps;
}

export type GateResult =
  | { ok: true; kind: "service" | "user"; userId: string | null }
  | { ok: false; status: number; body: { success: false; error: string; code: string } };

const no = (status: number, error: string, code: string): GateResult => ({ ok: false, status, body: { success: false, error, code } });

export async function gateAssetsRequest(
  deps: AssetsGateDeps,
  authHeader: string | null,
  action: string,
  // deno-lint-ignore no-explicit-any
  payload: Record<string, any>,
): Promise<GateResult> {
  const h = authHeader ?? "";
  const token = h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
  if (!token) return no(401, "Unauthorized", "UNAUTHORIZED");
  if (deps.serviceRoleKey && token === deps.serviceRoleKey) return { ok: true, kind: "service", userId: null };

  let userId: string | null = null;
  try {
    userId = await deps.userIdFromToken(token);
  } catch {
    userId = null;
  }
  if (!userId) return no(401, "Unauthorized", "UNAUTHORIZED");

  if (TRADE_ACTIONS.has(action)) {
    let perms: Set<string>;
    try {
      perms = await deps.permissions(userId);
    } catch (e) {
      console.error("assets permission lookup failed:", (e as Error).message);
      return no(503, "Permission check failed — please try again. Nothing was sent to Binance.", "PERMISSION_CHECK_FAILED");
    }
    if (!ASSET_TRADE_PERMISSIONS.some((p) => perms.has(p))) {
      return no(403, "Permission denied: you need the Assets 'Manage & Spot Trade' right to trade.", "PERMISSION_DENIED");
    }
    const acc = await checkAccountAccess(deps.access, userId, [payload?.exchange_account_id ?? payload?.exchangeAccountId ?? null]);
    if (!acc.ok) return acc;
  }
  return { ok: true, kind: "user", userId };
}
