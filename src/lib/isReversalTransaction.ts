/**
 * Reversal / contra entries (created when a transaction is voided) are booked as
 * INCOME rows so the ledger balances. They are NOT real income and must never be
 * aggregated into income reporting.
 *
 * Markers (verified 1:1 in bank_transactions): reference_number starts with "REV-"
 * and description starts with "Reversal of".
 */
export function isReversalTransaction(t: {
  reference_number?: string | null;
  description?: string | null;
}): boolean {
  const ref = String(t?.reference_number || '').trim().toUpperCase();
  const desc = String(t?.description || '').trim().toLowerCase();
  return ref.startsWith('REV-') || desc.startsWith('reversal of');
}
