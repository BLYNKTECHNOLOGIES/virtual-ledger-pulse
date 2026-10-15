// Shared resolver for multi-Binance-account credentials.
//
// Credentials are NEVER stored in the database. Each exchange account row in
// `terminal_exchange_accounts` carries a `credential_key` that maps to a pair
// of Supabase secrets:
//   - 'default'  -> BINANCE_API_KEY        / BINANCE_API_SECRET   (Account 1)
//   - 'acct2'    -> BINANCE_API_KEY_2      / BINANCE_API_SECRET_2 (Account 2)
//   - 'acctN'    -> BINANCE_API_KEY_N      / BINANCE_API_SECRET_N
//
// The proxy URL + token are shared across all accounts (single AWS relay).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface ResolvedAccount {
  id: string;
  accountName: string;
  credentialKey: string;
  /** Env-var suffix for this account's secrets ("" for default, "_2" for acct2, …). */
  secretSuffix: string;
  proxyUrl: string;
  proxyToken: string;
  apiKey: string;
  apiSecret: string;
}


export interface ExchangeAccountRow {
  id: string;
  account_name: string;
  credential_key: string | null;
  is_default: boolean;
  is_active: boolean;
}

function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

/** Map a credential_key to the env-var suffix used for its secrets. */
export function suffixForCredentialKey(key: string | null | undefined): string {
  if (!key || key === "default") return "";
  const m = String(key).match(/^acct(\d+)$/i);
  if (m) return `_${m[1]}`;
  // Fallback: treat the key itself as an explicit suffix token (uppercased).
  return `_${String(key).toUpperCase()}`;
}

function secretsForSuffix(suffix: string): { apiKey: string; apiSecret: string } {
  const apiKey = Deno.env.get(`BINANCE_API_KEY${suffix}`) ?? "";
  const apiSecret = Deno.env.get(`BINANCE_API_SECRET${suffix}`) ?? "";
  return { apiKey, apiSecret };
}

/** AM-SEC-5b: an explicitly requested account could not be used; nothing may be sent. */
export class AccountUnavailableError extends Error {
  readonly code = "ACCOUNT_UNAVAILABLE";
  constructor(message: string) { super(message); }
}

export type AccountRowLookup = (by: { id?: string; isDefault?: boolean }) =>
  Promise<{ row: ExchangeAccountRow | null; error: string | null }>;

/**
 * Pick the account row. Lenient (default): an unknown id falls back to the
 * default account (read paths). Strict: an explicit id must exist, be active and
 * be read without error — never a fallback to another account (AM-SEC-5b).
 */
export async function pickAccountRow(
  accountId: string | null | undefined,
  lookup: AccountRowLookup,
  strict = false,
): Promise<ExchangeAccountRow> {
  if (accountId && strict) {
    const { row, error } = await lookup({ id: accountId });
    if (error) throw new AccountUnavailableError(`Could not read the Binance account (${error}). Nothing was sent to Binance.`);
    if (!row || !row.is_active) throw new AccountUnavailableError("That Binance account does not exist or is switched off. Nothing was sent to Binance.");
    return row;
  }
  let row: ExchangeAccountRow | null = null;
  if (accountId) row = (await lookup({ id: accountId })).row;
  if (!row) row = (await lookup({ isDefault: true })).row;
  // Hard fallback to the primary deterministic account id.
  return row ?? {
    id: "00000000-0000-0000-0000-000000000001",
    account_name: "Account 1 (Primary)",
    credential_key: "default",
    is_default: true,
    is_active: true,
  };
}

/**
 * Resolve full credentials for a given exchange account id.
 * Lenient by default (falls back to the default account). With `{ strict: true }`
 * an explicit id never falls back: lookup errors or unknown/inactive ids throw
 * AccountUnavailableError.
 */
export async function resolveAccount(accountId?: string | null, opts: { strict?: boolean } = {}): Promise<ResolvedAccount> {
  const proxyUrl = Deno.env.get("BINANCE_PROXY_URL") ?? "";
  const proxyToken = Deno.env.get("BINANCE_PROXY_TOKEN") ?? "";
  if (!proxyUrl || !proxyToken) {
    throw new Error("Missing shared Binance proxy configuration (BINANCE_PROXY_URL / BINANCE_PROXY_TOKEN)");
  }

  const supabase = adminClient();
  const row = await pickAccountRow(accountId, async (by) => {
    let q = supabase.from("terminal_exchange_accounts")
      .select("id, account_name, credential_key, is_default, is_active");
    q = by.id ? q.eq("id", by.id) : q.eq("is_default", true);
    const { data, error } = await q.maybeSingle();
    return { row: (data as ExchangeAccountRow | null) ?? null, error: error?.message ?? null };
  }, !!opts.strict);

  const suffix = suffixForCredentialKey(row.credential_key);
  const { apiKey, apiSecret } = secretsForSuffix(suffix);
  if (!apiKey || !apiSecret) {
    throw new Error(
      `Missing Binance API secrets for account "${row.account_name}" (expected BINANCE_API_KEY${suffix} / BINANCE_API_SECRET${suffix})`,
    );
  }

  return {
    id: row.id,
    accountName: row.account_name,
    credentialKey: row.credential_key ?? "default",
    secretSuffix: suffix,
    proxyUrl,

    proxyToken,
    apiKey,
    apiSecret,
  };
}

/** List active accounts — used by automation engines to iterate all accounts. */
export async function listActiveAccounts(): Promise<ExchangeAccountRow[]> {
  const supabase = adminClient();
  const { data } = await supabase
    .from("terminal_exchange_accounts")
    .select("id, account_name, credential_key, is_default, is_active")
    .eq("is_active", true)
    .order("display_order", { ascending: true });
  return (data as ExchangeAccountRow[] | null) ?? [];
}

/** Build the proxy headers for a resolved account. */
export function proxyHeadersFor(acct: ResolvedAccount): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-proxy-token": acct.proxyToken,
    "x-api-key": acct.apiKey,
    "x-api-secret": acct.apiSecret,
    "clientType": "web",
  };
}

/** Extract the requested exchange account id from a parsed request payload. */
export function accountIdFromPayload(payload: Record<string, unknown>): string | null {
  const v = payload?.exchange_account_id ?? payload?.exchangeAccountId ?? null;
  return v ? String(v) : null;
}
