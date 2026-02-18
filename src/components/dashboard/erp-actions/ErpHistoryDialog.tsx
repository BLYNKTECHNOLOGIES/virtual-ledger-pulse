import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrowDownLeft, ArrowUpRight, CheckCircle, XCircle, Clock, Search } from "lucide-react";
import { format } from "date-fns";

interface ErpHistoryItem {
  id: string;
  movement_type: string;
  asset: string;
  amount: number;
  tx_id: string | null;
  network: string | null;
  status: string;
  action_type: string | null;
  processed_by: string | null;
  processed_at: string | null;
  reject_reason: string | null;
  movement_time: number;
  created_at: string;
  processor_name?: string | null;
}

interface ErpHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function useErpFullHistory() {
  return useQuery({
    queryKey: ["erp_action_queue", "all"],
    queryFn: async () => {
      // Fetch all queue items
      const { data: items, error } = await supabase
        .from("erp_action_queue")
        .select("*")
        .order("movement_time", { ascending: false })
        .limit(200);
      if (error) throw error;

      if (!items || items.length === 0) return [] as ErpHistoryItem[];

      // Get unique processor user IDs
      const userIds = [...new Set(items.map((i) => i.processed_by).filter(Boolean))] as string[];

      let userMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: users } = await supabase
          .from("users")
          .select("id, username, first_name, last_name")
          .in("id", userIds);
        if (users) {
          users.forEach((u: any) => {
            const displayName = [u.first_name, u.last_name].filter(Boolean).join(" ") || u.username || u.id;
            userMap[u.id] = displayName;
          });
        }
      }

      return items.map((item) => ({
        ...item,
        processor_name: item.processed_by ? (userMap[item.processed_by] || item.processed_by) : null,
      })) as ErpHistoryItem[];
    },
    refetchInterval: 30000,
  });
}

const statusConfig = {
  PENDING: { label: "Pending", icon: Clock, className: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30" },
  PROCESSED: { label: "Processed", icon: CheckCircle, className: "bg-green-500/10 text-green-400 border-green-500/30" },
  REJECTED: { label: "Rejected", icon: XCircle, className: "bg-destructive/10 text-destructive border-destructive/30" },
};

const actionTypeLabel: Record<string, string> = {
  PURCHASE: "Purchase Entry",
  SALE: "Sale Entry",
  TRANSFER: "Transfer",
  WALLET_TRANSFER: "Wallet Transfer",
};

function truncateTxId(txId: string | null) {
  if (!txId) return "—";
  if (txId.startsWith("Off-chain")) return txId;
  if (txId.length <= 14) return txId;
  return `${txId.slice(0, 8)}...${txId.slice(-6)}`;
}

function formatTime(ts: number) {
  try { return format(new Date(ts), "dd MMM yy, HH:mm"); } catch { return "—"; }
}

function formatProcessedAt(ts: string | null) {
  if (!ts) return "—";
  try { return format(new Date(ts), "dd MMM yy, HH:mm"); } catch { return "—"; }
}

export function ErpHistoryDialog({ open, onOpenChange }: ErpHistoryDialogProps) {
  const { data: items = [], isLoading } = useErpFullHistory();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");

  const filtered = items.filter((item) => {
    if (filterStatus !== "all" && item.status !== filterStatus) return false;
    if (filterType !== "all" && item.movement_type !== filterType) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        item.asset.toLowerCase().includes(q) ||
        String(item.amount).includes(q) ||
        (item.tx_id || "").toLowerCase().includes(q) ||
        (item.network || "").toLowerCase().includes(q) ||
        (item.processor_name || "").toLowerCase().includes(q) ||
        (item.action_type || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-full max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b border-border bg-muted/60 rounded-t-lg flex-shrink-0">
          <DialogTitle className="text-lg font-semibold text-foreground flex items-center gap-2">
            ERP Action Queue — Full History
            <Badge variant="outline" className="ml-2 text-xs font-normal">
              {items.length} total
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {/* Filters */}
        <div className="flex items-center gap-3 px-6 py-3 border-b border-border bg-background flex-shrink-0">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search asset, amount, TX, user..."
              className="pl-8 h-8 text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-8 w-36 text-sm">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="PROCESSED">Processed</SelectItem>
              <SelectItem value="REJECTED">Rejected</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="h-8 w-36 text-sm">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="deposit">Deposits</SelectItem>
              <SelectItem value="withdrawal">Withdrawals</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground ml-auto">
            {filtered.length} record{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="text-center py-16 text-muted-foreground text-sm">Loading history...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground text-sm">No records found</div>
          ) : (
            <TooltipProvider>
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/80 border-b border-border z-10">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Type</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Asset / Amount</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Network / TX</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Movement Time</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Status</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Action</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Actioned By</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Actioned At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((item) => {
                    const sc = statusConfig[item.status as keyof typeof statusConfig] || statusConfig.PENDING;
                    const StatusIcon = sc.icon;
                    return (
                      <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                        {/* Type */}
                        <td className="px-4 py-3">
                          <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${
                            item.movement_type === "deposit"
                              ? "bg-secondary/30 text-secondary-foreground"
                              : "bg-muted text-muted-foreground"
                          }`}>
                            {item.movement_type === "deposit"
                              ? <ArrowDownLeft className="h-3 w-3" />
                              : <ArrowUpRight className="h-3 w-3" />}
                            {item.movement_type === "deposit" ? "Deposit" : "Withdrawal"}
                          </div>
                        </td>

                        {/* Asset / Amount */}
                        <td className="px-4 py-3">
                          <span className="font-semibold text-foreground">{item.asset}</span>
                          <span className="ml-1.5 text-foreground">
                            {Number(item.amount).toLocaleString(undefined, { maximumFractionDigits: 8 })}
                          </span>
                        </td>

                        {/* Network / TX */}
                        <td className="px-4 py-3 text-muted-foreground">
                          <div>{item.network || "—"}</div>
                          {item.tx_id && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="font-mono text-xs cursor-help text-muted-foreground hover:text-foreground transition-colors">
                                  {truncateTxId(item.tx_id)}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="font-mono text-xs break-all max-w-xs">{item.tx_id}</p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </td>

                        {/* Movement Time */}
                        <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                          {formatTime(item.movement_time)}
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${sc.className}`}>
                            <StatusIcon className="h-3 w-3" />
                            {sc.label}
                          </span>
                          {item.status === "REJECTED" && item.reject_reason && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="ml-1 text-xs text-muted-foreground cursor-help underline decoration-dotted">reason</span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-xs max-w-xs">{item.reject_reason}</p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </td>

                        {/* Action */}
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {item.action_type ? (actionTypeLabel[item.action_type] || item.action_type) : "—"}
                        </td>

                        {/* Actioned By */}
                        <td className="px-4 py-3 text-xs">
                          {item.processor_name ? (
                            <span className="text-foreground font-medium">{item.processor_name}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>

                        {/* Actioned At */}
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {formatProcessedAt(item.processed_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TooltipProvider>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
