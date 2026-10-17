const blank = (v: any) => v === undefined || v === null || (typeof v === "string" && v.trim() === "");

/**
 * True when a save deliberately clears "Fills hiring requirement": HR chose "None",
 * or the department/position changes in the same save (the old link no longer fits).
 */
/**
 * True when a save moves the onboarding to another department and leaves the designation blank: the old
 * designation belonged to the old department, so clearing it is deliberate (not a partial autosave).
 */
export function designationCleared(existing: Record<string, any> | null, updates: Record<string, any>): boolean {
  if (!blank(updates?.position_id) || blank(existing?.position_id)) return false;
  if (!("department_id" in (updates || {}))) return false;
  const next = blank(updates.department_id) ? null : updates.department_id;
  const prev = blank(existing?.department_id) ? null : existing!.department_id;
  return next !== prev;
}

export function requirementLinkCleared(existing: Record<string, any> | null, updates: Record<string, any>): boolean {
  if (!blank(updates?.hiring_requirement_id) || blank(existing?.hiring_requirement_id)) return false;
  if (updates?.hiring_requirement_declined === true) return true;
  const changed = (k: string) => k in (updates || {}) && (blank(updates[k]) ? null : updates[k]) !== (blank(existing?.[k]) ? null : existing![k]);
  return changed("position_id") || changed("department_id");
}
