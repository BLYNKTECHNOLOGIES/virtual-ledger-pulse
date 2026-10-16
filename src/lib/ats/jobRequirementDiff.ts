/** Pure diff: which links to insert/delete so the table holds exactly `desired` (requisition_id excluded — it lives on the job). */
export function diffLinks(current: string[], desired: string[], primaryId: string | null) {
  const want = new Set(desired.filter((id) => id && id !== primaryId));
  return {
    add: [...want].filter((id) => !current.includes(id)),
    remove: current.filter((id) => !want.has(id)),
  };
}
