import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { differenceInDays } from "date-fns";

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

      // Fetch all sales orders (buyers) - exclude cancelled, include amounts and dates
      const { data: salesOrders, error: salesError } = await supabase
        .from('sales_orders')
        .select('client_name, client_phone, total_amount, order_date')
        .neq('status', 'CANCELLED');

      if (salesError) throw salesError;

      // Fetch all purchase orders (sellers) - exclude cancelled, include amounts and dates
      const { data: purchaseOrders, error: purchaseError } = await supabase
        .from('purchase_orders')
        .select('supplier_name, contact_number, total_amount, order_date')
        .neq('status', 'CANCELLED');

      if (purchaseError) throw purchaseError;

      const today = new Date();

      // Count orders and calculate metrics for each client
      for (const client of clientIdentifiers) {
        // Get matching sales orders
        const clientSalesOrders = salesOrders?.filter(order => 
          order.client_name === client.name || 
          (client.phone && order.client_phone === client.phone)
        ) || [];

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
          daysSinceLastOrder
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
