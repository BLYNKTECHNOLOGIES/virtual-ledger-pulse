import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface ClientOrderCounts {
  clientId: string;
  salesOrderCount: number;
  purchaseOrderCount: number;
  isBuyer: boolean;
  isSeller: boolean;
  isComposite: boolean;
  clientType: 'Buyer' | 'Seller' | 'Composite' | 'Unknown';
}

export function useClientTypeFromOrders(clients: any[] | undefined) {
  return useQuery({
    queryKey: ['client-order-counts', clients?.map(c => c.id).join(',')],
    queryFn: async (): Promise<Map<string, ClientOrderCounts>> => {
      if (!clients || clients.length === 0) {
        return new Map();
      }

      const result = new Map<string, ClientOrderCounts>();

      // Get all client names and phones for matching
      const clientIdentifiers = clients.map(c => ({
        id: c.id,
        name: c.name,
        phone: c.phone
      }));

      // Fetch all sales orders (buyers) - exclude cancelled
      const { data: salesOrders, error: salesError } = await supabase
        .from('sales_orders')
        .select('client_name, client_phone')
        .neq('status', 'CANCELLED');

      if (salesError) throw salesError;

      // Fetch all purchase orders (sellers) - exclude cancelled
      const { data: purchaseOrders, error: purchaseError } = await supabase
        .from('purchase_orders')
        .select('supplier_name, contact_number')
        .neq('status', 'CANCELLED');

      if (purchaseError) throw purchaseError;

      // Count orders for each client
      for (const client of clientIdentifiers) {
        // Count sales orders (client is a buyer if they have sales orders)
        const salesCount = salesOrders?.filter(order => 
          order.client_name === client.name || 
          (client.phone && order.client_phone === client.phone)
        ).length || 0;

        // Count purchase orders (client is a seller if they have purchase orders)
        const purchaseCount = purchaseOrders?.filter(order => 
          order.supplier_name === client.name || 
          (client.phone && order.contact_number === client.phone)
        ).length || 0;

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
          clientType
        });
      }

      return result;
    },
    enabled: !!clients && clients.length > 0,
  });
}
