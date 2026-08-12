import { supabase } from "@/integrations/supabase/client";

/**
 * Deactivates the ERP login account (public.users) tied to an HR employee.
 *
 * Resolution order: hr_employees.user_id → badge_id → email. Setting
 * force_logout_at invalidates any live session immediately, matching the
 * behaviour of the User Management screen.
 */
export async function deactivateErpAccount(
  employeeId: string,
): Promise<{ deactivated: boolean; reason?: string }> {
  const { data: emp } = await (supabase as any)
    .from("hr_employees")
    .select("user_id, badge_id, email")
    .eq("id", employeeId)
    .maybeSingle();

  if (!emp) return { deactivated: false, reason: "Employee not found" };

  let userId: string | null = emp.user_id || null;

  if (!userId && emp.badge_id) {
    const { data } = await (supabase as any)
      .from("users")
      .select("id")
      .eq("badge_id", emp.badge_id)
      .maybeSingle();
    userId = data?.id || null;
  }

  if (!userId && emp.email) {
    const { data } = await (supabase as any)
      .from("users")
      .select("id")
      .ilike("email", emp.email)
      .maybeSingle();
    userId = data?.id || null;
  }

  if (!userId) return { deactivated: false, reason: "No ERP account linked to this employee" };

  const { error } = await (supabase as any)
    .from("users")
    .update({
      status: "INACTIVE",
      force_logout_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (error) throw error;
  return { deactivated: true };
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
    const { data } = await (supabase as any).from("users").select("id, status").ilike("email", emp.email).maybeSingle();
    row = data;
  }
  return { userId: row?.id || null, status: row?.status || null };
}
