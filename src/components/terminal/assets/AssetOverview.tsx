import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { assetPageSymbols, useBinanceBalances, useBinanceTickerPrices } from "@/hooks/useBinanceAssets";
import { useExchangeAccount } from "@/contexts/ExchangeAccountContext";
import { AlertTriangle, Check, Eye, EyeOff, Lock, Package, Wallet } from "lucide-react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AssetDetailPanel, type ErpComparison } from "./AssetDetailPanel";
import { CoinAvatar, PanelState, ShimmerRows } from "./assetUi";
import { fmt2, fmtQty, fmtUsdt } from "./assetFormat";

const MASK = "••••";
// Holdings grid: asset | balance | value | ERP check (single column + stacked details on narrow work areas)
const ROW_GRID = "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 @[44rem]:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,1.1fr)]";

/**
 * F4 — ERP side of the check: only the ERP wallets linked to the account(s) in view
 * (terminal_wallet_links, active, platform_source 'terminal'), from wallet_asset_balances.
 */
function useLinkedErpBalances(accountIds: string[]) {
  return useQuery({
    queryKey: ["terminal_linked_erp_balances", accountIds.join(",")],
    queryFn: async () => {
      const { data: links, error } = await supabase
        .from("terminal_wallet_links")
        .select("wallet_id, exchange_account_id")
        .eq("status", "active")
        .eq("platform_source", "terminal")
        .in("exchange_account_id", accountIds);
      if (error) throw error;
      const walletIds = [...new Set((links || []).map((l) => l.wallet_id).filter(Boolean))] as string[];
      const linkedAccounts = new Set((links || []).map((l) => l.exchange_account_id));
      const [{ data: wallets }, { data: bals, error: bErr }] = await Promise.all([
        walletIds.length ? supabase.from("wallets").select("id, wallet_name").in("id", walletIds) : Promise.resolve({ data: [] as any[] }),
        walletIds.length ? supabase.from("wallet_asset_balances").select("wallet_id, asset_code, balance").in("wallet_id", walletIds) : Promise.resolve({ data: [] as any[], error: null }),
      ]);
      if (bErr) throw bErr;
      const nameOf = new Map((wallets || []).map((w: any) => [w.id, w.wallet_name as string]));
      const byAsset = new Map<string, { total: number; wallets: { name: string; balance: number }[] }>();
      for (const b of bals || []) {
        const code = String(b.asset_code || "").toUpperCase();
        const cur = byAsset.get(code) || { total: 0, wallets: [] };
        cur.total += Number(b.balance) || 0;
        cur.wallets.push({ name: nameOf.get(b.wallet_id) || "ERP wallet", balance: Number(b.balance) || 0 });
        byAsset.set(code, cur);
      }
      return { byAsset, unlinked: accountIds.filter((id) => !linkedAccounts.has(id)) };
    },
    staleTime: 60_000,
  });
}

