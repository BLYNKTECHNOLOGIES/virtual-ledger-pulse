import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Payroll safety gate: an employee whose bank account change is still open
 * must not be paid, because the salary would land in the old (or an
 * unconfirmed) account. Any request in `pending`, `pending_razorpay` or
 * `razorpay_failed` blocks the payroll run step and month close.
 */
const OPEN_STATUSES = ["pending", "pending_razorpay", "razorpay_failed"];

export function usePendingBankChanges() {
  const q = useQuery({
    queryKey: ["gate_bank_changes"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_bank_change_requests")
        .select(
          "id,status,employee_id,hr_employees!hr_bank_change_requests_employee_id_fkey(first_name,last_name,badge_id)",
        )
        .in("status", OPEN_STATUSES);
      if (error) throw error;
      return data || [];
    },
    staleTime: 30_000,
  });

  const rows = (q.data ?? []) as any[];
  const names = [
    ...new Set(
      rows
        .map((r) =>
          `${r.hr_employees?.first_name || ""} ${r.hr_employees?.last_name || ""}`.trim(),
        )
        .filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

  const reasons: string[] = [];
  if (rows.length) {
    reasons.push(
      `${rows.length} bank account change request${rows.length === 1 ? " is" : "s are"} still open${
        names.length
          ? ` — ${names.slice(0, 4).join(", ")}${names.length > 4 ? ` +${names.length - 4} more` : ""}`
          : ""
      }. Approve or reject them before running payroll.`,
    );
  }

  return {
    loading: q.isLoading,
    blocked: rows.length > 0,
    count: rows.length,
    names,
    reasons,
  };
}
