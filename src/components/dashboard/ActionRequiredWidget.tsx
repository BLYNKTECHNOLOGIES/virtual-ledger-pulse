import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, RefreshCw, CheckCircle, History } from "lucide-react";
import { useErpActionQueue, useCheckNewMovements, ErpActionQueueItem } from "@/hooks/useErpActionQueue";
import { RejectDialog } from "./erp-actions/RejectDialog";
import { ActionSelectionDialog } from "./erp-actions/ActionSelectionDialog";
import { ErpHistoryDialog } from "./erp-actions/ErpHistoryDialog";
import { format } from "date-fns";
import { useNotifications } from "@/contexts/NotificationContext";
import { useErpReconciliationAccess } from "@/hooks/useErpReconciliationAccess";

export function ActionRequiredWidget() {
  const { hasAccess, isLoading: accessLoading } = useErpReconciliationAccess();
  const { data: pendingItems = [], isLoading } = useErpActionQueue();
  const checkMutation = useCheckNewMovements();
  const [rejectItem, setRejectItem] = useState<ErpActionQueueItem | null>(null);
  const [entryItem, setEntryItem] = useState<ErpActionQueueItem | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const { addNotification } = useNotifications();
  const notifiedIdsRef = useRef<Set<string>>(
    (() => {
      try {
        const stored = sessionStorage.getItem('erp_notified_ids');
        return stored ? new Set<string>(JSON.parse(stored) as string[]) : new Set<string>();
      } catch {
        return new Set<string>();
      }
    })()
  );

  // Only users with erp_reconciliation function get notifications
  const shouldNotify = hasAccess;

  // Push new pending items to the notification bell (role-gated) — deduplicated via sessionStorage
  useEffect(() => {
    if (!shouldNotify || isLoading || pendingItems.length === 0) return;
    
    const currentSet: Set<string> = notifiedIdsRef.current instanceof Set ? notifiedIdsRef.current : new Set<string>();
    const newItems = pendingItems.filter(item => !currentSet.has(item.id));
    if (newItems.length === 0) return;

    newItems.forEach(item => {
      currentSet.add(item.id);
      addNotification({
        title: `${item.movement_type === "deposit" ? "Deposit" : "Withdrawal"} — ${item.asset} ${Number(item.amount).toLocaleString('en-IN')}`,
        description: `New ${item.movement_type} detected. ERP action required.`,
        type: "warning",
      });
    });
    notifiedIdsRef.current = currentSet;
    try {
      sessionStorage.setItem('erp_notified_ids', JSON.stringify([...currentSet]));
    } catch { /* ignore */ }
  }, [pendingItems, shouldNotify, isLoading, addNotification]);

  // If user doesn't have access, don't render the widget at all
  if (accessLoading) return null;
  if (!hasAccess) return null;

  const deposits = pendingItems.filter(i => i.movement_type === "deposit");
  const withdrawals = pendingItems.filter(i => i.movement_type === "withdrawal");

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
      <WidgetShell>
        <WidgetHeader
          icon={AlertTriangle}
          title="Action Required"
          subtitle={
            pendingItems.length > 0
              ? `${pendingItems.length} movement${pendingItems.length === 1 ? '' : 's'} pending`
              : 'Wallet movements awaiting an ERP entry'
          }
          actions={
            <>
              {deposits.length > 0 && (
                <WidgetStatus tone="primary">{deposits.length} in</WidgetStatus>
              )}
              {withdrawals.length > 0 && (
                <WidgetStatus tone="warning">{withdrawals.length} out</WidgetStatus>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setHistoryOpen(true)}
                  >
                    <History className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left">
                  <p className="text-xs">View full history</p>
                </TooltipContent>
              </Tooltip>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => { e.stopPropagation(); checkMutation.mutate({ force: true }); }}
                disabled={checkMutation.isPending}
              >
                <RefreshCw className={`h-4 w-4 ${checkMutation.isPending ? "animate-spin" : ""}`} />
              </Button>
            </>
          }
        />
        <WidgetBody padded={false} className="max-h-[420px] p-1.5">
          {isLoading ? (
            <WidgetSkeleton variant="list" rows={4} />
          ) : pendingItems.length === 0 ? (
            <WidgetEmpty
              icon={CheckCircle}
              title="All caught up"
              description="No pending movements require action"
            />
          ) : (
            <TooltipProvider>
              <WidgetList>
                {pendingItems.map((item) => {
                  const isDeposit = item.movement_type === "deposit";
                  return (
                    <WidgetListRow
                      key={item.id}
                      icon={isDeposit ? ArrowDownLeft : ArrowUpRight}
                      iconTone={isDeposit ? "success" : "warning"}
                      title={
                        <span className="flex items-center gap-1.5">
                          <span>{item.asset}</span>
                          <span className="tabular-nums text-muted-foreground">
                            {Number(item.amount).toLocaleString(undefined, { maximumFractionDigits: 8 })}
                          </span>
                        </span>
                      }
                      subtitle={
                        <span className="flex items-center gap-1.5">
                          <span>{formatTime(item.movement_time)}</span>
                          {item.tx_id && (
                            <>
                              <span aria-hidden>·</span>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="cursor-help font-mono">{truncateTxId(item.tx_id)}</span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="max-w-xs break-all font-mono text-xs">{item.tx_id}</p>
                                </TooltipContent>
                              </Tooltip>
                            </>
                          )}
                          {item.network && (
                            <>
                              <span aria-hidden>·</span>
                              <span>{item.network}</span>
                            </>
                          )}
                        </span>
                      }
                      trailing={
                        <div className="flex shrink-0 items-center gap-1.5">
                          <Button size="sm" className="h-7 px-2.5 text-[11px]" onClick={() => setEntryItem(item)}>
                            Entry
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-[11px] text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => setRejectItem(item)}
                          >
                            Reject
                          </Button>
                        </div>
                      }
                    />
                  );
                })}
              </WidgetList>
            </TooltipProvider>
          )}
        </WidgetBody>
      </WidgetShell>


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

      {/* Full history dialog */}
      <ErpHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
      />
    </>
  );
}
