import { AssetBalance, COIN_COLORS } from "@/hooks/useBinanceAssets";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";

interface AssetDetailPanelProps {
  asset: string;
  balances: AssetBalance[];
  onClose: () => void;
}

export function AssetDetailPanel({ asset, balances, onClose }: AssetDetailPanelProps) {
  const data = balances.find((b) => b.asset === asset);
  if (!data) return null;

  const color = COIN_COLORS[asset] || "#888";

  const rows = [
    { label: "Funding – Available", value: data.funding_free, type: "available" },
    { label: "Funding – Locked", value: data.funding_locked, type: "locked" },
    { label: "Funding – Frozen", value: data.funding_freeze, type: "frozen" },
    { label: "Spot – Available", value: data.spot_free, type: "available" },
    { label: "Spot – In Orders", value: data.spot_locked, type: "locked" },
  ].filter((r) => r.value > 0 || r.type === "available");

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div
              className="h-9 w-9 rounded-full flex items-center justify-center text-xs font-bold text-white"
              style={{ backgroundColor: color }}
            >
              {asset.slice(0, 2)}
            </div>
            <div>
              <p className="text-base font-semibold">{asset}</p>
              <p className="text-xs text-muted-foreground font-normal">Balance Breakdown</p>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Summary */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-accent/10 rounded-lg p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Available</p>
              <p className="text-sm font-semibold text-trade-buy tabular-nums">{data.total_free.toFixed(8)}</p>
            </div>
            <div className="bg-accent/10 rounded-lg p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Frozen / Locked</p>
              <p className="text-sm font-semibold text-amber-400 tabular-nums">
                {data.total_locked > 0 ? data.total_locked.toFixed(8) : "0.00000000"}
              </p>
            </div>
          </div>

          <Separator className="bg-border" />

          {/* Detailed Breakdown */}
          <div className="space-y-0">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Fund Allocation</p>
            {rows.map((row) => (
              <div key={row.label} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                <div className="flex items-center gap-2">
                  <div
                    className={`h-1.5 w-1.5 rounded-full ${
                      row.type === "available"
                        ? "bg-trade-buy"
                        : row.type === "locked"
                        ? "bg-amber-400"
                        : "bg-trade-sell"
                    }`}
                  />
                  <span className="text-xs text-muted-foreground">{row.label}</span>
                </div>
                <span className="text-xs font-medium text-foreground tabular-nums">
                  {row.value.toFixed(8)}
                </span>
              </div>
            ))}
          </div>

          {/* Explanation for frozen */}
          {data.total_locked > 0 && (
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">
              <p className="text-[10px] text-amber-400">
                Locked/frozen funds may be held in P2P orders, open spot orders, or escrow. 
                These values are fetched directly from Binance API.
              </p>
            </div>
          )}

          {/* Total */}
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <span className="text-xs font-medium text-muted-foreground">Total Balance</span>
            <span className="text-sm font-bold text-foreground tabular-nums">
              {data.total_balance.toFixed(8)} {asset}
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
