import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { TrendingUp, Layers, ChevronDown, ChevronRight } from "lucide-react";

interface BankDetail { account_name: string; bank_name: string; balance: number; status: string; dormant_at: string | null }
interface GatewayGroup { gateway_name: string; total: number; count: number }
interface AssetStockDetail { asset_code: string; total_units: number; avg_cost: number; total_value: number }
interface WalletDetail { wallet_name: string; current_balance: number }
interface TdsDetail { id: string; tds_amount: number; pan_number: string; deduction_date: string }

export function useTotalAssetValue() {
  return useQuery({
    queryKey: ["total_asset_value_realtime"],
    queryFn: async () => {
      // 1. Bank balances (Active + Dormant)
      const { data: banks } = await supabase
        .from("bank_accounts")
        .select("account_name, bank_name, balance, status, dormant_at")
        .in("status", ["ACTIVE", "DORMANT"])
        .order("account_name");

      const bankDetails: BankDetail[] = (banks || []).map(b => ({
        account_name: b.account_name, bank_name: b.bank_name,
        balance: Number(b.balance || 0), status: b.status, dormant_at: b.dormant_at,
      }));
      const totalBank = bankDetails.reduce((s, a) => s + a.balance, 0);

      // 2. POS / Gateway — group by gateway, not individual transactions
      const { data: pendingSettlements } = await supabase
        .from("pending_settlements")
        .select("settlement_amount, payment_method_id")
        .eq("status", "PENDING");

      // Fetch payment method names for grouping
      const pmIds = [...new Set((pendingSettlements || []).map(p => p.payment_method_id).filter(Boolean))];
      let pmNameMap = new Map<string, string>();
      if (pmIds.length > 0) {
        const { data: pms } = await supabase
          .from("sales_payment_methods")
          .select("id, type, nickname")
          .in("id", pmIds);
        (pms || []).forEach(pm => {
          pmNameMap.set(pm.id, pm.nickname || pm.type || "Unknown");
        });
      }

      // Group settlements by gateway
      const gwMap = new Map<string, { total: number; count: number }>();
      (pendingSettlements || []).forEach(p => {
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

      // 3. Stock valuation — multi-asset (USDT from wallets, others from wallet_asset_balances)
      // 3a. USDT balances from wallets table
      const { data: wallets } = await supabase
        .from("wallets")
        .select("wallet_name, current_balance")
        .eq("is_active", true)
        .order("wallet_name");

      const walletDetails: WalletDetail[] = (wallets || []).map(w => ({
        wallet_name: w.wallet_name, current_balance: Number(w.current_balance || 0),
      }));
      const totalUsdtUnits = walletDetails.reduce((s, w) => s + w.current_balance, 0);

      // 3b. Non-USDT asset balances
      const { data: assetBalances } = await supabase
        .from("wallet_asset_balances")
        .select("asset_code, balance")
        .neq("asset_code", "USDT");

      const nonUsdtMap = new Map<string, number>();
      (assetBalances || []).forEach(ab => {
        const bal = Number(ab.balance || 0);
        nonUsdtMap.set(ab.asset_code, (nonUsdtMap.get(ab.asset_code) || 0) + bal);
      });

      // 3c. Get avg costs per product from completed POs
      const { data: purchaseOrders } = await supabase
        .from("purchase_orders")
        .select(`*, purchase_order_items(quantity, total_price, products(code))`)
        .eq("status", "COMPLETED");

      const costCalc = new Map<string, { qty: number; cost: number }>();
      (purchaseOrders || []).forEach(po => {
        (po.purchase_order_items || []).forEach((item: any) => {
          const code = item.products?.code;
          if (!code) return;
          const e = costCalc.get(code) || { qty: 0, cost: 0 };
          e.qty += Number(item.quantity || 0);
          e.cost += Number(item.total_price || 0);
          costCalc.set(code, e);
        });
      });

      const getAvgCost = (code: string) => {
        const c = costCalc.get(code);
        return c && c.qty > 0 ? c.cost / c.qty : 0;
      };

      // Build asset stock details
      const assetStocks: AssetStockDetail[] = [];

      // USDT
      const usdtAvg = getAvgCost("USDT");
      if (totalUsdtUnits > 0 || usdtAvg > 0) {
        assetStocks.push({
          asset_code: "USDT", total_units: totalUsdtUnits,
          avg_cost: usdtAvg, total_value: totalUsdtUnits * usdtAvg,
        });
      }

      // Other assets
      nonUsdtMap.forEach((units, code) => {
        const avg = getAvgCost(code);
        if (units > 0) {
          assetStocks.push({
            asset_code: code, total_units: units,
            avg_cost: avg, total_value: units * avg,
          });
        }
      });

      assetStocks.sort((a, b) => b.total_value - a.total_value);
      const stockVal = assetStocks.reduce((s, a) => s + a.total_value, 0);

      // 4. TDS Liability
      const { data: unpaidTds } = await supabase
        .from("tds_records")
        .select("id, tds_amount, pan_number, deduction_date")
        .or("payment_status.is.null,payment_status.neq.PAID")
        .order("deduction_date", { ascending: false });

      const tdsDetails: TdsDetail[] = (unpaidTds || []).map(r => ({
        id: r.id, tds_amount: Number(r.tds_amount || 0),
        pan_number: r.pan_number, deduction_date: r.deduction_date,
      }));
      const totalUnpaidTds = tdsDetails.reduce((s, r) => s + r.tds_amount, 0);

      const total = totalBank + totalGateway + stockVal - totalUnpaidTds;

      return {
        total, totalBank, totalGateway, stockVal, totalUnpaidTds,
        bankDetails, gatewayGroups, assetStocks, walletDetails, tdsDetails,
        pendingCount: (pendingSettlements || []).length,
      };
    },
    refetchInterval: 60000,
  });
}

export function TotalAssetValueWidget() {
  const { data } = useTotalAssetValue();
  const [showBreakdown, setShowBreakdown] = useState(false);
  const total = data?.total || 0;

  const fmt = (amount: number) =>
    `₹${Math.abs(amount).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

  const fmtUnits = (units: number) =>
    units.toLocaleString(undefined, { maximumFractionDigits: 4 });

  return (
    <>
      <Card
        className="bg-indigo-600 text-white border-0 shadow-xl hover:shadow-2xl transition-all duration-300 cursor-pointer"
        onClick={() => setShowBreakdown(true)}
      >
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-indigo-100 text-sm font-medium">Total Asset Value</p>
              <p className="text-2xl xl:text-3xl font-bold mt-2 truncate">
                {fmt(total)}
              </p>
              <div className="flex items-center gap-1 mt-2">
                <Layers className="h-4 w-4" />
                <span className="text-sm font-medium">Banks + POS + Stock − TDS</span>
              </div>
            </div>
            <div className="bg-indigo-700 p-3 rounded-xl shadow-lg flex-shrink-0">
              <TrendingUp className="h-8 w-8" />
            </div>
          </div>
        </CardContent>
      </Card>

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
              positive
            >
              {data?.bankDetails?.map((b, i) => (
                <div key={i} className="flex justify-between items-center py-1.5 px-3 rounded bg-muted/50">
                  <div>
                    <span className="font-medium">{b.account_name}</span>
                    <span className="text-xs text-muted-foreground ml-2">({b.bank_name})</span>
                    {b.dormant_at && <span className="text-xs text-orange-500 ml-1">[Dormant]</span>}
                  </div>
                  <span className="font-semibold text-green-600">{fmt(b.balance)}</span>
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
                  <span className="font-semibold text-green-600">{fmt(g.total)}</span>
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
                  <span className="font-semibold text-green-600">{fmt(a.total_value)}</span>
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
              count={data?.tdsDetails?.length || 0}
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
          <span className={negative ? "text-destructive font-semibold" : positive ? "text-green-600 font-semibold" : "font-semibold"}>
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
