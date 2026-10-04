/**
 * Owners / directors are not part of any workforce statistic.
 *
 * The owner instructed (Oct 2026) that Abhishek Singh Tomar, Shubham Singh and
 * Sitara Singh are excluded from every statistical calculation — headcount,
 * attendance, attrition, leave counts and payroll cost alike. The rule lives
 * here so a new screen cannot quietly re-include them.
 *
 * Matching is on the full name (case- and whitespace-insensitive) because badge
 * ids and active flags differ across their records; every record carrying one of
 * these names is treated as an owner.
 */

export const OWNER_STAT_EXCLUDED_NAMES = [
  "abhishek singh tomar",
  "shubham singh",
  "sitara singh",
] as const;

/** Normalised "first last" used for the comparison. */
export const ownerStatNameKey = (firstName?: string | null, lastName?: string | null) =>
  `${firstName || ""} ${lastName || ""}`.trim().toLowerCase().replace(/\s+/g, " ");

/** True when this employee record belongs to an owner and must be left out of stats. */
export const isOwnerStatExcluded = (
  row: { first_name?: string | null; last_name?: string | null },
) => (OWNER_STAT_EXCLUDED_NAMES as readonly string[]).includes(ownerStatNameKey(row.first_name, row.last_name));

/**
 * Split a roster into the people stats should count and the ids of the owners
 * that were dropped — the id set is what lets payslip / attendance rows that
 * arrive independently of the roster be filtered by the same rule.
 */
export const splitOwnerStats = <T extends { id: string; first_name?: string | null; last_name?: string | null }>(
  rows: T[],
): { kept: T[]; excludedIds: Set<string> } => {
  const excludedIds = new Set<string>();
  const kept: T[] = [];
  for (const row of rows) {
    if (isOwnerStatExcluded(row)) excludedIds.add(row.id);
    else kept.push(row);
  }
  return { kept, excludedIds };
};
