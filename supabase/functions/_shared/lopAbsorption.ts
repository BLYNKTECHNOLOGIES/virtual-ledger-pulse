import { absorbLop, fetchCompoffPool } from "./compoff.ts";

export interface LopAbsorption {
  raw_lop_days: number;
  compoff_offset_days: number;
  cl_offset_days: number;
  chargeable_lop_days: number;
}

/**
 * Shared read-only LOP settlement preview.
 * Order is fixed by owner policy: comp-off, then casual leave, then LOP.
 */
export async function fetchLopAbsorption(
  supabase: any,
  employeeIds: string[],
  periodStr: string,
  rawLopByEmployee: Map<string, number>,
): Promise<Map<string, LopAbsorption>> {
  const result = new Map<string, LopAbsorption>();
  if (!employeeIds.length) return result;

  const [compoff, clResult] = await Promise.all([
    fetchCompoffPool(supabase, employeeIds, periodStr),
    supabase.rpc("hr_cl_available", {
      p_employee_ids: employeeIds,
      p_period_month: periodStr,
    }),
  ]);
  if (clResult.error) throw clResult.error;

  const clByEmployee = new Map<string, number>();
  for (const row of (clResult.data ?? []) as any[]) {
    clByEmployee.set(row.employee_id, Number(row.cl_available ?? 0));
  }

  for (const employeeId of employeeIds) {
    const raw = Math.max(0, Number(rawLopByEmployee.get(employeeId) ?? 0));
    const split = absorbLop(
      compoff.get(employeeId)?.days_available ?? 0,
      clByEmployee.get(employeeId) ?? 0,
      raw,
    );
    result.set(employeeId, {
      raw_lop_days: raw,
      compoff_offset_days: split.compoff_offset_days,
      cl_offset_days: split.cl_offset_days,
      chargeable_lop_days: split.lop_after_offset,
    });
  }
  return result;
}