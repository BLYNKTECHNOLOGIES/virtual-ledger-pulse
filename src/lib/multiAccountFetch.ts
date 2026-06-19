// Helper to fan-out a Binance read across multiple exchange accounts and merge
// the results, tagging each returned row with the account it came from.
//
// In single-account mode `accountIds` has one entry and behavior is identical
// to a plain per-account call. In combined ("All accounts") mode it calls every
// visible account in parallel and concatenates the rows.

export const ACCOUNT_TAG = "_exchangeAccountId" as const;

export interface MergedResult<T> {
  rows: T[];
  /** Per-account failures (combined mode never blanks the whole view). */
  errors: { accountId: string; error: string }[];
}

/**
 * Run `caller` once per account id (in parallel) and merge the row arrays it
 * returns, stamping each row object with `_exchangeAccountId`.
 */
export async function fetchAcrossAccounts<T extends Record<string, any>>(
  accountIds: string[],
  caller: (accountId: string) => Promise<T[]>,
): Promise<MergedResult<T>> {
  const settled = await Promise.allSettled(accountIds.map((id) => caller(id)));
  const rows: T[] = [];
  const errors: { accountId: string; error: string }[] = [];

  settled.forEach((res, i) => {
    const accountId = accountIds[i];
    if (res.status === "fulfilled") {
      for (const row of res.value || []) {
        if (row && typeof row === "object") {
          rows.push({ ...row, [ACCOUNT_TAG]: accountId });
        } else {
          rows.push(row as T);
        }
      }
    } else {
      errors.push({ accountId, error: String(res.reason?.message || res.reason || "failed") });
    }
  });

  return { rows, errors };
}
