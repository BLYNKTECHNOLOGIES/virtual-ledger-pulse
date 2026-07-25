import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Activity, ArrowRight } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  referenceNumber: string | null;
}

const fmt = (n: number | null | undefined) =>
  n == null ? "-" : `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function TransactionEditHistoryDialog({ open, onOpenChange, referenceNumber }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["tx-edit-history", referenceNumber],
    enabled: open && !!referenceNumber,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_transactions")
        .select("id, transaction_date, created_at, amount, transaction_type, is_reversed, reverses_transaction_id, balance_before, balance_after, description, reference_number")
        .eq("reference_number", referenceNumber!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const rows = data || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" /> Edit History
          </DialogTitle>
          <DialogDescription className="font-mono text-xs">
            Reference: {referenceNumber}
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-auto">
          {isLoading ? (
            <div className="p-6 text-center text-muted-foreground text-sm">Loading history…</div>
          ) : rows.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">No history found for this reference.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-xs">
                  <th className="text-left p-2">#</th>
                  <th className="text-left p-2">Posted At (IST)</th>
                  <th className="text-left p-2">Business Date</th>
                  <th className="text-left p-2">Type</th>
                  <th className="text-right p-2">Amount</th>
                  <th className="text-right p-2">Balance Δ</th>
                  <th className="text-left p-2">Status</th>
                  <th className="text-left p-2">Description</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any, idx: number) => {
                  const isCredit = ["INCOME", "CREDIT", "TRANSFER_IN"].includes(r.transaction_type);
                  const isReversal = !!r.reverses_transaction_id;
                  const isReversed = !!r.is_reversed;
                  const isActive = !isReversed && !isReversal;
                  return (
                    <tr key={r.id} className={`border-b ${isActive ? "bg-success/5" : "opacity-70"}`}>
                      <td className="p-2 font-mono text-xs">{idx + 1}</td>
                      <td className="p-2 whitespace-nowrap">
                        <div>{format(new Date(r.created_at), "dd MMM yyyy")}</div>
                        <div className="text-xs text-muted-foreground">{format(new Date(r.created_at), "HH:mm:ss")}</div>
                      </td>
                      <td className="p-2 text-xs">{format(new Date(r.transaction_date), "dd MMM yyyy")}</td>
                      <td className="p-2">
                        <Badge variant="outline" className="text-xs">{r.transaction_type}</Badge>
                      </td>
                      <td className={`p-2 text-right font-mono ${isCredit ? "text-success" : "text-destructive"}`}>
                        {isCredit ? "+" : "-"}{fmt(r.amount)}
                      </td>
                      <td className="p-2 text-right font-mono text-xs text-muted-foreground whitespace-nowrap">
                        {fmt(r.balance_before)} <ArrowRight className="inline h-3 w-3" /> {fmt(r.balance_after)}
                      </td>
                      <td className="p-2">
                        {isActive && <Badge className="bg-success/15 text-success border-success/30" variant="outline">Active</Badge>}
                        {isReversed && <Badge variant="outline" className="border-destructive/40 text-destructive text-xs">Reversed</Badge>}
                        {isReversal && <Badge variant="outline" className="border-warning/40 text-warning text-xs">Reversal Entry</Badge>}
                      </td>
                      <td className="p-2 text-xs max-w-[280px] truncate" title={r.description || ""}>
                        {r.description || "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {rows.length > 0 && (
          <div className="text-xs text-muted-foreground border-t pt-2 mt-2">
            {rows.filter((r: any) => !r.is_reversed && !r.reverses_transaction_id).length} active ·{" "}
            {rows.filter((r: any) => r.is_reversed).length} reversed ·{" "}
            {rows.filter((r: any) => r.reverses_transaction_id).length} reversal entries · {rows.length} total revisions
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
