// Lightweight module-level mirror of the active Binance exchange account.
//
// Most Binance edge-function callers in the app are plain async functions
// (not React hooks), so they cannot read React context directly. The
// ExchangeAccountProvider keeps this value in sync, and the generic callers
// read it to stamp every request with the active account.

export const ALL_ACCOUNTS = "ALL";
const PRIMARY_ID = "00000000-0000-0000-0000-000000000001";

let activeId: string = PRIMARY_ID;
// Accounts the current user can see/use. Used to fan-out in "All accounts" mode.
let visibleIds: string[] = [PRIMARY_ID];

export function setActiveExchangeAccountId(id: string) {
  activeId = id || PRIMARY_ID;
}

export function getActiveExchangeAccountId(): string {
  return activeId;
}

export function setVisibleExchangeAccountIds(ids: string[]) {
  visibleIds = ids && ids.length > 0 ? ids : [PRIMARY_ID];
}

/**
 * The list of account ids the current view should query.
 * - Single account selected → just that account.
 * - "All accounts" (ALL) → every visible account (for live fan-out / merge).
 */
export function getAccountsToQuery(): string[] {
  if (activeId === ALL_ACCOUNTS) return visibleIds.length > 0 ? visibleIds : [PRIMARY_ID];
  return [activeId];
}

export function isAllAccountsActive(): boolean {
  return activeId === ALL_ACCOUNTS;
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
