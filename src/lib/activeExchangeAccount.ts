// Lightweight module-level mirror of the active Binance exchange account.
//
// Most Binance edge-function callers in the app are plain async functions
// (not React hooks), so they cannot read React context directly. The
// ExchangeAccountProvider keeps this value in sync, and the generic callers
// read it to stamp every request with the active account.

export const ALL_ACCOUNTS = "ALL";
const PRIMARY_ID = "00000000-0000-0000-0000-000000000001";

let activeId: string = PRIMARY_ID;

export function setActiveExchangeAccountId(id: string) {
  activeId = id || PRIMARY_ID;
}

export function getActiveExchangeAccountId(): string {
  return activeId;
}

/** Merge the active account id into an edge-function body (skipped for "All"). */
export function withActiveAccount<T extends Record<string, unknown>>(body?: T): T & { exchange_account_id?: string } {
  const base = (body || {}) as T & { exchange_account_id?: string };
  if (activeId && activeId !== ALL_ACCOUNTS) {
    // Do not clobber an explicit per-call override.
    if (base.exchange_account_id == null) base.exchange_account_id = activeId;
  }
  return base;
}
