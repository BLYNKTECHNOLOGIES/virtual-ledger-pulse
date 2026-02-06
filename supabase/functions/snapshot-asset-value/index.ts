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

    // 2. Sum all POS / payment gateway balances (current_usage on active payment_gateway methods)
    const { data: gateways } = await supabase
      .from("sales_payment_methods")
      .select("current_usage")
      .eq("payment_gateway", true)
      .eq("is_active", true);

    const totalGatewayBalance = gateways?.reduce(
      (sum, g) => sum + Number(g.current_usage || 0), 0
    ) || 0;

    // 3. Stock valuation: total wallet units × weighted average purchase price
    // Get all active wallet balances
    const { data: wallets } = await supabase
      .from("wallets")
      .select("current_balance, wallet_type")
      .eq("is_active", true);

    const totalStockUnits = wallets?.reduce(
      (sum, w) => sum + Number(w.current_balance || 0), 0
    ) || 0;

    // Calculate weighted average purchase price from completed purchase orders
    const { data: purchaseItems } = await supabase
      .from("purchase_order_items")
      .select("quantity, unit_price, purchase_order_id")
      .limit(1000);

    // Get completed purchase order IDs
    const { data: completedPOs } = await supabase
      .from("purchase_orders")
      .select("id")
      .eq("status", "COMPLETED");

    const completedIds = new Set(completedPOs?.map(po => po.id) || []);

    let totalQty = 0;
    let totalCost = 0;
    for (const item of purchaseItems || []) {
      if (completedIds.has(item.purchase_order_id)) {
        const qty = Number(item.quantity || 0);
        const price = Number(item.unit_price || 0);
        totalQty += qty;
        totalCost += qty * price;
      }
    }

    const weightedAvgCost = totalQty > 0 ? totalCost / totalQty : 0;
    const stockValuation = totalStockUnits * weightedAvgCost;

    // 4. Total Asset Value
    const totalAssetValue = totalBankBalance + totalGatewayBalance + stockValuation;

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
          stock_units: totalStockUnits,
          weighted_avg_cost: weightedAvgCost,
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
