import { supabase } from "@/integrations/supabase/client";
import { deactivateErpAccount } from "@/lib/erpAccountDeactivation";
import { deleteFromEssl } from "@/lib/esslPushback";

/**
 * Completes an employee's separation.
 *
 * This closes internal access only after the employee's last working day.
 * F&F payment is independent; RazorpayX dismissal waits for final payroll.
 */
export async function finalizeSeparation(
  employeeId: string,
): Promise<{ name: string; lwd: string | null; separationReason: string | null; erp: { deactivated: boolean; reason?: string } }> {
  const { data: emp } = await (supabase as any)
    .from("hr_employees")
    .select("first_name, last_name, notice_period_end_date, last_working_day, separation_reason")
    .eq("id", employeeId)
    .maybeSingle();

  const lwd: string | null = emp?.last_working_day || emp?.notice_period_end_date || null;
  const todayIst = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  if (!lwd || lwd >= todayIst) {
    return {
      name: `${emp?.first_name ?? ""} ${emp?.last_name ?? ""}`.trim() || "employee",
      lwd,
      separationReason: (emp?.separation_reason as string | null) || null,
      erp: { deactivated: false, reason: "Access remains available through the last working day" },
    };
  }
  const { data: { user: currentUser } } = await supabase.auth.getUser();

  const { error } = await (supabase as any)
    .from("hr_employees")
    .update({
      resignation_status: "completed",
      is_active: false,
      account_deletion_date: lwd || new Date().toISOString().slice(0, 10),
      deletion_approved_by: currentUser?.id || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", employeeId);
  if (error) throw error;

  // Non-fatal side effects — the separation itself is already committed.
  let erp: { deactivated: boolean; reason?: string } = { deactivated: false, reason: "not attempted" };
  try { erp = await deactivateErpAccount(employeeId); }
  catch (e: any) { erp = { deactivated: false, reason: e?.message || "ERP deactivation failed" }; }

  try { await deleteFromEssl(employeeId, { triggeredFrom: "last_working_day", silent: true }); }
  catch { /* biometric removal is retried from the exit checklist */ }

  return {
    name: `${emp?.first_name ?? ""} ${emp?.last_name ?? ""}`.trim() || "employee",
    lwd,
    separationReason: (emp?.separation_reason as string | null) || null,
    erp,
  };
}
