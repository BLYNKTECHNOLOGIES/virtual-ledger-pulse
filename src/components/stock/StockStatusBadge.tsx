
import { Badge } from "@/components/ui/badge";
import { useProductStockSummary } from "@/hooks/useWalletStock";

interface StockStatusBadgeProps {
  productId: string;
  showWarehouseBreakdown?: boolean;
  className?: string;
}

export function StockStatusBadge({ 
  productId, 
  showWarehouseBreakdown = false, 
  className 
}: StockStatusBadgeProps) {
  const { data: productSummaries, isLoading } = useProductStockSummary();

  if (isLoading) {
    return <Badge variant="outline" className={className}>Loading...</Badge>;
  }

  const productStock = productSummaries?.find(p => p.product_id === productId);
  
  if (!productStock) {
    return <Badge variant="destructive" className={className}>No Stock Data</Badge>;
  }

  const { total_stock, wallet_stocks, unit_of_measurement } = productStock;

  const getBadgeVariant = (stock: number) => {
    if (stock <= 0) return "destructive";
    if (stock <= 10) return "secondary";
    return "default";
  };

  if (showWarehouseBreakdown && wallet_stocks.length > 0) {
    return (
      <div className="space-y-1">
        <Badge variant={getBadgeVariant(total_stock)} className={className}>
          Total: {total_stock} {unit_of_measurement}
        </Badge>
        <div className="flex flex-wrap gap-1">
          {wallet_stocks
            .filter(ws => ws.balance >= 0) // Show all wallets, including zero balance
            .map((ws) => (
              <Badge 
                key={ws.wallet_id} 
                variant={ws.balance > 0 ? "outline" : "destructive"} 
                className="text-xs"
              >
                {ws.wallet_name}: {ws.balance}
              </Badge>
            ))}
        </div>
      </div>
    );
  }

  return (
    <Badge variant={getBadgeVariant(total_stock)} className={className}>
      {total_stock} {unit_of_measurement}
    </Badge>
  );
}
