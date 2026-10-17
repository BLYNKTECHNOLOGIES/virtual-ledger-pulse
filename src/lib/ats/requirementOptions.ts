export interface ShiftRequirementOption {
  id: string;
  raw?: { plan_shift_ids?: string[] | null };
}

export function requirementCoversShift(raw: ShiftRequirementOption["raw"], shiftId: string) {
  return !raw?.plan_shift_ids?.length || raw.plan_shift_ids.includes(shiftId);
}

export interface RequirementScopeRaw {
  department_id?: string | null;
  position_id?: string | null;
  /** Roles of the requirement's staffing line (pooled lines list several); null = no line. */
  plan_role_ids?: string[] | null;
}

/**
 * Same rule as the server (ats_validate_job_requirement): a requirement fits a job when it is for
 * the job's department and the job's role is one of the line's roles (or the requirement's own role).
 * An unset department/role on the job does not restrict.
 */
export function requirementFitsJob(raw: RequirementScopeRaw | undefined, deptId?: string | null, posId?: string | null) {
  if (!raw) return true;
  if (deptId && raw.department_id && raw.department_id !== deptId) return false;
  if (posId) {
    const roles = [...(raw.plan_role_ids ?? []), ...(raw.position_id ? [raw.position_id] : [])];
    if (roles.length && !roles.includes(posId)) return false;
  }
  return true;
}

/** Count and reveal only linked requirements that can actually be selected. */
export function hiddenRequirementOptions<T extends ShiftRequirementOption>(
  options: T[], linked: ReadonlyMap<string, unknown> | undefined,
  chosen: ReadonlySet<string>, shiftIds: string[],
) {
  return options.filter((option) => linked?.has(option.id) && !chosen.has(option.id) &&
    (shiftIds.length < 2 || shiftIds.some((shift) => requirementCoversShift(option.raw, shift))));
}

/**
 * Per-shift picker values from the job's links. The job's main link (primary) is placed first and
 * keeps its slot; earlier picks keep theirs when they still cover the shift; the rest fill the first
 * empty covering slot; anything left over becomes an extra link.
 */
export function buildRequirementSlots(
  shiftIds: string[], primaryId: string, extraIds: string[],
  rawOf: (id: string) => ShiftRequirementOption["raw"] | undefined,
  previous: Record<string, string> = {},
): Record<string, string> {
  const pool = [...new Set([primaryId, ...extraIds].filter(Boolean))];
  const next: Record<string, string> = {};
  const placed = new Set<string>();
  if (shiftIds.length === 0) {
    pool.forEach((id, i) => { next[i === 0 ? "__single" : `__extra_${i - 1}`] = id; });
    return next;
  }
  const fits = (id: string, s: string) => { const raw = rawOf(id); return !raw || requirementCoversShift(raw, s); };
  for (const s of shiftIds) {
    const prev = previous[s];
    if (prev && pool.includes(prev) && !placed.has(prev) && fits(prev, s)) { next[s] = prev; placed.add(prev); }
  }
  for (const id of pool) {
    if (placed.has(id)) continue;
    const slot = shiftIds.find((s) => !next[s] && fits(id, s));
    if (slot) { next[slot] = id; placed.add(id); }
  }
  pool.filter((id) => !placed.has(id)).forEach((id, i) => { next[`__extra_${i}`] = id; });
  return next;
}

/** (primary, extras) from slot values; an existing main link stays the main link while it is still chosen. */
export function slotsToLinks(slots: Record<string, string>, shiftIds: string[], currentPrimary: string): { primary: string; extras: string[] } {
  const values = [...new Set([
    ...shiftIds.map((s) => slots[s]).filter(Boolean),
    ...(slots.__single ? [slots.__single] : []),
    ...Object.keys(slots).filter((k) => k.startsWith("__extra_")).sort().map((k) => slots[k]).filter(Boolean),
  ])];
  const primary = currentPrimary && values.includes(currentPrimary) ? currentPrimary : values[0] ?? "";
  return { primary, extras: values.filter((v) => v !== primary) };
}
