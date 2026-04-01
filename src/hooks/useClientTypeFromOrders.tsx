import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { differenceInDays, subDays, startOfMonth, endOfMonth, subMonths } from "date-fns";

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

// Helper to fetch all rows from a table, paginating past the 1000-row limit
async function fetchAllRows<T>(
  table: string,
  select: string,
  filter?: { column: string; op: 'neq'; value: string }
): Promise<T[]> {
  const PAGE_SIZE = 1000;
  let allData: T[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    let query = supabase.from(table as any).select(select).range(from, from + PAGE_SIZE - 1);
    if (filter) {
      query = query.neq(filter.column, filter.value);
    }
    const { data, error } = await query;
    if (error) throw error;
    if (data) {
      allData = allData.concat(data as T[]);
    }
    hasMore = (data?.length || 0) === PAGE_SIZE;
    from += PAGE_SIZE;
  }

  return allData;
}

export function useClientTypeFromOrders(clients: any[] | undefined) {
  return useQuery({
    queryKey: ['client-order-counts', clients?.map(c => c.id).join(',')],
    queryFn: async (): Promise<Map<string, ClientOrderData>> => {
      if (!clients || clients.length === 0) {
        return new Map();
      }

      const result = new Map<string, ClientOrderData>();

      // Get all client names and phones for matching
      const clientIdentifiers = clients.map(c => ({
        id: c.id,
        name: c.name,
        phone: c.phone
      }));

      // Fetch ALL sales orders (buyers) - paginated to avoid 1000-row limit
      // Include client_id for FK-based matching (primary), fall back to name/phone
      const salesOrders = await fetchAllRows<any>(
        'sales_orders',
        'client_id, client_name, client_phone, total_amount, order_date',
        { column: 'status', op: 'neq', value: 'CANCELLED' }
      );

      // Fetch ALL purchase orders (sellers) - paginated to avoid 1000-row limit
      const purchaseOrders = await fetchAllRows<any>(
        'purchase_orders',
        'supplier_name, contact_number, total_amount, order_date',
        { column: 'status', op: 'neq', value: 'CANCELLED' }
      );

      const today = new Date();
      
      // Date boundaries for period comparisons
      const last10Days = subDays(today, 10);
      const prev10DaysStart = subDays(today, 20);
      const currentMonthStart = startOfMonth(today);
      const previousMonthStart = startOfMonth(subMonths(today, 1));
      const previousMonthEnd = endOfMonth(subMonths(today, 1));

      // Count orders and calculate metrics for each client
      for (const client of clientIdentifiers) {
        // Get matching sales orders — prioritize client_id FK match,
        // fall back to name-only match for legacy orders without client_id.
        // NEVER match by phone alone — phone reuse across clients causes inflation.
        const clientSalesOrders = salesOrders?.filter(order => {
          if (order.client_id) {
            return order.client_id === client.id;
          }
          // Legacy fallback: match by exact name only (no phone matching)
          return order.client_name === client.name;
        }) || [];

        // Get matching purchase orders
        const clientPurchaseOrders = purchaseOrders?.filter(order => 
          order.supplier_name === client.name || 
          (client.phone && order.contact_number === client.phone)
        ) || [];

        const salesCount = clientSalesOrders.length;
        const purchaseCount = clientPurchaseOrders.length;

        // Calculate sales metrics
        const totalSalesValue = clientSalesOrders.reduce((sum, order) => 
          sum + (Number(order.total_amount) || 0), 0);
        const averageSalesOrderValue = salesCount > 0 ? totalSalesValue / salesCount : 0;
        
        // Find last sales order date
        const salesDates = clientSalesOrders
          .map(o => o.order_date)
          .filter(Boolean)
          .sort((a, b) => new Date(b!).getTime() - new Date(a!).getTime());
        const lastSalesOrderDate = salesDates[0] || null;
        const daysSinceLastSalesOrder = lastSalesOrderDate 
          ? differenceInDays(today, new Date(lastSalesOrderDate))
          : null;

        // Calculate purchase metrics
        const totalPurchaseValue = clientPurchaseOrders.reduce((sum, order) => 
          sum + (Number(order.total_amount) || 0), 0);
        const averagePurchaseOrderValue = purchaseCount > 0 ? totalPurchaseValue / purchaseCount : 0;
        
        // Find last purchase order date
        const purchaseDates = clientPurchaseOrders
          .map(o => o.order_date)
          .filter(Boolean)
          .sort((a, b) => new Date(b!).getTime() - new Date(a!).getTime());
        const lastPurchaseOrderDate = purchaseDates[0] || null;
        const daysSinceLastPurchaseOrder = lastPurchaseOrderDate 
          ? differenceInDays(today, new Date(lastPurchaseOrderDate))
          : null;

        // Computed combined values
        const totalOrderCount = salesCount + purchaseCount;
        const totalTransactionValue = totalSalesValue + totalPurchaseValue;
        
        // Get the most recent order date across both types
        let lastOrderDate: string | null = null;
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

        // Calculate 10-day period values for sales
        const last10DaysSalesValue = clientSalesOrders
          .filter(o => o.order_date && new Date(o.order_date) >= last10Days)
          .reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
        
        const prev10DaysSalesValue = clientSalesOrders
          .filter(o => {
            if (!o.order_date) return false;
            const date = new Date(o.order_date);
            return date >= prev10DaysStart && date < last10Days;
          })
          .reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);

        // Calculate 10-day period values for purchases
        const last10DaysPurchaseValue = clientPurchaseOrders
          .filter(o => o.order_date && new Date(o.order_date) >= last10Days)
          .reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
        
        const prev10DaysPurchaseValue = clientPurchaseOrders
          .filter(o => {
            if (!o.order_date) return false;
            const date = new Date(o.order_date);
            return date >= prev10DaysStart && date < last10Days;
          })
          .reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);

        // Calculate month period values for sales
        const currentMonthSalesValue = clientSalesOrders
          .filter(o => o.order_date && new Date(o.order_date) >= currentMonthStart)
          .reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
        
        const previousMonthSalesValue = clientSalesOrders
          .filter(o => {
            if (!o.order_date) return false;
            const date = new Date(o.order_date);
            return date >= previousMonthStart && date <= previousMonthEnd;
          })
          .reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);

        // Calculate month period values for purchases
        const currentMonthPurchaseValue = clientPurchaseOrders
          .filter(o => o.order_date && new Date(o.order_date) >= currentMonthStart)
          .reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
        
        const previousMonthPurchaseValue = clientPurchaseOrders
          .filter(o => {
            if (!o.order_date) return false;
            const date = new Date(o.order_date);
            return date >= previousMonthStart && date <= previousMonthEnd;
          })
          .reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);

        // Calculate volume trends for sales
        const sales10DayTrend = calculateVolumeTrend(last10DaysSalesValue, prev10DaysSalesValue);
        const salesMonthTrend = calculateVolumeTrend(currentMonthSalesValue, previousMonthSalesValue);
        
        // Calculate volume trends for purchases
        const purchase10DayTrend = calculateVolumeTrend(last10DaysPurchaseValue, prev10DaysPurchaseValue);
        const purchaseMonthTrend = calculateVolumeTrend(currentMonthPurchaseValue, previousMonthPurchaseValue);

        const isBuyer = salesCount > 0;
        const isSeller = purchaseCount > 0;
        const isComposite = isBuyer && isSeller;

        let clientType: 'Buyer' | 'Seller' | 'Composite' | 'Unknown';
        if (isComposite) {
          clientType = 'Composite';
        } else if (isBuyer) {
          clientType = 'Buyer';
        } else if (isSeller) {
          clientType = 'Seller';
        } else {
          clientType = 'Unknown';
        }

        result.set(client.id, {
          clientId: client.id,
          salesOrderCount: salesCount,
          purchaseOrderCount: purchaseCount,
          isBuyer,
          isSeller,
          isComposite,
          clientType,
          totalSalesValue,
          totalPurchaseValue,
          averageSalesOrderValue,
          averagePurchaseOrderValue,
          lastSalesOrderDate,
          lastPurchaseOrderDate,
          daysSinceLastSalesOrder,
          daysSinceLastPurchaseOrder,
          totalOrderCount,
          totalTransactionValue,
          lastOrderDate,
          daysSinceLastOrder,
          // 10-day period values
          last10DaysSalesValue,
          prev10DaysSalesValue,
          last10DaysPurchaseValue,
          prev10DaysPurchaseValue,
          // Month period values
          currentMonthSalesValue,
          previousMonthSalesValue,
          currentMonthPurchaseValue,
          previousMonthPurchaseValue,
          // Sales volume trends
          salesVolumeTrend10Day: sales10DayTrend.trend,
          salesVolumeChange10Day: sales10DayTrend.changePercent,
          salesVolumeTrendMonth: salesMonthTrend.trend,
          salesVolumeChangeMonth: salesMonthTrend.changePercent,
          // Purchase volume trends
          purchaseVolumeTrend10Day: purchase10DayTrend.trend,
          purchaseVolumeChange10Day: purchase10DayTrend.changePercent,
          purchaseVolumeTrendMonth: purchaseMonthTrend.trend,
          purchaseVolumeChangeMonth: purchaseMonthTrend.changePercent,
        });
      }

      return result;
    },
    enabled: !!clients && clients.length > 0,
  });
}

// Helper to determine client activity status (15-day threshold for high-frequency business)
export function getClientActivityStatus(daysSinceLastOrder: number | null, totalOrders: number): 'active' | 'inactive' | 'dormant' | 'new' {
  if (totalOrders === 0 || daysSinceLastOrder === null) return 'new';
  if (daysSinceLastOrder > 45) return 'dormant';
  if (daysSinceLastOrder > 15) return 'inactive';
  return 'active';
}
