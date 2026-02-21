import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Sum all bank balances (Active + Dormant)
    const { data: bankAccounts } = await supabase
      .from("bank_accounts")
      .select("balance, status")
      .in("status", ["ACTIVE", "DORMANT"]);

    const totalBankBalance = bankAccounts?.reduce(
      (sum, a) => sum + Number(a.balance || 0), 0
    ) || 0;

    // 2. POS / Payment gateway balances = pending settlements awaiting clearing
    const { data: pendingSettlements } = await supabase
      .from("pending_settlements")
      .select("settlement_amount")
      .eq("status", "PENDING");

    const totalGatewayBalance = pendingSettlements?.reduce(
      (sum, p) => sum + Number(p.settlement_amount || 0), 0
    ) || 0;

    // 3. Stock valuation: multi-asset (USDT from wallets, others from wallet_asset_balances)
    // 3a. USDT from wallets
    const { data: wallets } = await supabase
      .from("wallets")
      .select("current_balance")
      .eq("is_active", true);

    const totalUsdtUnits = wallets?.reduce(
      (sum, w) => sum + Number(w.current_balance || 0), 0
    ) || 0;

    // 3b. Non-USDT from wallet_asset_balances
    const { data: assetBalances } = await supabase
      .from("wallet_asset_balances")
      .select("asset_code, balance")
      .neq("asset_code", "USDT");

    const nonUsdtMap = new Map<string, number>();
    (assetBalances || []).forEach(ab => {
      const bal = Number(ab.balance || 0);
      nonUsdtMap.set(ab.asset_code, (nonUsdtMap.get(ab.asset_code) || 0) + bal);
    });

    // 3c. Avg costs per product from completed POs
    const { data: purchaseOrders } = await supabase
      .from("purchase_orders")
      .select(`*, purchase_order_items(quantity, total_price, products(code))`)
      .eq("status", "COMPLETED");

    const costCalc = new Map<string, { qty: number; cost: number }>();
    (purchaseOrders || []).forEach((po: any) => {
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

    // Calculate total stock valuation across all assets
    let stockValuation = totalUsdtUnits * getAvgCost("USDT");
    nonUsdtMap.forEach((units, code) => {
      stockValuation += units * getAvgCost(code);
    });

    // 4. Unpaid TDS liability
    const { data: unpaidTds } = await supabase
      .from("tds_records")
      .select("tds_amount")
      .or("payment_status.is.null,payment_status.neq.PAID");

    const totalUnpaidTds = unpaidTds?.reduce(
      (sum: number, r: any) => sum + Number(r.tds_amount || 0), 0
    ) || 0;

    // 5. Total Asset Value (net of TDS liability)
    const totalAssetValue = totalBankBalance + totalGatewayBalance + stockValuation - totalUnpaidTds;

    // 5. Store snapshot (upsert to handle re-runs on same day)
    const today = new Date().toISOString().split("T")[0];

    const { error: insertError } = await supabase
      .from("asset_value_history")
      .upsert(
        { snapshot_date: today, total_asset_value: totalAssetValue },
        { onConflict: "snapshot_date" }
      );

    if (insertError) throw insertError;

    return new Response(
      JSON.stringify({
        success: true,
        snapshot_date: today,
        total_asset_value: totalAssetValue,
        breakdown: {
          bank_balance: totalBankBalance,
          gateway_balance: totalGatewayBalance,
          stock_valuation: stockValuation,
          usdt_units: totalUsdtUnits,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
