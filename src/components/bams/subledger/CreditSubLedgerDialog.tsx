import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaginated } from "@/lib/fetchAllRows";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronDown, ChevronRight, Loader2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useCreditSubLedgers } from "@/hooks/useCreditSubLedgers";
import { usePermissions } from "@/hooks/usePermissions";

interface CreditSubLedgerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bankAccountId: string;
  accountName: string;
}

interface Txn {
  id: string;
  transaction_date: string;
  transaction_type: string;
  amount: number;
  description: string | null;
  category: string | null;
  reference_number: string | null;
  sub_ledger_id: string | null;
  is_reversed: boolean;
}

const POSITIVE_TYPES = ["INCOME", "CREDIT", "TRANSFER_IN"];

function signedAmount(t: Txn): number {
  const amt = Number(t.amount) || 0;
  return POSITIVE_TYPES.includes(t.transaction_type) ? amt : -amt;
}

const UNIDENTIFIED_KEY = "__unidentified__";

export function CreditSubLedgerDialog({
  open,
  onOpenChange,
  bankAccountId,
  accountName,
}: CreditSubLedgerDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: subLedgers = [] } = useCreditSubLedgers(true);

  const { data: txns = [], isLoading } = useQuery({
    queryKey: ["credit_subledger_txns", bankAccountId],
    enabled: open && !!bankAccountId,
    queryFn: async () =>
      fetchAllPaginated<Txn>(() =>
        supabase
          .from("bank_transactions")
          .select(
            "id, transaction_date, transaction_type, amount, description, category, reference_number, sub_ledger_id, is_reversed"
          )
          .eq("bank_account_id", bankAccountId)
          .eq("is_reversed", false)
          .order("transaction_date", { ascending: false })
      ),
  });

  const reassign = useMutation({
    mutationFn: async ({ txnId, subLedgerId }: { txnId: string; subLedgerId: string | null }) => {
      const { error } = await supabase
        .from("bank_transactions")
        .update({ sub_ledger_id: subLedgerId })
        .eq("id", txnId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["credit_subledger_txns", bankAccountId] });
      toast({ title: "Reassigned", description: "Transaction moved to the selected sub-ledger." });
    },
    onError: (e: any) =>
      toast({ title: "Error", description: e?.message ?? "Failed to reassign", variant: "destructive" }),
  });

  const subLedgerName = (id: string | null) => {
    if (!id) return "Unidentified";
    return subLedgers.find((s) => s.id === id)?.name ?? "Unidentified";
  };

  // Group signed totals + transactions per sub-ledger (null -> Unidentified)
  const groups = useMemo(() => {
    const map = new Map<string, { key: string; id: string | null; name: string; net: number; items: Txn[] }>();
    for (const t of txns) {
      const key = t.sub_ledger_id ?? UNIDENTIFIED_KEY;
      if (!map.has(key)) {
        map.set(key, {
          key,
          id: t.sub_ledger_id,
          name: subLedgerName(t.sub_ledger_id),
          net: 0,
          items: [],
        });
      }
      const g = map.get(key)!;
      g.net += signedAmount(t);
      g.items.push(t);
    }
    return Array.from(map.values()).sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
  }, [txns, subLedgers]);

  const total = useMemo(() => groups.reduce((s, g) => s + g.net, 0), [groups]);

  const fmt = (v: number) =>
    `${v < 0 ? "-" : ""}₹${Math.abs(v).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

  const balanceLabel = (v: number) =>
    v > 0 ? "Given (owed to us)" : v < 0 ? "Taken (we owe)" : "Settled";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" /> Sub-Ledgers — {accountName}
          </DialogTitle>
          <DialogDescription>
            Person-wise breakdown of this credit account. Positive = credit given by us; negative =
            credit taken by us. The total equals the account balance.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 p-3">
              <span className="font-medium">Account Total (sum of all sub-ledgers)</span>
              <span
                className={cn(
                  "font-mono font-semibold tabular-nums",
                  total > 0 ? "text-green-600" : total < 0 ? "text-red-600" : "text-muted-foreground"
                )}
              >
                {fmt(total)}
              </span>
            </div>

            {groups.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No transactions on this credit account yet.
              </p>
            )}

            {groups.map((g) => {
              const isOpen = expanded === g.key;
              return (
                <div key={g.key} className="rounded-lg border border-border">
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : g.key)}
                    className="flex w-full items-center justify-between p-3 text-left hover:bg-muted/40"
                  >
                    <span className="flex items-center gap-2 font-medium">
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                      {g.name}
                      {g.id === null && (
                        <Badge variant="outline" className="text-xs">
                          legacy
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">({g.items.length})</span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">{balanceLabel(g.net)}</span>
                      <span
                        className={cn(
                          "font-mono font-semibold tabular-nums",
                          g.net > 0 ? "text-green-600" : g.net < 0 ? "text-red-600" : "text-muted-foreground"
                        )}
                      >
                        {fmt(g.net)}
                      </span>
                    </span>
                  </button>

                  {isOpen && (
                    <div className="overflow-x-auto border-t border-border">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left text-muted-foreground">
                            <th className="p-2">Date</th>
                            <th className="p-2">Type</th>
                            <th className="p-2">Description</th>
                            <th className="p-2 text-right">Amount</th>
                            <th className="p-2">Reassign to</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.items.map((t) => (
                            <tr key={t.id} className="border-b hover:bg-muted/30">
                              <td className="whitespace-nowrap p-2">
                                {t.transaction_date
                                  ? format(new Date(t.transaction_date), "dd MMM yyyy")
                                  : "-"}
                              </td>
                              <td className="p-2">
                                <Badge
                                  variant={POSITIVE_TYPES.includes(t.transaction_type) ? "default" : "secondary"}
                                >
                                  {t.transaction_type}
                                </Badge>
                              </td>
                              <td className="max-w-[180px] truncate p-2">
                                {t.description || t.category || "-"}
                              </td>
                              <td
                                className={cn(
                                  "p-2 text-right font-mono tabular-nums",
                                  signedAmount(t) >= 0 ? "text-green-600" : "text-red-600"
                                )}
                              >
                                {fmt(signedAmount(t))}
                              </td>
                              <td className="p-2">
                                <Select
                                  value={t.sub_ledger_id ?? UNIDENTIFIED_KEY}
                                  onValueChange={(val) =>
                                    reassign.mutate({
                                      txnId: t.id,
                                      subLedgerId: val === UNIDENTIFIED_KEY ? null : val,
                                    })
                                  }
                                >
                                  <SelectTrigger className="h-8 w-[160px] text-foreground">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {subLedgers.map((s) => (
                                      <SelectItem key={s.id} value={s.id}>
                                        {s.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
