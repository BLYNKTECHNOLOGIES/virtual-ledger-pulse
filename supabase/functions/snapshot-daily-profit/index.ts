import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchAllRows } from "../_shared/paginate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Legacy non-USDT orders created before the WAC system — excluded from P&L math
const EXCLUDED_LEGACY_PURCHASE_ORDER_IDS = [
  "1fd66952-bf77-4bf4-a183-4c0fbc34510f",
  "937f087e-6b2a-4328-a2dd-0166e0682c5b",
  "4f90519e-6d47-43c4-8206-9278927c788f",
];

/** Total USDT fee debits recorded on a single calendar day. */
async function getDayUsdtFees(supabase: any, day: string): Promise<number> {
  const rows = await fetchAllRows((from, to) =>
    supabase
      .from("wallet_transactions")
      .select("amount")
      .eq("transaction_type", "DEBIT")
      .in("reference_type", [
        "PLATFORM_FEE",
        "TRANSFER_FEE",
        "SALES_ORDER_FEE",
        "PURCHASE_ORDER_FEE",
      ])
      .gte("created_at", `${day}T00:00:00`)
      .lte("created_at", `${day}T23:59:59`)
      .range(from, to)
  );
  return rows?.reduce((sum: number, f: any) => sum + Number(f.amount || 0), 0) || 0;
}

/**
 * Carry-forward cost basis: when a day has no purchases at all, walk back to the
 * most recent earlier day that DID have purchases and reuse that day's fee-adjusted
 * effective purchase rate. No lookback limit. Returns null when no earlier
 * purchase day exists — the caller must then treat the cost basis as unavailable.
 */
async function resolveCarriedPurchaseRate(
  supabase: any,
  beforeDate: string
): Promise<{ rate: number; sourceDate: string } | null> {
  const { data: latest } = await supabase
    .from("purchase_orders")
    .select("order_date")
    .eq("status", "COMPLETED")
    .lt("order_date", beforeDate)
    .gt("effective_usdt_qty", 0)
    .not("id", "in", `(${EXCLUDED_LEGACY_PURCHASE_ORDER_IDS.join(",")})`)
    .order("order_date", { ascending: false })
    .limit(1);

  const sourceDate = latest?.[0]?.order_date;
  if (!sourceDate) return null;

  const orders = await fetchAllRows((from, to) =>
    supabase
      .from("purchase_orders")
      .select("id, total_amount, effective_usdt_qty")
      .eq("status", "COMPLETED")
      .eq("order_date", sourceDate)
      .range(from, to)
  );

  let value = 0;
  let qty = 0;
  for (const po of orders || []) {
    if (EXCLUDED_LEGACY_PURCHASE_ORDER_IDS.includes(po.id)) continue;
    const effQty = Number(po.effective_usdt_qty) || 0;
    if (effQty > 0) {
      qty += effQty;
      value += Number(po.total_amount) || 0;
    }
  }
  if (qty <= 0 || value <= 0) return null;

  const fees = await getDayUsdtFees(supabase, sourceDate);
  const netQty = qty - fees;
  const rate = netQty > 0 ? value / netQty : value / qty;
  if (!isFinite(rate) || rate <= 0) return null;

  return { rate, sourceDate };
}

async function computeSnapshotForDate(supabase: any, snapshotDate: string) {
  const dayStart = snapshotDate + "T00:00:00";
  const dayEnd = snapshotDate + "T23:59:59";

  // 1. Fetch completed sales orders for the day — use effective USDT fields
  const salesOrders = await fetchAllRows((from, to) =>
    supabase
      .from("sales_orders")
      .select("id, quantity, price_per_unit, effective_usdt_qty, effective_usdt_rate")
      .eq("status", "COMPLETED")
      .eq("order_date", snapshotDate)
      .range(from, to)
  );

  // Use effective_usdt_qty/rate when available (normalized USDT-equivalent)
  const totalSalesQty = salesOrders?.reduce(
    (sum: number, o: any) => sum + (Number(o.effective_usdt_qty || o.quantity) || 0), 0
  ) || 0;

  const totalSalesValue = salesOrders?.reduce(
    (sum: number, o: any) => {
      const qty = Number(o.effective_usdt_qty || o.quantity) || 0;
      const rate = Number(o.effective_usdt_rate || o.price_per_unit) || 0;
      return sum + (qty * rate);
    }, 0
  ) || 0;

  const avgSalesRate = totalSalesQty > 0 ? totalSalesValue / totalSalesQty : 0;

  // 2. Fetch completed purchase orders for the day — use effective USDT fields
  const purchaseOrders = await fetchAllRows((from, to) =>
    supabase
      .from("purchase_orders")
      .select("id, total_amount, effective_usdt_qty")
      .eq("status", "COMPLETED")
      .eq("order_date", snapshotDate)
      .range(from, to)
  );

  let totalPurchaseValue = 0;
  let totalPurchaseQty = 0;

  // Use effective_usdt_qty from purchase_orders directly (already normalized)
  for (const po of purchaseOrders || []) {
    const effQty = Number(po.effective_usdt_qty) || 0;
    const totalAmt = Number(po.total_amount) || 0;
    if (effQty > 0) {
      totalPurchaseQty += effQty;
      totalPurchaseValue += totalAmt;
    }
  }

  // 3. Fetch USDT fee debits for the day
  const usdtFees = await fetchAllRows((from, to) =>
    supabase
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
      .lte("created_at", dayEnd)
      .range(from, to)
  );

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
      JSON.stringify({ success: false, error: (error as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
