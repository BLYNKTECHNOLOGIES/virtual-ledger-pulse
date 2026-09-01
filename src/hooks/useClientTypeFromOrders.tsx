import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaginated } from "@/lib/fetchAllRows";
import { differenceInDays } from "date-fns";

export type VolumeTrend = 'growing' | 'stable' | 'declining' | 'dropping' | 'new';

export interface ClientOrderData {
  clientId: string;
  salesOrderCount: number;
  purchaseOrderCount: number;
  isBuyer: boolean;
  isSeller: boolean;
  isComposite: boolean;
  clientType: 'Buyer' | 'Seller' | 'Composite' | 'Unknown';
  // Extended metrics for filtering
  totalSalesValue: number;
  totalPurchaseValue: number;
  averageSalesOrderValue: number;
  averagePurchaseOrderValue: number;
  lastSalesOrderDate: string | null;
  lastPurchaseOrderDate: string | null;
  daysSinceLastSalesOrder: number | null;
  daysSinceLastPurchaseOrder: number | null;
  // Computed helpers
  totalOrderCount: number;
  totalTransactionValue: number;
  lastOrderDate: string | null;
  daysSinceLastOrder: number | null;
  
  // Volume trend metrics - 10-day comparison
  last10DaysSalesValue: number;
  prev10DaysSalesValue: number;
  last10DaysPurchaseValue: number;
  prev10DaysPurchaseValue: number;
  
  // Volume trend metrics - Month comparison
  currentMonthSalesValue: number;
  previousMonthSalesValue: number;
  currentMonthPurchaseValue: number;
  previousMonthPurchaseValue: number;
  
  // Computed volume trends (for sales/buyers)
  salesVolumeTrend10Day: VolumeTrend;
  salesVolumeChange10Day: number | null;
  salesVolumeTrendMonth: VolumeTrend;
  salesVolumeChangeMonth: number | null;
  
  // Computed volume trends (for purchases/sellers)
  purchaseVolumeTrend10Day: VolumeTrend;
  purchaseVolumeChange10Day: number | null;
  purchaseVolumeTrendMonth: VolumeTrend;
  purchaseVolumeChangeMonth: number | null;
}

function calculateVolumeTrend(current: number, previous: number): { trend: VolumeTrend; changePercent: number | null } {
  // No previous data = new client
  if (previous === 0 && current === 0) {
    return { trend: 'new', changePercent: null };
  }
  
  // Had no previous activity but has current = growing from zero
  if (previous === 0 && current > 0) {
    return { trend: 'growing', changePercent: null };
  }
  
  // Had activity before but none now = dropping
  if (previous > 0 && current === 0) {
    return { trend: 'dropping', changePercent: -100 };
  }
  
  const changePercent = ((current - previous) / previous) * 100;
  
  if (changePercent > 10) {
    return { trend: 'growing', changePercent };
  } else if (changePercent >= -10) {
    return { trend: 'stable', changePercent };
  } else if (changePercent >= -30) {
    return { trend: 'declining', changePercent };
  } else {
    return { trend: 'dropping', changePercent };
  }
}

interface ClientOrderMetricsRow {
  client_id: string;
  sales_order_count: number;
  purchase_order_count: number;
  total_sales_value: number | string;
  total_purchase_value: number | string;
  last_sales_order_date: string | null;
  last_purchase_order_date: string | null;
  last10_sales_value: number | string;
  prev10_sales_value: number | string;
  last10_purchase_value: number | string;
  prev10_purchase_value: number | string;
  current_month_sales_value: number | string;
  previous_month_sales_value: number | string;
  current_month_purchase_value: number | string;
  previous_month_purchase_value: number | string;
}

const num = (v: number | string | null | undefined) => Number(v) || 0;

/**
 * Client order metrics are aggregated server-side (RPC: get_client_order_metrics).
 * Previously this hook downloaded every sales + purchase order and matched them in
 * the browser (O(clients x orders) — ~85M comparisons), which crashed the tab.
 * The RPC preserves the exact matching rules (sales: client_id FK, falling back to
 * exact name for legacy rows; purchases: supplier name or contact phone).
 */
