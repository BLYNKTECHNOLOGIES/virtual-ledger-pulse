import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Step 5 (additions / deductions) readiness.
 *
 * Two distinct concerns, deliberately kept apart:
 *  - LOP verification is an UPSTREAM dependency (step 4's own work).
 *  - Unpushed automatic recoveries are step 5's OWN work — they are pushed
 *    from the step 5 tool itself, so they must never block access to it,
 *    only the acknowledgement of the step.
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

  const names = (rows: any[]) =>
    [...new Set(rows.map((r) => String(r.employee_name || "").trim()).filter(Boolean))];

  // Upstream dependency — step 4's own work.
  const lopReasons: string[] = [];
  if (lopPending.length)
    lopReasons.push(
      `${lopPending.length} LOP deduction${lopPending.length === 1 ? "" : "s"} not yet verified on the RazorpayX run`,
    );

  // Step 5's own work — pushed from inside the step 5 tool.
  const recoveryReasons: string[] = [];
  if (recPending.length) {
    const who = names(recPending);
    recoveryReasons.push(
      `${recPending.length} automatic recover${recPending.length === 1 ? "y is" : "ies are"} still ${[
        ...new Set(recPending.map((r) => String(r.status))),
      ].join(" / ")}${who.length ? ` — ${who.slice(0, 4).join(", ")}${who.length > 4 ? ` +${who.length - 4} more` : ""}` : ""}`,
    );
  }

  const reasons = [...lopReasons, ...recoveryReasons];

  return {
    loading: lop.isLoading || rec.isLoading,
    /** Acknowledgement gate only — never disables access to the step 5 tool. */
    blocked: reasons.length > 0,
    reasons,
    lopReasons,
    recoveryReasons,
    lopTotal: lopRows.length,
    lopPending: lopPending.length,
    recTotal: recRows.length,
    recPending: recPending.length,
    recPendingRows: recPending,
    queryKeys: {
      lop: ["gate_lop", periodDate] as const,
      recoveries: ["gate_auto_recoveries", periodDate] as const,
    },
  };

}
