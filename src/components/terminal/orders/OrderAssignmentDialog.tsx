import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { UserPlus, X, BarChart2, Clock, Briefcase } from "lucide-react";
import { toast } from "sonner";
import { useTerminalJurisdiction } from "@/hooks/useTerminalJurisdiction";

interface EligibleOperator {
  userId: string;
  username: string;
  displayName: string;
  roleName: string;
  specialization: string;
  shift: string | null;
  activeOrderCount: number;
  isActive: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderNumber: string;
  tradeType?: string;
  totalPrice?: number;
  asset?: string;
  currentAssignee?: string | null;
  onAssigned: () => void;
}

export function OrderAssignmentDialog({
  open, onOpenChange, orderNumber, tradeType, totalPrice, asset,
  currentAssignee, onAssigned,
}: Props) {
  const { assignOrder, unassignOrder, getEligibleOperators } = useTerminalJurisdiction();
  const [operators, setOperators] = useState<EligibleOperator[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAssigning, setIsAssigning] = useState(false);

  useEffect(() => {
    if (open) {
      setIsLoading(true);
      getEligibleOperators().then(ops => {
        setOperators(ops);
        setIsLoading(false);
      });
    }
  }, [open, getEligibleOperators]);

  const handleAssign = async (operatorId: string) => {
    setIsAssigning(true);
    try {
      await assignOrder(orderNumber, operatorId, tradeType, totalPrice, asset);
      toast.success("Order assigned successfully");
      onAssigned();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to assign order");
    } finally {
      setIsAssigning(false);
    }
  };

  const handleUnassign = async () => {
    setIsAssigning(true);
    try {
      await unassignOrder(orderNumber);
      toast.success("Order unassigned");
      onAssigned();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to unassign");
    } finally {
      setIsAssigning(false);
    }
  };

  const maxWorkload = Math.max(...operators.map(o => o.activeOrderCount), 1);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto t-scale-in border-border bg-popover">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
            <UserPlus className="h-4 w-4 text-primary" />
            Assign Order
          </DialogTitle>
        </DialogHeader>


        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs">
          {tradeType && (
            <span className={`inline-flex h-5 items-center rounded px-1.5 t-mono text-[10px] font-semibold uppercase ${tradeType === 'BUY' ? 'bg-[hsl(var(--trade-buy,var(--success))/0.1)] text-trade-buy' : 'bg-[hsl(var(--trade-sell,var(--destructive))/0.1)] text-trade-sell'}`}>
              {tradeType}
            </span>
          )}
          <span className="t-mono text-foreground">{orderNumber}</span>
          {totalPrice && <span className="ml-auto t-mono font-semibold text-foreground">₹{totalPrice.toLocaleString('en-IN')}</span>}
        </div>

        {currentAssignee && (
          <div className="flex items-center justify-between bg-primary/5 border border-primary/20 rounded-lg px-3 py-2">
            <span className="text-xs text-foreground">Currently assigned</span>
            <Button variant="outline" size="sm" className="h-7 text-xs text-destructive" onClick={handleUnassign} disabled={isAssigning}>
              <X className="h-3 w-3 mr-1" /> Unassign
            </Button>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
          </div>
        ) : operators.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            No eligible Operations Associates found in your jurisdiction.
          </div>
        ) : (
          <div className="space-y-1.5">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Select Operations Associate (sorted by workload):</p>
            {operators.map(op => (
              <button
                key={op.userId}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border hover:border-primary/40 hover:bg-secondary/40 transition-colors text-left disabled:opacity-50"
                onClick={() => handleAssign(op.userId)}
                disabled={isAssigning || op.userId === currentAssignee}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{op.displayName}</span>
                    <Badge variant="outline" className="text-[10px] shrink-0">{op.roleName}</Badge>
                    {op.userId === currentAssignee && (
                      <Badge variant="secondary" className="text-[10px] shrink-0">Current</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground">@{op.username}</span>
                    {op.specialization !== 'both' && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                        <Briefcase className="h-2.5 w-2.5" /> {op.specialization}
                      </span>
                    )}
                    {op.shift && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                        <Clock className="h-2.5 w-2.5" /> {op.shift}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right">
                    <div className="text-xs t-mono font-semibold">{op.activeOrderCount}</div>
                    <div className="text-[10px] text-muted-foreground">active</div>
                  </div>
                  <div className="w-14 h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary/60 rounded-full transition-all"
                      style={{ width: `${Math.max((op.activeOrderCount / maxWorkload) * 100, 5)}%` }}
                    />
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" className="h-9" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}
