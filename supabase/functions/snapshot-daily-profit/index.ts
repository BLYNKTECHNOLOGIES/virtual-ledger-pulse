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

    // Cron runs at midnight, so we snapshot YESTERDAY's completed data
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const snapshotDate = yesterday.toISOString().split("T")[0];
    const dayStart = snapshotDate + "T00:00:00";
    const dayEnd = snapshotDate + "T23:59:59";

    // 1. Fetch completed sales orders for yesterday
    const { data: salesOrders } = await supabase
      .from("sales_orders")
      .select("id, quantity, price_per_unit")
      .eq("status", "COMPLETED")
      .eq("order_date", snapshotDate);

    const totalSalesQty = salesOrders?.reduce(
      (sum, o) => sum + (Number(o.quantity) || 0), 0
    ) || 0;

    const totalSalesValue = salesOrders?.reduce(
      (sum, o) => sum + ((Number(o.quantity) || 0) * (Number(o.price_per_unit) || 0)), 0
    ) || 0;

    const avgSalesRate = totalSalesQty > 0 ? totalSalesValue / totalSalesQty : 0;

    // 2. Fetch completed purchase orders for yesterday
    const { data: purchaseOrders } = await supabase
      .from("purchase_orders")
      .select("id")
      .eq("status", "COMPLETED")
      .eq("order_date", snapshotDate);

    const purchaseOrderIds = purchaseOrders?.map((po) => po.id) || [];

    let totalPurchaseValue = 0;
    let totalPurchaseQty = 0;

    if (purchaseOrderIds.length > 0) {
      const { data: purchaseItems } = await supabase
        .from("purchase_order_items")
        .select("quantity, unit_price")
        .in("purchase_order_id", purchaseOrderIds);

      for (const item of purchaseItems || []) {
        const qty = Number(item.quantity) || 0;
        const price = Number(item.unit_price) || 0;
        totalPurchaseQty += qty;
        totalPurchaseValue += qty * price;
      }
    }

    // 3. Fetch USDT fee debits for yesterday
    const { data: usdtFees } = await supabase
      .from("wallet_transactions")
      .select("amount")
      .eq("transaction_type", "DEBIT")
      .in("reference_type", [
        "PLATFORM_FEE",
        "TRANSFER_FEE",
        "SALES_ORDER_FEE",
        "PURCHASE_ORDER_FEE",
      ])
      .gte("created_at", dayStart)
      .lte("created_at", dayEnd);

    const totalUsdtFees =
      usdtFees?.reduce((sum, f) => sum + Number(f.amount), 0) || 0;

    // 4. Calculate effective purchase rate and gross profit
    const netPurchaseQty = totalPurchaseQty - totalUsdtFees;
    let effectivePurchaseRate = 0;

    if (totalPurchaseQty > 0 && netPurchaseQty > 0) {
      effectivePurchaseRate = totalPurchaseValue / netPurchaseQty;
    } else if (totalPurchaseQty > 0) {
      // Fees exceed purchased qty, use avg purchase rate as fallback
      effectivePurchaseRate = totalPurchaseValue / totalPurchaseQty;
    }

    const npm = avgSalesRate - effectivePurchaseRate;
    const grossProfit = npm * totalSalesQty;

    // 5. Upsert into daily_gross_profit_history
    const { error: upsertError } = await supabase
      .from("daily_gross_profit_history")
      .upsert(
        {
          snapshot_date: snapshotDate,
          gross_profit: grossProfit,
          total_sales_qty: totalSalesQty,
          avg_sales_rate: avgSalesRate,
          effective_purchase_rate: effectivePurchaseRate,
        },
        { onConflict: "snapshot_date" }
      );

    if (upsertError) throw upsertError;

    return new Response(
      JSON.stringify({
        success: true,
        snapshot_date: snapshotDate,
        gross_profit: grossProfit,
        total_sales_qty: totalSalesQty,
        avg_sales_rate: avgSalesRate,
        effective_purchase_rate: effectivePurchaseRate,
        npm,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
