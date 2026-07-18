import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { HandCoins } from "lucide-react";

const INR = (n: any) =>
  n == null || n === "" ? "—" : `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

interface Props {
  hrEmployeeId: string;
  employeeType?: string | null;
}

/**
 * Inline payout list for a single contractor employee. Renders nothing when the
 * employee is not classified as a contractor. Read-only mirror of the org-wide
 * hub on RazorpaySyncPage; create/delete/refresh all live there.
 */
export function ContractorPayoutsSection({ hrEmployeeId, employeeType }: Props) {
  const isContractor = (employeeType || "").toLowerCase().includes("contract");

  const { data: rows, isLoading } = useQuery({
    queryKey: ["hr_rzp_contractor_payments_emp", hrEmployeeId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_razorpay_contractor_payments")
        .select("*")
        .eq("hr_employee_id", hrEmployeeId)
        .order("execute_on", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!hrEmployeeId && isContractor,
  });

  if (!isContractor) return null;

  return (
    <div className="border border-border rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2">
        <HandCoins className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">RazorpayX contractor payouts</h3>
      </div>
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : !rows || rows.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">
          No payouts recorded. Create/refresh from the RazorpayX Sync page → Contractor payouts.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left py-1.5 px-2 font-medium">Execute on</th>
                <th className="text-left py-1.5 px-2 font-medium">Purpose</th>
                <th className="text-right py-1.5 px-2 font-medium">Amount</th>
                <th className="text-right py-1.5 px-2 font-medium">Tax</th>
                <th className="text-center py-1.5 px-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any) => (
                <tr key={r.id} className="border-b border-border/40">
                  <td className="py-1.5 px-2 text-foreground">{r.execute_on || "—"}</td>
                  <td className="py-1.5 px-2 text-muted-foreground">{r.purpose || "—"}</td>
                  <td className="py-1.5 px-2 text-right font-medium">{INR(r.amount)}</td>
                  <td className="py-1.5 px-2 text-right text-muted-foreground">{INR(r.tax)}</td>
                  <td className="py-1.5 px-2 text-center">
                    <Badge variant={r.paid ? "default" : "outline"} className={r.paid ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/40 text-[10px]" : "text-[10px]"}>
                      {r.status || (r.paid ? "paid" : "pending")}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