export function AssetOverview() {
  const { data: balances, isLoading, error } = useBinanceBalances();
  const { accountsToQuery, visibleAccounts } = useExchangeAccount();
  const heldAssets = (Array.isArray(balances) ? balances : []).map((b) => b.asset);
  const { data: prices } = useBinanceTickerPrices(assetPageSymbols(heldAssets));
  const { data: erpLinked } = useLinkedErpBalances(accountsToQuery);
  const unlinkedNames = (erpLinked?.unlinked || []).map((id) => visibleAccounts.find((a) => a.id === id)?.account_name || "this account");
  const [showValues, setShowValues] = useState(true);
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);


  // Calculate USDT equivalent for each asset
  const priceList = Array.isArray(prices) ? prices : [];

  const getUsdtValue = (asset: string, amount: number) => {
    if (asset === "USDT") return amount;
    if (priceList.length === 0) return null;
    const ticker = priceList.find((p) => p.symbol === `${asset}USDT`);
    if (ticker) return amount * parseFloat(ticker.price);
    return null;
  };

  const balanceList = Array.isArray(balances) ? balances : [];

  const totalValue = balanceList.reduce((sum, b) => {
    const val = getUsdtValue(b.asset, b.total_balance);
    return sum + (val || 0);
  }, 0);
  const lockedValue = balanceList.reduce((sum, b) => sum + (b.total_locked > 0 ? getUsdtValue(b.asset, b.total_locked) || 0 : 0), 0);
  const availableValue = Math.max(0, totalValue - lockedValue);

  // Most valuable first; coins without a USDT price go last (display order only).
  const rows = balanceList
    .map((b, i) => ({ b, i, usdt: getUsdtValue(b.asset, b.total_balance) }))
    .sort((x, y) => (y.usdt ?? -1) - (x.usdt ?? -1) || x.i - y.i);

  // An account in view without a linked ERP wallet makes any difference meaningless.
  const noLink = !!erpLinked && erpLinked.unlinked.length > 0;
  const erpFor = (asset: string, binance: number): ErpComparison | null => {
    if (!erpLinked || noLink) return null;
    const e = erpLinked.byAsset.get(asset);
    if (!e) return null; // coin not held in the linked ERP wallet(s)
    const diff = e.total - binance;
    return { erp: e.total, binance, diff, mismatch: Math.abs(diff) > 0.001, wallets: e.wallets };
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="t-panel p-4 sm:p-5">
          <div className="t-shimmer h-3 w-24 rounded" />
          <div className="t-shimmer mt-3 h-7 w-48 rounded" />
        </div>
        <div className="t-panel overflow-hidden">
          <ShimmerRows label="Loading balances from Binance…" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="t-panel border-destructive/30">
        <PanelState
          tone="danger"
          icon={<AlertTriangle className="h-5 w-5" />}
          title="Couldn't load balances from Binance"
          hint={<>Failed to load balances: {error.message}</>}
        />
      </div>
    );
  }

  const selectedRow = selectedAsset ? rows.find((r) => r.b.asset === selectedAsset) : undefined;

  return (
    <div className="space-y-4">
      {/* Total value */}
      <div className="t-panel p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Est. total value</span>
              <button
                type="button"
                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setShowValues(!showValues)}
                aria-label={showValues ? "Hide balances" : "Show balances"}
                title={showValues ? "Hide balances" : "Show balances"}
              >
                {showValues ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              </button>
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="t-mono text-2xl font-semibold tabular-nums text-foreground sm:text-3xl">
                {showValues ? fmt2(totalValue) : MASK}
              </span>
              <span className="text-sm text-muted-foreground">USDT</span>
            </div>
          </div>
          <dl className="grid grid-cols-3 gap-x-6 gap-y-1 text-right sm:gap-x-8">
            <div>
              <dt className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Available</dt>
              <dd className="t-mono text-xs tabular-nums text-foreground sm:text-sm">{showValues ? fmt2(availableValue) : MASK}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Locked</dt>
              <dd className={`t-mono text-xs tabular-nums sm:text-sm ${lockedValue > 0 ? "text-warning" : "text-foreground"}`}>{showValues ? fmt2(lockedValue) : MASK}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Coins</dt>
              <dd className="t-mono text-xs tabular-nums text-foreground sm:text-sm">{balanceList.length}</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Asset List */}
      <div className="t-panel overflow-hidden @container">
        <div className="t-panel-head">
          <span className="t-panel-head-title">Crypto assets</span>
          <span className="ml-auto t-mono text-[10px] text-muted-foreground">{balanceList.length} assets</span>
        </div>
        {balanceList.length > 0 && (
          <div className={`${ROW_GRID} hidden border-b border-border px-4 py-2 text-[10px] font-medium text-muted-foreground @[44rem]:grid`}>
            <span>Asset</span>
            <span className="text-right">Balance</span>
            <span className="text-right">Value (USDT)</span>
            <span className="text-right">ERP check</span>
          </div>
        )}
        <ul className="divide-y divide-border">
          {rows.map(({ b: asset, usdt: usdtVal }) => {
            const erp = erpFor(asset.asset, asset.total_balance);
            const valueText = showValues ? (usdtVal !== null ? `≈ ${fmtUsdt(usdtVal)}` : "≈ --") : MASK;
            const erpChip = showValues && noLink ? (
              <span className="text-[10px] text-muted-foreground" title={`No ERP wallet linked to ${unlinkedNames.join(", ")}`}>
                no ERP wallet linked
              </span>
            ) : showValues && erp ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className={`inline-flex h-5 max-w-full items-center gap-1 rounded px-1.5 t-mono text-[10px] tabular-nums ${
                      erp.mismatch ? "bg-warning/10 text-warning" : "text-muted-foreground"
                    }`}
                  >
                    {erp.mismatch ? <Package className="h-3 w-3 shrink-0" /> : <Check className="h-3 w-3 shrink-0" />}
                    <span className="truncate">
                      ERP {fmtQty(erp.erp, 4)}
                      {erp.mismatch && <> · {erp.diff > 0 ? "+" : "−"}{fmtQty(Math.abs(erp.diff), 4)}</>}
                    </span>
                  </span>
                </TooltipTrigger>
                {/* Portalled: the @container panel would otherwise offset the fixed-position tooltip. */}
                <TooltipPrimitive.Portal>
                <TooltipContent className="max-w-xs">
                  <p className="text-xs">ERP (linked wallets): {fmtQty(erp.erp, 4)}</p>
                  <p className="text-xs">Binance API: {fmtQty(erp.binance, 4)}</p>
                  {erp.mismatch && <p className="text-xs text-warning">Difference: {erp.diff > 0 ? "+" : "−"}{fmtQty(Math.abs(erp.diff), 4)} ({erp.diff > 0 ? "ERP higher" : "ERP lower"})</p>}
                  {erp.wallets.length > 0 && (
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      ERP wallets counted: {erp.wallets.map((w) => `${w.name} ${fmtQty(w.balance, 4)}`).join(" · ")}
                    </p>
                  )}
                </TooltipContent>
                </TooltipPrimitive.Portal>
              </Tooltip>
            ) : null;

            return (
              <li key={asset.asset}>
                <button
                  type="button"
                  className={`${ROW_GRID} w-full px-4 py-2.5 text-left transition-colors hover:bg-accent/5 focus-visible:bg-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring`}
                  onClick={() => setSelectedAsset(asset.asset)}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <CoinAvatar asset={asset.asset} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{asset.asset}</p>
                      {asset.total_locked > 0 && (
                        <p className="flex items-center gap-1 text-[10px] text-warning">
                          <Lock className="h-2.5 w-2.5 shrink-0" />
                          <span className="t-mono tabular-nums">{showValues ? fmtQty(asset.total_locked) : MASK}</span> locked
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="min-w-0 text-right">
                    <p className="t-mono text-sm tabular-nums text-foreground">{showValues ? fmtQty(asset.total_balance) : MASK}</p>
                    <p className="t-mono text-[10px] tabular-nums text-muted-foreground @[44rem]:hidden">{valueText} USDT</p>
                    {erpChip && <div className="mt-0.5 flex justify-end @[44rem]:hidden">{erpChip}</div>}
                  </div>
                  <p className="hidden t-mono text-sm tabular-nums text-muted-foreground @[44rem]:block @[44rem]:text-right">
                    {valueText}
                  </p>
                  <div className="hidden min-w-0 justify-end @[44rem]:flex">{erpChip ?? <span className="text-[10px] text-muted-foreground">—</span>}</div>
                </button>
              </li>
            );
          })}
        </ul>
        {balanceList.length === 0 && (
          <PanelState icon={<Wallet className="h-5 w-5" />} title="No assets found" hint="No balances to show for this view." />
        )}
      </div>

      {/* Asset Detail Panel */}
      {selectedAsset && (
        <AssetDetailPanel
          asset={selectedAsset}
          balances={balanceList}
          onClose={() => setSelectedAsset(null)}
          usdtValue={selectedRow?.usdt ?? null}
          erp={selectedRow ? erpFor(selectedRow.b.asset, selectedRow.b.total_balance) : null}
          showValues={showValues}
        />
      )}
    </div>
  );
}
