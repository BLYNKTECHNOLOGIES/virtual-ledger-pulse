import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Step 5 (additions / deductions) may not be opened or acknowledged until
 * step 4 is genuinely finished:
 *  - every staged LOP deduction for the month is verified on the RazorpayX run
 *  - every automatic recovery for the month is pushed / paid / collected
 *    (nothing left scheduled or failed)
 */
export function usePayrollStepGate(month: string) {
  const periodDate = month; // YYYY-MM-01

  const lop = useQuery({
    queryKey: ["gate_lop", periodDate],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_payroll_input_deductions")
        .select("id,label,pushed_at,readback_verified_at")
        .eq("period_month", periodDate);
      if (error) throw error;
      return (data || []).filter((r: any) =>
        /lop|loss of pay|loss-of-pay/i.test(String(r.label ?? "")),
      );
    },
    staleTime: 15_000,
  });

  const rec = useQuery({
    queryKey: ["gate_auto_recoveries", periodDate],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_payroll_auto_recoveries")
        .select("id,source_kind,status,employee_name")
        .eq("period_month", periodDate);
      if (error) throw error;
      return data || [];
    },
    staleTime: 15_000,
  });

  const lopRows = (lop.data ?? []) as any[];
  const recRows = (rec.data ?? []) as any[];

  const lopPending = lopRows.filter((r) => !r.readback_verified_at);
  const recPending = recRows.filter(
    (r) => !["pushed", "paid", "collected", "cancelled"].includes(String(r.status)),
  );

  const reasons: string[] = [];
  if (lopPending.length)
    reasons.push(
      `${lopPending.length} LOP deduction${lopPending.length === 1 ? "" : "s"} not yet verified on the RazorpayX run`,
    );
  if (recPending.length)
    reasons.push(
      `${recPending.length} automatic recover${recPending.length === 1 ? "y is" : "ies are"} not pushed (${[
        ...new Set(recPending.map((r) => String(r.status))),
      ].join(", ")})`,
    );

  return {
    loading: lop.isLoading || rec.isLoading,
    blocked: reasons.length > 0,
    reasons,
    lopTotal: lopRows.length,
    lopPending: lopPending.length,
    recTotal: recRows.length,
    recPending: recPending.length,
  };
}
