/**
 * Audit/contra-entry buckets that must be EXCLUDED from all financial
 * aggregations (Total Asset Value, Bank Balance widgets, P&L, Dashboard
 * stats, daily snapshots, etc.) but kept visible in BAMS for audit.
 *
 * These accounts/wallets exist purely to balance manual adjustments so
 * the arithmetic ledger stays consistent — their balances are not real
 * funds and must never be summed into totals.
 */
export const ADJUSTMENT_BANK_NAMES = ["Balance Adjustment Account"] as const;
export const ADJUSTMENT_WALLET_NAMES = ["Balance Adjustment Wallet"] as const;

const lowerSet = (arr: readonly string[]) =>
  new Set(arr.map((s) => s.toLowerCase()));

const BANK_SET = lowerSet(ADJUSTMENT_BANK_NAMES);
const WALLET_SET = lowerSet(ADJUSTMENT_WALLET_NAMES);

export const isAdjustmentBank = (name?: string | null): boolean =>
  !!name && BANK_SET.has(name.trim().toLowerCase());

export const isAdjustmentWallet = (name?: string | null): boolean =>
  !!name && WALLET_SET.has(name.trim().toLowerCase());

export const filterNonAdjustmentBanks = <T extends { account_name?: string | null }>(accounts?: T[] | null): T[] =>
  (accounts || []).filter((account) => !isAdjustmentBank(account.account_name));
