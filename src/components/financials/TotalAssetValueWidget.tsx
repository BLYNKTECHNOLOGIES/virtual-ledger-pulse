import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchActiveWalletsWithLedgerUsdtBalance } from "@/lib/wallet-ledger-balance";
import { isAdjustmentBank, isAdjustmentWallet } from "@/lib/adjustment-accounts";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { TrendingUp, Layers, ChevronDown, ChevronRight } from "lucide-react";
import { StatTile } from "@/components/financials/StatTile";
import { formatCompactINR } from "@/lib/formatCompactCurrency";

interface BankDetail { account_name: string; bank_name: string; balance: number; status: string; dormant_at: string | null }
interface GatewayGroup { gateway_name: string; total: number; count: number }
interface AssetStockDetail { asset_code: string; total_units: number; avg_cost: number; total_value: number }
interface WalletDetail { wallet_name: string; current_balance: number }
interface TdsDetail { id: string; tds_amount: number; pan_number: string; deduction_date: string }

export function useTotalAssetValue() {
  return useQuery({
    queryKey: ["total_asset_value_realtime"],
    queryFn: async () => {
      // All independent reads run in parallel; heavy aggregations (WAC cost basis,
      // unpaid TDS totals) are computed server-side instead of downloading
      // thousands of purchase-order rows into the browser.
      const [
        banksRes,
        settlementsRes,
        wallets,
        assetBalancesRes,
        costBasisRes,
        tdsTotalRes,
        tdsSampleRes,
      ] = await Promise.all([
        supabase
          .from("bank_accounts")
          .select("account_name, bank_name, balance, status, dormant_at")
          .in("status", ["ACTIVE", "DORMANT"])
          .order("account_name"),
        supabase
          .from("pending_settlements")
          .select("settlement_amount, payment_method_id")
          .eq("status", "PENDING"),
        fetchActiveWalletsWithLedgerUsdtBalance("wallet_name, current_balance"),
        supabase
          .from("wallet_asset_balances")
          .select("asset_code, balance")
          .neq("asset_code", "USDT"),
        (supabase as any).rpc("get_product_cost_basis"),
        (supabase as any).rpc("get_unpaid_tds_total"),
        supabase
          .from("tds_records")
          .select("id, tds_amount, pan_number, deduction_date")
          .or("payment_status.is.null,payment_status.neq.PAID")
          .order("deduction_date", { ascending: false })
          .limit(200),
      ]);

      // 1. Bank balances (Active + Dormant)
      const bankDetails: BankDetail[] = (banksRes.data || [])
        .filter(b => !isAdjustmentBank(b.account_name))
        .map(b => ({
          account_name: b.account_name, bank_name: b.bank_name,
          balance: Number(b.balance || 0), status: b.status, dormant_at: b.dormant_at,
        }));
      const totalBank = bankDetails.reduce((s, a) => s + a.balance, 0);

      // 2. POS / Gateway — group by gateway, not individual transactions
      const pendingSettlements = settlementsRes.data || [];
      const pmIds = [...new Set(pendingSettlements.map(p => p.payment_method_id).filter(Boolean))];
      const pmNameMap = new Map<string, string>();
      if (pmIds.length > 0) {
        const { data: pms } = await supabase
          .from("sales_payment_methods")
          .select("id, type, nickname")
          .in("id", pmIds as string[]);
        (pms || []).forEach(pm => {
          pmNameMap.set(pm.id, pm.nickname || pm.type || "Unknown");
        });
      }

      const gwMap = new Map<string, { total: number; count: number }>();
      pendingSettlements.forEach(p => {
        const name = p.payment_method_id ? (pmNameMap.get(p.payment_method_id) || "Unknown Gateway") : "Unassigned";
        const existing = gwMap.get(name) || { total: 0, count: 0 };
        existing.total += Number(p.settlement_amount || 0);
        existing.count += 1;
        gwMap.set(name, existing);
      });
      const gatewayGroups: GatewayGroup[] = Array.from(gwMap.entries())
        .map(([gateway_name, v]) => ({ gateway_name, total: v.total, count: v.count }))
        .sort((a, b) => b.total - a.total);
      const totalGateway = gatewayGroups.reduce((s, g) => s + g.total, 0);

      // 3. Stock valuation — multi-asset (wallet_asset_balances ledger source of truth)
      const walletDetails: WalletDetail[] = (wallets || [])
        .filter((w) => !isAdjustmentWallet(String(w.wallet_name)))
        .map((w) => ({
          wallet_name: String(w.wallet_name),
          current_balance: Number(w.current_balance || 0),
        }));
      const totalUsdtUnits = walletDetails.reduce((s, w) => s + w.current_balance, 0);

      const nonUsdtMap = new Map<string, number>();
      ((assetBalancesRes.data || []) as { asset_code: string; balance: number }[]).forEach(ab => {
        nonUsdtMap.set(ab.asset_code, (nonUsdtMap.get(ab.asset_code) || 0) + Number(ab.balance || 0));
      });

      // Avg cost per product — aggregated in Postgres (get_product_cost_basis)
      const costMap = new Map<string, number>();
      ((costBasisRes?.data || []) as any[]).forEach((r) => {
        costMap.set(String(r.product_code), Number(r.average_cost || 0));
      });
      const getAvgCost = (code: string) => costMap.get(code) || 0;

      const assetStocks: AssetStockDetail[] = [];
      const usdtAvg = getAvgCost("USDT");
      if (totalUsdtUnits > 0 || usdtAvg > 0) {
        assetStocks.push({
          asset_code: "USDT", total_units: totalUsdtUnits,
          avg_cost: usdtAvg, total_value: totalUsdtUnits * usdtAvg,
        });
      }
      nonUsdtMap.forEach((units, code) => {
        const avg = getAvgCost(code);
        if (units > 0) {
          assetStocks.push({ asset_code: code, total_units: units, avg_cost: avg, total_value: units * avg });
        }
      });
      assetStocks.sort((a, b) => b.total_value - a.total_value);
      const stockVal = assetStocks.reduce((s, a) => s + a.total_value, 0);

      // 4. TDS liability — total aggregated server-side, sample rows for the drilldown
      const tdsAgg = ((tdsTotalRes?.data || []) as any[])[0] || { total_amount: 0, record_count: 0 };
      const totalUnpaidTds = Number(tdsAgg.total_amount || 0);
      const tdsCount = Number(tdsAgg.record_count || 0);
      const tdsDetails: TdsDetail[] = ((tdsSampleRes.data || []) as any[]).map(r => ({
        id: r.id, tds_amount: Number(r.tds_amount || 0),
        pan_number: r.pan_number, deduction_date: r.deduction_date,
      }));

      const total = totalBank + totalGateway + stockVal - totalUnpaidTds;

      return {
        total, totalBank, totalGateway, stockVal, totalUnpaidTds,
        bankDetails, gatewayGroups, assetStocks, walletDetails, tdsDetails, tdsCount,
        pendingCount: pendingSettlements.length,
      };
    },
    refetchInterval: 60000,
    staleTime: 30000,
    placeholderData: (prev: any) => prev,
  });
}

