import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, RefreshCw, CheckCircle, XCircle } from "lucide-react";
import { useErpActionQueue, useCheckNewMovements, ErpActionQueueItem } from "@/hooks/useErpActionQueue";
import { RejectDialog } from "./erp-actions/RejectDialog";
import { ActionSelectionDialog } from "./erp-actions/ActionSelectionDialog";
import { format } from "date-fns";

export function ActionRequiredWidget() {
  const { data: pendingItems = [], isLoading } = useErpActionQueue();
  const checkMutation = useCheckNewMovements();
  const [rejectItem, setRejectItem] = useState<ErpActionQueueItem | null>(null);
  const [entryItem, setEntryItem] = useState<ErpActionQueueItem | null>(null);

  const deposits = useMemo(() => pendingItems.filter(i => i.movement_type === "deposit"), [pendingItems]);
  const withdrawals = useMemo(() => pendingItems.filter(i => i.movement_type === "withdrawal"), [pendingItems]);

  const truncateTxId = (txId: string | null) => {
    if (!txId) return "—";
    if (txId.length <= 12) return txId;
    return `${txId.slice(0, 6)}...${txId.slice(-4)}`;
  };

  const formatTime = (timestamp: number) => {
    if (!timestamp) return "—";
    try {
      return format(new Date(timestamp), "dd MMM, HH:mm");
    } catch {
      return "—";
    }
  };

  return (
    <>
      <Card className="bg-card border-2 border-border shadow-xl">
        <CardHeader className="bg-amber-600 text-white rounded-t-lg">
          <CardTitle className="flex items-center gap-2 text-lg">
            <div className="p-2 bg-amber-700 rounded-lg shadow-md">
              <AlertTriangle className="h-5 w-5" />
            </div>
            Action Required
            <div className="ml-auto flex items-center gap-2">
              {deposits.length > 0 && (
                <Badge variant="secondary" className="bg-green-100 text-green-800 text-xs">
                  <ArrowDownLeft className="h-3 w-3 mr-1" />
                  {deposits.length} Deposits
                </Badge>
              )}
              {withdrawals.length > 0 && (
                <Badge variant="secondary" className="bg-red-100 text-red-800 text-xs">
                  <ArrowUpRight className="h-3 w-3 mr-1" />
                  {withdrawals.length} Withdrawals
                </Badge>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-white hover:bg-amber-700"
                onClick={() => checkMutation.mutate()}
                disabled={checkMutation.isPending}
              >
                <RefreshCw className={`h-4 w-4 ${checkMutation.isPending ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">Loading...</div>
          ) : pendingItems.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm font-medium">All caught up!</p>
              <p className="text-xs">No pending movements require action</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              <TooltipProvider>
                {pendingItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors"
                  >
                    {/* Type icon */}
                    <div className={`p-1.5 rounded-md ${item.movement_type === "deposit" ? "bg-green-100" : "bg-red-100"}`}>
                      {item.movement_type === "deposit" ? (
                        <ArrowDownLeft className="h-4 w-4 text-green-600" />
                      ) : (
                        <ArrowUpRight className="h-4 w-4 text-red-600" />
                      )}
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{item.asset}</span>
                        <span className="text-sm text-foreground">{Number(item.amount).toLocaleString(undefined, { maximumFractionDigits: 8 })}</span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {item.movement_type === "deposit" ? "Deposit" : "Withdrawal"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <span>{formatTime(item.movement_time)}</span>
                        {item.tx_id && (
                          <>
                            <span>·</span>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="font-mono cursor-help">{truncateTxId(item.tx_id)}</span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="font-mono text-xs break-all max-w-xs">{item.tx_id}</p>
                              </TooltipContent>
                            </Tooltip>
                          </>
                        )}
                        {item.network && (
                          <>
                            <span>·</span>
                            <span>{item.network}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <Button size="sm" className="h-7 text-xs" onClick={() => setEntryItem(item)}>
                        Entry
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setRejectItem(item)}
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                ))}
              </TooltipProvider>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reject dialog */}
      <RejectDialog
        item={rejectItem}
        open={!!rejectItem}
        onOpenChange={(open) => !open && setRejectItem(null)}
      />

      {/* Action selection dialog */}
      <ActionSelectionDialog
        item={entryItem}
        open={!!entryItem}
        onOpenChange={(open) => !open && setEntryItem(null)}
      />
    </>
  );
}
