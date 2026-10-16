export interface ShiftRequirementOption {
  id: string;
  raw?: { plan_shift_ids?: string[] | null };
}

export function requirementCoversShift(raw: ShiftRequirementOption["raw"], shiftId: string) {
  return !raw?.plan_shift_ids?.length || raw.plan_shift_ids.includes(shiftId);
}

/** Count and reveal only linked requirements that can actually be selected. */
export function hiddenRequirementOptions<T extends ShiftRequirementOption>(
  options: T[], linked: ReadonlyMap<string, unknown> | undefined,
  chosen: ReadonlySet<string>, shiftIds: string[],
) {
  return options.filter((option) => linked?.has(option.id) && !chosen.has(option.id) &&
    (shiftIds.length < 2 || shiftIds.some((shift) => requirementCoversShift(option.raw, shift))));
}