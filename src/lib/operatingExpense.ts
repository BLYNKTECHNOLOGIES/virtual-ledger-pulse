/**
 * Single source of truth for what counts as an OPERATING EXPENSE (OpEx).
 *
 * Total Expenses on the Financials page = bank_transactions of type EXPENSE
 * minus:
 *  - COGS / revenue / settlement plumbing categories (purchases, sales, settlements)
 *  - reversal / contra entries (ledger corrections, not spend)
 *  - the audit-only Balance Adjustment account
 *
 * Both the Financials "Total Expenses" tile and the BAMS journal OpEx view
 * use these helpers so the figure and the drill-down list always match.
 */
export const COGS_EXPENSE_CATEGORIES = [
  "Purchase",
  "Sales",
  "Stock Purchase",
  "Stock Sale",
  "Trade",
  "Trading",
  "Payment Gateway Settlement",
  "Settlement",
  "Manual Baseline Reset",
] as const;

const COGS_SET = new Set(COGS_EXPENSE_CATEGORIES.map((c) => c.toLowerCase()));

export const COGS_CATEGORY_IN_FILTER = `(${COGS_EXPENSE_CATEGORIES.map((c) => `"${c}"`).join(",")})`;

export const isCogsExpenseCategory = (category?: string | null): boolean =>
  !!category && COGS_SET.has(String(category).trim().toLowerCase());

/** Contra / reversal entries — never real spend. */
export const isContraExpense = (t: {
  reference_number?: string | null;
  description?: string | null;
  is_reversed?: boolean | null;
  reverses_transaction_id?: string | null;
}): boolean => {
  if (t?.is_reversed || t?.reverses_transaction_id) return true;
  const ref = String(t?.reference_number || "").trim().toUpperCase();
  const desc = String(t?.description || "").trim().toLowerCase();
  if (ref.startsWith("REV-") || ref.includes("-REV")) return true;
  return (
    desc.startsWith("reversal of") ||
    desc.startsWith("reversal ") ||
    desc.startsWith("reverse entry") ||
    desc.includes("reverse entry of") ||
    desc.startsWith("contra entry")
  );
};

/** True when a bank EXPENSE row belongs in the Total Expenses figure. */
export const isOperatingExpenseRow = (t: {
  category?: string | null;
  reference_number?: string | null;
  description?: string | null;
  is_reversed?: boolean | null;
  reverses_transaction_id?: string | null;
}): boolean => !isCogsExpenseCategory(t?.category) && !isContraExpense(t);
