import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { TrendingUp, Layers, ChevronDown, ChevronRight } from "lucide-react";

interface BankDetail { account_name: string; bank_name: string; balance: number; status: string; dormant_at: string | null }
interface SettlementDetail { id: string; settlement_amount: number; client_name: string; order_number: string; expected_settlement_date: string | null }
interface WalletDetail { wallet_name: string; current_balance: number }
interface TdsDetail { id: string; tds_amount: number; pan_number: string; deduction_date: string }

export function useTotalAssetValue() {
  return useQuery({
    queryKey: ["total_asset_value_realtime"],
    queryFn: async () => {
      // 1. Bank balances (Active + Dormant) with details
      const { data: banks } = await supabase
        .from("bank_accounts")
        .select("account_name, bank_name, balance, status, dormant_at")
        .in("status", ["ACTIVE", "DORMANT"])
        .order("account_name");

      const bankDetails: BankDetail[] = (banks || []).map(b => ({
        account_name: b.account_name,
        bank_name: b.bank_name,
        balance: Number(b.balance || 0),
        status: b.status,
        dormant_at: b.dormant_at,
      }));
      const totalBank = bankDetails.reduce((s, a) => s + a.balance, 0);

      // 2. POS / Payment gateway with details
      const { data: pendingSettlements } = await supabase
        .from("pending_settlements")
        .select("id, settlement_amount, client_name, order_number, expected_settlement_date")
        .eq("status", "PENDING")
        .order("expected_settlement_date", { ascending: false });

      const settlementDetails: SettlementDetail[] = (pendingSettlements || []).map(p => ({
        id: p.id,
        settlement_amount: Number(p.settlement_amount || 0),
        client_name: p.client_name,
        order_number: p.order_number,
        expected_settlement_date: p.expected_settlement_date,
      }));
      const totalGateway = settlementDetails.reduce((s, p) => s + p.settlement_amount, 0);

      // 3. Stock valuation - wallet details
      const { data: wallets } = await supabase
        .from("wallets")
        .select("wallet_name, current_balance")
        .eq("is_active", true)
        .order("wallet_name");

      const walletDetails: WalletDetail[] = (wallets || []).map(w => ({
        wallet_name: w.wallet_name,
        current_balance: Number(w.current_balance || 0),
      }));
      const totalUnits = walletDetails.reduce((s, w) => s + w.current_balance, 0);

      // Get ALL completed PO items (paginated to avoid 1000-row limit)
      const { data: completedPOs } = await supabase
        .from("purchase_orders")
        .select("id")
        .eq("status", "COMPLETED");

      const completedIds = new Set(completedPOs?.map((p) => p.id) || []);

      let allItems: { quantity: number; unit_price: number; purchase_order_id: string }[] = [];
      let offset = 0;
      const batchSize = 1000;
      while (true) {
        const { data: items } = await supabase
          .from("purchase_order_items")
          .select("quantity, unit_price, purchase_order_id")
          .range(offset, offset + batchSize - 1);
        if (!items || items.length === 0) break;
        allItems = allItems.concat(items);
        if (items.length < batchSize) break;
        offset += batchSize;
      }

      let totalQty = 0;
      let totalCost = 0;
      for (const item of allItems) {
        if (completedIds.has(item.purchase_order_id)) {
          const qty = Number(item.quantity || 0);
          totalQty += qty;
          totalCost += qty * Number(item.unit_price || 0);
        }
      }

      const avgCost = totalQty > 0 ? totalCost / totalQty : 0;
      const stockVal = totalUnits * avgCost;

      // 4. TDS Liability with details
      const { data: unpaidTds } = await supabase
        .from("tds_records")
        .select("id, tds_amount, pan_number, deduction_date")
        .or("payment_status.is.null,payment_status.neq.PAID")
        .order("deduction_date", { ascending: false });

      const tdsDetails: TdsDetail[] = (unpaidTds || []).map(r => ({
        id: r.id,
        tds_amount: Number(r.tds_amount || 0),
        pan_number: r.pan_number,
        deduction_date: r.deduction_date,
      }));
      const totalUnpaidTds = tdsDetails.reduce((s, r) => s + r.tds_amount, 0);

      // 5. Net Total
      const total = totalBank + totalGateway + stockVal - totalUnpaidTds;

      return {
        total, totalBank, totalGateway, stockVal, totalUnits, avgCost, totalUnpaidTds,
        bankDetails, settlementDetails, walletDetails, tdsDetails,
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

            {/* POS / Gateway */}
            <ExpandableCategory
              label="POS / Gateway (Pending Settlements)"
              total={fmt(data?.totalGateway || 0)}
              count={data?.settlementDetails?.length || 0}
              positive
            >
              {data?.settlementDetails?.length ? data.settlementDetails.map((s, i) => (
                <div key={i} className="flex justify-between items-center py-1.5 px-3 rounded bg-muted/50">
                  <div>
                    <span className="font-medium">{s.client_name}</span>
                    <span className="text-xs text-muted-foreground ml-2">#{s.order_number}</span>
                    {s.expected_settlement_date && (
                      <span className="text-xs text-muted-foreground ml-1">
                        ({new Date(s.expected_settlement_date).toLocaleDateString()})
                      </span>
                    )}
                  </div>
                  <span className="font-semibold text-green-600">{fmt(s.settlement_amount)}</span>
                </div>
              )) : (
                <p className="text-xs text-muted-foreground px-3">No pending settlements</p>
              )}
            </ExpandableCategory>

            {/* Stock / Wallets */}
            <ExpandableCategory
              label="Stock Valuation (Units × Avg Cost)"
              total={fmt(data?.stockVal || 0)}
              count={data?.walletDetails?.length || 0}
              positive
              subtitle={`Units: ${fmtUnits(data?.totalUnits || 0)} | Avg Cost: ${fmt(data?.avgCost || 0)}`}
            >
              {data?.walletDetails?.map((w, i) => (
                <div key={i} className="flex justify-between items-center py-1.5 px-3 rounded bg-muted/50">
                  <span className="font-medium">{w.wallet_name}</span>
                  <span className="font-semibold">{fmtUnits(w.current_balance)} units</span>
                </div>
              ))}
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
              Formula: Banks + POS + (Stock Units × Weighted Avg Purchase Price) − Unpaid TDS
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
