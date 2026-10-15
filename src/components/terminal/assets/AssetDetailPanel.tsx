import { AssetBalance } from "@/hooks/useBinanceAssets";
import { useExchangeAccount } from "@/contexts/ExchangeAccountContext";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Info } from "lucide-react";
import { CoinAvatar } from "./assetUi";
import { fmtQty, fmtUsdt } from "./assetFormat";

export interface ErpComparison {
  erp: number;
  binance: number;
  diff: number;
  mismatch: boolean;
  wallets: { name: string; balance: number }[];
}

interface AssetDetailPanelProps {
  asset: string;
  balances: AssetBalance[];
  onClose: () => void;
  usdtValue?: number | null;
  erp?: ErpComparison | null;
  showValues?: boolean;
}

const MASK = "••••";
// The dialog is portalled outside the .terminal wrapper, so the terminal helper classes do not apply here.
const SECTION_TITLE = "mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground";

function Row({ label, value, dot, strong }: { label: string; value: string; dot?: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
        {dot && <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />}
        <span className="truncate">{label}</span>
      </span>
      <span className={`t-mono text-xs tabular-nums ${strong ? "font-semibold text-foreground" : "text-foreground"}`}>{value}</span>
    </div>
  );
}

export function AssetDetailPanel({ asset, balances, onClose, usdtValue = null, erp = null, showValues = true }: AssetDetailPanelProps) {
  const { accounts } = useExchangeAccount();
  const data = balances.find((b) => b.asset === asset);
  if (!data) return null;

  const v = (n: number) => (showValues ? fmtQty(n) : MASK);
  const funding = [
    { label: "Available", value: data.funding_free, dot: "bg-trade-buy", show: true },
    { label: "Locked", value: data.funding_locked, dot: "bg-warning", show: data.funding_locked > 0 },
    { label: "Frozen", value: data.funding_freeze, dot: "bg-trade-sell", show: data.funding_freeze > 0 },
  ].filter((r) => r.show);
  const spot = [
    { label: "Available", value: data.spot_free, dot: "bg-trade-buy", show: true },
    { label: "In orders", value: data.spot_locked, dot: "bg-warning", show: data.spot_locked > 0 },
  ].filter((r) => r.show);
  // "All accounts" view: the hook attaches each account's share of the total.
  const perAccount = ((data as AssetBalance & { _accounts?: { accountId: string; total_balance: number }[] })._accounts || []).map((a) => ({
    name: accounts.find((x) => x.id === a.accountId)?.account_name || "Account",
    total: a.total_balance,
  }));

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="t-scale-in bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-left">
            <CoinAvatar asset={asset} size="lg" />
            <span className="min-w-0">
              <span className="block text-base font-semibold text-foreground">{asset}</span>
              <span className="block text-xs font-normal text-muted-foreground">
                Balance breakdown{showValues && usdtValue !== null ? ` · ≈ ${fmtUsdt(usdtValue)} USDT` : ""}
              </span>
            </span>
          </DialogTitle>
          <DialogDescription className="sr-only">Where this coin sits across the Funding and Spot wallets.</DialogDescription>
        </DialogHeader>

        <div className="mt-1 space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-border bg-secondary/20 p-3">
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Available</p>
              <p className="t-mono text-sm font-semibold tabular-nums text-trade-buy break-all">{v(data.total_free)}</p>
            </div>
            <div className="rounded-lg border border-border bg-secondary/20 p-3">
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Frozen / Locked</p>
              <p className={`t-mono text-sm font-semibold tabular-nums break-all ${data.total_locked > 0 ? "text-warning" : "text-muted-foreground"}`}>{v(data.total_locked)}</p>
            </div>
          </div>

          {/* Fund allocation */}
          <div className="grid gap-4 sm:grid-cols-2">
            <section aria-label="Funding wallet">
              <p role="heading" aria-level={3} className={SECTION_TITLE}>Funding wallet</p>
              <div className="divide-y divide-border/60">
                {funding.map((r) => <Row key={r.label} label={r.label} value={v(r.value)} dot={r.dot} />)}
              </div>
            </section>
            <section aria-label="Spot wallet">
              <p role="heading" aria-level={3} className={SECTION_TITLE}>Spot wallet</p>
              <div className="divide-y divide-border/60">
                {spot.map((r) => <Row key={r.label} label={r.label} value={v(r.value)} dot={r.dot} />)}
              </div>
            </section>
          </div>

          {perAccount.length > 0 && (
            <section aria-label="By account">
              <p role="heading" aria-level={3} className={SECTION_TITLE}>By account</p>
              <div className="divide-y divide-border/60">
                {perAccount.map((a, i) => <Row key={`${a.name}-${i}`} label={a.name} value={v(a.total)} />)}
              </div>
            </section>
          )}

          {erp && showValues && (
            <section aria-label="ERP check" className={`rounded-lg border p-3 ${erp.mismatch ? "border-warning/40" : "border-border bg-secondary/20"}`}>
              <p role="heading" aria-level={3} className={SECTION_TITLE}>ERP check</p>
              <Row label="ERP inventory" value={fmtQty(erp.erp, 4)} />
              <Row label="Binance API" value={fmtQty(erp.binance, 4)} />
              <Row
                label={erp.mismatch ? (erp.diff > 0 ? "Difference (ERP higher)" : "Difference (ERP lower)") : "Difference"}
                value={erp.mismatch ? `${erp.diff > 0 ? "+" : "−"}${fmtQty(Math.abs(erp.diff), 4)}` : "Matches"}
                strong
              />
              {erp.wallets.length > 0 && (
                <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
                  ERP wallets counted: {erp.wallets.map((w) => `${w.name} ${fmtQty(w.balance, 4)}`).join(" · ")}
                </p>
              )}
            </section>
          )}

          {/* Explanation for frozen */}
          {data.total_locked > 0 && (
            <div className="flex gap-2 rounded-lg border border-warning/20 bg-warning/5 p-3">
              <Info className="mt-px h-3.5 w-3.5 shrink-0 text-warning" />
              <p className="text-[11px] leading-relaxed text-warning">
                Locked/frozen funds may be held in P2P orders, open spot orders, or escrow.
                These values are fetched directly from Binance API.
              </p>
            </div>
          )}

          {/* Total */}
          <div className="flex items-center justify-between border-t border-border pt-3">
            <span className="text-xs font-medium text-muted-foreground">Total Balance</span>
            <span className="t-mono text-sm font-semibold tabular-nums text-foreground">
              {v(data.total_balance)} {asset}
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