export function TotalAssetValueWidget() {
  const { data } = useTotalAssetValue();
  const [showBreakdown, setShowBreakdown] = useState(false);
  const total = data?.total || 0;

  const fmt = (amount: number) =>
    `${amount < 0 ? '-' : ''}₹${Math.abs(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const fmtUnits = (units: number) =>
    units.toLocaleString(undefined, { maximumFractionDigits: 4 });

  return (
    <>
      <div className="h-full cursor-pointer" onClick={() => setShowBreakdown(true)}>
        <StatTile
          label="Total Asset Value"
          value={formatCompactINR(total)}
          exactValue={fmt(total)}
          hint={<><Layers className="h-3.5 w-3.5" /><span>Banks + POS + Stock − TDS</span></>}
          icon={<TrendingUp className="h-5 w-5 text-primary" />}
          iconClassName="bg-primary/10"
          interactive
        />
      </div>



      <Dialog open={showBreakdown} onOpenChange={setShowBreakdown}>
        <DialogContent className="md:max-w-2xl w-full max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Total Asset Value — Breakdown</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            {/* Bank Balances */}
            <ExpandableCategory
              label="Bank Balances (Active + Dormant)"
              total={fmt(data?.totalBank || 0)}
              count={data?.bankDetails?.length || 0}
              positive={(data?.totalBank || 0) >= 0}
              negative={(data?.totalBank || 0) < 0}
            >
              {data?.bankDetails?.map((b, i) => (
                <div key={i} className="flex justify-between items-center py-1.5 px-3 rounded bg-muted/50">
                  <div>
                    <span className="font-medium">{b.account_name}</span>
                    <span className="text-xs text-muted-foreground ml-2">({b.bank_name})</span>
                    {b.dormant_at && <span className="text-xs text-warning ml-1">[Dormant]</span>}
                  </div>
                  <span className={`font-semibold ${b.balance < 0 ? 'text-destructive' : 'text-success'}`}>{fmt(b.balance)}</span>
                </div>
              ))}
            </ExpandableCategory>

            {/* POS / Gateway — grouped by gateway */}
            <ExpandableCategory
              label="POS / Gateway (Pending Settlements)"
              total={fmt(data?.totalGateway || 0)}
              count={data?.pendingCount || 0}
              positive
            >
              {data?.gatewayGroups?.length ? data.gatewayGroups.map((g, i) => (
                <div key={i} className="flex justify-between items-center py-1.5 px-3 rounded bg-muted/50">
                  <div>
                    <span className="font-medium">{g.gateway_name}</span>
                    <span className="text-xs text-muted-foreground ml-2">({g.count} txns)</span>
                  </div>
                  <span className="font-semibold text-success">{fmt(g.total)}</span>
                </div>
              )) : (
                <p className="text-xs text-muted-foreground px-3">No pending settlements</p>
              )}
            </ExpandableCategory>

            {/* Stock Valuation — multi-asset */}
            <ExpandableCategory
              label="Stock Valuation (Multi-Asset)"
              total={fmt(data?.stockVal || 0)}
              count={data?.assetStocks?.length || 0}
              positive
            >
              {data?.assetStocks?.map((a, i) => (
                <div key={i} className="flex justify-between items-center py-1.5 px-3 rounded bg-muted/50">
                  <div>
                    <span className="font-medium">{a.asset_code}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {fmtUnits(a.total_units)} units × {fmt(a.avg_cost)}
                    </span>
                  </div>
                  <span className="font-semibold text-success">{fmt(a.total_value)}</span>
                </div>
              ))}
              {(!data?.assetStocks?.length) && (
                <p className="text-xs text-muted-foreground px-3">No stock positions</p>
              )}
            </ExpandableCategory>

            {/* TDS */}
            <ExpandableCategory
              label="Unpaid TDS (Liability)"
              total={`- ${fmt(data?.totalUnpaidTds || 0)}`}
              count={data?.tdsCount ?? (data?.tdsDetails?.length || 0)}
              negative
            >
              {data?.tdsDetails?.length ? data.tdsDetails.map((t, i) => (
                <div key={i} className="flex justify-between items-center py-1.5 px-3 rounded bg-muted/50">
                  <div>
                    <span className="font-medium">PAN: {t.pan_number}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {new Date(t.deduction_date).toLocaleDateString()}
                    </span>
                  </div>
                  <span className="font-semibold text-destructive">{fmt(t.tds_amount)}</span>
                </div>
              )) : (
                <p className="text-xs text-muted-foreground px-3">No unpaid TDS records</p>
              )}
            </ExpandableCategory>

            {/* Net Total */}
            <div className="border-t pt-3 flex justify-between font-bold text-base">
              <span>Net Total Asset Value</span>
              <span className="text-primary">{fmt(data?.total || 0)}</span>
            </div>

            <p className="text-xs text-muted-foreground italic">
              Formula: Banks + POS + Σ(Asset Units × Avg Cost) − Unpaid TDS
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ExpandableCategory({
  label, total, count, positive, negative, subtitle, children,
}: {
  label: string; total: string; count: number;
  positive?: boolean; negative?: boolean; subtitle?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="w-full">
        <div className="flex justify-between items-center p-2 rounded-lg hover:bg-muted/60 transition-colors cursor-pointer">
          <div className="flex items-center gap-2">
            {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            <div className="text-left">
              <span>{label}</span>
              <span className="text-xs text-muted-foreground ml-2">({count})</span>
              {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
            </div>
          </div>
          <span className={negative ? "text-destructive font-semibold" : positive ? "text-success font-semibold" : "font-semibold"}>
            {total}
          </span>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-6 space-y-1 mt-1 mb-2 max-h-48 overflow-y-auto">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