export function useClientTypeFromOrders(clients: any[] | undefined) {
  return useQuery({
    queryKey: ['client-order-metrics'],
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<Map<string, ClientOrderData>> => {
      // One row per client with order history (~5k today) — well past PostgREST's
      // 1,000-row response cap, so every page must be fetched or clients beyond
      // the cutoff silently show zero orders / no trend.
      const data = await fetchAllPaginated<ClientOrderMetricsRow>(() =>
        (supabase as any).rpc('get_client_order_metrics').order('client_id', { ascending: true }),
      );


      const today = new Date();
      const result = new Map<string, ClientOrderData>();

      for (const row of ((data || []) as unknown as ClientOrderMetricsRow[])) {
        const salesCount = Number(row.sales_order_count) || 0;
        const purchaseCount = Number(row.purchase_order_count) || 0;

        const totalSalesValue = num(row.total_sales_value);
        const totalPurchaseValue = num(row.total_purchase_value);
        const lastSalesOrderDate = row.last_sales_order_date;
        const lastPurchaseOrderDate = row.last_purchase_order_date;

        const daysSinceLastSalesOrder = lastSalesOrderDate
          ? differenceInDays(today, new Date(lastSalesOrderDate))
          : null;
        const daysSinceLastPurchaseOrder = lastPurchaseOrderDate
          ? differenceInDays(today, new Date(lastPurchaseOrderDate))
          : null;

        let lastOrderDate: string | null;
        if (lastSalesOrderDate && lastPurchaseOrderDate) {
          lastOrderDate = new Date(lastSalesOrderDate) > new Date(lastPurchaseOrderDate)
            ? lastSalesOrderDate
            : lastPurchaseOrderDate;
        } else {
          lastOrderDate = lastSalesOrderDate || lastPurchaseOrderDate;
        }
        const daysSinceLastOrder = lastOrderDate
          ? differenceInDays(today, new Date(lastOrderDate))
          : null;

        const last10DaysSalesValue = num(row.last10_sales_value);
        const prev10DaysSalesValue = num(row.prev10_sales_value);
        const last10DaysPurchaseValue = num(row.last10_purchase_value);
        const prev10DaysPurchaseValue = num(row.prev10_purchase_value);
        const currentMonthSalesValue = num(row.current_month_sales_value);
        const previousMonthSalesValue = num(row.previous_month_sales_value);
        const currentMonthPurchaseValue = num(row.current_month_purchase_value);
        const previousMonthPurchaseValue = num(row.previous_month_purchase_value);

        const sales10DayTrend = calculateVolumeTrend(last10DaysSalesValue, prev10DaysSalesValue);
        const salesMonthTrend = calculateVolumeTrend(currentMonthSalesValue, previousMonthSalesValue);
        const purchase10DayTrend = calculateVolumeTrend(last10DaysPurchaseValue, prev10DaysPurchaseValue);
        const purchaseMonthTrend = calculateVolumeTrend(currentMonthPurchaseValue, previousMonthPurchaseValue);

        const isBuyer = salesCount > 0;
        const isSeller = purchaseCount > 0;
        const isComposite = isBuyer && isSeller;
        const clientType: ClientOrderData['clientType'] = isComposite
          ? 'Composite'
          : isBuyer
            ? 'Buyer'
            : isSeller
              ? 'Seller'
              : 'Unknown';

        result.set(row.client_id, {
          clientId: row.client_id,
          salesOrderCount: salesCount,
          purchaseOrderCount: purchaseCount,
          isBuyer,
          isSeller,
          isComposite,
          clientType,
          totalSalesValue,
          totalPurchaseValue,
          averageSalesOrderValue: salesCount > 0 ? totalSalesValue / salesCount : 0,
          averagePurchaseOrderValue: purchaseCount > 0 ? totalPurchaseValue / purchaseCount : 0,
          lastSalesOrderDate,
          lastPurchaseOrderDate,
          daysSinceLastSalesOrder,
          daysSinceLastPurchaseOrder,
          totalOrderCount: salesCount + purchaseCount,
          totalTransactionValue: totalSalesValue + totalPurchaseValue,
          lastOrderDate,
          daysSinceLastOrder,
          last10DaysSalesValue,
          prev10DaysSalesValue,
          last10DaysPurchaseValue,
          prev10DaysPurchaseValue,
          currentMonthSalesValue,
          previousMonthSalesValue,
          currentMonthPurchaseValue,
          previousMonthPurchaseValue,
          salesVolumeTrend10Day: sales10DayTrend.trend,
          salesVolumeChange10Day: sales10DayTrend.changePercent,
          salesVolumeTrendMonth: salesMonthTrend.trend,
          salesVolumeChangeMonth: salesMonthTrend.changePercent,
          purchaseVolumeTrend10Day: purchase10DayTrend.trend,
          purchaseVolumeChange10Day: purchase10DayTrend.changePercent,
          purchaseVolumeTrendMonth: purchaseMonthTrend.trend,
          purchaseVolumeChangeMonth: purchaseMonthTrend.changePercent,
        });
      }

      return result;
    },
  });
}


// Helper to determine client activity status (15-day threshold for high-frequency business)
export function getClientActivityStatus(daysSinceLastOrder: number | null, totalOrders: number): 'active' | 'inactive' | 'dormant' | 'new' {
  if (totalOrders === 0 || daysSinceLastOrder === null) return 'new';
  if (daysSinceLastOrder > 45) return 'dormant';
  if (daysSinceLastOrder > 15) return 'inactive';
  return 'active';
}
