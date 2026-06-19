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

/**
 * Resolve full credentials for a given exchange account id.
 * Falls back to the default account when accountId is missing/unknown.
 */
export async function resolveAccount(accountId?: string | null): Promise<ResolvedAccount> {
  const proxyUrl = Deno.env.get("BINANCE_PROXY_URL") ?? "";
  const proxyToken = Deno.env.get("BINANCE_PROXY_TOKEN") ?? "";
  if (!proxyUrl || !proxyToken) {
    throw new Error("Missing shared Binance proxy configuration (BINANCE_PROXY_URL / BINANCE_PROXY_TOKEN)");
  }

  const supabase = adminClient();
  let row: ExchangeAccountRow | null = null;

  if (accountId) {
    const { data } = await supabase
      .from("terminal_exchange_accounts")
      .select("id, account_name, credential_key, is_default, is_active")
      .eq("id", accountId)
      .maybeSingle();
    row = data as ExchangeAccountRow | null;
  }
  if (!row) {
    const { data } = await supabase
      .from("terminal_exchange_accounts")
      .select("id, account_name, credential_key, is_default, is_active")
      .eq("is_default", true)
      .maybeSingle();
    row = data as ExchangeAccountRow | null;
  }
  if (!row) {
    // Hard fallback to the primary deterministic account id.
    row = {
      id: "00000000-0000-0000-0000-000000000001",
      account_name: "Account 1 (Primary)",
      credential_key: "default",
      is_default: true,
      is_active: true,
    };
  }

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
