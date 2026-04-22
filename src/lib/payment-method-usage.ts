import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaginated } from "@/lib/fetchAllRows";

/**
 * Compute live current_usage for a sales payment method from actual order data.
 * For payment gateways: usage = sum of PENDING settlements for this method.
 * For non-gateways: usage = sum of sales orders since last_reset using this method.
 *
 * NOTE: All queries below use fetchAllPaginated to bypass Supabase's default 1000-row cap.
 * Without pagination, payment-method usage would be silently under-counted once a method
 * exceeds 1000 orders/settlements, allowing limits to be bypassed.
 */
export async function computeSalesPaymentMethodUsage(
  methodId: string,
  lastReset: string | null,
  isPaymentGateway: boolean
): Promise<number> {
  if (isPaymentGateway) {
    const rows = await fetchAllPaginated<{ settlement_amount: number }>(
      () => supabase
        .from("pending_settlements")
        .select("settlement_amount")
        .eq("payment_method_id", methodId)
        .eq("status", "PENDING")
    );
    return rows.reduce((sum, row) => sum + Number(row.settlement_amount || 0), 0);
  }

  const rows = await fetchAllPaginated<{ total_amount: number }>(
    () => {
      let query = supabase
        .from("sales_orders")
        .select("total_amount")
        .eq("sales_payment_method_id", methodId)
        .not("status", "eq", "CANCELLED");
      if (lastReset) query = query.gte("created_at", lastReset);
      return query;
    }
  );
  return rows.reduce((sum, row) => sum + Number(row.total_amount || 0), 0);
}

/**
 * Compute live current_usage for a purchase payment method from actual order data.
 * Usage = sum of purchase orders since last_reset using this method (excluding cancelled).
 */
export async function computePurchasePaymentMethodUsage(
  methodId: string,
  lastReset: string | null
): Promise<number> {
  const rows = await fetchAllPaginated<{ total_amount: number }>(
    () => {
      let query = supabase
        .from("purchase_orders")
        .select("total_amount")
        .eq("purchase_payment_method_id", methodId)
        .not("status", "eq", "CANCELLED");
      if (lastReset) query = query.gte("created_at", lastReset);
      return query;
    }
  );
  return rows.reduce((sum, row) => sum + Number(row.total_amount || 0), 0);
}

/**
 * Batch-compute usage for all sales payment methods.
 * Returns a map of methodId -> computedUsage.
 */
export async function batchComputeSalesUsage(
  methods: Array<{ id: string; last_reset: string | null; payment_gateway: boolean }>
): Promise<Map<string, number>> {
  const gatewayIds = methods.filter((m) => m.payment_gateway).map((m) => m.id);
  const directIds = methods.filter((m) => !m.payment_gateway).map((m) => m.id);

  const usageMap = new Map<string, number>();

  if (gatewayIds.length > 0) {
    const settlements = await fetchAllPaginated<{ payment_method_id: string | null; settlement_amount: number }>(
      () => supabase
        .from("pending_settlements")
        .select("payment_method_id, settlement_amount")
        .in("payment_method_id", gatewayIds)
        .eq("status", "PENDING")
    );

    const gwTotals: Record<string, number> = {};
    settlements.forEach((s) => {
      if (s.payment_method_id) {
        gwTotals[s.payment_method_id] = (gwTotals[s.payment_method_id] || 0) + Number(s.settlement_amount || 0);
      }
    });

    gatewayIds.forEach((id) => usageMap.set(id, gwTotals[id] || 0));
  }

  if (directIds.length > 0) {
    const orders = await fetchAllPaginated<{ sales_payment_method_id: string | null; total_amount: number; created_at: string }>(
      () => supabase
        .from("sales_orders")
        .select("sales_payment_method_id, total_amount, created_at")
        .in("sales_payment_method_id", directIds)
        .not("status", "eq", "CANCELLED")
    );

    const directTotals: Record<string, number> = {};
    const methodMap = new Map(methods.map((m) => [m.id, m]));

    orders.forEach((o) => {
      const mid = o.sales_payment_method_id;
      if (!mid) return;
      const method = methodMap.get(mid);
      if (method?.last_reset && new Date(o.created_at) < new Date(method.last_reset)) return;
      directTotals[mid] = (directTotals[mid] || 0) + Number(o.total_amount || 0);
    });

    directIds.forEach((id) => usageMap.set(id, directTotals[id] || 0));
  }

  return usageMap;
}

/**
 * Batch-compute usage for all purchase payment methods.
 */
export async function batchComputePurchaseUsage(
  methods: Array<{ id: string; last_reset: string | null }>
): Promise<Map<string, number>> {
  const ids = methods.map((m) => m.id);
  if (ids.length === 0) return new Map();

  const orders = await fetchAllPaginated<{ purchase_payment_method_id: string | null; total_amount: number; created_at: string }>(
    () => supabase
      .from("purchase_orders")
      .select("purchase_payment_method_id, total_amount, created_at")
      .in("purchase_payment_method_id", ids)
      .not("status", "eq", "CANCELLED")
  );

  const totals: Record<string, number> = {};
  const methodMap = new Map(methods.map((m) => [m.id, m]));

  orders.forEach((o) => {
    const mid = o.purchase_payment_method_id;
    if (!mid) return;
    const method = methodMap.get(mid);
    if (method?.last_reset && new Date(o.created_at) < new Date(method.last_reset)) return;
    totals[mid] = (totals[mid] || 0) + Number(o.total_amount || 0);
  });

  const usageMap = new Map<string, number>();
  ids.forEach((id) => usageMap.set(id, totals[id] || 0));
  return usageMap;
}
