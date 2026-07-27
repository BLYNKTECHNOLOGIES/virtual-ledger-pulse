import { supabase } from "@/integrations/supabase/client";

/**
 * Suggests the smallest positive integer Employee ID that does not clash with
 * any current or historical identifier across HRMS:
 *  - hr_employees.badge_id / legacy_badge_id (current + past staff)
 *  - hr_employee_onboarding.essl_badge_id / razorpay_employee_id (drafts)
 *  - hr_razorpay_employee_map.razorpay_employee_id (linked RazorpayX IDs)
 *  - users.badge_id (ERP users)
 *
 * Returns the smallest unused positive integer as a string, or `max(used)+1`
 * when the sequence is dense.
 */
export async function suggestNextEmployeeId(): Promise<string> {
  const toInt = (v: unknown): number | null => {
    if (v == null) return null;
    const digits = String(v).replace(/\D/g, "");
    if (!digits) return null;
    const n = Number(digits);
    return Number.isFinite(n) && n > 0 && n < 10_000_000 ? n : null;
  };

  const used = new Set<number>();
  const collect = (rows: any[] | null, ...cols: string[]) => {
    (rows || []).forEach((r) => {
      cols.forEach((c) => {
        const n = toInt(r?.[c]);
        if (n !== null) used.add(n);
      });
    });
  };

  const [emp, onb, rzp, usr] = await Promise.all([
    supabase.from("hr_employees").select("badge_id, legacy_badge_id"),
    supabase
      .from("hr_employee_onboarding")
      .select("essl_badge_id, razorpay_employee_id"),
    supabase.from("hr_razorpay_employee_map").select("razorpay_employee_id"),
    supabase.from("users").select("badge_id"),
  ]);

  collect(emp.data as any[], "badge_id", "legacy_badge_id");
  collect(onb.data as any[], "essl_badge_id", "razorpay_employee_id");
  collect(rzp.data as any[], "razorpay_employee_id");
  collect(usr.data as any[], "badge_id");

  // Smallest positive integer not in `used`.
  let candidate = 1;
  while (used.has(candidate)) candidate += 1;
  return String(candidate);
}
