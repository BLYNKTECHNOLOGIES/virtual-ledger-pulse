import { supabase } from "@/integrations/supabase/client";

/**
 * Permanently removes ERP/Auth login through the shared HRMS server action.
 *
 * Resolution order: hr_employees.user_id → badge_id → email. Setting
 * force_logout_at invalidates any live session immediately, matching the
 * behaviour of the User Management screen.
 */
export async function deactivateErpAccount(
  employeeId: string,
): Promise<{ deactivated: boolean; reason?: string }> {
  const { data, error } = await supabase.functions.invoke("hr-revoke-erp-access", { body: { employeeId } });
  if (error) throw error;
  return { deactivated: data?.deleted === true, reason: data?.reason || data?.error };
}

/** True when the employee still has an ACTIVE/SUSPENDED ERP login. */
export async function getErpAccountStatus(
  employeeId: string,
): Promise<{ userId: string | null; status: string | null }> {
  const { data: emp } = await (supabase as any)
    .from("hr_employees")
    .select("user_id, badge_id, email")
    .eq("id", employeeId)
    .maybeSingle();
  if (!emp) return { userId: null, status: null };

  let row: any = null;
  if (emp.user_id) {
    const { data } = await (supabase as any).from("users").select("id, status").eq("id", emp.user_id).maybeSingle();
    row = data;
  }
  if (!row && emp.badge_id) {
    const { data } = await (supabase as any).from("users").select("id, status").eq("badge_id", emp.badge_id).maybeSingle();
    row = data;
  }
  if (!row && emp.email) {
    const { data } = await (supabase as any).from("users").select("id, status").eq("email", emp.email).maybeSingle();
    row = data;
  }
  return { userId: row?.id || null, status: row?.status || null };
}
