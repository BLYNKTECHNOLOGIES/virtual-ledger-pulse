/** Pure diff: which links to insert/delete so the table holds exactly `desired` (requisition_id excluded — it lives on the job). */
export function diffLinks(current: string[], desired: string[], primaryId: string | null) {
  const want = new Set(desired.filter((id) => id && id !== primaryId));
  return {
    add: [...want].filter((id) => !current.includes(id)),
    remove: current.filter((id) => !want.has(id)),
  };
}

export interface OpenJobRef { id: string; job_code: string | null; title: string; department_id: string | null; position_id: string | null; shift_ids: string[] | null }

/**
 * Open/paused jobs a requirement could join instead of a new posting: same department, the job's
 * role among the requirement line's roles, and a job shift on the requirement's line.
 */
export function matchingJobsForRequirement(
  jobs: OpenJobRef[],
  req: { department_id?: string | null; position_id?: string | null },
  planRoleIds: string[] | null, planShiftIds: string[] | null,
): OpenJobRef[] {
  const roles = [...(planRoleIds ?? []), ...(req.position_id ? [req.position_id] : [])];
  return jobs.filter((j) =>
    (!j.department_id || !req.department_id || j.department_id === req.department_id) &&
    !!j.position_id && roles.includes(j.position_id) &&
    (!planShiftIds?.length || !(j.shift_ids ?? []).length || (j.shift_ids ?? []).some((s) => planShiftIds.includes(s))));
}

