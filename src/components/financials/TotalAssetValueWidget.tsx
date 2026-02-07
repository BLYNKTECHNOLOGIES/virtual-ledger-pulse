import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TrendingUp, Layers } from "lucide-react";

export function useTotalAssetValue() {
  return useQuery({
    queryKey: ["total_asset_value_realtime"],
    queryFn: async () => {
      // 1. Bank balances (Active + Dormant)
      const { data: banks } = await supabase
        .from("bank_accounts")
        .select("balance, status")
        .in("status", ["ACTIVE", "DORMANT"]);

      const totalBank = banks?.reduce((s, a) => s + Number(a.balance || 0), 0) || 0;

      // 2. POS / Payment gateway balances
      const { data: pendingSettlements } = await supabase
        .from("pending_settlements")
        .select("settlement_amount")
        .eq("status", "PENDING");

      const totalGateway = pendingSettlements?.reduce((s, p) => s + Number(p.settlement_amount || 0), 0) || 0;

      // 3. Stock valuation
      const { data: wallets } = await supabase
        .from("wallets")
        .select("current_balance")
        .eq("is_active", true);

      const totalUnits = wallets?.reduce((s, w) => s + Number(w.current_balance || 0), 0) || 0;

      const { data: completedPOs } = await supabase
        .from("purchase_orders")
        .select("id")
        .eq("status", "COMPLETED");

      const completedIds = new Set(completedPOs?.map((p) => p.id) || []);

      const { data: items } = await supabase
        .from("purchase_order_items")
        .select("quantity, unit_price, purchase_order_id")
        .limit(1000);

      let totalQty = 0;
      let totalCost = 0;
      for (const item of items || []) {
        if (completedIds.has(item.purchase_order_id)) {
          const qty = Number(item.quantity || 0);
          totalQty += qty;
          totalCost += qty * Number(item.unit_price || 0);
        }
      }

      const avgCost = totalQty > 0 ? totalCost / totalQty : 0;
      const stockVal = totalUnits * avgCost;

      // 4. TDS Liability (unpaid TDS)
      const { data: unpaidTds } = await supabase
        .from("tds_records")
        .select("tds_amount")
        .or("payment_status.is.null,payment_status.neq.PAID");

      const totalUnpaidTds = unpaidTds?.reduce((s, r) => s + Number(r.tds_amount || 0), 0) || 0;

      // 5. Net Total
      const grossAssets = totalBank + totalGateway + stockVal;
      const total = grossAssets - totalUnpaidTds;

      return { total, totalBank, totalGateway, stockVal, totalUnits, avgCost, totalUnpaidTds };
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Total Asset Value — Breakdown</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <div className="space-y-2">
              <Row label="Bank Balances (Active + Dormant)" value={fmt(data?.totalBank || 0)} positive />
              <Row label="POS / Gateway (Pending Settlements)" value={fmt(data?.totalGateway || 0)} positive />
              <div className="pl-4 text-xs text-muted-foreground space-y-1">
                <p>Stock Units: {fmtUnits(data?.totalUnits || 0)}</p>
                <p>Weighted Avg Cost: {fmt(data?.avgCost || 0)}</p>
              </div>
              <Row label="Stock Valuation (Units × Avg Cost)" value={fmt(data?.stockVal || 0)} positive />
            </div>

            <div className="border-t pt-2">
              <Row label="Unpaid TDS (Liability)" value={`- ${fmt(data?.totalUnpaidTds || 0)}`} negative />
            </div>

            <div className="border-t pt-3 flex justify-between font-bold text-base">
              <span>Net Total Asset Value</span>
              <span className="text-primary">{fmt(data?.total || 0)}</span>
            </div>

            <p className="text-xs text-muted-foreground italic">
              Formula: Banks + POS + (Stock Units × Weighted Avg Purchase Price) − Unpaid TDS
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Row({ label, value, positive, negative }: { label: string; value: string; positive?: boolean; negative?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-muted-foreground">{label}</span>
      <span className={negative ? "text-destructive font-semibold" : positive ? "text-green-600 font-semibold" : ""}>
        {value}
      </span>
    </div>
  );
}
