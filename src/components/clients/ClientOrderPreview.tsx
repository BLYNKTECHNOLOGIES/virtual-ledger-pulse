import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import { TrendingUp, TrendingDown, Calendar, ShoppingCart, Package } from "lucide-react";

interface ClientOrderPreviewProps {
  clientId: string;
  clientName: string;
  clientData?: {
    client_id: string;
    phone?: string | null;
    date_of_onboarding: string;
    client_type: string;
    is_buyer?: boolean | null;
    is_seller?: boolean | null;
  };
  isOpen: boolean;
}

interface OrderData {
  order_number: string;
  total_amount: number;
  order_date: string;
  type: 'buy' | 'sell';
}

interface PreviewData {
  buyTotal: number;
  sellTotal: number;
  buyCount: number;
  sellCount: number;
  recentOrders: OrderData[];
  isComposite: boolean;
}

interface RawOrderData {
  order_number: string;
  total_amount: number;
  order_date: string;
}

// Fetch orders by matching client name and/or phone
async function fetchClientOrders(clientName: string, clientPhone?: string | null): Promise<PreviewData> {
  // Build sales query - match by client_name (case insensitive)
  let salesQuery = supabase
    .from('sales_orders')
    .select('order_number, total_amount, order_date')
    .neq('status', 'CANCELLED')
    .order('order_date', { ascending: false })
    .limit(50);
  
  // Match by name OR phone
  if (clientPhone) {
    salesQuery = salesQuery.or(`client_name.ilike.${clientName},client_phone.eq.${clientPhone}`);
  } else {
    salesQuery = salesQuery.ilike('client_name', clientName);
  }

  // Build purchase query - match by supplier_name (case insensitive)
  let purchaseQuery = supabase
    .from('purchase_orders')
    .select('order_number, total_amount, order_date')
    .neq('status', 'CANCELLED')
    .order('order_date', { ascending: false })
    .limit(50);
  
  // Match by name OR phone
  if (clientPhone) {
    purchaseQuery = purchaseQuery.or(`supplier_name.ilike.${clientName},contact_number.eq.${clientPhone}`);
  } else {
    purchaseQuery = purchaseQuery.ilike('supplier_name', clientName);
  }

  const [salesResult, purchaseResult] = await Promise.all([
    salesQuery,
    purchaseQuery
  ]);

  const salesOrders: RawOrderData[] = (salesResult.data as RawOrderData[]) || [];
  const purchaseOrders: RawOrderData[] = (purchaseResult.data as RawOrderData[]) || [];

  // Calculate totals
  const buyTotal = salesOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
  const sellTotal = purchaseOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
  const buyCount = salesOrders.length;
  const sellCount = purchaseOrders.length;

  // Combine and sort recent transactions
  const allOrders: OrderData[] = [
    ...salesOrders.slice(0, 5).map(o => ({ 
      order_number: o.order_number, 
      total_amount: o.total_amount, 
      order_date: o.order_date, 
      type: 'buy' as const 
    })),
    ...purchaseOrders.slice(0, 5).map(o => ({ 
      order_number: o.order_number, 
      total_amount: o.total_amount, 
      order_date: o.order_date, 
      type: 'sell' as const 
    }))
  ].sort((a, b) => new Date(b.order_date).getTime() - new Date(a.order_date).getTime())
   .slice(0, 3);

  return {
    buyTotal,
    sellTotal,
    buyCount,
    sellCount,
    recentOrders: allOrders,
    isComposite: buyCount > 0 && sellCount > 0
  };
}

export function ClientOrderPreview({ 
  clientName, 
  clientData,
  isOpen 
}: ClientOrderPreviewProps) {
  const { data, isLoading, refetch } = useQuery<PreviewData>({
    queryKey: ['client-preview-orders', clientName, clientData?.phone],
    queryFn: () => fetchClientOrders(clientName, clientData?.phone),
    enabled: false,
    staleTime: 60000,
  });

  // Trigger fetch when hover card opens
  useEffect(() => {
    if (isOpen) {
      refetch();
    }
  }, [isOpen, refetch]);

  const formatAmount = (amount: number) => {
    if (amount >= 100000) {
      return `₹${(amount / 100000).toFixed(1)}L`;
    } else if (amount >= 1000) {
      return `₹${(amount / 1000).toFixed(1)}K`;
    }
    return `₹${amount.toLocaleString('en-IN')}`;
  };

  const memberSince = clientData?.date_of_onboarding 
    ? formatDistanceToNow(new Date(clientData.date_of_onboarding), { addSuffix: true })
    : null;

  // Determine client role based on is_buyer/is_seller flags
  const getClientRole = () => {
    const isBuyer = clientData?.is_buyer;
    const isSeller = clientData?.is_seller;
    
    if (isBuyer && isSeller) return 'COMPOSITE';
    if (isBuyer) return 'BUYER';
    if (isSeller) return 'SELLER';
    return null;
  };

  const clientRole = getClientRole();

  if (isLoading) {
    return (
      <div className="space-y-3 p-1">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-5 w-16" />
        </div>
        <Skeleton className="h-4 w-24" />
        <div className="grid grid-cols-2 gap-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-1">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm">{clientName}</span>
          <Badge variant="secondary" className="text-xs">
            {clientData?.client_id}
          </Badge>
        </div>
        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
          <Calendar className="h-3 w-3" />
          <span>Member {memberSince}</span>
        </div>
      </div>

      {/* Client Role Badge */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {clientRole && (
          <Badge 
            variant="outline" 
            className={`text-xs ${
              clientRole === 'COMPOSITE' 
                ? 'bg-accent text-accent-foreground border-accent' 
                : clientRole === 'BUYER' 
                  ? 'bg-primary/10 text-primary border-primary/30' 
                  : 'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800'
            }`}
          >
            {clientRole}
          </Badge>
        )}
      </div>

      {/* Order Statistics */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-accent/50 rounded-md p-2">
          <div className="flex items-center gap-1 text-primary text-xs mb-1">
            <TrendingUp className="h-3 w-3" />
            <span>Buy Orders</span>
          </div>
          <div className="font-semibold text-sm">{formatAmount(data?.buyTotal || 0)}</div>
          <div className="text-xs text-muted-foreground">{data?.buyCount || 0} orders</div>
        </div>
        <div className="bg-accent/50 rounded-md p-2">
          <div className="flex items-center gap-1 text-primary text-xs mb-1">
            <TrendingDown className="h-3 w-3" />
            <span>Sell Orders</span>
          </div>
          <div className="font-semibold text-sm">{formatAmount(data?.sellTotal || 0)}</div>
          <div className="text-xs text-muted-foreground">{data?.sellCount || 0} orders</div>
        </div>
      </div>

      {/* Recent Transactions */}
      {data?.recentOrders && data.recentOrders.length > 0 && (
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
            Recent Transactions
          </div>
          <div className="space-y-1.5">
            {data.recentOrders.map((order, idx) => (
              <div 
                key={idx} 
                className="flex items-center justify-between text-xs bg-muted/50 rounded px-2 py-1.5"
              >
                <div className="flex items-center gap-2">
                  {order.type === 'buy' ? (
                    <ShoppingCart className="h-3 w-3 text-primary" />
                  ) : (
                    <Package className="h-3 w-3 text-primary" />
                  )}
                  <span className="text-muted-foreground">
                    {new Date(order.order_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{formatAmount(order.total_amount)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No orders message */}
      {(!data?.recentOrders || data.recentOrders.length === 0) && (
        <div className="text-xs text-muted-foreground text-center py-2">
          No order history found
        </div>
      )}
    </div>
  );
}
