import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function computeSnapshotForDate(supabase: any, snapshotDate: string) {
  const dayStart = snapshotDate + "T00:00:00";
  const dayEnd = snapshotDate + "T23:59:59";

  // 1. Fetch completed sales orders for the day
  const { data: salesOrders } = await supabase
    .from("sales_orders")
    .select("id, quantity, price_per_unit")
    .eq("status", "COMPLETED")
    .eq("order_date", snapshotDate);

  const totalSalesQty = salesOrders?.reduce(
    (sum: number, o: any) => sum + (Number(o.quantity) || 0), 0
  ) || 0;

  const totalSalesValue = salesOrders?.reduce(
    (sum: number, o: any) => sum + ((Number(o.quantity) || 0) * (Number(o.price_per_unit) || 0)), 0
  ) || 0;

  const avgSalesRate = totalSalesQty > 0 ? totalSalesValue / totalSalesQty : 0;

  // 2. Fetch completed purchase orders for the day
  const { data: purchaseOrders } = await supabase
    .from("purchase_orders")
    .select("id")
    .eq("status", "COMPLETED")
    .eq("order_date", snapshotDate);

  const purchaseOrderIds = purchaseOrders?.map((po: any) => po.id) || [];

  let totalPurchaseValue = 0;
  let totalPurchaseQty = 0;

  if (purchaseOrderIds.length > 0) {
    const { data: purchaseItems } = await supabase
      .from("purchase_order_items")
      .select("quantity, unit_price, products!inner(code)")
      .in("purchase_order_id", purchaseOrderIds)
      .eq("products.code", "USDT");

    for (const item of purchaseItems || []) {
      const qty = Number(item.quantity) || 0;
      const price = Number(item.unit_price) || 0;
      totalPurchaseQty += qty;
      totalPurchaseValue += qty * price;
    }
  }

  // 3. Fetch USDT fee debits for the day
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
    usdtFees?.reduce((sum: number, f: any) => sum + Number(f.amount), 0) || 0;

  // 4. Calculate effective purchase rate and gross profit
  const netPurchaseQty = totalPurchaseQty - totalUsdtFees;
  let effectivePurchaseRate = 0;

  if (totalPurchaseQty > 0 && netPurchaseQty > 0) {
    effectivePurchaseRate = totalPurchaseValue / netPurchaseQty;
  } else if (totalPurchaseQty > 0) {
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

  return { snapshot_date: snapshotDate, gross_profit: grossProfit, total_sales_qty: totalSalesQty, avg_sales_rate: avgSalesRate, effective_purchase_rate: effectivePurchaseRate, npm };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let body: any = {};
    try { body = await req.json(); } catch { /* empty body is fine */ }

    // If backfill_from is provided, fill all missing dates from that date to yesterday
    if (body.backfill_from) {
      const results: any[] = [];
      const startDate = new Date(body.backfill_from);
      const now = new Date();
      // Yesterday in IST (UTC+5:30)
      const yesterdayUTC = new Date(now);
      yesterdayUTC.setUTCDate(yesterdayUTC.getUTCDate() - (now.getUTCHours() < 6 ? 1 : 0));
      const endDate = new Date(body.backfill_to || yesterdayUTC.toISOString().split("T")[0]);

      const current = new Date(startDate);
      while (current <= endDate) {
        const dateStr = current.toISOString().split("T")[0];
        const result = await computeSnapshotForDate(supabase, dateStr);
        results.push(result);
        current.setUTCDate(current.getUTCDate() + 1);
      }

      return new Response(
        JSON.stringify({ success: true, backfilled: results.length, results }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Default: snapshot today (or yesterday if before 6 AM UTC)
    const now = new Date();
    const hourUTC = now.getUTCHours();
    let targetDate = new Date(now);
    if (hourUTC < 6) {
      targetDate.setUTCDate(targetDate.getUTCDate() - 1);
    }
    const snapshotDate = body.date || targetDate.toISOString().split("T")[0];

    const result = await computeSnapshotForDate(supabase, snapshotDate);

    return new Response(
      JSON.stringify({ success: true, ...result }),
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
