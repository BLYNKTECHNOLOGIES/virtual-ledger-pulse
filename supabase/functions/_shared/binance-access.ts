// AM-SEC-5 — "which Binance accounts may this user use", enforced on the server.
//
// The rule itself lives in SQL (public.binance_accounts_for_user), which the
// Terminal screen (ExchangeAccountContext) reads too, so screen and server
// cannot drift. This module only applies it to a request, before any Binance call.

export interface AccessAccountRow {
  id: string;
  account_name: string;
  is_active: boolean;
  is_default: boolean;
}

export interface AccessDeps {
  /** Every configured exchange account (active or not). */
  loadAccounts(): Promise<AccessAccountRow[]>;
  /** Account ids this user may use (public.binance_accounts_for_user). */
  allowedFor(userId: string): Promise<string[]>;
}

export type AccessResult =
  | { ok: true; accountIds: string[] }
  | { ok: false; status: number; body: { success: false; error: string; code: string } };

const deny = (status: number, error: string, code: string): AccessResult => ({
  ok: false,
  status,
  body: { success: false, error, code },
});

/**
 * Check that `userId` may use every requested account.
 * A null/empty id means "the default account" (it must be allowed too).
 * Unknown or inactive ids are refused — never a silent fallback.
 * Any lookup error refuses with 503 (fail closed).
 */
export async function checkAccountAccess(
  deps: AccessDeps,
  userId: string,
  requested: (string | null | undefined)[],
): Promise<AccessResult> {
  let accounts: AccessAccountRow[];
  let allowed: string[];
  try {
    [accounts, allowed] = await Promise.all([deps.loadAccounts(), deps.allowedFor(userId)]);
  } catch (e) {
    console.error("binance account access lookup failed:", (e as Error).message);
    return deny(503, "Account access check failed — please try again. Nothing was sent to Binance.", "ACCOUNT_CHECK_FAILED");
  }
  const allowedSet = new Set(allowed);
  const wanted = requested.length > 0 ? requested : [null];
  const ids: string[] = [];
  for (const raw of wanted) {
    const want = raw ? String(raw) : null;
    const row = want
      ? accounts.find((a) => a.id === want)
      : accounts.find((a) => a.is_default && a.is_active);
    if (!row || !row.is_active) {
      return deny(403, "That Binance account does not exist or is switched off.", "ACCOUNT_DENIED");
    }
    if (!allowedSet.has(row.id)) {
      return deny(403, `You don't have access to the ${row.account_name} Binance account.`, "ACCOUNT_DENIED");
    }
    if (!ids.includes(row.id)) ids.push(row.id);
  }
  return { ok: true, accountIds: ids };
}

/** Production deps backed by the service-role client. */
// deno-lint-ignore no-explicit-any
export function supabaseAccessDeps(admin: any): AccessDeps {
  return {
    async loadAccounts() {
      const { data, error } = await admin
        .from("terminal_exchange_accounts")
        .select("id, account_name, is_active, is_default");
      if (error) throw new Error(error.message);
      return (data ?? []) as AccessAccountRow[];
    },
    async allowedFor(userId: string) {
      const { data, error } = await admin.rpc("binance_accounts_for_user", { p_user_id: userId });
      if (error) throw new Error(error.message);
      return ((data ?? []) as unknown[]).map(String);
    },
  };
}

/** Normalise get_terminal_permissions() output to a Set of keys. */
// deno-lint-ignore no-explicit-any
export function permissionSet(data: any): Set<string> {
  return new Set(
    (Array.isArray(data) ? data : []).map((p: any) =>
      typeof p === "string" ? p : p?.get_terminal_permissions ?? p?.permission
    ),
  );
}

/** Spot trading on Terminal Assets: same rule as the screen (terminal admins get it implicitly). */
export const ASSET_TRADE_PERMISSIONS = ["terminal_assets_manage"];
