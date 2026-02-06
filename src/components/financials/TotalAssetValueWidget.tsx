import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, ArrowUpIcon, Layers } from "lucide-react";

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
      const { data: gateways } = await supabase
        .from("sales_payment_methods")
        .select("current_usage")
        .eq("payment_gateway", true)
        .eq("is_active", true);

      const totalGateway = gateways?.reduce((s, g) => s + Number(g.current_usage || 0), 0) || 0;

      // 3. Stock valuation: wallet units × weighted avg purchase price
      const { data: wallets } = await supabase
        .from("wallets")
        .select("current_balance")
        .eq("is_active", true);

      const totalUnits = wallets?.reduce((s, w) => s + Number(w.current_balance || 0), 0) || 0;

      // Weighted average cost from completed purchase orders
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
      const total = totalBank + totalGateway + stockVal;

      return { total, totalBank, totalGateway, stockVal };
    },
    refetchInterval: 60000, // refresh every minute
  });
}

export function TotalAssetValueWidget() {
  const { data } = useTotalAssetValue();
  const total = data?.total || 0;

  const formatCurrency = (amount: number) =>
    `₹${Math.abs(amount).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

  return (
    <Card className="bg-indigo-600 text-white border-0 shadow-xl hover:shadow-2xl transition-all duration-300">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-indigo-100 text-sm font-medium">Total Asset Value</p>
            <p className="text-2xl xl:text-3xl font-bold mt-2 truncate">
              {formatCurrency(total)}
            </p>
            <div className="flex items-center gap-1 mt-2">
              <Layers className="h-4 w-4" />
              <span className="text-sm font-medium">Banks + POS + Stock</span>
            </div>
          </div>
          <div className="bg-indigo-700 p-3 rounded-xl shadow-lg flex-shrink-0">
            <TrendingUp className="h-8 w-8" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
