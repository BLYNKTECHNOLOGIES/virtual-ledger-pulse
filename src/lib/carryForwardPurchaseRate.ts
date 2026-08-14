import { supabase } from "@/integrations/supabase/client";

/**
 * Carry-forward purchase rate.
 *
 * When a P&L period contains no purchases at all, the cost basis would otherwise
 * be zero and the entire sale value would read as profit. In that case we walk
 * back to the most recent earlier day that DID have purchases and reuse that
 * day's fee-adjusted (effective) purchase rate as the cost basis.
 *
 * There is no lookback limit — we walk back until a purchase day is found.
 * If no earlier purchase day exists at all, null is returned and the caller
 * must treat the rate (and therefore gross profit) as unavailable.
 */

// Legacy non-USDT orders created before the WAC system — excluded everywhere in P&L
export const EXCLUDED_LEGACY_PURCHASE_ORDER_IDS = [
  "1fd66952-bf77-4bf4-a183-4c0fbc34510f", // SHIB order
  "937f087e-6b2a-4328-a2dd-0166e0682c5b", // BTC order
  "4f90519e-6d47-43c4-8206-9278927c788f", // BTC order
];

export interface CarriedPurchaseRate {
  rate: number;
  sourceDate: string;
}

/** Total USDT fees recorded on a single calendar day (same sources the dashboard uses). */
async function getDayUsdtFees(day: string): Promise<number> {
  const dayStart = day;
  const dayEnd = `${day}T23:59:59`;

  const [feeDeductions, conversionFees, transferFees] = await Promise.all([
    supabase
      .from("wallet_fee_deductions")
      .select("fee_usdt_amount")
      .gte("created_at", dayStart)
      .lte("created_at", dayEnd),
    supabase
      .from("erp_product_conversions")
      .select("fee_amount")
      .eq("status", "APPROVED")
      .gte("approved_at", dayStart)
      .lte("approved_at", dayEnd),
    supabase
      .from("wallet_transactions")
      .select("amount")
      .eq("transaction_type", "DEBIT")
      .eq("reference_type", "TRANSFER_FEE")
      .eq("asset_code", "USDT")
      .gte("created_at", dayStart)
      .lte("created_at", dayEnd),
  ]);

  const sum = (rows: any[] | null, key: string) =>
    (rows || []).reduce((acc, r) => acc + Number(r[key] || 0), 0);

  return (
    sum(feeDeductions.data as any[], "fee_usdt_amount") +
    sum(conversionFees.data as any[], "fee_amount") +
    sum(transferFees.data as any[], "amount")
  );
}

/**
 * Resolve the carry-forward effective purchase rate for a period that had no purchases.
 *
 * @param beforeDate  period start (yyyy-MM-dd). Only strictly earlier days are considered.
 * @param selectedAsset  'all' for USDT-normalised mode, or an asset code (e.g. 'USDT').
 */
export async function resolveCarriedPurchaseRate(
  beforeDate: string,
  selectedAsset: string = "all"
): Promise<CarriedPurchaseRate | null> {
  let sourceDate: string | null = null;

  if (selectedAsset === "all") {
    const { data } = await supabase
      .from("purchase_orders")
      .select("order_date")
      .eq("status", "COMPLETED")
      .lt("order_date", beforeDate)
      .gt("effective_usdt_qty", 0)
      .not("id", "in", `(${EXCLUDED_LEGACY_PURCHASE_ORDER_IDS.join(",")})`)
      .order("order_date", { ascending: false })
      .limit(1);
    sourceDate = data?.[0]?.order_date ?? null;
  } else {
    const { data } = await supabase
      .from("purchase_orders")
      .select("order_date, purchase_order_items!inner(quantity, products!inner(code))")
      .eq("status", "COMPLETED")
      .lt("order_date", beforeDate)
      .eq("purchase_order_items.products.code", selectedAsset)
      .not("id", "in", `(${EXCLUDED_LEGACY_PURCHASE_ORDER_IDS.join(",")})`)
      .order("order_date", { ascending: false })
      .limit(1);
    sourceDate = (data?.[0] as any)?.order_date ?? null;
  }

  if (!sourceDate) return null;

  let value = 0;
  let qty = 0;

  if (selectedAsset === "all") {
    const { data: orders } = await supabase
      .from("purchase_orders")
      .select("id, total_amount, effective_usdt_qty")
      .eq("status", "COMPLETED")
      .eq("order_date", sourceDate);

    (orders || []).forEach((po: any) => {
      if (EXCLUDED_LEGACY_PURCHASE_ORDER_IDS.includes(po.id)) return;
      const effQty = Number(po.effective_usdt_qty || 0);
      if (effQty > 0) {
        qty += effQty;
        value += Number(po.total_amount || 0);
      }
    });
  } else {
    const { data: items } = await supabase
      .from("purchase_order_items")
      .select(
        "quantity, unit_price, purchase_order_id, products!inner(code), purchase_orders!inner(order_date, status)"
      )
      .eq("products.code", selectedAsset)
      .eq("purchase_orders.status", "COMPLETED")
      .eq("purchase_orders.order_date", sourceDate);

    (items || []).forEach((item: any) => {
      if (EXCLUDED_LEGACY_PURCHASE_ORDER_IDS.includes(item.purchase_order_id)) return;
      const q = Number(item.quantity || 0);
      qty += q;
      value += q * Number(item.unit_price || 0);
    });
  }

  if (qty <= 0 || value <= 0) return null;

  const fees = await getDayUsdtFees(sourceDate);
  const netQty = qty - fees;
  const rate = netQty > 0 ? value / netQty : value / qty;

  if (!isFinite(rate) || rate <= 0) return null;

  return { rate, sourceDate };
}
