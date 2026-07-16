/**
 * ERP → Razorpay Pushback Helper
 *
 * Fires after ERP saves for Identity / Bank / Salary. ERP is treated as
 * the source of truth; Razorpay is nudged to match.
 *
 * Policy (per operator directive):
 *   - ERP save always commits first. This helper never throws.
 *   - On failure we surface a warning toast so the operator can retry
 *     from the Razorpay Sync page. The proxy already writes a row to
 *     hr_razorpay_sync_log for every attempt, which is our audit trail.
 *   - We only push when an hr_razorpay_employee_map row exists — otherwise
 *     the employee has never been synced and there is nothing to update.
 */
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type PushKind = "identity" | "bank" | "salary";

const ACTION_BY_KIND: Record<PushKind, string> = {
  identity: "push_person_apply_one",
  bank: "push_bank_apply_one",
  salary: "push_salary_apply_one",
};

const LABEL_BY_KIND: Record<PushKind, string> = {
  identity: "identity",
  bank: "bank details",
  salary: "salary structure",
};

async function resolveRazorpayEmployeeId(hrEmployeeId: string): Promise<string | null> {
  const { data, error } = await (supabase as any)
    .from("hr_razorpay_employee_map")
    .select("razorpay_employee_id")
    .eq("hr_employee_id", hrEmployeeId)
    .maybeSingle();
  if (error) return null;
  return data?.razorpay_employee_id ?? null;
}

export async function pushToRazorpay(
  kind: PushKind,
  hrEmployeeId: string,
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  try {
    const razorpayId = await resolveRazorpayEmployeeId(hrEmployeeId);
    if (!razorpayId) {
      // No mapping = employee never synced. Silent skip.
      return { ok: false, skipped: true };
    }

    const { data, error } = await supabase.functions.invoke("razorpay-payroll-proxy", {
      body: { action: ACTION_BY_KIND[kind], razorpay_employee_id: razorpayId },
    });

    if (error) throw error;
    if (data && (data as any).ok === false) {
      const msg = (data as any).error || "Razorpay rejected the push";
      throw new Error(msg);
    }

    toast.success(`Razorpay ${LABEL_BY_KIND[kind]} updated`);
    return { ok: true };
  } catch (e: any) {
    const msg = e?.message || String(e);
    toast.warning(
      `ERP saved, but Razorpay ${LABEL_BY_KIND[kind]} push failed. Retry from the Razorpay Sync page.`,
      { description: msg.length > 160 ? msg.slice(0, 160) + "…" : msg },
    );
    return { ok: false, error: msg };
  }
}

export const pushIdentityToRazorpay = (hrEmployeeId: string) => pushToRazorpay("identity", hrEmployeeId);
export const pushBankToRazorpay = (hrEmployeeId: string) => pushToRazorpay("bank", hrEmployeeId);
export const pushSalaryToRazorpay = (hrEmployeeId: string) => pushToRazorpay("salary", hrEmployeeId);
